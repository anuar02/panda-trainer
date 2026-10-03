import type { PreloadParticipant, PreloadSet } from '../workout-preload/types';
import type {
  PendingOperation,
  OperationResult,
  SyncScope,
} from '../workout-sync/types';

export type SetValues = Pick<PreloadSet, 'weightGrams' | 'reps' | 'seconds'>;
export type EntryDraft = {
  workoutId: string;
  bookingId: string;
  focusExerciseId: string | null;
  values: Record<string, SetValues>;
  localEntityIds?: string[];
};
export type EntryWorkout = {
  participant: PreloadParticipant;
  tombstones: string[];
  tombstoneRevisions?: Record<string, number>;
};
export interface EntryDraftStore {
  readonly scope: SyncScope;
  read(workoutId: string): Promise<EntryDraft | null>;
  save(draft: EntryDraft): Promise<void>;
  close(): Promise<void>;
}
export function validateSetValues(values: SetValues): void {
  for (const value of [values.weightGrams, values.reps, values.seconds]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error('invalid_set_values');
  }
}
export function copyPreviousSet(set: SetValues): SetValues {
  validateSetValues(set);
  return { weightGrams: set.weightGrams, reps: set.reps, seconds: set.seconds };
}
export function validateDraft(draft: EntryDraft): void {
  if (
    !draft.workoutId ||
    !draft.bookingId ||
    (draft.focusExerciseId !== null &&
      typeof draft.focusExerciseId !== 'string') ||
    !draft.values ||
    typeof draft.values !== 'object' ||
    Array.isArray(draft.values)
  )
    throw new Error('invalid_entry_draft');
  Object.values(draft.values).forEach(validateSetValues);
}
export function reconcileWorkout(
  server: PreloadParticipant,
  local: EntryWorkout | null,
  pending: PendingOperation[],
  issues: OperationResult[],
): EntryWorkout {
  if (!local || local.participant.workoutId !== server.workoutId)
    return {
      participant: {
        ...server,
        exercises: server.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter(
            (set) => !('deletedAt' in set) || !set.deletedAt,
          ),
        })),
      },
      tombstones: [],
    };
  const protectedIds = new Set([
    ...pending.flatMap((item) => [
      item.operation.entity_id,
      ...(typeof item.operation.payload.replaced_from_id === 'string'
        ? [item.operation.payload.replaced_from_id]
        : []),
    ]),
    ...issues.map((item) => item.entity_id),
  ]);
  const protectedWorkout = protectedIds.has(server.workoutId);
  const exercises = server.exercises.map((exercise) => {
    const previous = local.participant.exercises.find(
      (item) => item.id === exercise.id,
    );
    if (!previous)
      return {
        ...exercise,
        sets: exercise.sets.filter(
          (set) => !('deletedAt' in set) || !set.deletedAt,
        ),
      };
    if (
      protectedIds.has(exercise.id) ||
      local.participant.exercises.some(
        (item) =>
          item.replacedFromId === exercise.id &&
          !server.exercises.some((remote) => remote.id === item.id),
      )
    )
      return previous;
    const sets = exercise.sets
      .filter((set) => !('deletedAt' in set) || !set.deletedAt)
      .filter(
        (set) =>
          !local.tombstones.includes(set.id) ||
          (!protectedIds.has(set.id) &&
            set.revision >
              (local.tombstoneRevisions?.[set.id] ?? Number.MAX_SAFE_INTEGER)),
      );
    for (const set of previous.sets) {
      if (
        protectedIds.has(set.id) ||
        (!sets.some((item) => item.id === set.id) &&
          !exercise.sets.some((item) => item.id === set.id))
      ) {
        const index = sets.findIndex((item) => item.id === set.id);
        if (index < 0) sets.push(set);
        else sets[index] = set;
      }
    }
    return {
      ...exercise,
      sets: sets.sort(
        (a, b) => a.position - b.position || a.id.localeCompare(b.id),
      ),
    };
  });
  for (const exercise of local.participant.exercises)
    if (
      (protectedIds.has(exercise.id) || exercise.revision > 0) &&
      !exercises.some((item) => item.id === exercise.id)
    )
      exercises.push(exercise);
  return {
    participant: {
      ...server,
      ...(protectedWorkout
        ? { workoutRevision: local.participant.workoutRevision }
        : {}),
      exercises,
    },
    ...(local.tombstoneRevisions
      ? { tombstoneRevisions: local.tombstoneRevisions }
      : {}),
    tombstones: local.tombstones.filter(
      (id) =>
        protectedIds.has(id) ||
        server.exercises.some((exercise) =>
          exercise.sets.some(
            (set) =>
              set.id === id &&
              (!('deletedAt' in set) || !set.deletedAt) &&
              set.revision <=
                (local.tombstoneRevisions?.[id] ?? Number.MAX_SAFE_INTEGER),
          ),
        ),
    ),
  };
}
