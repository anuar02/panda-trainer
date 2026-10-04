import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  archiveWorkspaceExerciseOperation,
  loadWorkspaceLibrary,
  saveWorkspaceTemplateOperation,
  createWorkspaceExerciseOperation,
} from '../src/features/workspace-library/service';
import { WorkspaceLibrarySessionError } from '../src/features/workspace-library/read-session';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => id }));
const user = '51000000-0000-4000-8000-000000000001';
const workspace = '61000000-0000-4000-8000-000000000001';
const id = '81000000-0000-4000-8000-000000000001';
const login = 'a1000000-0000-4000-8000-000000000001';
const other = 'a1000000-0000-4000-8000-000000000002';
const input = {
  name: 'Моя Ёлка',
  muscleGroup: 'Грудь',
  equipment: 'штанга',
  measure: 'reps' as const,
  bodyweight: false,
  aliases: ['жим'],
  instructions: ['Темп'],
};
const row = {
  id,
  workspace_id: workspace,
  name: input.name,
  name_normalized: 'моя елка',
  muscle_group: input.muscleGroup,
  equipment: input.equipment,
  measure: 'reps',
  bodyweight: false,
  aliases: input.aliases,
  instructions: input.instructions,
  source_key: null,
  archived_at: null as string | null,
  revision: 1,
  created_at: '2026-10-04T10:00:00Z',
  updated_at: '2026-10-04T10:00:00Z',
  created_by: user,
};
const sessionFor = (sessionId = login, sub = user, tokenUser = user) =>
  ({
    user: { id: tokenUser },
    access_token: `h.${btoa(JSON.stringify({ sub, session_id: sessionId })).replace(/=/g, '')}.s`,
  }) as Session;
