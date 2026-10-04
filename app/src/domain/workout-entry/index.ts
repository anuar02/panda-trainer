import type { PreloadParticipant, PreloadSet } from '../workout-preload/types';
import type {
  PendingOperation,
  OperationResult,
  SyncScope,
  JournalOperation,
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
  finishOperation?: JournalOperation;
  finishResolution?: {
    operationId: string;
    conflictId: string;
    selection: 'current' | 'incoming';
    operation?: JournalOperation;
  };
  finishRelease?: {
    operationId: string;
    resolutionOperationId: string;
    revision: number;
  };
  finishHistory?: {
    operation: JournalOperation;
    resolution: NonNullable<EntryWorkout['finishResolution']>;
    release: NonNullable<EntryWorkout['finishRelease']>;
  }[];
};
export type EntryFinish = {
  status:
    | 'available'
    | 'saved_on_phone'
    | 'applied'
    | 'not_finished'
    | 'error'
    | 'conflict'
    | 'correction_draft';
  operationId: string | null;
  issue: OperationResult | null;
};
export function workoutFinishLocked(workout: EntryWorkout): boolean {
  if (!workout.finishOperation) return false;
  const release = workout.finishRelease;
  return !(
    release &&
    Number.isSafeInteger(release.revision) &&
    release.revision > workout.finishOperation.base_revision &&
    release.operationId === workout.finishOperation.operation_id &&
    release.resolutionOperationId === workout.finishResolution?.operationId &&
    workout.finishResolution?.selection === 'current' &&
    workout.participant.workoutStatus === 'in_progress' &&
    workout.participant.workoutRevision >= release.revision
  );
}
export function summarizeWorkoutFinish(
  participant: PreloadParticipant,
  draft?: EntryDraft,
) {
  let recordedSets = 0;
  let plannedSets = 0;
  let unrecordedSets = 0;
  for (const exercise of participant.exercises) {
    const recorded = exercise.sets.filter(
      (set) =>
        !set.deletedAt &&
        (exercise.measure === 'reps'
          ? set.reps !== null && set.seconds === null
          : set.seconds !== null && set.reps === null),
    ).length;
    recordedSets += recorded;
    plannedSets += exercise.skipped ? recorded : exercise.plannedSets;
    if (!exercise.skipped)
      unrecordedSets += Math.max(0, exercise.plannedSets - recorded);
  }
  const draftCount = Object.entries(draft?.values ?? {}).filter(
    ([id, values]) =>
      participant.exercises.some((exercise) => exercise.id === id) &&
      Object.values(values).some((value) => value !== null),
  ).length;
  const assigned = new Set(
    participant.assignedExercises.map((exercise) => exercise.exerciseId),
  );
  return {
    recordedSets,
    plannedSets,
    unrecordedSets,
    draftCount,
    needsConfirmation:
      plannedSets === 0 || unrecordedSets > 0 || draftCount > 0,
    addedExerciseIds: participant.exercises
      .filter(
        (exercise) =>
          !exercise.skipped &&
          !exercise.replacedFromId &&
          !assigned.has(exercise.exerciseId),
      )
      .map((exercise) => exercise.id),
    replacedExerciseIds: participant.exercises
      .filter((exercise) => !exercise.skipped && exercise.replacedFromId)
      .map((exercise) => exercise.id),
  };
}
export function workoutFinishState(
  workout: EntryWorkout,
  pending: PendingOperation[],
  issues: OperationResult[],
): EntryFinish {
  const operation = workout.finishOperation;
  const issue =
    issues.find((item) => item.operation_id === operation?.operation_id) ??
    pending.find(
      (item) => item.operation.operation_id === operation?.operation_id,
    )?.result ??
    pending.find(
      (item) =>
        item.operation.operation_id === workout.finishResolution?.operationId,
    )?.result ??
    (operation || workout.participant.workoutStatus === 'finished'
      ? issues.find((item) => item.status !== 'applied')
      : null) ??
    null;
  if (issue && issue.status !== 'applied')
    return {
      status: issue.status,
      operationId: operation?.operation_id ?? null,
      issue,
    };
  const choseCurrent = operation && !workoutFinishLocked(workout);
  return {
    status:
      workout.participant.workoutStatus === 'finished'
        ? 'applied'
        : choseCurrent
          ? 'not_finished'
          : operation
            ? 'saved_on_phone'
            : 'available',
    operationId: operation?.operation_id ?? null,
    issue: null,
  };
}
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
    ...pending
      .filter((item) => item.result?.status !== 'applied')
      .flatMap((item) => [
        item.operation.entity_id,
        ...(typeof item.operation.payload.replaced_from_id === 'string'
          ? [item.operation.payload.replaced_from_id]
          : []),
      ]),
    ...issues
      .filter((item) => item.status !== 'applied')
      .map((item) => item.entity_id),
  ]);
  if (
    local.finishOperation &&
    server.workoutStatus !== 'finished' &&
    server.workoutRevision <= local.finishOperation.base_revision
  )
    for (const exercise of local.participant.exercises) {
      protectedIds.add(exercise.id);
      for (const set of exercise.sets) protectedIds.add(set.id);
    }
  if (
    local.finishRelease &&
    server.workoutStatus === 'in_progress' &&
    server.workoutRevision <= local.finishRelease.revision
  ) {
    for (const exercise of local.participant.exercises) {
      const remote = server.exercises.find((item) => item.id === exercise.id);
      if (!remote) protectedIds.add(exercise.id);
      for (const set of exercise.sets) {
        const remoteSet = remote?.sets.find((item) => item.id === set.id);
        if (!remoteSet || remoteSet.revision <= set.revision)
          protectedIds.add(set.id);
      }
    }
  }
  const retainedExerciseIds = new Set<string>();
  for (const exercise of local.participant.exercises) {
    if (protectedIds.has(exercise.id)) {
      retainedExerciseIds.add(exercise.id);
      if (exercise.replacedFromId) {
        protectedIds.add(exercise.replacedFromId);
        retainedExerciseIds.add(exercise.replacedFromId);
      }
    }
    if (exercise.sets.some((set) => protectedIds.has(set.id)))
      retainedExerciseIds.add(exercise.id);
  }
  for (const item of pending) {
    const parentId = item.operation.payload.workout_exercise_id;
    if (item.result?.status !== 'applied' && typeof parentId === 'string')
      retainedExerciseIds.add(parentId);
  }
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
    if (protectedIds.has(exercise.id)) return previous;
    const sets = exercise.sets
      .filter((set) => !('deletedAt' in set) || !set.deletedAt)
      .filter(
        (set) =>
          (!local.tombstones.includes(set.id) &&
            local.tombstoneRevisions?.[set.id] === undefined) ||
          (!protectedIds.has(set.id) &&
            set.revision >
              (local.tombstoneRevisions?.[set.id] ?? Number.MAX_SAFE_INTEGER)),
      );
    for (const set of previous.sets) {
      if (protectedIds.has(set.id) && !local.tombstones.includes(set.id)) {
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
      retainedExerciseIds.has(exercise.id) &&
      !exercises.some((item) => item.id === exercise.id)
    )
      exercises.push(
        protectedIds.has(exercise.id)
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.filter(
                (set) =>
                  protectedIds.has(set.id) &&
                  !local.tombstones.includes(set.id),
              ),
            },
      );
  return {
    participant: {
      ...server,
      exercises,
    },
    ...(local.finishOperation
      ? { finishOperation: local.finishOperation }
      : {}),
    ...(local.finishResolution
      ? { finishResolution: local.finishResolution }
      : {}),
    ...(local.finishRelease ? { finishRelease: local.finishRelease } : {}),
    ...(local.finishHistory ? { finishHistory: local.finishHistory } : {}),
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
