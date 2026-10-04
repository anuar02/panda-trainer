import type { JsonValue, JournalOperation } from '@/domain/workout-sync/types';
import type { CorrectionScope } from './types';
import { validUuid, validRevision } from './types';
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/.test(value) &&
  Number.isFinite(Date.parse(value));
export const json = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  return isRecord(value) && Object.values(value).every(json);
};
const nullableNumber = (value: unknown) =>
  value === null || validRevision(value);
export function validateOperation(
  value: unknown,
  scope: CorrectionScope,
): JournalOperation {
  if (
    !isRecord(value) ||
    !validUuid(value.operation_id) ||
    !validUuid(value.entity_id) ||
    !validUuid(value.device_id) ||
    !validRevision(value.base_revision) ||
    !timestamp(value.created_at) ||
    !isRecord(value.payload) ||
    Object.keys(value).sort().join(',') !==
      'base_revision,created_at,device_id,entity_id,kind,operation_id,payload'
  )
    throw new Error('correction_response');
  const p = value.payload;
  const fields: Record<string, string[]> = {
    add_exercise: [
      'workout_instance_id',
      'exercise_id',
      'position',
      'planned_sets',
    ],
    replace_exercise: [
      'workout_instance_id',
      'exercise_id',
      'position',
      'planned_sets',
      'replaced_from_id',
    ],
    upsert_set: [
      'workout_instance_id',
      'workout_exercise_id',
      'position',
      'reps',
      'seconds',
      'weight_g',
    ],
    delete_set: ['workout_instance_id', 'workout_exercise_id'],
    set_note: ['workout_instance_id', 'text', 'shared'],
    resolve_conflict: ['conflict_id', 'selected_version', 'expected_revision'],
  };
  const keys = typeof value.kind === 'string' ? fields[value.kind] : undefined;
  if (!keys || Object.keys(p).sort().join(',') !== [...keys].sort().join(','))
    throw new Error('correction_response');
  if (value.kind === 'resolve_conflict') {
    if (
      !validUuid(p.conflict_id) ||
      !['current', 'incoming'].includes(String(p.selected_version)) ||
      !validRevision(p.expected_revision) ||
      p.expected_revision < 1 ||
      value.base_revision !== p.expected_revision
    )
      throw new Error('correction_response');
  } else {
    if (
      !validUuid(p.workout_instance_id) ||
      p.workout_instance_id.toLowerCase() !== scope.workoutId
    )
      throw new Error('correction_response');
    if (
      ['add_exercise', 'replace_exercise'].includes(String(value.kind)) &&
      (!validUuid(p.exercise_id) ||
        !validRevision(p.position) ||
        !validRevision(p.planned_sets))
    )
      throw new Error('correction_response');
    if (value.kind === 'replace_exercise' && !validUuid(p.replaced_from_id))
      throw new Error('correction_response');
    if (
      ['upsert_set', 'delete_set'].includes(String(value.kind)) &&
      !validUuid(p.workout_exercise_id)
    )
      throw new Error('correction_response');
    if (
      value.kind === 'upsert_set' &&
      (!validRevision(p.position) ||
        !nullableNumber(p.reps) ||
        !nullableNumber(p.seconds) ||
        !nullableNumber(p.weight_g) ||
        (p.reps !== null && p.seconds !== null))
    )
      throw new Error('correction_response');
    if (
      value.kind === 'set_note' &&
      (typeof p.text !== 'string' || typeof p.shared !== 'boolean')
    )
      throw new Error('correction_response');
  }
  if (!json(value)) throw new Error('correction_response');
  return JSON.parse(JSON.stringify(value)) as JournalOperation;
}
export function validateCurrent(value: unknown, scope: CorrectionScope) {
  if (
    !isRecord(value) ||
    !json(value) ||
    !Array.isArray(value.sets) ||
    !Array.isArray(value.replacements)
  )
    throw new Error('correction_response');
  const row = (candidate: unknown) => {
    if (
      !isRecord(candidate) ||
      !validUuid(candidate.id) ||
      candidate.workspace_id !== scope.workspaceId ||
      candidate.workout_instance_id !== scope.workoutId ||
      !validRevision(candidate.revision) ||
      candidate.revision < 1
    )
      throw new Error('correction_response');
    if ('weight_g' in candidate && !nullableNumber(candidate.weight_g))
      throw new Error('correction_response');
    if ('reps' in candidate && !nullableNumber(candidate.reps))
      throw new Error('correction_response');
    if ('seconds' in candidate && !nullableNumber(candidate.seconds))
      throw new Error('correction_response');
    if (
      'text' in candidate &&
      (typeof candidate.text !== 'string' ||
        typeof candidate.shared !== 'boolean')
    )
      throw new Error('correction_response');
    if (
      'exercise_id' in candidate &&
      (!validUuid(candidate.exercise_id) ||
        typeof candidate.exercise_name_snapshot !== 'string' ||
        !['reps', 'seconds'].includes(String(candidate.measure_snapshot)))
    )
      throw new Error('correction_response');
    if ('device_id' in candidate && !validUuid(candidate.device_id))
      throw new Error('correction_response');
    if (
      'deleted_at' in candidate &&
      !(candidate.deleted_at === null || timestamp(candidate.deleted_at))
    )
      throw new Error('correction_response');
    if ('skipped' in candidate && typeof candidate.skipped !== 'boolean')
      throw new Error('correction_response');
    if ('planned_sets' in candidate && !validRevision(candidate.planned_sets))
      throw new Error('correction_response');
    if (
      'replaced_from_id' in candidate &&
      !(
        candidate.replaced_from_id === null ||
        validUuid(candidate.replaced_from_id)
      )
    )
      throw new Error('correction_response');

    return candidate;
  };
  for (const candidate of [value.entity, value.exercise])
    if (candidate !== null) row(candidate);
  for (const candidate of value.sets) {
    const set = row(candidate);
    if (
      !validUuid(set.workout_exercise_id) ||
      !validUuid(set.device_id) ||
      !validRevision(set.position) ||
      !nullableNumber(set.reps) ||
      !nullableNumber(set.seconds) ||
      !nullableNumber(set.weight_g)
    )
      throw new Error('correction_response');
  }
  for (const candidate of value.replacements) row(candidate);
  return value;
}

export function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
