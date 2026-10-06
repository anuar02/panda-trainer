import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';
import { createWorkspaceScheduleReadFence } from './read-session';
import {
  isAvailabilityRead,
  isBookingRead,
  isClientRead,
  isProgramRead,
  isProposalRead,
  scheduleUuidPattern,
  type BookingRead,
  type ProposalRead,
  type ClientRead,
  type ProgramRead,
} from './read-validation';

type BookingRow = Database['public']['Tables']['bookings']['Row'];
type ClientRecordRow = Database['public']['Tables']['client_records']['Row'];
type ProposalRow = Database['public']['Tables']['schedule_proposals']['Row'];
type WorkspaceRow = Database['public']['Tables']['trainer_workspaces']['Row'];
export type WorkspaceScheduleAvailability = Pick<
  WorkspaceRow,
  | 'id'
  | 'timezone'
  | 'working_days'
  | 'day_start'
  | 'day_end'
  | 'usual_session_minutes'
>;

export type WorkspaceScheduleBooking = Pick<
  BookingRow,
  | 'id'
  | 'workspace_id'
  | 'client_record_id'
  | 'group_session_id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'revision'
> & {
  client_name: ClientRecordRow['display_name'];
  program_name?: string | null;
};

export type WorkspaceScheduleProposal = Pick<
  ProposalRow,
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
> & { authorRole: 'trainer' | 'client'; booking: WorkspaceScheduleBooking };

export type WorkspaceSchedule = {
  availability: WorkspaceScheduleAvailability;
  bookings: WorkspaceScheduleBooking[];
  pendingProposals: WorkspaceScheduleProposal[];
};

export type WorkspaceSchedulingErrorCode =
  | 'configuration'
  | 'invalidInput'
  | 'unavailable'
  | 'request'
  | 'conflict'
  | 'invalidState'
  | 'readLimit';

export class WorkspaceSchedulingError extends Error {
  constructor(readonly code: WorkspaceSchedulingErrorCode) {
    super(
      code === 'invalidInput'
        ? 'Schedule range is invalid'
        : code === 'readLimit'
          ? 'Schedule data exceeds the bounded read limit'
          : 'Schedule data could not be loaded',
    );
    this.name = 'WorkspaceSchedulingError';
  }
}

const uuidPattern = scheduleUuidPattern;
const pageSize = 500;
const idBatchSize = 200;
export const MAX_WORKSPACE_SCHEDULE_READ_PAGES = 20;
export const MAX_WORKSPACE_SCHEDULE_RANGE_DAYS = 42;
const maxRangeMilliseconds =
  MAX_WORKSPACE_SCHEDULE_RANGE_DAYS * 24 * 60 * 60 * 1000;
const bookingColumns =
  'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision';
const proposalColumns =
  'id,workspace_id,booking_id,author_role,proposed_starts_at,proposed_ends_at,base_revision,status,revision,created_at,updated_at';
export type WorkspaceScheduleReadOptions = {
  expectedUserId?: string;
  expectedSessionId?: string;
  assertCurrent?: () => void | Promise<void>;
};

const normalizeUtc = (value: string): string | null => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString() === value ? value : null;
};

const requireClient = () => {
  const client = getSupabaseClient();
  if (!client) throw new WorkspaceSchedulingError('configuration');
  return client;
};

const throwRequestError = (): never => {
  throw new WorkspaceSchedulingError('request');
};

const parseReadRows = <T>(
  data: unknown,
  validate: (value: unknown) => value is T,
  limit: number,
): T[] => {
  if (!Array.isArray(data) || data.length > limit) return throwRequestError();
  return data.map((value: unknown) => {
    if (!validate(value)) return throwRequestError();
    return value;
  });
};

