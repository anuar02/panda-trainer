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
  const pendingClearKey = `${key}:pending-clear`;
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
  const locked = useRef<number | null>(null);
  const command = useRef(0);
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
    locked.current = null;
    saveOperation.current?.operation.dispose?.();
    saveOperation.current = null;
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
      setCommandError(null);
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
      locked.current = null;
      saveOperation.current?.operation.dispose?.();
      saveOperation.current = null;
      setBusy(false);
      setCommandError(null);
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
        writes.current.then(async () => {
          const draft = decodeWorkspaceDraft(await AsyncStorage.getItem(key));
          if (draft.draft) return draft;
          const backup = decodeWorkspaceDraft(
            await AsyncStorage.getItem(pendingClearKey),
          );
          return backup.pendingSave ? backup : draft;
        }),
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
              {
                userId,
                sessionId,
                isCurrent: () =>
                  mounted.current &&
                  generation.current === version &&
                  scopeKey.current === key,
              },
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
      saveOperation.current?.operation.dispose?.();
      subscription?.unsubscribe();
    };
  }, [attempt, client, key, pendingClearKey, userId, workspaceId]);

  const persist = (
    next: WorkspaceDraft,
    guard?: () => boolean | Promise<boolean>,
  ) => {
    const currentBefore = current.current;
    const revision = ++ticket.current;
    const version = generation.current;
    const isCurrent = () =>
      mounted.current &&
      scopeKey.current === key &&
      generation.current === version &&
      revision === ticket.current;
    setStatus('saving');
    const result = writes.current
      .then(async () => {
        if (guard && !(await guard())) return false;
        if (guard && next.draft === null && currentBefore.pendingSave) {
          await AsyncStorage.setItem(
            pendingClearKey,
            JSON.stringify(currentBefore),
          );
          if (!(await guard())) return false;
        }
        await AsyncStorage.setItem(key, JSON.stringify(next));
        if (guard && !(await guard())) {
          await AsyncStorage.setItem(key, JSON.stringify(currentBefore));
          return false;
        }
        return true;
      })
      .then((ok) => {
        if (isCurrent()) setStatus(ok ? 'saved' : 'error');
        return ok;
      })
      .catch(() => {
        if (isCurrent()) setStatus('error');
        return false;
      });
    writes.current = result;
    return result;
  };
  const cleanupPendingClear = (isCurrent: () => boolean) => {
    const cleanup = writes.current.then(async () => {
      if (!isCurrent() || current.current !== emptyDraft) return true;
      try {
        await AsyncStorage.setItem(pendingClearKey, JSON.stringify(emptyDraft));
        return true;
      } catch {
        return false;
      }
    });
    writes.current = cleanup;
  };
  const update = (next: WorkspaceDraft) => {
    current.current = next;
    setLocal(next);
    saveOperation.current?.operation.dispose?.();
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
    readError: (visibleKey === null || visible) && readError,
    busy: visible && busy,
    status: visible ? status : 'loading',
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
      const owner = ++command.current;
      locked.current = owner;
      setBusy(true);
      const ok = await persist(emptyDraft, isCurrent);
      if (ok && isCurrent()) {
        current.current = emptyDraft;
        setLocal(emptyDraft);
        saveOperation.current?.operation.dispose?.();
        saveOperation.current = null;
        setCommandError(null);
        cleanupPendingClear(isCurrent);
      }
      if (locked.current === owner) locked.current = null;
      if (isCurrent()) setBusy(false);
      return ok && isCurrent();
    },
    save: async () => {
      if (
        scopeKey.current !== key ||
        !available.current ||
        locked.current ||
        !current.current.draft
      )
        return { ok: false, error: 'storage' };
      const version = generation.current;
      const isCurrent = () =>
        mounted.current &&
        available.current &&
        scopeKey.current === key &&
        generation.current === version;
      const invalidateSave = () => {
        if (!isCurrent()) return;
        generation.current += 1;
        available.current = false;
        identity.current = null;
        saveOperation.current?.operation.dispose?.();
        saveOperation.current = null;
        locked.current = null;
        setVisibleKey(null);
        setReady(false);
        setReadError(true);
        setBusy(false);
        setCommandError(null);
        setStatus('error');
      };
      const sessionId = identity.current;
      const verifySaveScope = async () => {
        if (!isCurrent() || !client || !sessionId) return false;
        try {
          const result = await client.auth.getSession();
          const valid =
            isCurrent() &&
            !result.error &&
            result.data.session?.user.id === userId &&
            librarySessionId(result.data.session) === sessionId;
          if (!valid) invalidateSave();
          return valid;
        } catch {
          invalidateSave();
          return false;
        }
      };
      const result = saveOperation.current
        ? { ok: true as const, template: saveOperation.current.template }
        : prepareTemplate(
            current.current.draft,
            catalog.current.templates,
            randomUUID(),
          );
      if (!result.ok) return result;
      const owner = ++command.current;
      locked.current = owner;
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
              { userId, sessionId: identity.current ?? undefined, isCurrent },
            ),
            template: result.template,
          };
        }
        const saved = await saveOperation.current.operation.execute();
        if (!isCurrent()) return { ok: false, error: 'storage' };
        await refresh();
        if (!isCurrent()) return { ok: false, error: 'storage' };
        if (!(await persist(emptyDraft, verifySaveScope)))
          return { ok: false, error: 'storage' };
        if (!isCurrent()) return { ok: false, error: 'storage' };
        if (isCurrent()) {
          current.current = emptyDraft;
          setLocal(emptyDraft);
          saveOperation.current?.operation.dispose?.();
          saveOperation.current = null;
        }
        cleanupPendingClear(isCurrent);
        return { ok: true, template: { ...result.template, id: saved.id } };
      } catch (error) {
        if (
          error instanceof WorkspaceLibraryError &&
          error.code === 'unavailable'
        )
          invalidateSave();
        if (isCurrent())
          setCommandError(
            error instanceof WorkspaceLibraryError ? error.code : 'request',
          );
        return { ok: false, error: 'storage' };
      } finally {
        if (locked.current === owner) locked.current = null;
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
        commandError: visible ? commandError : null,
        reloadServerDraft: async () => {
          if (!available.current || locked.current) return;
          const version = generation.current;
          const owner = ++command.current;
          locked.current = owner;
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
            if (locked.current === owner) locked.current = null;
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
