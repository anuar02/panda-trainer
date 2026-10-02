import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { loadClientSchedule } from '@/features/client-scheduling/service';
import type { Database } from '@/lib/database.types';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const clientId = '71000000-0000-4000-8000-000000000001';
const bookingId = '81000000-0000-4000-8000-000000000001';
const other = '81000000-0000-4000-8000-000000000002';
const programId = '91000000-0000-4000-8000-000000000001';
const proposalId = 'a1000000-0000-4000-8000-000000000001';
const input = {
  clientRecordId: clientId,
  expectedUserId: user,
  startsAtUtc: '2026-10-05T00:00:00Z',
  endsAtUtc: '2026-10-12T00:00:00Z',
};
const booking = (id = bookingId) => ({
  id,
  workspace_id: workspace,
  client_record_id: clientId,
  group_session_id: null,
  starts_at: '2026-10-06T10:00:00Z',
  ends_at: '2026-10-06T11:00:00Z',
  status: 'proposed',
  revision: 1,
});
const context = {
  client_record_id: clientId,
  workspace_id: workspace,
  timezone: 'Asia/Almaty',
  trainer_name: 'Тренер',
  client_name: 'Клиент',
};
const proposal = {
  id: proposalId,
  workspace_id: workspace,
  booking_id: other,
  proposed_starts_at: '2026-11-01T10:00:00Z',
  proposed_ends_at: '2026-11-01T11:00:00Z',
  base_revision: 1,
  status: 'pending',
  revision: 2,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  author_role: 'trainer',
};
type Call = {
  table: string;
  columns: string;
  filters: [string, unknown][];
  range: [number, number] | null;
  header: [string, string] | null;
};
function setup({
  contextData = context,
  proposals = [],
  bookings = [booking()],
  supplemental = [],
  programs = [],
  exercises = [],
  sessionUser = user,
}: {
  contextData?: unknown;
  proposals?: unknown[];
  bookings?: unknown[];
  supplemental?: unknown[];
  programs?: unknown[];
  exercises?: unknown[];
  sessionUser?: string;
} = {}) {
  const calls: Call[] = [];
  const rpcCalls: {
    name: string;
    args: Record<string, unknown>;
    header: [string, string];
  }[] = [];
  const rpc = jest.fn((name: string, args: Record<string, unknown>) => ({
    setHeader: (key: string, value: string) => {
      rpcCalls.push({ name, args, header: [key, value] });
      return Promise.resolve({
        data:
          name === 'get_my_client_schedule_context'
            ? contextData
            : proposals.slice(
                Number(args.p_offset),
                Number(args.p_offset) + Number(args.p_limit),
              ),
        error: null,
      });
    },
  }));
  const from = jest.fn((table: string) => {
    const call: Call = {
      table,
      columns: '',
      filters: [],
      range: null,
      header: null,
    };
    calls.push(call);
    const chain = {
      select: (columns: string) => {
        call.columns = columns;
        return chain;
      },
      eq: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return chain;
      },
      lt: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return chain;
      },
      gt: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return chain;
      },
      in: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return chain;
      },
      order: () => chain,
      range: (start: number, end: number) => {
        call.range = [start, end];
        return chain;
      },
      setHeader: (key: string, value: string) => {
        call.header = [key, value];
        const rows =
          table === 'bookings'
            ? call.filters.some(([key]) => key === 'id')
              ? supplemental
              : bookings
            : table === 'booking_programs'
              ? programs
              : exercises;
        return Promise.resolve({
          data: call.range
            ? rows.slice(call.range[0], call.range[1] + 1)
            : rows,
          error: null,
        });
      },
    };
    return chain;
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: sessionUser },
            access_token: 'pinned-token',
          },
        },
        error: null,
      }),
    },
    rpc,
    from,
  } as unknown as SupabaseClient<Database>);
  return { calls, rpcCalls, rpc, from };
}
beforeEach(() => jest.clearAllMocks());
test('loads own bookings through safe context and pins every request without trainer/catalog reads', async () => {
  const { calls, rpcCalls } = setup();
  const result = await loadClientSchedule(input);
  expect(result.context).toEqual({
    clientRecordId: clientId,
    workspaceId: workspace,
    timezone: 'Asia/Almaty',
    trainerName: 'Тренер',
    clientName: 'Клиент',
  });
  expect(result.bookings[0]).toMatchObject({ id: bookingId, program: null });
  for (const call of calls) {
    expect(call.header).toEqual(['Authorization', 'Bearer pinned-token']);
    expect(call.columns).not.toContain('*');
    expect(call.columns).not.toContain('created_by');
    expect(call.filters).toContainEqual(['workspace_id', workspace]);
  }
  expect(
    calls.filter((call) => call.table === 'bookings')[0]?.filters,
  ).toContainEqual(['client_record_id', clientId]);
  expect(calls.map((call) => call.table)).not.toContain('trainer_workspaces');
  expect(calls.map((call) => call.table)).not.toContain('schedule_proposals');
  for (const call of rpcCalls)
    expect(call.header).toEqual(['Authorization', 'Bearer pinned-token']);
});
test('joins outside-window proposal booking and immutable plan snapshots', async () => {
  const program = {
    id: programId,
    workspace_id: workspace,
    booking_id: other,
    name: 'План до правки',
    description: 'Описание',
  };
  const exercise = {
    id: proposalId,
    workspace_id: workspace,
    booking_program_id: programId,
    exercise_name_snapshot: 'Присед',
    measure_snapshot: 'reps',
    bodyweight_snapshot: false,
    muscle_group_snapshot: 'Ноги',
    equipment_snapshot: 'Штанга',
    instructions_snapshot: ['Спина ровно'],
    position: 0,
    planned_sets: 3,
    planned_reps: '10',
    planned_seconds: null,
    planned_weight_g: 15000,
    rest_seconds: 90,
    note: null,
    created_by: user,
  };
  setup({
    proposals: [proposal],
    supplemental: [booking(other)],
    programs: [program],
    exercises: [exercise],
  });
  const result = await loadClientSchedule(input);
  expect(result.bookings).toHaveLength(1);
  expect(result.pendingProposals[0]).toMatchObject({
    authorRole: 'trainer',
    booking: {
      id: other,
      program: {
        name: 'План до правки',
        exercises: [
          { exercise_name_snapshot: 'Присед', planned_weight_g: 15000 },
        ],
      },
    },
  });
  expect(JSON.stringify(result)).not.toContain('created_by');
  expect(JSON.stringify(result)).not.toContain('author_user_id');
});
test('paginates own bookings beyond PostgREST default and bounded related ID batches', async () => {
  const rows = Array.from({ length: 501 }, (_, index) =>
    booking(`81000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
  );
  const { calls } = setup({ bookings: rows });
  expect((await loadClientSchedule(input)).bookings).toHaveLength(501);
  expect(
    calls.filter((call) => call.table === 'bookings').map((call) => call.range),
  ).toEqual([
    [0, 499],
    [500, 999],
  ]);
  expect(
    calls
      .filter((call) => call.table === 'booking_programs')
      .map((call) => call.filters.find(([key]) => key === 'booking_id')?.[1]),
  ).toEqual([
    rows.slice(0, 200).map((row) => row.id),
    rows.slice(200, 400).map((row) => row.id),
    rows.slice(400).map((row) => row.id),
  ]);
});
test.each([
  { ...context, client_record_id: other },
  { ...context, timezone: 'Invalid/Zone' },
  { ...context, owner_user_id: user },
])('rejects unsafe context before table queries %j', async (contextData) => {
  const { from } = setup({ contextData });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'request',
  });
  expect(from).not.toHaveBeenCalled();
});
test('blocks switched account before context RPC', async () => {
  const { rpc } = setup({ sessionUser: other });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(rpc).not.toHaveBeenCalled();
});
test('rejects cross-client rows despite query filters', async () => {
  setup({ bookings: [{ ...booking(), client_record_id: other }] });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('rejects leaked proposal author identity and missing referenced own booking', async () => {
  setup({ proposals: [{ ...proposal, author_user_id: user }] });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'request',
  });
  setup({ proposals: [proposal] });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test.each([
  { ...input, clientRecordId: 'invalid' },
  { ...input, endsAtUtc: '2027-01-01T00:00:00Z' },
  { ...input, endsAtUtc: input.startsAtUtc },
])('rejects invalid range or identity %j', async (value) => {
  await expect(loadClientSchedule(value)).rejects.toMatchObject({
    code: 'invalidInput',
  });
  expect(getSupabaseClient).not.toHaveBeenCalled();
});

test('paginates pending proposals and supplements own bookings beyond current window', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    ...proposal,
    id: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }));
  const { rpcCalls } = setup({
    proposals: rows,
    supplemental: [booking(other)],
  });
  expect((await loadClientSchedule(input)).pendingProposals).toHaveLength(501);
  expect(
    rpcCalls
      .filter((call) => call.name === 'get_my_client_schedule_proposals')
      .map((call) => call.args),
  ).toEqual([
    { p_client_record_id: clientId, p_offset: 0, p_limit: 500 },
    { p_client_record_id: clientId, p_offset: 500, p_limit: 500 },
  ]);
});

test.each([
  { ...proposal, author_role: 'owner' },
  { ...proposal, base_revision: 0 },
  { ...proposal, proposed_ends_at: 'invalid' },
  { ...proposal, status: 'accepted' },
])('rejects malformed proposal %j', async (row) => {
  setup({ proposals: [row], supplemental: [booking(other)] });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'request',
  });
});

test('accepts empty schedule without reading snapshots or inventing data', async () => {
  const { calls } = setup({ bookings: [] });
  const result = await loadClientSchedule(input);
  expect(result.bookings).toEqual([]);
  expect(result.pendingProposals).toEqual([]);
  expect(calls.map((call) => call.table)).toEqual(['bookings']);
});

test('does not silently discard missing exercise snapshots from a named plan', async () => {
  setup({
    programs: [
      {
        id: programId,
        workspace_id: workspace,
        booking_id: bookingId,
        name: 'План',
        description: '',
      },
    ],
  });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});

test('converts malformed null server rows to typed request failure', async () => {
  setup({ proposals: [null] });
  await expect(loadClientSchedule(input)).rejects.toMatchObject({
    code: 'request',
  });
});
