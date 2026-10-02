import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { loadClientHistory } from '@/features/client-history/service';
import type { Database } from '@/lib/database.types';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const user = '11000000-0000-4000-8000-000000000001';
const workspace = '21000000-0000-4000-8000-000000000001';
const clientId = '31000000-0000-4000-8000-000000000001';
const journalId = '41000000-0000-4000-8000-000000000001';
const exerciseId = '51000000-0000-4000-8000-000000000001';
const id = '61000000-0000-4000-8000-000000000001';
const input = {
  expectedUserId: user,
  clientRecordId: clientId,
  startsAtUtc: '2026-09-01T00:00:00Z',
  endsAtUtc: '2026-10-01T00:00:00Z',
};
const context = {
  client_record_id: clientId,
  workspace_id: workspace,
  timezone: 'Asia/Almaty',
  client_name: 'Клиент',
  trainer_name: 'Тренер',
};
const instance = {
  id: journalId,
  workspace_id: workspace,
  client_record_id: clientId,
  booking_id: id,
  started_at: '2026-09-04T10:00:00Z',
  finished_at: '2026-09-04T11:00:00Z',
  revision: 3,
};
const exercise = {
  id: exerciseId,
  workspace_id: workspace,
  workout_instance_id: journalId,
  exercise_id: id,
  exercise_name_snapshot: 'Историческое движение',
  measure_snapshot: 'reps',
  bodyweight_snapshot: false,
  muscle_group_snapshot: 'Ноги',
  equipment_snapshot: 'Гантели',
  instructions_snapshot: ['Контроль'],
  position: 0,
  planned_sets: 2,
  planned_reps: '8–10',
  planned_seconds: null,
  planned_weight_g: 20000,
  rest_seconds: 60,
  replaced_from_id: null,
  skipped: false,
  revision: 1,
};
const set = {
  id,
  workspace_id: workspace,
  workout_instance_id: journalId,
  workout_exercise_id: exerciseId,
  position: 0,
  reps: 0,
  seconds: null,
  weight_g: 0,
  revision: 2,
  deleted_at: null,
};
const note = {
  id,
  workspace_id: workspace,
  workout_instance_id: journalId,
  text: 'Открытая заметка',
  revision: 1,
  created_at: '2026-09-04T10:30:00Z',
  updated_at: '2026-09-04T10:30:00Z',
};
type Call = {
  table: string;
  columns: string;
  filters: [string, unknown][];
  range: [number, number];
  header: [string, string] | null;
  orders: [string, unknown][];
};
function setup(
  options: {
    data?: Record<string, unknown[]>;
    context?: unknown;
    users?: string[];
    errorTable?: string;
    throwTable?: string;
  } = {},
) {
  const data = {
    workout_instances: [instance],
    workout_exercises: [exercise],
    set_results: [set],
    session_notes: [note],
    ...options.data,
  };
  const calls: Call[] = [];
  let authCall = 0;
  const getSession = jest.fn(async () => ({
    data: {
      session: {
        access_token: 'pinned-token',
        user: { id: options.users?.[authCall++] ?? user },
      },
    },
    error: null,
  }));
  const rpc = jest.fn(() => ({
    setHeader: jest.fn(async () => ({
      data: options.context ?? context,
      error: null,
    })),
  }));
  const from = jest.fn((table: string) => {
    const call: Call = {
      table,
      columns: '',
      filters: [],
      range: [0, 499],
      header: null,
      orders: [],
    };
    calls.push(call);
    const builder = {
      select: (columns: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      not: (key: string, operator: string, value: unknown) => {
        call.filters.push([key, [operator, value]]);
        return builder;
      },
      is: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      gte: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      lt: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      in: (key: string, value: unknown) => {
        call.filters.push([key, value]);
        return builder;
      },
      order: (key: string, options?: unknown) => {
        call.orders.push([key, options]);
        return builder;
      },
      range: (start: number, end: number) => {
        call.range = [start, end];
        return builder;
      },
      setHeader: (key: string, value: string) => {
        call.header = [key, value];
        return builder;
      },
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        if (options.throwTable === table)
          return Promise.reject(new Error('transport')).then(resolve, reject);
        return Promise.resolve({
          data: (data[table as keyof typeof data] ?? []).slice(
            call.range[0],
            call.range[1] + 1,
          ),
          error: options.errorTable === table ? { code: 'network' } : null,
        }).then(resolve, reject);
      },
    };
    return builder;
  });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { getSession },
    rpc,
    from,
  } as unknown as SupabaseClient<Database>);
  return { calls, from, rpc, getSession };
}
beforeEach(() => jest.clearAllMocks());
test('reads pre-link finished snapshots, zero values and public notes with pinned safe projections', async () => {
  const { calls } = setup();
  const result = await loadClientHistory(input);
  expect(result.journals[0]!.exercises[0]).toMatchObject({
    name: exercise.exercise_name_snapshot,
    plannedWeightG: 20000,
    sets: [{ reps: 0, weightG: 0, seconds: null }],
  });
  expect(result.journals[0]!.notes[0]!.text).toBe(note.text);
  expect(result.nextOffset).toBeNull();
  for (const call of calls) {
    expect(call.header).toEqual(['Authorization', 'Bearer pinned-token']);
    expect(call.filters).toContainEqual(['workspace_id', workspace]);
    expect(call.columns).not.toMatch(/author_user_id|device_id|created_by|\*/);
  }
  expect(calls.map((c) => c.table)).not.toContain('private_notes');
  expect(calls[0]!.filters).toContainEqual(['client_record_id', clientId]);
  expect(calls[0]!.filters).toContainEqual(['finished_at', ['is', null]]);
  expect(calls.find((c) => c.table === 'set_results')?.filters).toContainEqual([
    'deleted_at',
    null,
  ]);
});
test('strips unexpected audit and private response fields', async () => {
  setup({
    data: {
      workout_instances: [{ ...instance, created_by: user }],
      workout_exercises: [{ ...exercise, note: 'private?', created_by: user }],
      set_results: [{ ...set, author_user_id: user, device_id: user }],
      session_notes: [{ ...note, author_user_id: user }],
    },
  });
  const json = JSON.stringify(await loadClientHistory(input));
  expect(json).not.toContain(user);
  expect(json).not.toContain('private?');
  expect(json).not.toContain('author');
});
test('uses bounded lookahead page and only fetches selected child journals', async () => {
  const second = {
    ...instance,
    id: '41000000-0000-4000-8000-000000000002',
    finished_at: '2026-09-03T11:00:00Z',
    started_at: '2026-09-03T10:00:00Z',
  };
  const { calls } = setup({ data: { workout_instances: [instance, second] } });
  const result = await loadClientHistory({ ...input, limit: 1 });
  expect(result.nextOffset).toBe(1);
  expect(result.journals).toHaveLength(1);
  expect(calls[0]!.range).toEqual([0, 1]);
  expect(calls[1]!.filters).toContainEqual([
    'workout_instance_id',
    [journalId],
  ]);
});
test('empty history avoids child requests', async () => {
  const { calls } = setup({ data: { workout_instances: [] } });
  expect((await loadClientHistory(input)).journals).toEqual([]);
  expect(calls).toHaveLength(1);
});
test.each([
  ['draft', { ...instance, finished_at: null }],
  ['peer', { ...instance, client_record_id: user }],
  ['workspace', { ...instance, workspace_id: user }],
  ['outside window', { ...instance, finished_at: '2026-10-01T00:00:00Z' }],
  ['invalid date', { ...instance, started_at: 'bad' }],
  ['time order', { ...instance, started_at: '2026-09-05T10:00:00Z' }],
  ['revision', { ...instance, revision: 0 }],
])('rejects untrusted instance %s', async (_, value) => {
  setup({ data: { workout_instances: [value] } });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test.each([
  [
    'peer exercise',
    { workout_exercises: [{ ...exercise, workout_instance_id: user }] },
  ],
  ['wrong measure', { set_results: [{ ...set, seconds: 30 }] }],
  [
    'deleted set',
    { set_results: [{ ...set, deleted_at: '2026-09-04T10:00:00Z' }] },
  ],
  ['unbound set', { set_results: [{ ...set, workout_exercise_id: user }] }],
  ['negative value', { set_results: [{ ...set, reps: -1 }] }],
  [
    'unknown replacement',
    { workout_exercises: [{ ...exercise, replaced_from_id: user }] },
  ],
  ['private scope note', { session_notes: [{ ...note, workspace_id: user }] }],
  [
    'bad instructions',
    { workout_exercises: [{ ...exercise, instructions_snapshot: [3] }] },
  ],
])('rejects untrusted child %s', async (_, data) => {
  setup({ data });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('rejects duplicate rows and positions instead of silently overwriting', async () => {
  setup({ data: { set_results: [set, set] } });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('preserves nullable incomplete historical results', async () => {
  setup({ data: { set_results: [{ ...set, reps: null, weight_g: null }] } });
  expect(
    (await loadClientHistory(input)).journals[0]!.exercises[0]!.sets[0],
  ).toMatchObject({ reps: null, seconds: null, weightG: null });
});
test('seconds snapshots have seconds results and zero planned sets', async () => {
  setup({
    data: {
      workout_exercises: [
        {
          ...exercise,
          measure_snapshot: 'seconds',
          planned_reps: null,
          planned_seconds: '30',
          planned_sets: 0,
        },
      ],
      set_results: [{ ...set, reps: null, seconds: 30 }],
    },
  });
  expect(
    (await loadClientHistory(input)).journals[0]!.exercises[0],
  ).toMatchObject({
    measure: 'seconds',
    plannedSets: 0,
    sets: [{ seconds: 30 }],
  });
});
test('wrong signed-in account never sends read requests', async () => {
  const { from, rpc } = setup({ users: [id] });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
test('account switch while loading discards the loaded history', async () => {
  setup({ users: [user, id] });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
});
test.each([
  { startsAtUtc: undefined },
  { endsAtUtc: undefined },
  { limit: 101 },
  { offset: -1 },
  { endsAtUtc: '2028-10-01T00:00:00Z' },
  { startsAtUtc: '2026-10-01' },
  { clientRecordId: 'bad' },
])('invalid input fails before network %p', async (value) => {
  const { rpc } = setup();
  await expect(loadClientHistory({ ...input, ...value })).rejects.toMatchObject(
    { code: 'invalidInput' },
  );
  expect(rpc).not.toHaveBeenCalled();
});
test('invalid context cannot authorize subsequent table reads', async () => {
  const { from } = setup({ context: { ...context, client_record_id: user } });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
  expect(from).not.toHaveBeenCalled();
});
test.each([
  'set_results',
  'workout_exercises',
  'session_notes',
  'workout_instances',
])('read failure is typed %s', async (table) => {
  setup({ errorTable: table });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test('unexpected network rejection is typed', async () => {
  setup({ throwTable: 'set_results' });
  await expect(loadClientHistory(input)).rejects.toMatchObject({
    code: 'request',
  });
});

test('all-time history remains scoped, finished-only, ordered and paginated', async () => {
  const old = {
    ...instance,
    started_at: '2020-01-01T10:00:00Z',
    finished_at: '2020-01-01T11:00:00Z',
  };
  const { calls } = setup({ data: { workout_instances: [old] } });
  const result = await loadClientHistory({
    expectedUserId: user,
    clientRecordId: clientId,
    limit: 1,
    offset: 0,
  });
  expect(result.journals[0]?.finishedAtUtc).toBe('2020-01-01T11:00:00.000Z');
  const parent = calls.find((call) => call.table === 'workout_instances')!;
  expect(parent.filters).toEqual([
    ['workspace_id', workspace],
    ['client_record_id', clientId],
    ['finished_at', ['is', null]],
  ]);
  expect(parent.range).toEqual([0, 1]);
  expect(parent.orders).toEqual([
    ['finished_at', { ascending: false }],
    ['id', undefined],
  ]);
});

test('all-time history still rejects unfinished journals', async () => {
  setup({ data: { workout_instances: [{ ...instance, finished_at: null }] } });
  await expect(
    loadClientHistory({ expectedUserId: user, clientRecordId: clientId }),
  ).rejects.toMatchObject({ code: 'request' });
});
