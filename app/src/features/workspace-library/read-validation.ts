import type {
  WorkspaceExerciseRow,
  WorkspaceTemplateRow,
  WorkspaceTemplateExerciseRow,
} from './adapter';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const timestamp = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/.exec(
      value,
    );
  const milliseconds = Date.parse(value);
  return (
    !!match &&
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString().slice(0, 19) ===
      `${match[1]}T${match[2]}`
  );
};
const nullableString = (value: unknown) =>
  value === null || typeof value === 'string';
const strings = (value: unknown) =>
  Array.isArray(value) &&
  Array.from(value).every((item: unknown) => typeof item === 'string');
const named = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= max;
const common = (value: Record<string, unknown>, workspaceId: string) =>
  uuid(value.id) &&
  value.workspace_id === workspaceId &&
  integer(value.revision, 1, 2147483647) &&
  timestamp(value.created_at) &&
  timestamp(value.updated_at) &&
  Date.parse(String(value.created_at)) <=
    Date.parse(String(value.updated_at)) &&
  (value.created_by === null || uuid(value.created_by));
const archive = (value: unknown) => value === null || timestamp(value);
const range = (value: unknown, digits: number, max: number) => {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^[0-9]{1,${digits}}([–-][0-9]{1,${digits}})?$`).test(value)
  )
    return false;
  const values = value.split(/[–-]/).map(Number);
  return (
    values[0]! >= 1 &&
    values[0]! <= max &&
    (values.length === 1 || (values[1]! >= values[0]! && values[1]! <= max))
  );
};
export const isWorkspaceExerciseRead = (
  value: unknown,
  workspaceId: string,
): value is WorkspaceExerciseRow =>
  record(value) &&
  common(value, workspaceId) &&
  named(value.name, 120) &&
  typeof value.muscle_group === 'string' &&
  typeof value.equipment === 'string' &&
  (value.measure === 'reps' || value.measure === 'seconds') &&
  typeof value.bodyweight === 'boolean' &&
  strings(value.aliases) &&
  strings(value.instructions) &&
  nullableString(value.source_key) &&
  nullableString(value.name_normalized) &&
  archive(value.archived_at);
export const isWorkspaceTemplateRead = (
  value: unknown,
  workspaceId: string,
): value is WorkspaceTemplateRow =>
  record(value) &&
  common(value, workspaceId) &&
  named(value.name, 80) &&
  !['__proto__', 'prototype', 'constructor'].includes(String(value.name)) &&
  typeof value.description === 'string' &&
  value.description.length <= 400 &&
  nullableString(value.name_normalized) &&
  archive(value.archived_at);
export const isWorkspaceTemplateLineRead = (
  value: unknown,
  workspaceId: string,
): value is WorkspaceTemplateExerciseRow =>
  record(value) &&
  common(value, workspaceId) &&
  uuid(value.template_id) &&
  uuid(value.exercise_id) &&
  integer(value.position, 0, 49) &&
  integer(value.planned_sets, 1, 20) &&
  ((value.planned_reps === null && range(value.planned_seconds, 4, 3600)) ||
    (value.planned_seconds === null && range(value.planned_reps, 3, 999))) &&
  (value.planned_weight_g === null ||
    integer(value.planned_weight_g, 0, 1000000)) &&
  integer(value.rest_seconds, 0, 600) &&
  nullableString(value.note);
export const isWorkspaceLibraryOwner = (
  value: unknown,
  workspaceId: string,
  userId: string,
) =>
  record(value) && value.id === workspaceId && value.owner_user_id === userId;
