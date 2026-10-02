import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { loadLatestClientProgram } from '@/features/client-program/service';
import type { Database } from '@/lib/database.types';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const user = '11000000-0000-4000-8000-000000000001';
const workspace = '21000000-0000-4000-8000-000000000001';
const card = '31000000-0000-4000-8000-000000000001';
const id = '41000000-0000-4000-8000-000000000001';
const input = { expectedUserId: user, clientRecordId: card };
const context = {
  client_record_id: card,
  workspace_id: workspace,
  timezone: 'Asia/Almaty',
  client_name: 'Client',
  trainer_name: 'Trainer',
};
const program = {
  id,
  workspace_id: workspace,
  client_record_id: card,
  name: 'Snapshot',
  description: '',
  revision: 1,
  created_at: '2026-10-01T10:00:00Z',
};
const line = {
  id,
  workspace_id: workspace,
  client_program_id: id,
  exercise_name_snapshot: 'Historical movement',
  measure_snapshot: 'reps',
  bodyweight_snapshot: false,
  muscle_group_snapshot: 'Legs',
  equipment_snapshot: '',
  instructions_snapshot: ['Historical technique'],
  position: 0,
  planned_sets: 3,
  planned_reps: '8–10',
  planned_seconds: null,
  planned_weight_g: 0,
  rest_seconds: 60,
  note: null,
  revision: 1,
};
function setup(
  options: {
    program?: unknown;
    lines?: unknown[];
    context?: unknown;
    users?: string[];
    error?: boolean;
  } = {},
) {
  const calls: {
    table: string;
    columns: string;
    filters: [string, unknown][];
    orders: [string, unknown][];
    range?: [number, number];
    header?: string;
    limit?: number;
  }[] = [];
  let authIndex = 0;
  const rpc = jest.fn(() => ({
    setHeader: jest.fn(async () => ({
      data: options.context ?? context,
      error: null,
    })),
  }));
  const from = jest.fn((table: string) => {
    const call: (typeof calls)[number] = {
      table,
      columns: '',
      filters: [],
      orders: [],
    };
    calls.push(call);
    const response = () => ({
      data:
        table === 'client_programs'
          ? options.program === undefined
            ? program
            : options.program
          : (options.lines ?? [line]).slice(
              call.range?.[0] ?? 0,
              (call.range?.[1] ?? 24) + 1,
            ),
      error: options.error ? {} : null,
    });
    const builder = {
      select: (columns: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      order: (key: string, options?: unknown) => {
        call.orders.push([key, options]);
        return builder;
      },
      limit: (limit: number) => {
        call.limit = limit;
        return builder;
      },
      range: (start: number, end: number) => {
        call.range = [start, end];
        return builder;
      },
      setHeader: (_key: string, value: string) => {
        call.header = value;
        return builder;
      },
      maybeSingle: async () => response(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(response()).then(resolve),
    };
    return builder;
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: {
            access_token: 'pinned',
            user: { id: options.users?.[authIndex++] ?? user },
          },
        },
        error: null,
      })),
    },
    rpc,
    from,
  } as unknown as SupabaseClient<Database>);
  return { calls, rpc, from };
}
beforeEach(() => jest.clearAllMocks());
test('reads latest own immutable copy with safe fields and pinned token', async () => {
  const { calls } = setup();
  const data = await loadLatestClientProgram(input);
  expect(data.program?.exercises[0]).toMatchObject({
    name: 'Historical movement',
    instructions: ['Historical technique'],
    plannedWeightG: 0,
  });
  expect(calls.map((call) => call.table)).toEqual([
    'client_programs',
    'client_program_exercises',
  ]);
  expect(calls[0]).toMatchObject({
    filters: [
      ['workspace_id', workspace],
      ['client_record_id', card],
    ],
    orders: [
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ],
    limit: 1,
  });
  for (const call of calls) {
    expect(call.columns).not.toMatch(/created_by|base_template|exercise_id/);
    expect(call.columns).not.toBe('*');
    expect(call.header).toBe('Bearer pinned');
  }
  expect(calls[1]?.filters).toEqual([
    ['workspace_id', workspace],
    ['client_program_id', id],
  ]);
});
test('absence is empty and does not query exercises', async () => {
  const { from } = setup({ program: null });
  expect((await loadLatestClientProgram(input)).program).toBeNull();
  expect(from).toHaveBeenCalledTimes(1);
});
test('pages exercises in stable order', async () => {
  const lines = Array.from({ length: 26 }, (_, position) => ({
    ...line,
    id: `41000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
    position,
  }));
  const { calls } = setup({ lines });
  expect(
    (await loadLatestClientProgram(input)).program?.exercises,
  ).toHaveLength(26);
  expect(calls.slice(1).map((call) => call.range)).toEqual([
    [0, 24],
    [25, 49],
  ]);
  expect(calls[1]?.orders).toEqual([
    ['position', undefined],
    ['id', undefined],
  ]);
});
test.each([{ workspace_id: user }, { client_record_id: user }])(
  'rejects peer parent %p',
  async (change) => {
    setup({ program: { ...program, ...change } });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
test.each([
  { workspace_id: user },
  { client_program_id: user },
  { planned_seconds: '30' },
  { planned_weight_g: -1 },
  { instructions_snapshot: [1] },
])('rejects unsafe snapshot %p', async (change) => {
  setup({ lines: [{ ...line, ...change }] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('rejects duplicate positions', async () => {
  setup({ lines: [line, { ...line, id: user }] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('invalid context stops scoped reads', async () => {
  const { from } = setup({ context: { ...context, client_record_id: user } });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
  expect(from).not.toHaveBeenCalled();
});
test('account changes discard results', async () => {
  setup({ users: [user, id] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test('wrong account never sends requests', async () => {
  const { rpc } = setup({ users: [id] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(rpc).not.toHaveBeenCalled();
});
test('invalid input fails before network', async () => {
  const { rpc } = setup();
  await expect(
    loadLatestClientProgram({ ...input, clientRecordId: 'bad' }),
  ).rejects.toMatchObject({ code: 'invalidInput' });
  expect(rpc).not.toHaveBeenCalled();
});
test('read failure is typed', async () => {
  setup({ error: true });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});
