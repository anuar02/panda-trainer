import type { Database } from '@/lib/database.types';
import type { WorkspaceClientDetailsData } from './details-screen';

export class ClientReadError extends Error {
  constructor(
    readonly code:
      'invalidInput' | 'sessionChanged' | 'unavailable' | 'malformed' | 'limit',
  ) {
    super(code);
    this.name = 'ClientReadError';
  }
}
export const fail = (): never => {
  throw new ClientReadError('malformed');
};
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const integer = (value: unknown, min = 1, max = 2147483647): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const text = (value: unknown, max: number, empty = false): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  (empty || value.trim().length > 0);
const nullableText = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
export const timestamp = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/.test(value)
  )
    return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 19) === value.slice(0, 19)
  );
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
}
function base(value: unknown, workspaceId: string, columns: string) {
  const row = record(value);
  if (
    !uuid(row.id) ||
    row.workspace_id !== workspaceId ||
    !integer(row.revision) ||
    !timestamp(row.created_at) ||
    !timestamp(row.updated_at) ||
    Date.parse(row.updated_at) < Date.parse(row.created_at)
  )
    return fail();
  return Object.fromEntries(
    columns.split(',').map((column) => [column, row[column]]),
  );
}
export const personColumns =
  'id,workspace_id,user_id,display_name,phone,archived_at,revision,created_at,updated_at';
export const programColumns =
  'id,workspace_id,client_record_id,base_template_id,base_template_revision,name,description,revision,created_at,updated_at';
export const bookingColumns =
  'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision,created_at,updated_at';
export const exerciseColumns =
  'id,workspace_id,client_program_id,exercise_id,exercise_name_snapshot,source_key_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,revision,created_at,updated_at';
export function parsePerson(
  value: unknown,
  workspaceId: string,
): Database['public']['Tables']['client_records']['Row'] {
  const row = base(value, workspaceId, personColumns);
  if (
    (row.user_id !== null && !uuid(row.user_id)) ||
    !text(row.display_name, 120) ||
    !nullableText(row.phone) ||
    (row.archived_at !== null && !timestamp(row.archived_at))
  )
    return fail();
  return {
    ...row,
    created_by: null,
  } as Database['public']['Tables']['client_records']['Row'];
}
type Program = NonNullable<WorkspaceClientDetailsData['program']>;
export function parseProgram(
  value: unknown,
  workspaceId: string,
  clients: Set<string>,
): Omit<Program, 'items'> {
  const row = base(value, workspaceId, programColumns);
  if (
    !uuid(row.client_record_id) ||
    !clients.has(row.client_record_id) ||
    !uuid(row.base_template_id) ||
    !integer(row.base_template_revision) ||
    !text(row.name, 80) ||
    !text(row.description, 400, true)
  )
    return fail();
  return row as Omit<Program, 'items'>;
}
export function parseBooking(
  value: unknown,
  workspaceId: string,
  clients: Set<string>,
): WorkspaceClientDetailsData['bookings'][number] {
  const row = base(value, workspaceId, bookingColumns);
  if (
    !uuid(row.client_record_id) ||
    !clients.has(row.client_record_id) ||
    (row.group_session_id !== null && !uuid(row.group_session_id)) ||
    !timestamp(row.starts_at) ||
    !timestamp(row.ends_at) ||
    Date.parse(row.ends_at) <= Date.parse(row.starts_at) ||
    typeof row.status !== 'string' ||
    ![
      'proposed',
      'confirmed',
      'cancelled_by_client',
      'cancelled_by_trainer',
    ].includes(row.status)
  )
    return fail();
  return row as WorkspaceClientDetailsData['bookings'][number];
}
function range(value: unknown, digits: number) {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^[0-9]{1,${digits}}([–-][0-9]{1,${digits}})?$`).test(value)
  )
    return false;
  const parts = value.split(/[–-]/).map(Number);
  const first = parts[0];
  const last = parts[1];
  return (
    first !== undefined &&
    first > 0 &&
    (parts.length === 1 || (last !== undefined && last >= first))
  );
}
export function parseExercise(
  value: unknown,
  workspaceId: string,
  programId: string,
): Program['items'][number] {
  const row = base(value, workspaceId, exerciseColumns);
  if (
    row.client_program_id !== programId ||
    !uuid(row.exercise_id) ||
    !text(row.exercise_name_snapshot, 120) ||
    !nullableText(row.source_key_snapshot) ||
    typeof row.bodyweight_snapshot !== 'boolean' ||
    typeof row.muscle_group_snapshot !== 'string' ||
    typeof row.equipment_snapshot !== 'string' ||
    !Array.isArray(row.instructions_snapshot) ||
    !row.instructions_snapshot.every(
      (item: unknown) => typeof item === 'string',
    ) ||
    !integer(row.position, 0, 49) ||
    !integer(row.planned_sets, 1, 20) ||
    !integer(row.rest_seconds, 0, 600) ||
    !nullableText(row.note) ||
    (row.planned_weight_g !== null &&
      !integer(row.planned_weight_g, 0, 1000000)) ||
    !(
      (row.measure_snapshot === 'reps' &&
        range(row.planned_reps, 3) &&
        row.planned_seconds === null) ||
      (row.measure_snapshot === 'seconds' &&
        range(row.planned_seconds, 4) &&
        row.planned_reps === null)
    )
  )
    return fail();
  return row as Program['items'][number];
}
