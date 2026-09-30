import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { WorkoutAction, WorkoutState } from '@/domain/workout';
import {
  afterWorkoutAction,
  adjustRuntimeRest,
  createRuntimeState,
  restSnapshot,
  runtimeKey,
  skipRuntimeRest,
  type WorkoutRuntimeState,
} from './runtime-state';

type RuntimeContextValue = {
  state: WorkoutRuntimeState;
  focus: (key: string, id: string | null) => void;
  adjust: (key: string, by: number) => void;
  skip: (key: string) => void;
};
export const WorkoutRuntimeContext = createContext<RuntimeContextValue | null>(
  null,
);
export function useRuntimeController() {
  const [state, setState] = useState(createRuntimeState);
  const afterAction = useCallback(
    (before: WorkoutState, after: WorkoutState, action: WorkoutAction) => {
      const now = Date.now();
      setState((previous) =>
        afterWorkoutAction(previous, before, after, action, now),
      );
    },
    [],
  );
  const focus = useCallback(
    (key: string, id: string | null) =>
      setState((previous) => ({
        ...previous,
        focus: { ...previous.focus, [key]: id },
      })),
    [],
  );
  const adjust = useCallback((key: string, by: number) => {
    const now = Date.now();
    setState((previous) => adjustRuntimeRest(previous, key, by, now));
  }, []);
  const skip = useCallback(
    (key: string) => setState((previous) => skipRuntimeRest(previous, key)),
    [],
  );
  return {
    value: useMemo(
      () => ({ state, focus, adjust, skip }),
      [state, focus, adjust, skip],
    ),
    afterAction,
  };
}
export function useWorkoutRuntime(sessionId: string, clientId: string) {
  const runtime = useContext(WorkoutRuntimeContext);
  const key = runtimeKey(sessionId, clientId);
  const stored = runtime?.state.rest[key];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!stored) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [stored]);
  return {
    available: Boolean(runtime),
    focusedExerciseId: runtime?.state.focus[key] ?? null,
    focusExercise: (id: string | null) => runtime?.focus(key, id),
    rest: restSnapshot(stored, Math.max(now, stored?.startedAt ?? 0)),
    adjustRest: (by: number) => runtime?.adjust(key, by),
    skipRest: () => runtime?.skip(key),
  };
}
