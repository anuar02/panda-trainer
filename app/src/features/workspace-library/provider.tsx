import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  beginTemplate,
  prepareTemplate,
  type Template,
} from '@/domain/templates';
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
  const saveOperation = useRef<{
    operation: ReturnType<typeof saveWorkspaceTemplateOperation>;
    template: Template;
  } | null>(null);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    available.current = false;
    void Promise.all([
      loadWorkspaceLibrary(workspaceId),
      AsyncStorage.getItem(key).then(decodeWorkspaceDraft),
    ]).then(
      ([data, draft]) => {
        if (!active) return;
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
        setReady(true);
        setReadError(false);
        setStatus('saved');
      },
      () => {
        if (active) {
          setReadError(true);
          setStatus('error');
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      available.current = false;
    };
  }, [key, userId, workspaceId, attempt]);

  const persist = (next: WorkspaceDraft) => {
    const revision = ++ticket.current;
    setStatus('saving');
    const result = writes.current
      .then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
      .then(() => {
        if (mounted.current && revision === ticket.current) setStatus('saved');
        return true;
      })
      .catch(() => {
        if (mounted.current && revision === ticket.current) setStatus('error');
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
  const refresh = async () => {
    const data = await loadWorkspaceLibrary(workspaceId);
    if (mounted.current) {
      catalog.current = data;
      setLibrary(data);
    }
  };
  const editor: TemplateEditorStore = {
    templates: library.templates,
    draft: local.draft,
    ready,
    readError,
    busy,
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
      locked.current = true;
      setBusy(true);
      const ok = await persist(emptyDraft);
      if (ok && mounted.current) {
        current.current = emptyDraft;
        setLocal(emptyDraft);
        saveOperation.current = null;
        setCommandError(null);
      }
      locked.current = false;
      if (mounted.current) setBusy(false);
      return ok;
    },
    save: async () => {
      if (!available.current || locked.current || !current.current.draft)
        return { ok: false, error: 'storage' };
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
          if (!mounted.current || !available.current)
            return { ok: false, error: 'storage' };
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
        await refresh();
        if (!mounted.current) return { ok: false, error: 'storage' };
        if (!(await persist(emptyDraft)))
          return { ok: false, error: 'storage' };
        if (mounted.current) {
          current.current = emptyDraft;
          setLocal(emptyDraft);
          saveOperation.current = null;
        }
        return { ok: true, template: { ...result.template, id: saved.id } };
      } catch (error) {
        if (mounted.current)
          setCommandError(
            error instanceof WorkspaceLibraryError ? error.code : 'request',
          );
        return { ok: false, error: 'storage' };
      } finally {
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    retry: () => {
      if (!available.current) setAttempt((value) => value + 1);
      else if (!locked.current) void persist(current.current);
    },
  };
  const sources: typeof media = {};
  for (const exercise of [
    ...library.exercises,
    ...library.templates.flatMap((template) =>
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
        library,
        media: sources,
        refresh,
        commandError,
        reloadServerDraft: async () => {
          if (locked.current) return;
          locked.current = true;
          setBusy(true);
          try {
            const id = current.current.draft?.id;
            await refresh();
            if (!mounted.current) return;
            const template = catalog.current.templates.find(
              (item) => item.id === id,
            );
            if (template)
              update({
                draft: beginTemplate(template),
                baseRevision: template.revision,
              });
            else if (id) throw new WorkspaceLibraryError('unavailable');
          } finally {
            locked.current = false;
            if (mounted.current) setBusy(false);
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
