import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';

type BookingRow = Database['public']['Tables']['bookings']['Row'];
type ClientRecordRow = Database['public']['Tables']['client_records']['Row'];
type ProposalRow = Database['public']['Tables']['schedule_proposals']['Row'];
type WorkspaceRow = Database['public']['Tables']['trainer_workspaces']['Row'];
type BookingRead = Pick<
  BookingRow,
  | 'id'
  | 'workspace_id'
  | 'client_record_id'
  | 'group_session_id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'revision'
>;
type ProposalRead = Pick<
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
> & { author_role: 'trainer' | 'client' };

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
  | 'invalidState';

export class WorkspaceSchedulingError extends Error {
  constructor(readonly code: WorkspaceSchedulingErrorCode) {
    super(
      code === 'invalidInput'
        ? 'Schedule range is invalid'
        : 'Schedule data could not be loaded',
    );
    this.name = 'WorkspaceSchedulingError';
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 500;
const idBatchSize = 200;
export const MAX_WORKSPACE_SCHEDULE_RANGE_DAYS = 42;
const maxRangeMilliseconds =
  MAX_WORKSPACE_SCHEDULE_RANGE_DAYS * 24 * 60 * 60 * 1000;
const bookingColumns =
  'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision';
const proposalColumns =
  'id,workspace_id,booking_id,author_role,proposed_starts_at,proposed_ends_at,base_revision,status,revision,created_at,updated_at';

const parseProposalRows = (
  data: unknown,
  workspaceId: string,
): ProposalRead[] => {
  if (!Array.isArray(data) || data.length > pageSize)
    return throwRequestError();
  return data.map((value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return throwRequestError();
    const row = value as Record<string, unknown>;
    const timestamp = (key: string) =>
      typeof row[key] === 'string' && Number.isFinite(Date.parse(row[key]));
    if (
      Object.keys(row).sort().join(',') !==
        proposalColumns.split(',').sort().join(',') ||
      typeof row.id !== 'string' ||
      !uuidPattern.test(row.id) ||
      row.workspace_id !== workspaceId ||
      typeof row.booking_id !== 'string' ||
      !uuidPattern.test(row.booking_id) ||
      (row.author_role !== 'trainer' && row.author_role !== 'client') ||
      row.status !== 'pending' ||
      typeof row.base_revision !== 'number' ||
      !Number.isSafeInteger(row.base_revision) ||
      row.base_revision < 1 ||
      typeof row.revision !== 'number' ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      !timestamp('proposed_starts_at') ||
      !timestamp('proposed_ends_at') ||
      !timestamp('created_at') ||
      !timestamp('updated_at') ||
      Date.parse(row.proposed_ends_at as string) <=
        Date.parse(row.proposed_starts_at as string)
    )
      return throwRequestError();
    return row as ProposalRead;
  });
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

const readPages = async <T>(
  createQuery: (
    offset: number,
    limit: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { code: string } | null;
  }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await createQuery(offset, offset + pageSize - 1);
    if (error || data === null) throw new WorkspaceSchedulingError('request');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
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
  const [workspaceResult, bookingRows, proposalRows] = await Promise.all([
    client
      .from('trainer_workspaces')
      .select(
        'id,timezone,working_days,day_start,day_end,usual_session_minutes',
      )
      .eq('id', workspaceId)
      .maybeSingle(),
    readPages<BookingRead>((from, to) =>
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
    readPages<ProposalRead>(async (from) => {
      const { data, error } = await client.rpc(
        'get_my_workspace_schedule_proposals',
        {
          p_workspace_id: workspaceId,
          p_offset: from,
          p_limit: pageSize,
        },
      );
      return {
        data: error ? null : parseProposalRows(data, workspaceId),
        error,
      };
    }),
  ]);
  if (workspaceResult.error) throwRequestError();
  if (!workspaceResult.data) throw new WorkspaceSchedulingError('unavailable');
  const workspace = workspaceResult.data;
  if (new Set(proposalRows.map((row) => row.id)).size !== proposalRows.length)
    throwRequestError();

  const bookingIds = uniqueIds([
    ...bookingRows.map((booking) => booking.id),
    ...proposalRows.map((proposal) => proposal.booking_id),
  ]);
  const knownBookings = new Map(
    bookingRows.map((booking) => [booking.id, booking]),
  );
  const missingBookingIds = bookingIds.filter((id) => !knownBookings.has(id));
  const supplementalBookings: BookingRead[] = [];
  for (
    let offset = 0;
    offset < missingBookingIds.length;
    offset += idBatchSize
  ) {
    const ids = missingBookingIds.slice(offset, offset + idBatchSize);
    const { data, error } = await client
      .from('bookings')
      .select(bookingColumns)
      .eq('workspace_id', workspaceId)
      .in('id', ids)
      .order('starts_at')
      .order('id');
    if (error || data === null) throw new WorkspaceSchedulingError('request');
    supplementalBookings.push(...data);
  }
  for (const booking of supplementalBookings)
    knownBookings.set(booking.id, booking);
  if (bookingIds.some((id) => !knownBookings.has(id)))
    throw new WorkspaceSchedulingError('unavailable');

  const clientIds = uniqueIds(
    [...knownBookings.values()].map((booking) => booking.client_record_id),
  );
  const clientRows: Pick<
    ClientRecordRow,
    'id' | 'workspace_id' | 'display_name'
  >[] = [];
  for (let offset = 0; offset < clientIds.length; offset += idBatchSize) {
    const ids = clientIds.slice(offset, offset + idBatchSize);
    const { data, error } = await client
      .from('client_records')
      .select('id,workspace_id,display_name')
      .eq('workspace_id', workspaceId)
      .in('id', ids)
      .order('id');
    if (error || data === null) throw new WorkspaceSchedulingError('request');
    clientRows.push(...data);
  }
  const names = new Map(clientRows.map((row) => [row.id, row.display_name]));
  if (clientIds.some((id) => !names.has(id)))
    throw new WorkspaceSchedulingError('unavailable');
  const programs = new Map<string, string>();
  for (let offset = 0; offset < bookingIds.length; offset += idBatchSize) {
    const { data, error } = await client
      .from('booking_programs')
      .select('booking_id,name')
      .eq('workspace_id', workspaceId)
      .in('booking_id', bookingIds.slice(offset, offset + idBatchSize))
      .order('booking_id');
    if (error || data === null) throw new WorkspaceSchedulingError('request');
    for (const program of data) programs.set(program.booking_id, program.name);
  }
  const allBookings = [...knownBookings.values()];
  const bookingViews = new Map(
    allBookings.map((booking) => [
      booking.id,
      toBooking(booking, names, programs),
    ]),
  );

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
}
