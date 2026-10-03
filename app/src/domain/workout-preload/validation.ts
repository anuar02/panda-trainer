import type { SyncScope } from '../workout-sync/types';
import type { WorkoutPreloadContext, WorkoutRecovery } from './types';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function id(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}
function integer(value: unknown, minimum = 0): boolean {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
  );
}
function optionalInteger(value: unknown, minimum = 0): boolean {
  return value === null || integer(value, minimum);
}
function text(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
function date(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function unique(values: unknown[], key: string): boolean {
  return (
    new Set(values.map((value) => (record(value) ? value[key] : undefined)))
      .size === values.length
  );
}
function set(value: unknown, measure: unknown): boolean {
  return (
    record(value) &&
    keys(value, [
      'id',
      'revision',
      'position',
      'weightGrams',
      'reps',
      'seconds',
      ...(Object.prototype.hasOwnProperty.call(value, 'deletedAt')
        ? ['deletedAt']
        : []),
    ]) &&
    (value.deletedAt === undefined ||
      value.deletedAt === null ||
      date(value.deletedAt)) &&
    id(value.id) &&
    integer(value.revision) &&
    integer(value.position) &&
    optionalInteger(value.weightGrams) &&
    optionalInteger(value.reps) &&
    optionalInteger(value.seconds) &&
    (measure === 'reps' ? value.seconds === null : value.reps === null)
  );
}
function exercise(value: unknown): boolean {
  return (
    record(value) &&
    keys(value, [
      'id',
      'exerciseId',
      'name',
      'measure',
      'position',
      'plannedSets',
      'plannedReps',
      'plannedSeconds',
      'plannedWeightGrams',
      'restSeconds',
      'revision',
      'sets',
      'previousSets',
      'bodyweight',
      'muscleGroup',
      'equipment',
      'instructions',
      'sourceKey',
      'skipped',
      'replacedFromId',
    ]) &&
    id(value.id) &&
    id(value.exerciseId) &&
    text(value.name) &&
    typeof value.bodyweight === 'boolean' &&
    typeof value.muscleGroup === 'string' &&
    typeof value.equipment === 'string' &&
    Array.isArray(value.instructions) &&
    value.instructions.every(
      (instruction: unknown) => typeof instruction === 'string',
    ) &&
    (value.sourceKey === null || typeof value.sourceKey === 'string') &&
    typeof value.skipped === 'boolean' &&
    (value.replacedFromId === null || id(value.replacedFromId)) &&
    ['reps', 'seconds'].includes(String(value.measure)) &&
    integer(value.position) &&
    integer(value.plannedSets) &&
    (value.plannedReps === null ||
      (typeof value.plannedReps === 'string' &&
        /^[0-9]{1,3}([–-][0-9]{1,3})?$/.test(value.plannedReps))) &&
    (value.plannedSeconds === null ||
      (typeof value.plannedSeconds === 'string' &&
        /^[0-9]{1,4}([–-][0-9]{1,4})?$/.test(value.plannedSeconds))) &&
    optionalInteger(value.plannedWeightGrams) &&
    (value.plannedWeightGrams === null ||
      (typeof value.plannedWeightGrams === 'number' &&
        value.plannedWeightGrams <= 1000000)) &&
    optionalInteger(value.restSeconds) &&
    (value.restSeconds === null ||
      (typeof value.restSeconds === 'number' && value.restSeconds <= 600)) &&
    integer(value.revision) &&
    (value.measure === 'reps'
      ? value.plannedSeconds === null
      : value.plannedReps === null) &&
    Array.isArray(value.sets) &&
    value.sets.every((item) => set(item, value.measure)) &&
    unique(value.sets, 'id') &&
    unique(value.sets, 'position') &&
    Array.isArray(value.previousSets) &&
    value.previousSets.every((item) => set(item, value.measure)) &&
    unique(value.previousSets, 'id') &&
    unique(value.previousSets, 'position')
  );
}
function exercises(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.every(exercise) &&
    unique(value, 'id') &&
    unique(value, 'position') &&
    value.every(
      (item: unknown) =>
        record(item) &&
        (item.replacedFromId === null ||
          (item.replacedFromId !== item.id &&
            value.some(
              (target: unknown) =>
                record(target) && target.id === item.replacedFromId,
            ))),
    )
  );
}
function participant(value: unknown): boolean {
  return (
    record(value) &&
    keys(value, [
      'bookingId',
      'clientRecordId',
      'clientName',
      'programId',
      'programName',
      'programRevision',
      'workoutId',
      'workoutRevision',
      'workoutStatus',
      'exercises',
      'assignedExercises',
      'programDescription',
      'baseTemplateId',
    ]) &&
    id(value.bookingId) &&
    id(value.clientRecordId) &&
    text(value.clientName) &&
    id(value.programId) &&
    text(value.programName) &&
    typeof value.programDescription === 'string' &&
    id(value.baseTemplateId) &&
    integer(value.programRevision) &&
    id(value.workoutId) &&
    integer(value.workoutRevision) &&
    ['not_created', 'in_progress', 'finished'].includes(
      String(value.workoutStatus),
    ) &&
    exercises(value.exercises) &&
    exercises(value.assignedExercises) &&
    value.assignedExercises.length > 0
  );
}
export function validateWorkoutPreloadContext(
  value: unknown,
  scope: SyncScope,
): WorkoutPreloadContext {
  if (
    !record(value) ||
    !keys(value, [
      'version',
      'scope',
      'sessionKey',
      'startsAt',
      'loadedAt',
      'participants',
    ]) ||
    value.version !== 1 ||
    !record(value.scope) ||
    !keys(value.scope, ['accountId', 'workspaceId']) ||
    !id(scope.accountId) ||
    !id(scope.workspaceId) ||
    value.scope.accountId !== scope.accountId ||
    value.scope.workspaceId !== scope.workspaceId ||
    !text(value.sessionKey) ||
    !date(value.startsAt) ||
    !date(value.loadedAt) ||
    !Array.isArray(value.participants) ||
    value.participants.length === 0 ||
    !value.participants.every(participant) ||
    !unique(value.participants, 'bookingId') ||
    !unique(value.participants, 'clientRecordId') ||
    !unique(value.participants, 'workoutId')
  )
    throw new Error('Invalid workout preload context');
  const exerciseIds = value.participants.flatMap((item: unknown) =>
    record(item) && Array.isArray(item.exercises) ? item.exercises : [],
  );
  const assignedIds = value.participants.flatMap((item: unknown) =>
    record(item) && Array.isArray(item.assignedExercises)
      ? item.assignedExercises
      : [],
  );
  const assignedSetIds = assignedIds.flatMap((item: unknown) =>
    record(item) && Array.isArray(item.sets) ? item.sets : [],
  );
  const setIds = exerciseIds.flatMap((item: unknown) =>
    record(item) && Array.isArray(item.sets) ? item.sets : [],
  );
  if (
    !unique(exerciseIds, 'id') ||
    !unique(setIds, 'id') ||
    !unique(assignedIds, 'id') ||
    !unique(assignedSetIds, 'id')
  )
    throw new Error('Invalid workout preload relations');
  return value as unknown as WorkoutPreloadContext;
}
export function validateWorkoutRecovery(value: unknown): WorkoutRecovery {
  if (
    !record(value) ||
    !keys(value, [
      'version',
      'sessionKey',
      'bookingId',
      'clientRecordId',
      'collapsed',
    ]) ||
    value.version !== 1 ||
    !text(value.sessionKey) ||
    !id(value.bookingId) ||
    !id(value.clientRecordId) ||
    typeof value.collapsed !== 'boolean'
  )
    throw new Error('Invalid workout recovery');
  return value as unknown as WorkoutRecovery;
}