type Response = { data: unknown; error: { code: string } | null };
type Call = {
  table: string;
  action: string;
  payload?: unknown;
  filters: Record<string, unknown>;
  bearer?: string;
};
let session: Session | null;
let listener: (event: AuthChangeEvent, value: Session | null) => void;
let calls: Call[];
let responses: Response[];
let io: (call: Call) => Promise<Response>;
let authAwait: () => Promise<void>;
let current: boolean;
const scope = () => ({
  userId: user,
  workspaceId: workspace,
  sessionId: login,
  isCurrent: () => current,
});
const response = (data: unknown): Response => ({ data, error: null });
const duplicate = { data: null, error: { code: '23505' } };
const setup = () => {
  const client = {
    auth: {
      getSession: jest.fn(async () => {
        await authAwait();
        return { data: { session }, error: null };
      }),
      onAuthStateChange: jest.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
    from: (table: string) => {
      const call: Call = { table, action: 'read', filters: {} };
      const builder = {
        insert: (payload: unknown) => {
          call.action = 'insert';
          call.payload = payload;
          return builder;
        },
        update: (payload: unknown) => {
          call.action = 'update';
          call.payload = payload;
          return builder;
        },
        select: () => builder,
        eq: (key: string, value: unknown) => {
          call.filters[key] = value;
          return builder;
        },
        is: (key: string, value: unknown) => {
          call.filters[key] = value;
          return builder;
        },
        order: () => builder,
        range: () => builder,
        in: (key: string, value: string[]) => {
          call.filters[key] = value;
          return builder;
        },
        single: () => builder,
        maybeSingle: () => builder,
        setHeader: (key: string, value: string) => {
          expect(key).toBe('Authorization');
          call.bearer = value;
          return builder;
        },
        then: (
          resolve: (value: Response) => unknown,
          reject: (reason: unknown) => unknown,
        ) => {
          calls.push(call);
          return io(call).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  Object.assign(client, {
    rpc: (name: string, args: unknown) => client.from(name).insert(args),
  });
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(
      client as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>,
    );
  return client;
};
beforeEach(() => {
  session = sessionFor();
  current = true;
  calls = [];
  responses = [];
  authAwait = async () => undefined;
  io = async (call) =>
    call.table === 'trainer_workspaces'
      ? response({ id: workspace, owner_user_id: user })
      : responses.shift()!;
  setup();
});
test('canonical payload is captured before caller mutation and one insert serves double taps/cache', async () => {
  const mutable = { ...input, aliases: [...input.aliases] };
  const operation = createWorkspaceExerciseOperation(
    workspace,
    mutable,
    scope(),
    id,
  );
  mutable.name = 'Changed';
  mutable.aliases.push('Changed');
  responses.push(response(row));
  const values = await Promise.all([operation.execute(), operation.execute()]);
  expect(values[0]).toEqual(values[1]);
  await operation.execute();
  expect(calls.filter((call) => call.action === 'insert')).toHaveLength(1);
  expect(calls[1]?.payload).toMatchObject({
    id,
    name: input.name,
    aliases: input.aliases,
  });
  expect(
    calls.every((call) => call.bearer === `Bearer ${session!.access_token}`),
  ).toBe(true);
  operation.dispose?.();
});
test('lost response retries the same UUID and validates the full committed row', async () => {
  responses.push(
    { data: null, error: { code: '08006' } },
    duplicate,
    response(row),
  );
  const operation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  await expect(operation.execute()).resolves.toMatchObject({
    existing: true,
    exercise: { id },
  });
  expect(
    calls
      .filter((call) => call.action === 'insert')
      .map((call) => call.payload),
  ).toEqual([calls[1]!.payload, calls[1]!.payload]);
  expect(calls.at(-1)?.filters).toEqual({ workspace_id: workspace, id });
});
test('exact normalized-name duplicate reconciles only after own UUID is absent', async () => {
  responses.push(duplicate, response(null), response({ ...row, id: other }));
  await expect(
    createWorkspaceExerciseOperation(workspace, input, scope(), id).execute(),
  ).resolves.toMatchObject({ existing: true, exercise: { id: other } });
  expect(calls.at(-1)?.filters).toEqual({
    workspace_id: workspace,
    name_normalized: 'моя елка',
    archived_at: null,
  });
});
test.each([
  { name: 'моя елка' },
  { muscle_group: 'Спина' },
  { equipment: 'гантели' },
  { measure: 'seconds' },
  { bodyweight: true },
  { aliases: [] },
  { instructions: [] },
  { workspace_id: other },
  { source_key: 'e0' },
  { name_normalized: 'wrong' },
  { id: 'invalid' },
  { updated_at: '2026-02-30T10:00:00Z' },
  { revision: 0 },
])('rejects mismatched duplicate %j', async (change) => {
  responses.push(duplicate, response(null), response({ ...row, ...change }));
  await expect(
    createWorkspaceExerciseOperation(workspace, input, scope(), id).execute(),
  ).rejects.toBeDefined();
});
test('a lost insert subsequently archived cannot create a second row even when name is reusable', async () => {
  responses.push(
    duplicate,
    response({ ...row, archived_at: '2026-10-04T11:00:00Z' }),
  );
  await expect(
    createWorkspaceExerciseOperation(workspace, input, scope(), id).execute(),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(calls).toHaveLength(3);
});
test.each([
  { id: other },
  { created_by: other },
  { archived_at: '2026-10-04T11:00:00Z' },
  { measure: 'meters' },
  { workspace_id: other },
])('validates successful insert unknown row %j', async (change) => {
  responses.push(response({ ...row, ...change }));
  await expect(
    createWorkspaceExerciseOperation(workspace, input, scope(), id).execute(),
  ).rejects.toBeDefined();
});
test('wrong owner cannot dispatch insert', async () => {
  io = async () => response({ id: workspace, owner_user_id: other });
  await expect(
    createWorkspaceExerciseOperation(workspace, input, scope(), id).execute(),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(calls).toHaveLength(1);
});
test.each(['create', 'archive'] as const)(
  '%s is fenced on every auth await including cached results',
  async (kind) => {
    for (let boundary = 1; boundary <= 12; boundary += 1) {
      session = sessionFor();
      current = true;
      calls = [];
      responses = [];
      setup();
      let awaits = 0;
      authAwait = async () => {
        awaits += 1;
        if (awaits === boundary) session = sessionFor(other);
      };
      responses.push(
        response(
          kind === 'create'
            ? row
            : { ...row, archived_at: '2026-10-04T11:00:00Z' },
        ),
      );
      const operation =
        kind === 'create'
          ? createWorkspaceExerciseOperation(workspace, input, scope(), id)
          : archiveWorkspaceExerciseOperation(workspace, id, scope());
      let accepted = false;
      try {
        await operation.execute();
        await operation.execute();
        accepted = true;
      } catch (error) {
        expect(error).toBeInstanceOf(WorkspaceLibrarySessionError);
      }
      if (awaits >= boundary) expect(accepted).toBe(false);
      operation.dispose?.();
    }
  },
);
test.each([
  'owner',
  'insert',
  'uuid',
  'duplicate',
  'update',
  'archive-read',
  'error',
] as const)(
  'cancels after %s IO before returning data or error',
  async (boundary) => {
    let step = 0;
    const failAt = {
      owner: 1,
      insert: 2,
      uuid: 3,
      duplicate: 4,
      update: 2,
      'archive-read': 3,
      error: 2,
    }[boundary];
    const archive = boundary === 'update' || boundary === 'archive-read';
    io = async (call) => {
      step += 1;
      if (step === failAt) {
        session = sessionFor(other);
        listener('SIGNED_IN', session);
      }
      if (call.table === 'trainer_workspaces')
        return response({ id: workspace, owner_user_id: user });
      if (boundary === 'error') throw new Error('private');
      if (archive)
        return response(
          step === 2 ? null : { ...row, archived_at: '2026-10-04T11:00:00Z' },
        );
      return step === 2 ? duplicate : response(step === 3 ? null : row);
    };
    const operation = archive
      ? archiveWorkspaceExerciseOperation(workspace, id, scope())
      : createWorkspaceExerciseOperation(workspace, input, scope(), id);
    await expect(operation.execute()).rejects.toBeInstanceOf(
      WorkspaceLibrarySessionError,
    );
    expect(step).toBe(failAt);
  },
);
test.each(['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'] as const)(
  'cached success is revoked by %s even for the same user',
  async (event) => {
    responses.push(response(row));
    const operation = createWorkspaceExerciseOperation(
      workspace,
      input,
      scope(),
      id,
    );
    await operation.execute();
    listener(event, session);
    await expect(operation.execute()).rejects.toBeInstanceOf(
      WorkspaceLibrarySessionError,
    );
  },
);
test('normal refresh is accepted and wrong refresh claims cancel', async () => {
  responses.push(response(row));
  const operation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  await operation.execute();
  session = {
    ...sessionFor(),
    access_token: sessionFor().access_token + 'refresh',
  };
  listener('TOKEN_REFRESHED', session);
  await expect(operation.execute()).resolves.toMatchObject({
    exercise: { id },
  });
  session = sessionFor(login, other);
  listener('TOKEN_REFRESHED', session);
  await expect(operation.execute()).rejects.toBeInstanceOf(
    WorkspaceLibrarySessionError,
  );
});
test('unproved refresh while initial identity capture is pending cancels', async () => {
  let resume: () => void = () => undefined;
  authAwait = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  const operation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  listener('TOKEN_REFRESHED', session);
  resume();
  await expect(operation.execute()).rejects.toBeInstanceOf(
    WorkspaceLibrarySessionError,
  );
  expect(calls).toHaveLength(0);
});
test('dispose and caller switch revoke cached success', async () => {
  responses.push(response(row));
  const operation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  await operation.execute();
  current = false;
  await expect(operation.execute()).rejects.toBeInstanceOf(
    WorkspaceLibrarySessionError,
  );
  operation.dispose?.();
});
test('archive retry reads original archive date and leaves metadata unchanged', async () => {
  const archived = { ...row, archived_at: '2026-10-04T11:00:00Z' };
  responses.push(
    { data: null, error: { code: '08006' } },
    response(null),
    response(archived),
  );
  const operation = archiveWorkspaceExerciseOperation(workspace, id, scope());
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  await expect(operation.execute()).resolves.toEqual({
    exerciseId: id,
    archivedAt: archived.archived_at,
  });
  expect(
    calls
      .filter((call) => call.action === 'update')
      .map((call) => call.payload),
  ).toEqual([calls[1]!.payload, calls[1]!.payload]);
  expect(Object.keys(calls[1]!.payload as object)).toEqual(['archived_at']);
});
test.each([
  { id: other },
  { workspace_id: other },
  { archived_at: null },
  { archived_at: '2026-02-30T10:00:00Z' },
  { measure: 'meters' },
])('archive validates unknown scoped row %j', async (change) => {
  responses.push(
    response({ ...row, archived_at: '2026-10-04T11:00:00Z', ...change }),
  );
  await expect(
    archiveWorkspaceExerciseOperation(workspace, id, scope()).execute(),
  ).rejects.toMatchObject({ code: 'unavailable' });
});

test('same-identity refresh uses fresh bearer on retry; silently changed bearer is rejected', async () => {
  responses.push(
    { data: null, error: { code: '08006' } },
    duplicate,
    response(row),
  );
  const operation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  await expect(operation.execute()).rejects.toMatchObject({ code: 'request' });
  session = {
    ...sessionFor(),
    access_token: sessionFor().access_token + 'refreshed',
  };
  listener('TOKEN_REFRESHED', session);
  await expect(operation.execute()).resolves.toMatchObject({ existing: true });
  expect(
    calls
      .slice(2)
      .every((call) => call.bearer === `Bearer ${session!.access_token}`),
  ).toBe(true);
  session = {
    ...sessionFor(),
    access_token: sessionFor().access_token + 'silent',
  };
  await expect(operation.execute()).rejects.toBeInstanceOf(
    WorkspaceLibrarySessionError,
  );
});

test('actual service create → save attach → archive → existing read retains UUID and all plan units', async () => {
  const templateId = '91000000-0000-4000-8000-000000000001';
  const templateRow = {
    ...row,
    id: templateId,
    name: 'План',
    name_normalized: 'план',
    description: '',
  };
  let created: typeof row | null = null;
  let attached: Record<string, unknown> | null = null;
  io = async (call) => {
    if (call.table === 'trainer_workspaces')
      return response({ id: workspace, owner_user_id: user });
    if (call.table === 'exercises' && call.action === 'insert') {
      created = { ...row };
      return response(created);
    }
    if (call.table === 'save_workout_template') {
      const payload = call.payload as {
        p_exercises: Record<string, unknown>[];
      };
      attached = {
        ...row,
        ...payload.p_exercises[0],
        id: 'b1000000-0000-4000-8000-000000000001',
        template_id: templateId,
        position: 0,
      };
      return response({ id: templateId, revision: 1, replayed: false });
    }
    if (call.table === 'exercises' && call.action === 'update') {
      created = {
        ...created!,
        archived_at: (call.payload as { archived_at: string }).archived_at,
      };
      return response(created);
    }
    if (call.table === 'search_exercises')
      return response(created?.archived_at === null ? [created] : []);
    if (call.table === 'workout_templates') return response([templateRow]);
    if (call.table === 'template_exercises') return response([attached]);
    if (call.table === 'exercises') return response([created]);
    throw new Error('Unexpected service request');
  };
  const creation = createWorkspaceExerciseOperation(
    workspace,
    input,
    scope(),
    id,
  );
  const result = await creation.execute();
  const save = saveWorkspaceTemplateOperation(
    {
      id: templateId,
      name: 'План',
      description: '',
      exercises: [
        {
          id: result.exercise.id,
          name: result.exercise.name,
          sets: 3,
          reps: '8–12',
          target: 22.5,
          rest: 90,
          unit: 'повт',
          note: 'Темп',
        },
      ],
    },
    null,
    user,
    other,
    scope(),
  );
  await save.execute();
  const before = await loadWorkspaceLibrary(workspace, 'МОЯ ЕЛКА', scope());
  expect(before.exercises[0]?.id).toBe(id);
  const lineBefore = before.templates[0]!.exercises[0]!;
  const archive = archiveWorkspaceExerciseOperation(workspace, id, scope());
  await archive.execute();
  const after = await loadWorkspaceLibrary(workspace, 'МОЯ ЕЛКА', scope());
  expect(after.exercises).toEqual([]);
  expect(after.templates[0]?.exercises[0]).toMatchObject({
    id,
    name: input.name,
    sets: 3,
    reps: '8–12',
    plannedWeightG: 22500,
    rest: 90,
    note: 'Темп',
    exercise: { archivedAt: expect.any(String) },
  });
  expect(lineBefore.exercise.archivedAt).toBeNull();
  expect(lineBefore.plannedWeightG).toBe(22500);
  creation.dispose?.();
  archive.dispose?.();
  save.dispose?.();
});
