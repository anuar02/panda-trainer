import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  loadWorkspaceSchedule,
  MAX_WORKSPACE_SCHEDULE_RANGE_DAYS,
  WorkspaceSchedulingError,
} from '../src/features/workspace-scheduling/service';
import type { Database } from '../src/lib/database.types';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const workspaceId = '61000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '61000000-0000-4000-8000-000000000002';
const bookingId = '71000000-0000-4000-8000-000000000001';
const secondBookingId = '71000000-0000-4000-8000-000000000002';
const clientId = '81000000-0000-4000-8000-000000000001';
const otherClientId = '81000000-0000-4000-8000-000000000002';
const groupId = '91000000-0000-4000-8000-000000000001';
const proposalId = 'a1000000-0000-4000-8000-000000000001';
const intervalStart = '2026-10-05T00:00:00.000Z';
const intervalEnd = '2026-10-12T00:00:00.000Z';
const getClient = jest.mocked(getSupabaseClient);

type TableName = keyof Database['public']['Tables'];
type Row = Database['public']['Tables'][TableName]['Row'];
type QueryFilter = {
  field: string;
  operator: 'eq' | 'lt' | 'gt' | 'in';
  value: unknown;
};
type QueryState = {
  filters: QueryFilter[];
  orders: { field: string; ascending: boolean }[];
  range: [number, number] | null;
  single: boolean;
};
type QueryResponse = { data: unknown | null; error: { code: string } | null };

const workspace =
  (): Database['public']['Tables']['trainer_workspaces']['Row'] => ({
    id: workspaceId,
    name: 'Тренер',
    owner_user_id: '51000000-0000-4000-8000-000000000001',
    timezone: 'Asia/Almaty',
    working_days: [1, 2, 3, 4, 5],
    day_start: '07:00:00',
    day_end: '21:00:00',
    usual_session_minutes: 60,
    training_focus: ['strength'],
    revision: 1,
    created_at: intervalStart,
    updated_at: intervalStart,
    created_by: null,
  });

const booking = (
  overrides: Partial<Database['public']['Tables']['bookings']['Row']> = {},
): Database['public']['Tables']['bookings']['Row'] => ({
  id: bookingId,
  workspace_id: workspaceId,
  client_record_id: clientId,
  group_session_id: null,
  starts_at: '2026-10-06T10:00:00.000Z',
  ends_at: '2026-10-06T11:00:00.000Z',
  status: 'proposed',
  revision: 1,
  request_id: null,
  request_payload: null,
  created_at: intervalStart,
  updated_at: intervalStart,
  created_by: null,
  ...overrides,
});

const clientRecord = (
  id: string,
  displayName: string,
  archivedAt: string | null = null,
  recordWorkspaceId = workspaceId,
): Database['public']['Tables']['client_records']['Row'] => ({
  id,
  workspace_id: recordWorkspaceId,
  display_name: displayName,
  archived_at: archivedAt,
  phone: null,
  user_id: null,
  revision: 1,
  created_at: intervalStart,
  updated_at: intervalStart,
  created_by: null,
});

const proposal = (
  overrides: Partial<
    Database['public']['Tables']['schedule_proposals']['Row']
  > = {},
): Database['public']['Tables']['schedule_proposals']['Row'] => ({
  id: proposalId,
  workspace_id: workspaceId,
  booking_id: secondBookingId,
  author_user_id: '51000000-0000-4000-8000-000000000002',
  proposed_starts_at: '2026-11-12T11:00:00.000Z',
  proposed_ends_at: '2026-11-12T12:00:00.000Z',
  base_revision: 1,
  status: 'pending',
  revision: 1,
  created_at: intervalStart,
  updated_at: intervalStart,
  created_by: null,
  ...overrides,
});

