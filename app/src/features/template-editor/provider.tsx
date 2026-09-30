import AsyncStorage from '@react-native-async-storage/async-storage';
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
  decodeTemplates,
  emptyTemplates,
  prepareTemplate,
  templateStorageKey,
  type Template,
  type TemplateDraft,
  type TemplateState,
  type TemplateResult,
} from '@/domain/templates';
import { trainerLibrary } from '@/features/trainer-library/ru';
export const builtInTemplates: Template[] = trainerLibrary.templateData.map(
  (t) => ({
    ...t,
    description: '',
    exercises: t.exercises.map((e) => ({
      ...e,
      name: trainerLibrary.exerciseData.find((x) => x.id === e.id)!.name,
      rest: 90,
      unit: e.reps.includes('сек') ? 'сек' : 'повт',
    })),
  }),
);
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type Status = 'loading' | 'saved' | 'saving' | 'error';
type Value = {
  templates: Template[];
  draft: TemplateDraft | null;
  ready: boolean;
  readError: boolean;
  busy: boolean;
  status: Status;
  update: (draft: TemplateDraft) => void;
  begin: (id?: string, copy?: boolean) => boolean;
  discard: () => Promise<boolean>;
  save: () => Promise<TemplateResult>;
  retry: () => void;
};
const Context = createContext<Value | null>(null);
const catalog = (state: TemplateState) => [
  ...builtInTemplates.map((t) => state.items.find((x) => x.id === t.id) ?? t),
  ...state.items.filter((t) => !builtInTemplates.some((x) => x.id === t.id)),
];
export function TemplateProvider({
  children,
  storage = AsyncStorage,
}: PropsWithChildren<{ storage?: Storage }>) {
  const [state, setState] = useState(emptyTemplates);
  const [status, setStatus] = useState<Status>('loading');
  const [readError, setReadError] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const current = useRef(state);
  const available = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const writes = useRef(Promise.resolve(true));
  useEffect(() => {
    let active = true;
    mounted.current = true;
    available.current = false;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setReady(false);
          setStatus('loading');
        }
        return storage.getItem(templateStorageKey);
      })
      .then((raw) => {
        const value = decodeTemplates(raw);
        if (!active) return;
        if (!value) throw new Error('Invalid templates');
        current.current = value;
        available.current = true;
        setState(value);
        setReady(true);
        setReadError(false);
        setStatus('saved');
      })
      .catch(() => {
        if (active) {
          setReadError(true);
          setStatus('error');
        }
      });
    return () => {
      active = false;
      mounted.current = false;
      available.current = false;
    };
  }, [storage, reload]);
  const persist = (next: TemplateState) => {
    const ticket = ++revision.current;
    const raw = JSON.stringify(next);
    setStatus('saving');
    const result = writes.current
      .then(() => storage.setItem(templateStorageKey, raw))
      .then(() => {
        if (mounted.current && ticket === revision.current) setStatus('saved');
        return true;
      })
      .catch(() => {
        if (mounted.current && ticket === revision.current) setStatus('error');
        return false;
      });
    writes.current = result;
    return result;
  };
  const update = (draft: TemplateDraft) => {
    if (!available.current || locked.current) return;
    const next = { ...current.current, draft };
    current.current = next;
    setState(next);
    void persist(next);
  };
  const commit = async (next: TemplateState) => {
    locked.current = true;
    setBusy(true);
    const ok = await persist(next);
    if (ok) {
      current.current = next;
      if (mounted.current) setState(next);
    }
    locked.current = false;
    if (mounted.current) setBusy(false);
    return ok;
  };
  const value: Value = {
    templates: catalog(state),
    draft: state.draft,
    ready,
    readError,
    busy,
    status,
    update,
    begin: (id, copy) => {
      if (!available.current || locked.current) return false;
      const template = catalog(current.current).find((t) => t.id === id);
      if (id && !template) return false;
      update(beginTemplate(template, copy));
      return true;
    },
    discard: async () =>
      available.current && !locked.current
        ? commit({ ...current.current, draft: null })
        : false,
    save: async () => {
      if (!available.current || locked.current || !current.current.draft)
        return { ok: false, error: 'storage' };
      const result = prepareTemplate(
        current.current.draft,
        catalog(current.current),
        `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      );
      if (!result.ok) return result;
      const next: TemplateState = {
        ...current.current,
        items: [
          ...current.current.items.filter((t) => t.id !== result.template.id),
          result.template,
        ],
        draft: null,
      };
      return (await commit(next)) ? result : { ok: false, error: 'storage' };
    },
    retry: () => {
      if (!available.current) setReload((n) => n + 1);
      else if (!locked.current) void persist(current.current);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useOptionalTemplates = () => useContext(Context);
export function useTemplates() {
  const value = useOptionalTemplates();
  if (!value) throw new Error('TemplateProvider is required');
  return value;
}
