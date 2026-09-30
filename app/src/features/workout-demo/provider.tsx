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
  createWorkoutState,
  decodeWorkoutState,
  workoutReducer,
  type WorkoutAction,
  type WorkoutState,
} from '@/domain/workout';

export const workoutStorageKey = 'panda-trainer.demo-workouts.v1';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type StorageStatus = 'loading' | 'saved' | 'saving' | 'error';
type WorkoutContextValue = {
  state: WorkoutState;
  hydrated: boolean;
  readError: boolean;
  storageStatus: StorageStatus;
  dispatch: (action: WorkoutAction) => boolean;
  retrySave: () => void;
};
const WorkoutContext = createContext<WorkoutContextValue | null>(null);

export function WorkoutDemoProvider({
  children,
  storage = AsyncStorage,
}: PropsWithChildren<{ storage?: Storage }>) {
  const [state, setState] = useState(createWorkoutState);
  const [hydrated, setHydrated] = useState(false);
  const [readError, setReadError] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading');
  const current = useRef(state);
  const ready = useRef(false);
  const mounted = useRef(false);
  const loadTicket = useRef(0);
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());

  const load = useCallback(() => {
    const ticket = ++loadTicket.current;
    ready.current = false;
    return Promise.resolve()
      .then(() => storage.getItem(workoutStorageKey))
      .then((raw) => {
        const restored =
          raw === null ? createWorkoutState() : decodeWorkoutState(raw);
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
    (next: WorkoutState) => {
      const version = ++revision.current;
      const payload = JSON.stringify(next);
      setStorageStatus('saving');
      writes.current = writes.current
        .then(() => storage.setItem(workoutStorageKey, payload))
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
    (action: WorkoutAction) => {
      if (!ready.current) return false;
      const next = workoutReducer(current.current, action);
      if (next === current.current) return false;
      current.current = next;
      setState(next);
      persist(next);
      return true;
    },
    [persist],
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
    }),
    [state, hydrated, readError, storageStatus, dispatch, retrySave],
  );

  return (
    <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>
  );
}

export function useOptionalWorkoutDemo() {
  return useContext(WorkoutContext);
}

export function useWorkoutDemo() {
  const value = useOptionalWorkoutDemo();
  if (!value) throw new Error('WorkoutDemoProvider is required');
  return value;
}
