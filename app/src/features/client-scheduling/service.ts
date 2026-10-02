import { getSupabaseClient } from '@/features/auth/client';
import type { Database } from '@/lib/database.types';

type Tables = Database['public']['Tables'];
type BookingRead = Pick<
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
export type ClientBookingPlanExercise = Pick<
  Tables['booking_program_exercises']['Row'],
  | 'id'
  | 'booking_program_id'
  | 'exercise_name_snapshot'
  | 'measure_snapshot'
  | 'bodyweight_snapshot'
  | 'muscle_group_snapshot'
  | 'equipment_snapshot'
  | 'instructions_snapshot'
  | 'position'
  | 'planned_sets'
  | 'planned_reps'
  | 'planned_seconds'
  | 'planned_weight_g'
  | 'rest_seconds'
  | 'note'
>;
export type ClientBookingPlan = {
  id: string;
  name: string;
  description: string;
  exercises: ClientBookingPlanExercise[];
};
export type ClientScheduleBooking = BookingRead & {
  program: ClientBookingPlan | null;
};
export type ClientScheduleContext = {
  clientRecordId: string;
  workspaceId: string;
  timezone: string;
  trainerName: string;
  clientName: string;
};
export type ClientScheduleProposal = {
  id: string;
  bookingId: string;
  proposedStartsAtUtc: string;
  proposedEndsAtUtc: string;
  baseRevision: number;
  revision: number;
  authorRole: 'trainer' | 'client';
  booking: ClientScheduleBooking;
};
export type ClientSchedule = {
  context: ClientScheduleContext;
  bookings: ClientScheduleBooking[];
  pendingProposals: ClientScheduleProposal[];
};
export class ClientSchedulingError extends Error {
  constructor(
    readonly code: 'configuration' | 'invalidInput' | 'unavailable' | 'request',
  ) {
    super('Client schedule could not be loaded');
    this.name = 'ClientSchedulingError';
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const utc = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 2147483647;
const fail = (): never => {
  throw new ClientSchedulingError('request');
};
const contextFrom = (
  value: unknown,
  clientId: string,
): ClientScheduleContext => {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !==
      'client_name,client_record_id,timezone,trainer_name,workspace_id' ||
    value.client_record_id !== clientId ||
    !uuid(value.workspace_id) ||
    typeof value.client_name !== 'string' ||
    typeof value.trainer_name !== 'string' ||
    typeof value.timezone !== 'string'
  )
    return fail();
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format();
  } catch {
    return fail();
  }
  return {
    clientRecordId: clientId,
    workspaceId: value.workspace_id,
    timezone: value.timezone,
    trainerName: value.trainer_name,
    clientName: value.client_name,
  };
};
const bookingColumns =
  'id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision';
const planColumns = 'id,workspace_id,booking_id,name,description';
const exerciseColumns =
  'id,workspace_id,booking_program_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note';
