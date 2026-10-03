import type { Database } from '@/lib/database.types';

type Tables = Database['public']['Tables'];
export type BookingRead = Pick<
  Tables['bookings']['Row'],
  | 'id'
  | 'workspace_id'
  | 'client_record_id'
  | 'group_session_id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'revision'
>;
export type ProposalRead = Pick<
  Tables['schedule_proposals']['Row'],
  | 'id'
  | 'workspace_id'
  | 'booking_id'
  | 'proposed_starts_at'
  | 'proposed_ends_at'
  | 'base_revision'
  | 'status'
  | 'revision'
  | 'created_at'
  | 'updated_at'
> & { author_role: 'trainer' | 'client' };
export type ClientRead = Pick<
  Tables['client_records']['Row'],
  'id' | 'workspace_id' | 'display_name'
>;
export type ProgramRead = Pick<
  Tables['booking_programs']['Row'],
  'id' | 'booking_id' | 'workspace_id' | 'name'
>;
export type AvailabilityRead = Pick<
  Tables['trainer_workspaces']['Row'],
  | 'id'
  | 'owner_user_id'
  | 'timezone'
  | 'working_days'
  | 'day_start'
  | 'day_end'
  | 'usual_session_minutes'
>;

export const scheduleUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.toLowerCase() &&
  scheduleUuidPattern.test(value);
const revision = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 2147483647;
const name = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isScheduleUtc = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(
      value,
    );
  if (!match) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  const normalized = new Date(milliseconds).toISOString();
  return normalized.slice(0, 19) === `${match[1]}T${match[2]}`;
};

const interval = (start: unknown, end: unknown) =>
  isScheduleUtc(start) &&
  isScheduleUtc(end) &&
  Date.parse(start) < Date.parse(end);

export const isBookingRead = (
  value: unknown,
  workspaceId: string,
): value is BookingRead =>
  record(value) &&
  uuid(value.id) &&
  value.workspace_id === workspaceId &&
  uuid(value.client_record_id) &&
  (value.group_session_id === null || uuid(value.group_session_id)) &&
  typeof value.status === 'string' &&
  [
    'proposed',
    'confirmed',
    'cancelled_by_client',
    'cancelled_by_trainer',
  ].includes(value.status) &&
  revision(value.revision) &&
  interval(value.starts_at, value.ends_at);

export const isProposalRead = (
  value: unknown,
  workspaceId: string,
): value is ProposalRead =>
  record(value) &&
  uuid(value.id) &&
  value.workspace_id === workspaceId &&
  uuid(value.booking_id) &&
  (value.author_role === 'trainer' || value.author_role === 'client') &&
  value.status === 'pending' &&
  revision(value.base_revision) &&
  revision(value.revision) &&
  interval(value.proposed_starts_at, value.proposed_ends_at) &&
  isScheduleUtc(value.created_at) &&
  isScheduleUtc(value.updated_at) &&
  Date.parse(value.created_at) <= Date.parse(value.updated_at);

export const isClientRead = (
  value: unknown,
  workspaceId: string,
): value is ClientRead =>
  record(value) &&
  uuid(value.id) &&
  value.workspace_id === workspaceId &&
  name(value.display_name);
export const isProgramRead = (
  value: unknown,
  workspaceId: string,
): value is ProgramRead =>
  record(value) &&
  uuid(value.id) &&
  uuid(value.booking_id) &&
  value.workspace_id === workspaceId &&
  name(value.name);

const time = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (
    hours > 23 ||
    minutes > 59 ||
    seconds !== 0 ||
    Number(match[4] ?? 0) !== 0
  )
    return null;
  return hours * 3600 + minutes * 60 + seconds + Number(`0.${match[4] ?? '0'}`);
};

export const isAvailabilityRead = (
  value: unknown,
  workspaceId: string,
  userId: string,
): value is AvailabilityRead => {
  if (
    !record(value) ||
    value.id !== workspaceId ||
    value.owner_user_id !== userId ||
    !uuid(value.owner_user_id) ||
    typeof value.timezone !== 'string' ||
    value.timezone.trim() !== value.timezone ||
    value.timezone.length === 0
  )
    return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(0);
  } catch {
    return false;
  }
  const start = time(value.day_start);
  const end = time(value.day_end);
  return (
    Array.isArray(value.working_days) &&
    value.working_days.length > 0 &&
    value.working_days.length <= 7 &&
    value.working_days.every(
      (day: unknown) =>
        typeof day === 'number' &&
        Number.isInteger(day) &&
        day >= 0 &&
        day <= 6,
    ) &&
    new Set(value.working_days).size === value.working_days.length &&
    start !== null &&
    end !== null &&
    start < end &&
    [45, 60, 90].includes(Number(value.usual_session_minutes)) &&
    typeof value.usual_session_minutes === 'number'
  );
};