const readPages = async <T>(
  createQuery: (
    offset: number,
    limit: number,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
  validate: (value: unknown) => value is T,
  assertCurrent: () => Promise<void>,
  getId: (value: T) => string,
): Promise<T[]> => {
  const rows: T[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < MAX_WORKSPACE_SCHEDULE_READ_PAGES; page += 1) {
    await assertCurrent();
    const offset = page * pageSize;
    const { data, error } = await createQuery(offset, offset + pageSize - 1);
    await assertCurrent();
    if (error) return throwRequestError();
    const values = parseReadRows(data, validate, pageSize);
    for (const value of values) {
      const id = getId(value);
      if (ids.has(id)) return throwRequestError();
      ids.add(id);
      rows.push(value);
    }
    if (values.length < pageSize) return rows;
  }
  throw new WorkspaceSchedulingError('readLimit');
};

const toBooking = (
  row: BookingRead,
  names: ReadonlyMap<string, string>,
  programs: ReadonlyMap<string, string>,
): WorkspaceScheduleBooking => ({
  id: row.id,
  workspace_id: row.workspace_id,
  client_record_id: row.client_record_id,
  group_session_id: row.group_session_id,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  status: row.status,
  revision: row.revision,
  client_name: names.get(row.client_record_id)!,
  program_name: programs.get(row.id) ?? null,
});

const uniqueIds = (values: readonly string[]) => [...new Set(values)];

export async function loadWorkspaceSchedule(
  workspaceId: string,
  startsAtUtc: string,
  endsAtUtc: string,
  options?: WorkspaceScheduleReadOptions,
): Promise<WorkspaceSchedule> {
  const startsAt = normalizeUtc(startsAtUtc);
  const endsAt = normalizeUtc(endsAtUtc);
  if (
    !uuidPattern.test(workspaceId) ||
    !startsAt ||
    !endsAt ||
    Date.parse(endsAt) <= Date.parse(startsAt) ||
    Date.parse(endsAt) - Date.parse(startsAt) > maxRangeMilliseconds
  )
    throw new WorkspaceSchedulingError('invalidInput');

  const client = requireClient();
  await options?.assertCurrent?.();
  const fence = await createWorkspaceScheduleReadFence(
    client.auth,
    options?.expectedUserId
      ? {
          userId: options.expectedUserId,
          workspaceId,
          sessionId: options.expectedSessionId,
        }
      : undefined,
  );
  const assertCurrent = async () => {
    await options?.assertCurrent?.();
    await fence.assertCurrent();
    await options?.assertCurrent?.();
  };
  const authorize = <T extends { setHeader(name: string, value: string): T }>(
    query: T,
  ): T => query.setHeader('Authorization', `Bearer ${fence.accessToken}`);
  try {
    await assertCurrent();
    const workspaceResult = await authorize(
      client
        .from('trainer_workspaces')
        .select(
          'id,owner_user_id,timezone,working_days,day_start,day_end,usual_session_minutes',
        )
        .eq('id', workspaceId)
        .maybeSingle(),
    );
    await assertCurrent();
    if (workspaceResult.error) throwRequestError();
    if (!workspaceResult.data)
      throw new WorkspaceSchedulingError('unavailable');
    if (!isAvailabilityRead(workspaceResult.data, workspaceId, fence.userId))
      return throwRequestError();
    const workspace = workspaceResult.data;
    const bookingRows = await readPages<BookingRead>(
      (from, to) =>
        authorize(
          client
            .from('bookings')
            .select(bookingColumns)
            .eq('workspace_id', workspaceId)
            .lt('starts_at', endsAt)
            .gt('ends_at', startsAt)
            .order('starts_at')
            .order('id')
            .range(from, to),
        ),
      (value): value is BookingRead =>
        isBookingRead(value, workspaceId) &&
        Date.parse(value.starts_at) < Date.parse(endsAt) &&
        Date.parse(value.ends_at) > Date.parse(startsAt),
      assertCurrent,
      (value) => value.id,
    );
    const proposalRows = await readPages<ProposalRead>(
      (from) =>
        authorize(
          client.rpc('get_my_workspace_schedule_proposals', {
            p_workspace_id: workspaceId,
            p_offset: from,
            p_limit: pageSize,
          }),
        ),
      (value): value is ProposalRead =>
        isProposalRead(value, workspaceId) &&
        Object.keys(value).sort().join(',') ===
          proposalColumns.split(',').sort().join(','),
      assertCurrent,
      (value) => value.id,
    );

    const bookingIds = uniqueIds([
      ...bookingRows.map((booking) => booking.id),
      ...proposalRows.map((proposal) => proposal.booking_id),
    ]);
    const knownBookings = new Map(
      bookingRows.map((booking) => [booking.id, booking]),
    );
    const missingBookingIds = bookingIds.filter((id) => !knownBookings.has(id));
    const supplementalBookings: BookingRead[] = [];
    const supplementalBookingIds = new Set<string>();
    for (
      let offset = 0;
      offset < missingBookingIds.length;
      offset += idBatchSize
    ) {
      const ids = missingBookingIds.slice(offset, offset + idBatchSize);
      await assertCurrent();
      const { data, error } = await authorize(
        client
          .from('bookings')
          .select(bookingColumns)
          .eq('workspace_id', workspaceId)
          .in('id', ids)
          .order('starts_at')
          .order('id'),
      );
      await assertCurrent();
      if (error) return throwRequestError();
      const rows = parseReadRows(
        data,
        (value): value is BookingRead => isBookingRead(value, workspaceId),
        ids.length,
      );
      for (const row of rows) {
        if (
          !ids.includes(row.id) ||
          knownBookings.has(row.id) ||
          supplementalBookingIds.has(row.id)
        )
          return throwRequestError();
        supplementalBookingIds.add(row.id);
        supplementalBookings.push(row);
      }
    }
    for (const booking of supplementalBookings)
      knownBookings.set(booking.id, booking);
    if (bookingIds.some((id) => !knownBookings.has(id)))
      throw new WorkspaceSchedulingError('unavailable');

    for (const proposal of proposalRows) {
      const booking = knownBookings.get(proposal.booking_id)!;
      if (
        proposal.base_revision > booking.revision ||
        (booking.status !== 'proposed' && booking.status !== 'confirmed')
      )
        return throwRequestError();
    }
    if (
      new Set(proposalRows.map((row) => row.booking_id)).size !==
      proposalRows.length
    )
      return throwRequestError();

    const clientIds = uniqueIds(
      [...knownBookings.values()].map((booking) => booking.client_record_id),
    );
    const clientRows: ClientRead[] = [];
    const loadedClientIds = new Set<string>();
    for (let offset = 0; offset < clientIds.length; offset += idBatchSize) {
      const ids = clientIds.slice(offset, offset + idBatchSize);
      await assertCurrent();
      const { data, error } = await authorize(
        client
          .from('client_records')
          .select('id,workspace_id,display_name')
          .eq('workspace_id', workspaceId)
          .in('id', ids)
          .order('id'),
      );
      await assertCurrent();
      if (error) return throwRequestError();
      const rows = parseReadRows(
        data,
        (value): value is ClientRead => isClientRead(value, workspaceId),
        ids.length,
      );
      for (const row of rows) {
        if (!ids.includes(row.id) || loadedClientIds.has(row.id))
          return throwRequestError();
        loadedClientIds.add(row.id);
        clientRows.push(row);
      }
    }
    const names = new Map(clientRows.map((row) => [row.id, row.display_name]));
    if (clientIds.some((id) => !names.has(id)))
      throw new WorkspaceSchedulingError('unavailable');
    const programs = new Map<string, string>();
    const programIds = new Set<string>();
    for (let offset = 0; offset < bookingIds.length; offset += idBatchSize) {
      const ids = bookingIds.slice(offset, offset + idBatchSize);
      await assertCurrent();
      const { data, error } = await authorize(
        client
          .from('booking_programs')
          .select('id,booking_id,workspace_id,name')
          .eq('workspace_id', workspaceId)
          .in('booking_id', ids)
          .order('booking_id'),
      );
      await assertCurrent();
      if (error) return throwRequestError();
      const rows = parseReadRows(
        data,
        (value): value is ProgramRead => isProgramRead(value, workspaceId),
        ids.length,
      );
      for (const program of rows) {
        if (
          !ids.includes(program.booking_id) ||
          programs.has(program.booking_id) ||
          programIds.has(program.id)
        )
          return throwRequestError();
        programIds.add(program.id);
        programs.set(program.booking_id, program.name);
      }
    }
    const allBookings = [...knownBookings.values()];
    const bookingViews = new Map(
      allBookings.map((booking) => [
        booking.id,
        toBooking(booking, names, programs),
      ]),
    );

    await assertCurrent();
    return {
      availability: {
        id: workspace.id,
        timezone: workspace.timezone,
        working_days: workspace.working_days,
        day_start: workspace.day_start,
        day_end: workspace.day_end,
        usual_session_minutes: workspace.usual_session_minutes,
      },
      bookings: bookingRows.map((booking) => bookingViews.get(booking.id)!),
      pendingProposals: proposalRows.map((proposal) => ({
        id: proposal.id,
        workspace_id: proposal.workspace_id,
        booking_id: proposal.booking_id,
        proposed_starts_at: proposal.proposed_starts_at,
        proposed_ends_at: proposal.proposed_ends_at,
        base_revision: proposal.base_revision,
        status: proposal.status,
        revision: proposal.revision,
        created_at: proposal.created_at,
        updated_at: proposal.updated_at,
        authorRole: proposal.author_role,
        booking: bookingViews.get(proposal.booking_id)!,
      })),
    };
  } finally {
    fence.dispose();
  }
}
