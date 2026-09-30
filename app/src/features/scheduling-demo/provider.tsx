import { useOptionalTemplates } from '@/features/template-editor/provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  applySchedulingAction,
  createSchedulingState,
  decodeSchedulingState,
  encodeSchedulingState,
  schedulingStorageKey,
  schedulingToday,
  schedulingNow,
  type SchedulingState,
  type SchedulingAction,
  type SchedulingActor,
  type SchedulingResult,
} from '@/domain/scheduling';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type StorageStatus = 'loading' | 'saved' | 'saving' | 'error';
type SchedulingContextValue = {
  state: SchedulingState;
  hydrated: boolean;
  readError: boolean;
  storageStatus: StorageStatus;
  dispatch: (
    action: SchedulingAction,
    actor?: SchedulingActor,
  ) => SchedulingResult;
  retrySave: () => void;
  registerFinished: (ids: readonly string[]) => void;
};
const SchedulingContext = createContext<SchedulingContextValue | null>(null);

export function SchedulingDemoProvider({
  children,
  storage = AsyncStorage,
  waitForWorkout = false,
}: PropsWithChildren<{ storage?: Storage; waitForWorkout?: boolean }>) {
  const templates = useOptionalTemplates();
  const [state, setState] = useState(createSchedulingState);
  const [hydrated, setHydrated] = useState(false);
  const [readError, setReadError] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading');
  const current = useRef(state);
  const ready = useRef(false);
  const mounted = useRef(false);
  const loadTicket = useRef(0);
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());
  const finished = useRef<readonly string[]>([]);
  const workoutReady = useRef(false);
  const registerFinished = useCallback((ids: readonly string[]) => {
    finished.current = ids;
    workoutReady.current = true;
  }, []);

  const load = useCallback(() => {
    const ticket = ++loadTicket.current;
    ready.current = false;
    return Promise.resolve()
      .then(() => storage.getItem(schedulingStorageKey))
      .then((raw) => {
        const restored =
          raw === null ? createSchedulingState() : decodeSchedulingState(raw);
        if (!mounted.current || ticket !== loadTicket.current) return;
        if (!restored) throw new Error('Invalid demo workout storage');
        current.current = restored;
        ready.current = true;
        setState(restored);
        setReadError(false);
        setHydrated(true);
        setStorageStatus('saved');
      })
      .catch(() => {
        if (!mounted.current || ticket !== loadTicket.current) return;
        setReadError(true);
        setHydrated(true);
        setStorageStatus('error');
      });
  }, [storage]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      ready.current = false;
      loadTicket.current += 1;
    };
  }, [load]);

  const persist = useCallback(
    (next: SchedulingState) => {
      const version = ++revision.current;
      const payload = encodeSchedulingState(next);
      setStorageStatus('saving');
      writes.current = writes.current
        .then(() => storage.setItem(schedulingStorageKey, payload))
        .then(() => {
          if (mounted.current && version === revision.current)
            setStorageStatus('saved');
        })
        .catch(() => {
          if (mounted.current && version === revision.current)
            setStorageStatus('error');
        });
    },
    [storage],
  );

  const dispatch = useCallback(
    (
      action: SchedulingAction,
      actor: SchedulingActor = { role: 'trainer' },
    ): SchedulingResult => {
      if (
        !ready.current ||
        (waitForWorkout && !workoutReady.current) ||
        (action.type === 'create' &&
          templates &&
          (!templates.ready || templates.readError))
      )
        return { ok: false, error: 'unavailable' };
      const result = applySchedulingAction(current.current, action, {
        actor,
        templates: templates?.templates.filter((t) => t.custom),
        today: schedulingToday,
        nowTime: schedulingNow,
        finishedSessionIds: finished.current,
      });
      if (!result.ok) return result;
      current.current = result.state;
      setState(result.state);
      persist(result.state);
      return result;
    },
    [persist, waitForWorkout, templates],
  );

  const retrySave = useCallback(() => {
    if (!ready.current) {
      setHydrated(false);
      setStorageStatus('loading');
      void load();
      return;
    }
    persist(current.current);
  }, [load, persist]);

  const value = useMemo(
    () => ({
      state,
      hydrated,
      readError,
      storageStatus,
      dispatch,
      retrySave,
      registerFinished,
    }),
    [
      state,
      hydrated,
      readError,
      storageStatus,
      dispatch,
      retrySave,
      registerFinished,
    ],
  );

  return (
    <SchedulingContext.Provider value={value}>
      {children}
    </SchedulingContext.Provider>
  );
}

export function useOptionalSchedulingDemo() {
  return useContext(SchedulingContext);
}

export function useSchedulingDemo() {
  const value = useOptionalSchedulingDemo();
  if (!value) throw new Error('SchedulingDemoProvider is required');
  return value;
}