const makeClient = (data: Partial<Record<TableName, Row[]>>) => {
  const calls: { table: TableName; state: QueryState }[] = [];
  const errors: Partial<Record<TableName, { code: string }>> = {};
  const from = jest.fn((table: TableName) => {
    const state: QueryState = {
      filters: [],
      orders: [],
      range: null,
      single: false,
    };
    const record = () => calls.push({ table, state: structuredClone(state) });
    const builder: Record<string, unknown> = {};
    for (const method of ['select'] as const)
      builder[method] = jest.fn(() => builder);
    builder.setHeader = jest.fn(() => builder);
    builder.eq = jest.fn((field: string, value: unknown) => {
      state.filters.push({ field, operator: 'eq', value });
      return builder;
    });
    builder.lt = jest.fn((field: string, value: unknown) => {
      state.filters.push({ field, operator: 'lt', value });
      return builder;
    });
    builder.gt = jest.fn((field: string, value: unknown) => {
      state.filters.push({ field, operator: 'gt', value });
      return builder;
    });
    builder.in = jest.fn((field: string, value: unknown[]) => {
      state.filters.push({ field, operator: 'in', value });
      return builder;
    });
    builder.order = jest.fn(
      (field: string, options?: { ascending?: boolean }) => {
        state.orders.push({ field, ascending: options?.ascending ?? true });
        return builder;
      },
    );
    builder.range = jest.fn((from: number, to: number) => {
      state.range = [from, to];
      return builder;
    });
    builder.maybeSingle = jest.fn(() => {
      state.single = true;
      return builder;
    });
    builder.then = (
      resolve: (value: QueryResponse) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      record();
      const error = errors[table];
      if (error)
        return Promise.resolve({ data: null, error }).then(resolve, reject);
      let rows = [...(data[table] ?? [])];
      rows = rows.filter((row) =>
        state.filters.every(({ field, operator, value }) => {
          const actual = (row as Record<string, unknown>)[field];
          if (operator === 'eq') return actual === value;
          if (operator === 'in')
            return Array.isArray(value) && value.includes(actual);
          if (operator === 'lt')
            return typeof actual === 'string' && actual < String(value);
          return typeof actual === 'string' && actual > String(value);
        }),
      );
      for (const order of [...state.orders].reverse()) {
        rows.sort((first, second) => {
          const a = String((first as Record<string, unknown>)[order.field]);
          const b = String((second as Record<string, unknown>)[order.field]);
          return (a.localeCompare(b) || 0) * (order.ascending ? 1 : -1);
        });
      }
      if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
      const result = state.single ? (rows[0] ?? null) : rows;
      return Promise.resolve({ data: result, error: null }).then(
        resolve,
        reject,
      );
    };
    return builder;
  });
  const rpc = jest.fn(
    (
      name: string,
      args: { p_workspace_id: string; p_offset: number; p_limit: number },
    ): Promise<QueryResponse> => {
      const rows = (
        (data.schedule_proposals ??
          []) as Database['public']['Tables']['schedule_proposals']['Row'][]
      )
        .filter(
          (value) =>
            value.workspace_id === args.p_workspace_id &&
            value.status === 'pending',
        )
        .sort(
          (a, b) =>
            a.proposed_starts_at.localeCompare(b.proposed_starts_at) ||
            a.id.localeCompare(b.id),
        )
        .slice(args.p_offset, args.p_offset + args.p_limit)
        .map(({ author_user_id, created_by: _createdBy, ...value }) => ({
          ...value,
          author_role:
            author_user_id === workspace().owner_user_id ? 'trainer' : 'client',
        }));
      return Object.assign(
        Promise.resolve({
          data: rows,
          error: errors.schedule_proposals ?? null,
        }),
        {
          setHeader: () =>
            Promise.resolve({
              data: rows,
              error: errors.schedule_proposals ?? null,
            }),
        },
      );
    },
  );
  getClient.mockReturnValue({
    from,
    rpc,
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: workspace().owner_user_id },
            access_token: `header.${btoa(
              JSON.stringify({
                sub: workspace().owner_user_id,
                session_id: 'd1000000-0000-4000-8000-000000000001',
              }),
            )
              .replace(/=/g, '')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')}.signature`,
          },
        },
        error: null,
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  } as unknown as SupabaseClient<Database>);
  return { calls, errors, rpc };
};