async function pages<T>(
  query: (
    offset: number,
  ) => PromiseLike<{ data: T[] | null; error: { code: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query(offset);
    if (error || !data) return fail();
    if (data.length > 500) return fail();
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function readClientSchedule({
  clientRecordId,
  expectedUserId,
  startsAtUtc,
  endsAtUtc,
}: {
  clientRecordId: string;
  expectedUserId: string;
  startsAtUtc: string;
  endsAtUtc: string;
}): Promise<ClientSchedule> {
  if (
    !uuid(clientRecordId) ||
    !uuid(expectedUserId) ||
    !utc(startsAtUtc) ||
    !utc(endsAtUtc) ||
    Date.parse(endsAtUtc) <= Date.parse(startsAtUtc) ||
    Date.parse(endsAtUtc) - Date.parse(startsAtUtc) > 42 * 86400000
  )
    throw new ClientSchedulingError('invalidInput');
  const clientId = clientRecordId.toLowerCase();
  const userId = expectedUserId.toLowerCase();
  const client = getSupabaseClient();
  if (!client) throw new ClientSchedulingError('configuration');
  const session = await client.auth.getSession();
  const token = session.data.session?.access_token;
  if (
    session.error ||
    session.data.session?.user.id.toLowerCase() !== userId ||
    !token
  )
    throw new ClientSchedulingError('unavailable');
  const headers = { Authorization: `Bearer ${token}` };
  const contextResult = await client
    .rpc('get_my_client_schedule_context', { p_client_record_id: clientId })
    .setHeader('Authorization', headers.Authorization);
  if (contextResult.error)
    throw new ClientSchedulingError(
      contextResult.error.code === 'P0002' ||
        contextResult.error.code === '42501'
        ? 'unavailable'
        : 'request',
    );
  const context = contextFrom(contextResult.data, clientId);
  const [bookings, proposals] = await Promise.all([
    pages((offset) =>
      client
        .from('bookings')
        .select(bookingColumns)
        .eq('workspace_id', context.workspaceId)
        .eq('client_record_id', clientId)
        .lt('starts_at', new Date(endsAtUtc).toISOString())
        .gt('ends_at', new Date(startsAtUtc).toISOString())
        .order('starts_at')
        .order('id')
        .range(offset, offset + 499)
        .setHeader('Authorization', headers.Authorization),
    ),
    pages((offset) =>
      client
        .rpc('get_my_client_schedule_proposals', {
          p_client_record_id: clientId,
          p_offset: offset,
          p_limit: 500,
        })
        .setHeader('Authorization', headers.Authorization),
    ),
  ]);
  const known = new Map<string, BookingRead>();
  const checkBooking = (row: BookingRead) => {
    if (
      !uuid(row.id) ||
      row.workspace_id !== context.workspaceId ||
      row.client_record_id !== clientId ||
      !positive(row.revision) ||
      !utc(row.starts_at) ||
      !utc(row.ends_at) ||
      Date.parse(row.ends_at) <= Date.parse(row.starts_at) ||
      (row.group_session_id !== null && !uuid(row.group_session_id)) ||
      ![
        'proposed',
        'confirmed',
        'cancelled_by_client',
        'cancelled_by_trainer',
      ].includes(row.status)
    )
      return fail();
    known.set(row.id, {
      id: row.id,
      workspace_id: row.workspace_id,
      client_record_id: row.client_record_id,
      group_session_id: row.group_session_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.status,
      revision: row.revision,
    });
  };
  bookings.forEach(checkBooking);
  for (const row of proposals) {
    if (
      !uuid(row.id) ||
      row.workspace_id !== context.workspaceId ||
      !uuid(row.booking_id) ||
      row.status !== 'pending' ||
      !positive(row.revision) ||
      !positive(row.base_revision) ||
      !['trainer', 'client'].includes(row.author_role) ||
      !utc(row.proposed_starts_at) ||
      !utc(row.proposed_ends_at) ||
      Date.parse(row.proposed_ends_at) <= Date.parse(row.proposed_starts_at) ||
      Object.keys(row).sort().join(',') !==
        'author_role,base_revision,booking_id,created_at,id,proposed_ends_at,proposed_starts_at,revision,status,updated_at,workspace_id'
    )
      return fail();
  }
  const missing = [...new Set(proposals.map((row) => row.booking_id))].filter(
    (id) => !known.has(id),
  );
  for (let offset = 0; offset < missing.length; offset += 200) {
    const { data, error } = await client
      .from('bookings')
      .select(bookingColumns)
      .eq('workspace_id', context.workspaceId)
      .eq('client_record_id', clientId)
      .in('id', missing.slice(offset, offset + 200))
      .setHeader('Authorization', headers.Authorization);
    if (error || !data) return fail();
    data.forEach(checkBooking);
  }
  if (missing.some((id) => !known.has(id)))
    throw new ClientSchedulingError('unavailable');
  const plans = new Map<string, ClientBookingPlan>();
  const planBookings = new Map<string, string>();
  const ids = [...known.keys()];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const rows = await pages((page) =>
      client
        .from('booking_programs')
        .select(planColumns)
        .eq('workspace_id', context.workspaceId)
        .in('booking_id', ids.slice(offset, offset + 200))
        .order('id')
        .range(page, page + 499)
        .setHeader('Authorization', headers.Authorization),
    );
    for (const row of rows) {
      if (
        !uuid(row.id) ||
        row.workspace_id !== context.workspaceId ||
        !known.has(row.booking_id) ||
        typeof row.name !== 'string' ||
        typeof row.description !== 'string' ||
        plans.has(row.booking_id)
      )
        return fail();
      plans.set(row.booking_id, {
        id: row.id,
        name: row.name,
        description: row.description,
        exercises: [],
      });
      planBookings.set(row.id, row.booking_id);
    }
  }
  const planIds = [...planBookings.keys()];
  for (let offset = 0; offset < planIds.length; offset += 200) {
    const rows = await pages((page) =>
      client
        .from('booking_program_exercises')
        .select(exerciseColumns)
        .eq('workspace_id', context.workspaceId)
        .in('booking_program_id', planIds.slice(offset, offset + 200))
        .order('booking_program_id')
        .order('position')
        .range(page, page + 499)
        .setHeader('Authorization', headers.Authorization),
    );
    for (const row of rows) {
      const bookingId = planBookings.get(row.booking_program_id);
      const plan = bookingId ? plans.get(bookingId) : null;
      if (
        !plan ||
        row.workspace_id !== context.workspaceId ||
        !uuid(row.id) ||
        typeof row.exercise_name_snapshot !== 'string' ||
        !['reps', 'seconds'].includes(row.measure_snapshot) ||
        !Number.isInteger(row.position) ||
        row.position < 0 ||
        !positive(row.planned_sets) ||
        !Array.isArray(row.instructions_snapshot) ||
        row.instructions_snapshot.some((value) => typeof value !== 'string') ||
        typeof row.bodyweight_snapshot !== 'boolean' ||
        typeof row.muscle_group_snapshot !== 'string' ||
        typeof row.equipment_snapshot !== 'string' ||
        (row.note !== null && typeof row.note !== 'string') ||
        (row.planned_weight_g !== null &&
          (!Number.isInteger(row.planned_weight_g) ||
            row.planned_weight_g < 0 ||
            row.planned_weight_g > 1000000)) ||
        !Number.isInteger(row.rest_seconds) ||
        row.rest_seconds < 0 ||
        row.rest_seconds > 600 ||
        row.planned_sets > 20 ||
        (row.measure_snapshot === 'reps'
          ? typeof row.planned_reps !== 'string' || row.planned_seconds !== null
          : typeof row.planned_seconds !== 'string' ||
            row.planned_reps !== null)
      )
        return fail();
      plan.exercises.push({
        id: row.id,
        booking_program_id: row.booking_program_id,
        exercise_name_snapshot: row.exercise_name_snapshot,
        measure_snapshot: row.measure_snapshot,
        bodyweight_snapshot: row.bodyweight_snapshot,
        muscle_group_snapshot: row.muscle_group_snapshot,
        equipment_snapshot: row.equipment_snapshot,
        instructions_snapshot: [...row.instructions_snapshot],
        position: row.position,
        planned_sets: row.planned_sets,
        planned_reps: row.planned_reps,
        planned_seconds: row.planned_seconds,
        planned_weight_g: row.planned_weight_g,
        rest_seconds: row.rest_seconds,
        note: row.note,
      });
    }
  }
  if ([...plans.values()].some((plan) => plan.exercises.length === 0))
    throw new ClientSchedulingError('unavailable');
  const views = new Map(
    [...known.values()].map((row) => [
      row.id,
      { ...row, program: plans.get(row.id) ?? null },
    ]),
  );
  return {
    context,
    bookings: bookings.map((row) => views.get(row.id)!),
    pendingProposals: proposals.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      proposedStartsAtUtc: new Date(row.proposed_starts_at).toISOString(),
      proposedEndsAtUtc: new Date(row.proposed_ends_at).toISOString(),
      baseRevision: row.base_revision,
      revision: row.revision,
      authorRole: row.author_role as 'trainer' | 'client',
      booking: views.get(row.booking_id)!,
    })),
  };
}

export async function loadClientSchedule(
  input: Parameters<typeof readClientSchedule>[0],
): Promise<ClientSchedule> {
  try {
    return await readClientSchedule(input);
  } catch (error) {
    if (error instanceof ClientSchedulingError) throw error;
    throw new ClientSchedulingError('request');
  }
}
