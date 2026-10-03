import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  beginTemplate,
  prepareTemplate,
  type Template,
} from '@/domain/templates';
import { getSupabaseClient } from '@/features/auth/client';
import { librarySessionId, WorkspaceLibrarySessionError } from './read-session';
import type { TemplateEditorStore } from '@/features/template-editor/provider';
import { media } from '@/features/trainer-library/fixtures';
import { decodeWorkspaceDraft, type WorkspaceDraft } from './draft';
import {
  loadWorkspaceLibrary,
  saveWorkspaceTemplateOperation,
  WorkspaceLibraryError,
  type WorkspaceLibrary,
  type WorkspaceLibraryErrorCode,
} from './service';

type LibraryStore = {
  workspaceId: string;
  editor: TemplateEditorStore;
  library: WorkspaceLibrary;
  media: typeof media;
  refresh: () => Promise<void>;
  commandError: WorkspaceLibraryErrorCode | null;
  reloadServerDraft: () => Promise<void>;
};
const Context = createContext<LibraryStore | null>(null);
const emptyLibrary: WorkspaceLibrary = { exercises: [], templates: [] };
const emptyDraft: WorkspaceDraft = { draft: null, baseRevision: null };

export function WorkspaceLibraryProvider({
  userId,
  workspaceId,
  children,
}: PropsWithChildren<{ userId: string; workspaceId: string }>) {
  const key = `panda-trainer-workspace-template-v1:${userId}:${workspaceId}`;
  const [client] = useState(getSupabaseClient);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [library, setLibrary] = useState(emptyLibrary);
  const [local, setLocal] = useState(emptyDraft);
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] =
    useState<TemplateEditorStore['status']>('loading');
  const [attempt, setAttempt] = useState(0);
  const [commandError, setCommandError] =
    useState<WorkspaceLibraryErrorCode | null>(null);
  const current = useRef(emptyDraft);
  const catalog = useRef(emptyLibrary);
  const mounted = useRef(false);
  const locked = useRef(false);
  const available = useRef(false);
  const writes = useRef(Promise.resolve(true));
  const ticket = useRef(0);
  const generation = useRef(0);
  const request = useRef(0);
  const identity = useRef<string | null>(null);
  const scopeKey = useRef(key);
  useLayoutEffect(() => {
    if (scopeKey.current === key) return;
    scopeKey.current = key;
    generation.current += 1;
    request.current += 1;
    available.current = false;
    identity.current = null;
  }, [key]);
  const saveOperation = useRef<{
    operation: ReturnType<typeof saveWorkspaceTemplateOperation>;
    template: Template;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    available.current = false;
    identity.current = null;
    const version = ++generation.current;
    const read = ++request.current;
    const isCurrent = () =>
      mounted.current &&
      generation.current === version &&
      request.current === read &&
      scopeKey.current === key;
    void Promise.resolve().then(() => {
      if (!isCurrent()) return;
      setVisibleKey(null);
      setReady(false);
      setReadError(false);
      setStatus('loading');
      setBusy(false);
    });
    const invalidate = () => {
      generation.current += 1;
      request.current += 1;
      available.current = false;
      identity.current = null;
      setVisibleKey(null);
      setReady(false);
      setReadError(true);
      setStatus('error');
    };
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (!mounted.current || generation.current !== version) return;
      const next = librarySessionId(session);
      if (
        session?.user.id === userId &&
        next &&
        ((event === 'INITIAL_SESSION' &&
          (identity.current === null || next === identity.current)) ||
          (event === 'TOKEN_REFRESHED' && next === identity.current))
      )
        return;
      invalidate();
    }).data.subscription;
    void (async () => {
      if (!client) throw new WorkspaceLibraryError('unavailable');
      const { data: auth, error } = await client.auth.getSession();
      if (!isCurrent()) return;
      const sessionId = librarySessionId(auth.session);
      if (error || auth.session?.user.id !== userId || !sessionId)
        throw new WorkspaceLibraryError('unavailable');
      identity.current = sessionId;
      const [data, draft] = await Promise.all([
        loadWorkspaceLibrary(workspaceId, '', {
          userId,
          workspaceId,
          sessionId,
          isCurrent,
        }),
        writes.current
          .then(() => AsyncStorage.getItem(key))
          .then(decodeWorkspaceDraft),
      ]);
      if (!isCurrent()) return;
      catalog.current = data;
      current.current = draft;
      saveOperation.current = draft.pendingSave
        ? {
            template: draft.pendingSave.template,
            operation: saveWorkspaceTemplateOperation(
              draft.pendingSave.template,
              draft.pendingSave.expectedRevision,
              userId,
              draft.pendingSave.requestId,
            ),
          }
        : null;
      available.current = true;
      setLibrary(data);
      setLocal(draft);
      setVisibleKey(key);
      setReady(true);
      setReadError(false);
      setStatus('saved');
    })().catch(() => {
      if (isCurrent()) {
        setReadError(true);
        setStatus('error');
      }
    });
    return () => {
      generation.current += 1;
      request.current += 1;
      mounted.current = false;
      available.current = false;
      subscription?.unsubscribe();
    };
  }, [attempt, client, key, userId, workspaceId]);

  const persist = (next: WorkspaceDraft) => {
    const revision = ++ticket.current;
    const version = generation.current;
    const isCurrent = () =>
      mounted.current &&
      scopeKey.current === key &&
      generation.current === version &&
      revision === ticket.current;
    setStatus('saving');
    const result = writes.current
      .then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .then(() => {
        if (isCurrent()) setStatus('saved');
        return true;
      })
      .catch(() => {
        if (isCurrent()) setStatus('error');
        return false;
      });
    writes.current = result;
    return result;
  };
  const update = (next: WorkspaceDraft) => {
    current.current = next;
    setLocal(next);
    saveOperation.current = null;
    setCommandError(null);
    void persist(next);
  };
  const readCatalog = async () => {
    const version = generation.current;
    const sessionId = identity.current;
    if (
      !mounted.current ||
      !available.current ||
      scopeKey.current !== key ||
      !sessionId
    )
      throw new WorkspaceLibraryError('unavailable');
    const read = ++request.current;
    const isCurrent = () =>
      mounted.current &&
      available.current &&
      scopeKey.current === key &&
      generation.current === version &&
      request.current === read &&
      identity.current === sessionId;
    if (!sessionId || !isCurrent())
      throw new WorkspaceLibraryError('unavailable');
    let data: WorkspaceLibrary;
    try {
      data = await loadWorkspaceLibrary(workspaceId, '', {
        userId,
        workspaceId,
        sessionId,
        isCurrent,
      });
    } catch (error) {
      if (isCurrent() && error instanceof WorkspaceLibrarySessionError) {
        generation.current += 1;
        request.current += 1;
        available.current = false;
        identity.current = null;
        setVisibleKey(null);
        setReady(false);
        setReadError(true);
        setStatus('error');
      }
      throw error;
    }
    if (!isCurrent()) throw new WorkspaceLibraryError('unavailable');
    catalog.current = data;
    setLibrary(data);
    return { data, isCurrent };
  };
  const refresh = async () => {
    await readCatalog();
  };
  const visible = visibleKey === key;
  const visibleLibrary = visible ? library : emptyLibrary;
  const editor: TemplateEditorStore = {
    templates: visibleLibrary.templates,
    draft: visible ? local.draft : null,
    ready: visible && ready,
    readError,
    busy: visible && busy,
    status,
    update: (draft) => {
      if (available.current && !locked.current)
        update({ draft, baseRevision: current.current.baseRevision });
    },
    begin: (id, copy) => {
      if (!available.current || locked.current) return false;
      const template = catalog.current.templates.find((item) => item.id === id);
      if (id && !template) return false;
      update({
        draft: beginTemplate(template, copy),
        baseRevision: template && !copy ? template.revision : null,
      });
      return true;
    },
    discard: async () => {
      if (!available.current || locked.current) return false;
      const version = generation.current;
      const isCurrent = () =>
        mounted.current &&
        available.current &&
        generation.current === version &&
        scopeKey.current === key;
      locked.current = true;
      setBusy(true);
      const ok = await persist(emptyDraft);
      if (ok && isCurrent()) {
        current.current = emptyDraft;
        setLocal(emptyDraft);
        saveOperation.current = null;
        setCommandError(null);
      }
      locked.current = false;
      if (isCurrent()) setBusy(false);
      return ok;
    },
    save: async () => {
      if (!available.current || locked.current || !current.current.draft)
        return { ok: false, error: 'storage' };
      const version = generation.current;
      const isCurrent = () =>
        mounted.current &&
        available.current &&
        scopeKey.current === key &&
        generation.current === version;
      const result = saveOperation.current
        ? { ok: true as const, template: saveOperation.current.template }
        : prepareTemplate(
            current.current.draft,
            catalog.current.templates,
            randomUUID(),
          );
      if (!result.ok) return result;
      locked.current = true;
      setBusy(true);
      setCommandError(null);
      try {
        if (!saveOperation.current) {
          const requestId = randomUUID();
          const pendingSave = {
            template: result.template,
            expectedRevision: current.current.baseRevision,
            requestId,
          };
          const next = { ...current.current, pendingSave };
          if (!(await persist(next))) return { ok: false, error: 'storage' };
          if (!isCurrent()) return { ok: false, error: 'storage' };
          current.current = next;
          if (mounted.current) setLocal(next);
          saveOperation.current = {
            operation: saveWorkspaceTemplateOperation(
              result.template,
              current.current.baseRevision,
              userId,
              requestId,
            ),
            template: result.template,
          };
        }
        const saved = await saveOperation.current.operation.execute();
        if (!isCurrent()) return { ok: false, error: 'storage' };
        await refresh();
        if (!isCurrent()) return { ok: false, error: 'storage' };
        if (!(await persist(emptyDraft)))
          return { ok: false, error: 'storage' };
        if (isCurrent()) {
          current.current = emptyDraft;
          setLocal(emptyDraft);
          saveOperation.current = null;
        }
        return { ok: true, template: { ...result.template, id: saved.id } };
      } catch (error) {
        if (isCurrent())
          setCommandError(
            error instanceof WorkspaceLibraryError ? error.code : 'request',
          );
        return { ok: false, error: 'storage' };
      } finally {
        locked.current = false;
        if (isCurrent()) setBusy(false);
      }
    },
    retry: () => {
      if (!available.current) setAttempt((value) => value + 1);
      else if (!locked.current) void persist(current.current);
    },
  };
  const sources: typeof media = {};
  for (const exercise of [
    ...visibleLibrary.exercises,
    ...visibleLibrary.templates.flatMap((template) =>
      template.exercises.map((line) => line.exercise),
    ),
  ]) {
    const source = exercise.sourceKey ? media[exercise.sourceKey] : undefined;
    if (source) sources[exercise.id] = source;
  }
  return (
    <Context.Provider
      value={{
        workspaceId,
        editor,
        library: visibleLibrary,
        media: sources,
        refresh,
        commandError,
        reloadServerDraft: async () => {
          if (!available.current || locked.current) return;
          const version = generation.current;
          locked.current = true;
          setBusy(true);
          try {
            const id = current.current.draft?.id;
            const { data, isCurrent } = await readCatalog();
            if (!isCurrent()) return;
            const template = data.templates.find((item) => item.id === id);
            if (template)
              update({
                draft: beginTemplate(template),
                baseRevision: template.revision,
              });
            else if (id) throw new WorkspaceLibraryError('unavailable');
          } finally {
            locked.current = false;
            if (
              mounted.current &&
              generation.current === version &&
              scopeKey.current === key
            )
              setBusy(false);
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useWorkspaceLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace library provider is required');
  return value;
}