describe('workspace schedule service', () => {
  beforeEach(() => {
    getClient.mockReset();
  });

  it('loads half-open overlapping bookings and retains real status and group IDs', async () => {
    const rows = [
      booking({
        starts_at: '2026-10-04T23:00:00.000Z',
        ends_at: intervalStart,
      }),
      booking({
        id: bookingId,
        starts_at: '2026-10-04T23:00:00.000Z',
        ends_at: '2026-10-05T01:00:00.000Z',
        group_session_id: groupId,
        status: 'cancelled_by_client',
      }),
      booking({
        id: secondBookingId,
        client_record_id: otherClientId,
        starts_at: '2026-10-11T23:00:00.000Z',
        ends_at: '2026-10-12T01:00:00.000Z',
      }),
      booking({
        id: '71000000-0000-4000-8000-000000000003',
        starts_at: intervalEnd,
        ends_at: '2026-10-12T01:00:00.000Z',
      }),
      booking({
        id: '71000000-0000-4000-8000-000000000004',
        workspace_id: otherWorkspaceId,
      }),
    ];
    makeClient({
      trainer_workspaces: [workspace()],
      bookings: rows,
      schedule_proposals: [],
      client_records: [
        clientRecord(clientId, 'Архивная клиентка', intervalStart),
        clientRecord(otherClientId, 'Мира'),
      ],
    });

    const schedule = await loadWorkspaceSchedule(
      workspaceId,
      intervalStart,
      intervalEnd,
    );

    expect(schedule.availability).toEqual({
      id: workspaceId,
      timezone: 'Asia/Almaty',
      working_days: [1, 2, 3, 4, 5],
      day_start: '07:00:00',
      day_end: '21:00:00',
      usual_session_minutes: 60,
    });
    expect(schedule.bookings).toHaveLength(2);
    expect(schedule.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bookingId,
          group_session_id: groupId,
          status: 'cancelled_by_client',
          client_name: 'Архивная клиентка',
        }),
        expect.objectContaining({
          id: secondBookingId,
          client_record_id: otherClientId,
          status: 'proposed',
          client_name: 'Мира',
        }),
      ]),
    );
    expect(schedule.pendingProposals).toEqual([]);
  });

  it('reads immutable booking program names with workspace and booking bounds', async () => {
    const snapshot: Database['public']['Tables']['booking_programs']['Row'] = {
      id: 'b1000000-0000-4000-8000-000000000001',
      workspace_id: workspaceId,
      booking_id: bookingId,
      base_template_id: 'c1000000-0000-4000-8000-000000000001',
      base_template_revision: 1,
      name: 'Сохранённая программа',
      description: '',
      created_at: intervalStart,
      created_by: null,
    };
    const { calls } = makeClient({
      trainer_workspaces: [workspace()],
      bookings: [booking()],
      client_records: [clientRecord(clientId, 'Мира')],
      booking_programs: [
        snapshot,
        { ...snapshot, workspace_id: otherWorkspaceId, name: 'Чужая' },
      ],
    });
    const result = await loadWorkspaceSchedule(
      workspaceId,
      intervalStart,
      intervalEnd,
    );
    expect(result.bookings[0]?.program_name).toBe('Сохранённая программа');
    expect(
      calls.find((call) => call.table === 'booking_programs')?.state.filters,
    ).toEqual([
      { field: 'workspace_id', operator: 'eq', value: workspaceId },
      { field: 'booking_id', operator: 'in', value: [bookingId] },
    ]);
  });

  it('pages interval bookings in stable order and batches client lookups', async () => {
    const rows = Array.from({ length: 501 }, (_, index) =>
      booking({
        id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        client_record_id: `81000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        starts_at: `2026-10-06T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
        ends_at: `2026-10-06T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:30.000Z`,
      }),
    );
    const { calls } = makeClient({
      trainer_workspaces: [workspace()],
      bookings: rows,
      schedule_proposals: [],
      client_records: rows.map((row, index) =>
        clientRecord(row.client_record_id, `Клиент ${index}`),
      ),
    });

    const schedule = await loadWorkspaceSchedule(
      workspaceId,
      intervalStart,
      intervalEnd,
    );

    expect(schedule.bookings).toHaveLength(501);
    expect(schedule.bookings[0]?.id).toBe(rows[0]?.id);
    expect(schedule.bookings[500]?.id).toBe(rows[500]?.id);
    expect(
      calls
        .filter((call) => call.table === 'bookings' && call.state.range)
        .map((call) => call.state.range),
    ).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(
      calls.filter((call) => call.table === 'client_records'),
    ).toHaveLength(3);
    expect(
      calls
        .filter((call) => call.table === 'client_records')
        .map(
          (call) =>
            call.state.filters.find((filter) => filter.field === 'id')?.value,
        ),
    ).toEqual([expect.any(Array), expect.any(Array), expect.any(Array)]);
  });

  it('loads pending proposals outside the window with their booking and archived client', async () => {
    const outsideBooking = booking({
      id: secondBookingId,
      client_record_id: otherClientId,
      starts_at: '2026-11-12T10:00:00.000Z',
      ends_at: '2026-11-12T11:00:00.000Z',
    });
    const request = proposal();
    const trainerRequest = proposal({
      id: 'a1000000-0000-4000-8000-000000000003',
      booking_id: '71000000-0000-4000-8000-000000000003',
      author_user_id: workspace().owner_user_id,
      proposed_starts_at: '2026-11-13T11:00:00.000Z',
      proposed_ends_at: '2026-11-13T12:00:00.000Z',
    });
    const trainerBooking = booking({
      id: trainerRequest.booking_id,
      starts_at: '2026-11-13T10:00:00.000Z',
      ends_at: '2026-11-13T11:00:00.000Z',
    });
    const { calls, rpc } = makeClient({
      trainer_workspaces: [workspace()],
      bookings: [outsideBooking, trainerBooking],
      schedule_proposals: [
        request,
        trainerRequest,
        proposal({
          id: 'a1000000-0000-4000-8000-000000000002',
          workspace_id: otherWorkspaceId,
        }),
      ],
      client_records: [
        clientRecord(otherClientId, 'Архивный клиент', intervalStart),
        clientRecord(clientId, 'Клиент'),
      ],
    });

    const schedule = await loadWorkspaceSchedule(
      workspaceId,
      intervalStart,
      intervalEnd,
    );

    expect(schedule.bookings).toEqual([]);
    expect(schedule.pendingProposals).toEqual([
      expect.objectContaining({
        id: proposalId,
        workspace_id: workspaceId,
        booking_id: secondBookingId,
        status: 'pending',
        authorRole: 'client',
        booking: expect.objectContaining({
          id: secondBookingId,
          starts_at: outsideBooking.starts_at,
          client_name: 'Архивный клиент',
        }),
      }),
      expect.objectContaining({
        id: trainerRequest.id,
        authorRole: 'trainer',
        booking: expect.objectContaining({
          id: trainerBooking.id,
          client_name: 'Клиент',
        }),
      }),
    ]);
    expect(schedule.pendingProposals[0]).not.toHaveProperty('author_user_id');
    expect(schedule.pendingProposals[1]).not.toHaveProperty('author_user_id');
    expect(schedule.pendingProposals[0]?.booking).not.toHaveProperty(
      'request_id',
    );
    expect(schedule.pendingProposals[0]?.booking).not.toHaveProperty('phone');
    expect(schedule.pendingProposals[0]?.booking).not.toHaveProperty('user_id');
    expect(calls.some((call) => call.table === 'schedule_proposals')).toBe(
      false,
    );
    expect(rpc).toHaveBeenCalledWith('get_my_workspace_schedule_proposals', {
      p_workspace_id: workspaceId,
      p_offset: 0,
      p_limit: 500,
    });
  });

  it('pages all-time proposal RPC in stable order', async () => {
    const rows = Array.from({ length: 501 }, (_, index) =>
      proposal({
        id: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        booking_id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      }),
    );
    const { rpc } = makeClient({
      trainer_workspaces: [workspace()],
      bookings: rows.map((row) => booking({ id: row.booking_id })),
      schedule_proposals: rows,
      client_records: [clientRecord(clientId, 'Client')],
    });
    const result = await loadWorkspaceSchedule(
      workspaceId,
      intervalStart,
      intervalEnd,
    );
    expect(result.pendingProposals).toHaveLength(501);
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      { p_workspace_id: workspaceId, p_offset: 0, p_limit: 500 },
      { p_workspace_id: workspaceId, p_offset: 500, p_limit: 500 },
    ]);
  });

  it.each([
    { author_user_id: workspace().owner_user_id },
    { created_by: workspace().owner_user_id },
    { author_role: 'unknown' },
    { workspace_id: otherWorkspaceId },
    { status: 'accepted' },
    { revision: 0 },
    { proposed_ends_at: 'not a timestamp' },
  ])('rejects unsafe or invalid proposal RPC output %j', async (extra) => {
    const { rpc } = makeClient({ trainer_workspaces: [workspace()] });
    const {
      author_user_id: _author,
      created_by: _creator,
      ...safe
    } = proposal();
    const response = {
      data: [{ ...safe, author_role: 'client', ...extra }],
      error: null,
    };
    rpc.mockReturnValueOnce(
      Object.assign(Promise.resolve(response), {
        setHeader: () => Promise.resolve(response),
      }),
    );
    await expect(
      loadWorkspaceSchedule(workspaceId, intervalStart, intervalEnd),
    ).rejects.toMatchObject({ code: 'request' });
  });

  it('rejects missing related records and database read failures', async () => {
    makeClient({
      trainer_workspaces: [workspace()],
      bookings: [booking()],
      schedule_proposals: [],
      client_records: [],
    });
    await expect(
      loadWorkspaceSchedule(workspaceId, intervalStart, intervalEnd),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const failed = makeClient({
      trainer_workspaces: [workspace()],
      bookings: [],
      schedule_proposals: [],
      client_records: [],
    });
    failed.errors.bookings = { code: '42501' };
    await expect(
      loadWorkspaceSchedule(workspaceId, intervalStart, intervalEnd),
    ).rejects.toBeInstanceOf(WorkspaceSchedulingError);
    await expect(
      loadWorkspaceSchedule(workspaceId, intervalStart, intervalEnd),
    ).rejects.toMatchObject({ code: 'request' });
  });

  it('requires canonical UTC bounds and caps a read to six weeks', async () => {
    expect(MAX_WORKSPACE_SCHEDULE_RANGE_DAYS).toBe(42);
    makeClient({});
    await expect(
      loadWorkspaceSchedule(
        workspaceId,
        '2026-10-05T00:00:00+00:00',
        intervalEnd,
      ),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    await expect(
      loadWorkspaceSchedule(
        workspaceId,
        intervalStart,
        '2026-11-17T00:00:00.000Z',
      ),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    await expect(
      loadWorkspaceSchedule(workspaceId, intervalEnd, intervalStart),
    ).rejects.toMatchObject({ code: 'invalidInput' });
  });
});
