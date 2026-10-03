import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  loadWorkspaceExercises,
  loadWorkspaceLibrary,
  loadWorkspaceTemplates,
} from '../src/features/workspace-library/service';
import type { Database } from '../src/lib/database.types';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const workspaceId = '61000000-0000-4000-8000-000000000001';
const userId = '51000000-0000-4000-8000-000000000001';
const sessionId = '71000000-0000-4000-8000-000000000001';
const uuid = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
const token = (sub = userId, session = sessionId, nonce = 0) =>
  `e30.${Buffer.from(JSON.stringify({ sub, session_id: session, nonce })).toString('base64url')}.signature`;
const session = (accessToken = token()) =>
  ({ access_token: accessToken, user: { id: userId } }) as Session;
const exercise = (index = 1) => ({
  id: uuid('81000000', index),
  workspace_id: workspaceId,
  source_key: null,
  name: `Exercise ${index}`,
  name_normalized: `exercise ${index}`,
  muscle_group: 'Ноги',
  equipment: 'штанга',
  measure: 'reps',
  bodyweight: false,
  aliases: ['alias'],
  instructions: ['instruction'],
  archived_at: null,
  revision: 2,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  created_by: null,
});
const template = (index = 1) => ({
  id: uuid('91000000', index),
  workspace_id: workspaceId,
  name: `Template ${index}`,
  name_normalized: `template ${index}`,
  description: '',
  archived_at: null,
  revision: 3,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  created_by: null,
});
const line = (index = 1, templateIndex = 1, exerciseIndex = 1) => ({
  id: uuid('b1000000', index),
  workspace_id: workspaceId,
  template_id: template(templateIndex).id,
  exercise_id: exercise(exerciseIndex).id,
  position: 0,
  planned_sets: 3,
  planned_reps: '8–12',
  planned_seconds: null,
  planned_weight_g: 42501,
  rest_seconds: 0,
  note: null,
  revision: 4,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  created_by: null,
});
type Row = Record<string, unknown>;
type Request = {
  table: string;
  first: number;
  last: number;
  filters: [string, unknown][];
  ids: [string, string[]][];
  orders: string[];
  headers: [string, string][];
};
const mockLibrary = (data: Record<string, Row[]> = {}) => {
  let activeSession: Session | null = session();
  let listener:
    ((event: AuthChangeEvent, value: Session | null) => void) | undefined;
  let onRequest: ((request: Request) => void) | undefined;
  let transform: ((request: Request, rows: Row[]) => unknown) | undefined;
  const requests: Request[] = [];
  const unsubscribe = jest.fn();
  const query = (table: string) => {
    let single = false;
    const request: Request = {
      table,
      first: 0,
      last: 499,
      filters: [],
      ids: [],
      orders: [],
      headers: [],
    };
    const result = () => {
      requests.push(request);
      onRequest?.(request);
      const source =
        table === 'trainer_workspaces'
          ? [{ id: workspaceId, owner_user_id: userId }]
          : (data[table] ?? []);
      const rows = source
        .filter((row) =>
          request.ids.every(([column, ids]) =>
            ids.includes(String(row[column])),
          ),
        )
        .slice(request.first, request.last + 1);
      return {
        data: single
          ? transform
            ? ((transform(request, rows) as Row[])[0] ?? null)
            : (rows[0] ?? null)
          : transform
            ? transform(request, rows)
            : rows,
        error: null,
      };
    };
    const builder: {
      select: jest.Mock;
      eq: jest.Mock;
      is: jest.Mock;
      in: jest.Mock;
      order: jest.Mock;
      range: jest.Mock;
      setHeader: jest.Mock;
      maybeSingle: jest.Mock;
      then: (
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((column: string, value: unknown) => {
        request.filters.push([column, value]);
        return builder;
      }),
      is: jest.fn().mockReturnThis(),
      in: jest.fn((column: string, ids: string[]) => {
        request.ids.push([column, ids]);
        return builder;
      }),
      order: jest.fn((column: string) => {
        request.orders.push(column);
        return builder;
      }),
      range: jest.fn((first: number, last: number) => {
        request.first = first;
        request.last = last;
        return builder;
      }),
      setHeader: jest.fn((name: string, value: string) => {
        request.headers.push([name, value]);
        return builder;
      }),
      maybeSingle: jest.fn(() => {
        single = true;
        return builder;
      }),
      then: (
        resolve: (value: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  };
  const client = {
    from: jest.fn(query),
    rpc: jest.fn(() => query('search_exercises')),
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: activeSession },
        error: null,
      })),
      onAuthStateChange: jest.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(client as unknown as SupabaseClient<Database>);
  return {
    requests,
    client,
    unsubscribe,
    change: (event: AuthChangeEvent, value: Session | null) => {
      activeSession = value;
      listener?.(event, value);
    },
    onRequest: (callback: NonNullable<typeof onRequest>) => {
      onRequest = callback;
    },
    transform: (callback: NonNullable<typeof transform>) => {
      transform = callback;
    },
  };
};
beforeEach(() => jest.mocked(getSupabaseClient).mockReset());
it('loads 501 exercises with deterministic scoped pages and pinned credentials', async () => {
  const mock = mockLibrary({
    search_exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  expect(await loadWorkspaceExercises(workspaceId)).toHaveLength(501);
  const pages = mock.requests.filter((r) => r.table === 'search_exercises');
  expect(pages.map((r) => [r.first, r.last])).toEqual([
    [0, 499],
    [500, 999],
  ]);
  for (const r of pages) {
    expect(r.filters).toContainEqual(['workspace_id', workspaceId]);
    expect(r.orders).toEqual(['name_normalized', 'id']);
    expect(r.headers).toContainEqual(['Authorization', `Bearer ${token()}`]);
  }
  expect(mock.unsubscribe).toHaveBeenCalled();
});
it('loads 501 templates and relations through ID batches of at most 200', async () => {
  const mock = mockLibrary({
    workout_templates: Array.from({ length: 501 }, (_, i) => template(i + 1)),
    template_exercises: Array.from({ length: 501 }, (_, i) =>
      line(i + 1, i + 1, i + 1),
    ),
    exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  const loaded = await loadWorkspaceTemplates(workspaceId);
  expect(loaded).toHaveLength(501);
  expect(loaded.reduce((sum, item) => sum + item.exercises.length, 0)).toBe(
    501,
  );
  for (const r of mock.requests)
    for (const [, ids] of r.ids) expect(ids.length).toBeLessThanOrEqual(200);
});
it.each([
  ['foreign workspace', { ...exercise(), workspace_id: uuid('61000000', 2) }],
  ['invalid measure', { ...exercise(), measure: 'meters' }],
  ['invalid revision', { ...exercise(), revision: 0 }],
  ['invalid array', { ...exercise(), aliases: ['ok', 3] }],
  ['invalid identifier', { ...exercise(), id: 'invalid' }],
])('rejects the whole exercise read for %s', async (_name, invalid) => {
  mockLibrary({ search_exercises: [exercise(2), invalid] });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toBeDefined();
});
it('rejects duplicate exercise identities', async () => {
  mockLibrary({ search_exercises: [exercise(), exercise()] });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toBeDefined();
});
it.each([
  ['missing exercise', []],
  ['foreign exercise', [{ ...exercise(), workspace_id: uuid('61000000', 2) }]],
])('rejects templates with %s', async (_name, exercises) => {
  mockLibrary({
    workout_templates: [template()],
    template_exercises: [line()],
    exercises,
  });
  await expect(loadWorkspaceTemplates(workspaceId)).rejects.toBeDefined();
});
it('rejects another trainer ownership before reading exercises', async () => {
  const mock = mockLibrary();
  mock.transform((r, rows) =>
    r.table === 'trainer_workspaces'
      ? [{ id: workspaceId, owner_user_id: uuid('51000000', 2) }]
      : rows,
  );
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(mock.client.rpc).not.toHaveBeenCalled();
});
it('rejects a session replacement between pages', async () => {
  const mock = mockLibrary({
    search_exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  mock.onRequest((r) => {
    if (r.table === 'search_exercises' && r.first === 0)
      mock.change('SIGNED_IN', session(token(userId, uuid('71000000', 2))));
  });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
  });
});
it('accepts a verified refresh of the same session with pinned credentials', async () => {
  const mock = mockLibrary({
    search_exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  mock.onRequest((r) => {
    if (r.table === 'search_exercises' && r.first === 0)
      mock.change('TOKEN_REFRESHED', session(token(userId, sessionId, 1)));
  });
  expect(await loadWorkspaceExercises(workspaceId)).toHaveLength(501);
  for (const r of mock.requests)
    expect(r.headers).toContainEqual(['Authorization', `Bearer ${token()}`]);
});
it('rejects a combined read when the session changes during relation loading', async () => {
  const mock = mockLibrary({
    search_exercises: [exercise()],
    workout_templates: [template()],
    template_exercises: [line()],
    exercises: [exercise()],
  });
  mock.onRequest((r) => {
    if (r.table === 'template_exercises') mock.change('SIGNED_OUT', null);
  });
  await expect(loadWorkspaceLibrary(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
  });
});
it('fails explicitly at the pagination bound instead of returning truncated data', async () => {
  const mock = mockLibrary();
  mock.transform((r, rows) =>
    r.table === 'search_exercises'
      ? Array.from({ length: 500 }, (_, i) => exercise(r.first + i + 1))
      : rows,
  );
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    code: 'readLimit',
  });
  expect(
    mock.requests.filter((r) => r.table === 'search_exercises'),
  ).toHaveLength(20);
});
it('rejects a silent token replacement without a verified refresh event', async () => {
  const mock = mockLibrary({
    search_exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  mock.onRequest((r) => {
    if (r.table === 'search_exercises')
      mock.client.auth.getSession.mockResolvedValue({
        data: { session: session(token(userId, sessionId, 1)) },
        error: null,
      });
  });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
  });
});
it('does not expose private auth failure details', async () => {
  const mock = mockLibrary();
  mock.client.auth.getSession.mockRejectedValue(
    new Error('private token detail'),
  );
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
    message: 'Library session changed or could not be verified',
  });
  expect(mock.client.rpc).not.toHaveBeenCalled();
});
it('reads all 1200 lines across deterministic pages and keeps archived references', async () => {
  const exercises = Array.from({ length: 50 }, (_, i) => ({
    ...exercise(i + 1),
    archived_at: '2026-10-01T10:00:00.000Z',
  }));
  const templates = Array.from({ length: 24 }, (_, i) => template(i + 1));
  const mock = mockLibrary({
    workout_templates: templates,
    template_exercises: templates.flatMap((_, t) =>
      exercises.map((_, i) => ({
        ...line(t * 50 + i + 1, t + 1, i + 1),
        position: i,
      })),
    ),
    exercises,
  });
  const loaded = await loadWorkspaceTemplates(workspaceId);
  expect(loaded.reduce((sum, t) => sum + t.exercises.length, 0)).toBe(1200);
  expect(loaded[23]?.exercises[49]).toMatchObject({
    position: 49,
    plannedWeightG: 42501,
    target: 42.501,
    lineRevision: 4,
    rest: 0,
    exercise: {
      archivedAt: '2026-10-01T10:00:00.000Z',
      aliases: ['alias'],
      instructions: ['instruction'],
    },
  });
  expect(
    mock.requests
      .filter((r) => r.table === 'template_exercises')
      .map((r) => r.first),
  ).toEqual([0, 500, 1000]);
});
it.each([
  ['foreign line', { ...line(), workspace_id: uuid('61000000', 2) }],
  ['dangling template', { ...line(), template_id: template(2).id }],
  ['fractional grams', { ...line(), planned_weight_g: 0.5 }],
  ['invalid units', { ...line(), planned_seconds: '45' }],
  ['invalid position', { ...line(), position: 2 }],
])('rejects the complete template read for %s', async (_name, invalid) => {
  const mock = mockLibrary({
    workout_templates: [template()],
    exercises: [exercise()],
  });
  mock.transform((r, rows) =>
    r.table === 'template_exercises' ? [invalid] : rows,
  );
  await expect(loadWorkspaceTemplates(workspaceId)).rejects.toMatchObject({
    code: 'request',
  });
});
it.each([
  ['foreign template', { ...template(), workspace_id: uuid('61000000', 2) }],
  ['malformed template revision', { ...template(), revision: 0 }],
  ['malformed template name', { ...template(), name: '' }],
])('rejects %s before loading relations', async (_name, invalid) => {
  const mock = mockLibrary({ workout_templates: [invalid] });
  await expect(loadWorkspaceTemplates(workspaceId)).rejects.toMatchObject({
    code: 'request',
  });
  expect(mock.requests.some((r) => r.table === 'template_exercises')).toBe(
    false,
  );
});
it.each(['workout_templates', 'template_exercises'])(
  'rejects duplicated %s rows',
  async (table) => {
    const mock = mockLibrary({
      workout_templates: [template()],
      template_exercises: [line()],
      exercises: [exercise()],
    });
    mock.transform((r, rows) =>
      r.table === table ? [...rows, ...rows] : rows,
    );
    await expect(loadWorkspaceTemplates(workspaceId)).rejects.toMatchObject({
      code: 'request',
    });
  },
);
it.each(['workout_templates', 'template_exercises'])(
  'fails explicitly at the %s pagination limit',
  async (table) => {
    const mock = mockLibrary({ workout_templates: [template()] });
    mock.transform((r, rows) =>
      r.table !== table
        ? rows
        : Array.from({ length: 500 }, (_, i) =>
            table === 'workout_templates'
              ? template(r.first + i + 1)
              : { ...line(r.first + i + 1), position: i % 50 },
          ),
    );
    await expect(loadWorkspaceTemplates(workspaceId)).rejects.toMatchObject({
      code: 'readLimit',
    });
    expect(mock.requests.filter((r) => r.table === table)).toHaveLength(20);
  },
);
it('preserves null and zero weights and second-based plans in secure reads', async () => {
  mockLibrary({
    workout_templates: [template()],
    template_exercises: [
      { ...line(1, 1, 1), planned_weight_g: null },
      { ...line(2, 1, 2), position: 1, planned_weight_g: 0 },
      {
        ...line(3, 1, 3),
        position: 2,
        planned_reps: null,
        planned_seconds: '45–60',
        planned_weight_g: 1,
      },
    ],
    exercises: [
      exercise(1),
      exercise(2),
      { ...exercise(3), measure: 'seconds' },
    ],
  });
  const result = await loadWorkspaceTemplates(workspaceId);
  expect(result[0]?.exercises).toMatchObject([
    { plannedWeightG: null, target: 0, unit: 'повт' },
    { plannedWeightG: 0, target: 0 },
    { plannedWeightG: 1, target: 0.001, reps: '45–60 сек', unit: 'сек' },
  ]);
});
it('rejects a template whose required plan lines are absent', async () => {
  mockLibrary({ workout_templates: [template()] });
  await expect(loadWorkspaceTemplates(workspaceId)).rejects.toMatchObject({
    code: 'request',
  });
});
it('rejects an explicitly stale caller scope before publishing any data', async () => {
  const mock = mockLibrary({ search_exercises: [exercise()] });
  await expect(
    loadWorkspaceExercises(workspaceId, '', {
      userId,
      workspaceId,
      sessionId,
      isCurrent: () => false,
    }),
  ).rejects.toMatchObject({ name: 'WorkspaceLibrarySessionError' });
  expect(mock.client.rpc).not.toHaveBeenCalled();
});
it('rejects a refresh token whose JWT subject disagrees with the authenticated actor', async () => {
  const mock = mockLibrary({
    search_exercises: Array.from({ length: 501 }, (_, i) => exercise(i + 1)),
  });
  mock.onRequest((r) => {
    if (r.table === 'search_exercises')
      mock.change('TOKEN_REFRESHED', session(token(uuid('51000000', 2))));
  });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
  });
});

it('rejects a malformed actor even when the JWT subject agrees', async () => {
  const mock = mockLibrary();
  mock.client.auth.getSession.mockResolvedValue({
    data: {
      session: {
        ...session(token('invalid-actor')),
        user: { id: 'invalid-actor' },
      } as Session,
    },
    error: null,
  });
  await expect(loadWorkspaceExercises(workspaceId)).rejects.toMatchObject({
    name: 'WorkspaceLibrarySessionError',
  });
  expect(mock.client.from).not.toHaveBeenCalled();
});
