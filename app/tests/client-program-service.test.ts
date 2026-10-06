import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/features/auth/client';
import { loadLatestClientProgram } from '@/features/client-program/service';
import type { Database } from '@/lib/database.types';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
const user = '11000000-0000-4000-8000-000000000001';
const workspace = '21000000-0000-4000-8000-000000000001';
const card = '31000000-0000-4000-8000-000000000001';
const id = '41000000-0000-4000-8000-000000000001';
const sessionId = '51000000-0000-4000-8000-000000000001';
const token = (actor = user, sid = sessionId, revision = 1) =>
  `header.${Buffer.from(JSON.stringify({ sub: actor, session_id: sid, revision })).toString('base64url')}.signature`;
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
  exercise_id: id,
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
    page?: unknown;
    stage?: (
      stage: string,
      emit: (event: AuthChangeEvent, actor?: string, sid?: string) => void,
    ) => void;
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
  let current = { access_token: token(), user: { id: user } };
  let listener:
    | ((event: AuthChangeEvent, session: typeof current | null) => void)
    | undefined;
  const emit = (event: AuthChangeEvent, actor = user, sid = sessionId) => {
    current = { access_token: token(actor, sid, 2), user: { id: actor } };
    listener?.(event, event === 'SIGNED_OUT' ? null : current);
  };
  const stage = (name: string) => options.stage?.(name, emit);
  const rpc = jest.fn(() => ({
    setHeader: jest.fn(async () => {
      stage('context');
      return { data: options.context ?? context, error: null };
    }),
  }));
  const from = jest.fn((table: string) => {
    const call: (typeof calls)[number] = {
      table,
      columns: '',
      filters: [],
      orders: [],
    };
    calls.push(call);
    const response = () => {
      stage(
        table === 'client_programs' ? 'program' : `lines:${call.range?.[0]}`,
      );
      return {
        data:
          table === 'client_programs'
            ? options.program === undefined
              ? program
              : options.program
            : options.page !== undefined
              ? options.page
              : (options.lines ?? [line]).slice(
                  call.range?.[0] ?? 0,
                  (call.range?.[1] ?? 24) + 1,
                ),
        error: options.error ? {} : null,
      };
    };
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
      onAuthStateChange: jest.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      getSession: jest.fn(async () => ({
        data: {
          session: {
            ...current,
            user: { id: options.users?.[authIndex++] ?? current.user.id },
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
    expect(call.columns).not.toMatch(/created_by|base_template/);
    expect(call.columns).not.toBe('*');
    expect(call.header).toBe(`Bearer ${token()}`);
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
    exercise_id: `61000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
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

test.each(['context', 'program', 'lines:0'])(
  'same-user relogin at %s fails closed',
  async (at) => {
    setup({
      stage: (stage, emit) => {
        if (stage === at) emit('SIGNED_IN', user, id);
      },
    });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'unavailable',
    });
  },
);
test.each(['SIGNED_OUT', 'USER_UPDATED', 'SIGNED_IN'] as const)(
  'lifecycle %s fences even identical identity',
  async (event) => {
    setup({
      stage: (stage, emit) => {
        if (stage === 'context') emit(event);
      },
    });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'unavailable',
    });
  },
);
test('verified refresh keeps original explicit bearer and result contains no credentials', async () => {
  const { calls } = setup({
    stage: (stage, emit) => {
      if (stage === 'context') emit('TOKEN_REFRESHED');
    },
  });
  const data = await loadLatestClientProgram(input);
  expect(calls.every((call) => call.header === `Bearer ${token()}`)).toBe(true);
  expect(JSON.stringify(data)).not.toMatch(/access_token|signature|session_id/);
});
test('foreign refresh is rejected before program query', async () => {
  const { from } = setup({
    stage: (stage, emit) => {
      if (stage === 'context') emit('TOKEN_REFRESHED', id);
    },
  });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(from).not.toHaveBeenCalled();
});
test('result fence rejects invalidated caller', async () => {
  let valid = true;
  setup({
    stage: (stage) => {
      if (stage === 'lines:0') valid = false;
    },
  });
  await expect(
    loadLatestClientProgram({ ...input, isCurrent: () => valid }),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
test.each([25, 50, 51])('bounded %i line pagination', async (count) => {
  const lines = Array.from({ length: count }, (_, position) => ({
    ...line,
    position,
    id: `41000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
    exercise_id: `61000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
  }));
  const { calls } = setup({ lines });
  if (count > 50)
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'request',
    });
  else
    expect(
      (await loadLatestClientProgram(input)).program?.exercises,
    ).toHaveLength(count);
  expect(calls.at(-1)?.range).toEqual(count === 25 ? [25, 49] : [50, 74]);
});
test.each([
  { planned_reps: '' },
  { planned_reps: '1000' },
  { planned_reps: '1e2' },
  { planned_seconds: '10000', planned_reps: null, measure_snapshot: 'seconds' },
  { planned_sets: 21 },
  { rest_seconds: 601 },
  { planned_weight_g: 1000001 },
  { revision: 0 },
  { exercise_name_snapshot: 'x'.repeat(121) },
  { id: 'bad' },
])('rejects malformed schema fields %p', async (change) => {
  setup({ lines: [{ ...line, ...change }] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});
test.each(['2026-02-30T00:00:00Z', '2026-10-01T10:00:00+01:00', 'unknown'])(
  'rejects malformed UTC %s',
  async (created_at) => {
    setup({ program: { ...program, created_at } });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
test('rejects duplicate source exercises', async () => {
  setup({ lines: [line, { ...line, id: user, position: 1 }] });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});

test.each([{}, null, 'unknown'])(
  'unknown page is not empty success %p',
  async (page) => {
    setup({ page });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
test('zero/null plan values are lossless and SQL unit format is not coerced', async () => {
  setup({
    lines: [
      {
        ...line,
        planned_reps: '000',
        planned_weight_g: null,
        rest_seconds: 0,
        note: '',
      },
    ],
  });
  expect(
    (await loadLatestClientProgram(input)).program?.exercises[0],
  ).toMatchObject({
    plannedReps: '000',
    plannedWeightG: null,
    restSeconds: 0,
    note: '',
  });
});
test('error from old session becomes unavailable and has no upstream payload', async () => {
  setup({
    error: true,
    stage: (stage, emit) => {
      if (stage === 'program') emit('SIGNED_OUT');
    },
  });
  try {
    await loadLatestClientProgram(input);
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toMatchObject({
      code: 'unavailable',
      message: 'Client program could not be loaded',
    });
    expect(error).not.toHaveProperty('cause');
  }
});

test.each(['relogin', 'duplicate'] as const)(
  'second page %s rejects the whole copy',
  async (mode) => {
    const lines = Array.from({ length: 26 }, (_, position) => ({
      ...line,
      position,
      id: `41000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
      exercise_id: `61000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`,
    }));
    if (mode === 'duplicate') lines[25] = { ...lines[25]!, id: lines[0]!.id };
    setup({
      lines,
      stage: (stage, emit) => {
        if (mode === 'relogin' && stage === 'lines:25')
          emit('SIGNED_IN', user, id);
      },
    });
    await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
      code: mode === 'relogin' ? 'unavailable' : 'request',
    });
  },
);
test.each([
  { name: 'x'.repeat(81) },
  { description: 'x'.repeat(401) },
  { revision: 0 },
  { created_at: 34 },
  { id: 'unknown' },
])('rejects malformed parent %p', async (change) => {
  setup({ program: { ...program, ...change } });
  await expect(loadLatestClientProgram(input)).rejects.toMatchObject({
    code: 'request',
  });
});
