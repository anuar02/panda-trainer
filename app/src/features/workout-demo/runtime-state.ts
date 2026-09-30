import type {
  WorkoutAction,
  WorkoutJournal,
  WorkoutState,
} from '@/domain/workout';

export type RestClock = {
  exerciseId: string;
  total: number;
  until: number;
  startedAt: number;
  preferenceKey?: string;
};
export type WorkoutRuntimeState = {
  focus: Record<string, string | null>;
  rest: Record<string, RestClock>;
  lengths: Record<string, number>;
};
export const runtimeKey = (sessionId: string, clientId: string) =>
  `${sessionId}:${clientId}`;
export const createRuntimeState = (): WorkoutRuntimeState => ({
  focus: {},
  rest: {},
  lengths: {},
});
export function restSnapshot(rest: RestClock | undefined, now: number) {
  if (!rest) return null;
  const seconds = Math.ceil((rest.until - now) / 1000);
  const left = Math.max(0, seconds);
  const over = Math.max(0, -seconds);
  const value = left || over;
  return {
    ...rest,
    left,
    over,
    done: seconds <= 0,
    label: `${seconds > 0 ? '' : '+'}${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`,
  };
}
export function runtimeExercise(
  journal: WorkoutJournal,
  focused: string | null,
) {
  const values = journal.values[journal.active] ?? {};
  const exercises = journal.plans[journal.active]?.exercises ?? [];
  const usable = exercises.filter(
    (exercise) =>
      !(
        exercise.skipped &&
        exercise.replacedBy &&
        !(values[exercise.id] ?? []).some(Boolean)
      ),
  );
  return (
    usable.find((exercise) => exercise.id === focused) ??
    usable.find(
      (exercise) =>
        !exercise.skipped &&
        (values[exercise.id] ?? []).filter(Boolean).length < exercise.sets,
    )
  );
}
export function adjustRuntimeRest(
  state: WorkoutRuntimeState,
  key: string,
  by: number,
  now: number,
) {
  const rest = state.rest[key];
  if (!rest || !Number.isFinite(by)) return state;
  const left = Math.max(5, Math.ceil((rest.until - now) / 1000) + by);
  const total = Math.max(left, Math.min(600, Math.max(15, rest.total + by)));
  return {
    ...state,
    rest: {
      ...state.rest,
      [key]: { ...rest, until: now + left * 1000, total },
    },
    lengths: {
      ...state.lengths,
      [rest.preferenceKey ?? `${key}:${rest.exerciseId}`]: total,
    },
  };
}
export function skipRuntimeRest(state: WorkoutRuntimeState, key: string) {
  if (!state.rest[key]) return state;
  const rest = { ...state.rest };
  delete rest[key];
  return { ...state, rest };
}
export function afterWorkoutAction(
  runtime: WorkoutRuntimeState,
  before: WorkoutState,
  after: WorkoutState,
  action: WorkoutAction,
  now: number,
): WorkoutRuntimeState {
  const id = after.activeSessionId;
  const journal = id ? after.sessions[id] : undefined;
  const previous = id ? before.sessions[id] : undefined;
  if (!journal || !previous || before === after) return runtime;
  const key = runtimeKey(journal.sessionId, journal.active);
  if (journal.finished) {
    const rest = Object.fromEntries(
      Object.entries(runtime.rest).filter(
        ([entry]) => !entry.startsWith(`${journal.sessionId}:`),
      ),
    );
    return { ...runtime, rest };
  }
  if (action.type === 'undo') return skipRuntimeRest(runtime, key);
  const exercises = journal.plans[journal.active]?.exercises ?? [];
  const count = (source: WorkoutJournal, exerciseId: string) =>
    (source.values[journal.active]?.[exerciseId] ?? []).filter(Boolean).length;
  const changed = exercises.find(
    (exercise) => count(journal, exercise.id) > count(previous, exercise.id),
  );
  if (!changed) return runtime;
  const focus = { ...runtime.focus };
  if (focus[key] === changed.id && count(journal, changed.id) >= changed.sets)
    focus[key] = null;
  const remaining = exercises.some(
    (exercise) =>
      !exercise.skipped && count(journal, exercise.id) < exercise.sets,
  );
  if (!remaining) return { ...skipRuntimeRest(runtime, key), focus };
  const preferenceKey = JSON.stringify([
    key,
    changed.id,
    changed.name,
    changed.unit,
    changed.bodyweight ?? changed.prev.kg === 0,
  ]);
  const total =
    runtime.lengths[preferenceKey] ??
    ((changed.bodyweight ?? changed.prev.kg === 0) ? 60 : 90);
  return {
    ...runtime,
    focus,
    rest: {
      ...runtime.rest,
      [key]: {
        exerciseId: changed.id,
        total,
        until: now + total * 1000,
        startedAt: now,
        preferenceKey,
      },
    },
  };
}
