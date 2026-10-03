import {
  loadWorkspaceClientDetails,
  loadWorkspaceClients,
} from '@/features/workspace-clients/service';
import {
  setupRead,
  workspaceId,
  clientId,
  userId,
  id,
  person,
  program,
  exercise,
  booking,
} from './workspace-client-read-fixtures';

jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
afterEach(() => jest.resetAllMocks());

test('reads immutable metadata, safe projections, UTC zero/null units and deterministic latest ordering', async () => {
  const read = setupRead();
  const result = await loadWorkspaceClientDetails(workspaceId, clientId);
  expect(result?.program).toEqual({ ...program, items: [exercise] });
  for (const query of read.queries) {
    expect(query.columns).not.toContain('*');
    expect(query.columns).not.toContain('created_by');
    expect(query.token).toBe('Bearer original-token');
  }
  expect(
    read.queries.find((q) => q.table === 'client_programs')?.orders,
  ).toEqual([
    ['created_at', false],
    ['id', false],
  ]);
  expect(
    read.queries.find((q) => q.table === 'client_program_exercises')?.filters
      .client_program_id,
  ).toBe(program.id);
  expect(read.unsubscribe).toHaveBeenCalledTimes(1);
});

test('unassigned client has no exercise query; missing and archived clients stay not-found', async () => {
  const read = setupRead({ client_programs: [] });
  expect(
    (await loadWorkspaceClientDetails(workspaceId, clientId))?.program,
  ).toBeNull();
  expect(read.from).not.toHaveBeenCalledWith('client_program_exercises');
  setupRead({ client_records: [] });
  expect(await loadWorkspaceClientDetails(workspaceId, clientId)).toBeNull();
  setupRead({
    client_records: [{ ...person, archived_at: person.updated_at }],
  });
  expect(await loadWorkspaceClientDetails(workspaceId, clientId)).toBeNull();
});

test('list reads >500 clients/programs/bookings including archived relations and selects latest/nearest deterministically', async () => {
  const people = Array.from({ length: 601 }, (_, n) => ({
    ...person,
    id: id(n + 1000),
    archived_at: null as string | null,
  }));
  const programs = people.map((p, n) => ({
    ...program,
    id: id(3000 - n),
    client_record_id: p.id,
  }));
  const bookings = people.map((p, n) => ({
    ...booking,
    id: id(n + 4000),
    client_record_id: p.id,
  }));
  people[600] = { ...person, id: id(1600), archived_at: person.updated_at };
  const read = setupRead({
    client_records: people,
    client_programs: programs,
    bookings,
  });
  const result = await loadWorkspaceClients(workspaceId);
  expect(result).toHaveLength(600);
  expect(result[599]?.programName).toBe(program.name);
  expect(result[599]?.nextStartsAt).toBe(booking.starts_at);
  expect(
    read.queries
      .filter((q) => q.table === 'client_records')
      .map((q) => q.offset),
  ).toEqual([0, 200, 400, 600]);
  expect(
    read.queries.filter((q) => q.table === 'client_programs'),
  ).toHaveLength(4);
  expect(read.queries.filter((q) => q.table === 'bookings')).toHaveLength(4);
});

test('details paginate >500 programs/bookings and preserve latest copy and descending session order', async () => {
  const programs = Array.from({ length: 501 }, (_, n) => ({
    ...program,
    id: id(2000 - n),
  }));
  const bookings = Array.from({ length: 501 }, (_, n) => ({
    ...booking,
    id: id(4000 - n),
  }));
  const read = setupRead({
    client_programs: programs,
    bookings,
    client_program_exercises: [
      { ...exercise, client_program_id: programs[0]?.id },
    ],
  });
  const result = await loadWorkspaceClientDetails(workspaceId, clientId);
  expect(result?.program?.id).toBe(id(2000));
  expect(result?.bookings).toHaveLength(501);
  expect(result?.bookings[500]?.id).toBe(id(3500));
  expect(read.queries.filter((q) => q.table === 'bookings')).toHaveLength(3);
});

test.each([
  ['client_records', { ...person, workspace_id: id(99) }],
  ['client_records', { ...person, id: id(99) }],
  ['client_records', { ...person, revision: 0 }],
  ['client_records', { ...person, user_id: 'bad' }],
  ['client_records', { ...person, created_at: '2026-02-30T10:00:00Z' }],
  ['client_programs', { ...program, client_record_id: id(99) }],
  ['client_programs', { ...program, base_template_id: 'bad' }],
  ['bookings', { ...booking, client_record_id: id(99) }],
  ['bookings', { ...booking, status: 'completed' }],
  ['bookings', { ...booking, ends_at: booking.starts_at }],
  ['bookings', { ...booking, starts_at: '2099-10-01T11:00:00+01:00' }],
  ['bookings', { ...booking, group_session_id: 'bad' }],
  ['client_program_exercises', { ...exercise, client_program_id: id(99) }],
  ['client_program_exercises', { ...exercise, planned_weight_g: -1 }],
  ['client_program_exercises', { ...exercise, planned_weight_g: 0.5 }],
  ['client_program_exercises', { ...exercise, planned_sets: 0 }],
  ['client_program_exercises', { ...exercise, measure_snapshot: 'distance' }],
  ['client_program_exercises', { ...exercise, planned_reps: '3' }],
  ['client_program_exercises', { ...exercise, planned_seconds: '45–30' }],
  ['client_program_exercises', { ...exercise, planned_seconds: '3601' }],
  ['client_program_exercises', { ...exercise, planned_seconds: '1–3601' }],
  ['client_program_exercises', { ...exercise, planned_seconds: '9999' }],
  ['client_program_exercises', { ...exercise, instructions_snapshot: [1] }],
])('rejects malformed/foreign runtime row in %s', async (table, row) => {
  setupRead({ [table]: [row] });
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
});

test.each(['client_programs', 'bookings', 'client_program_exercises'])(
  'duplicates fail closed in %s',
  async (table) => {
    const row =
      table === 'client_programs'
        ? program
        : table === 'bookings'
          ? booking
          : exercise;
    setupRead({ [table]: [row, row] });
    await expect(
      loadWorkspaceClientDetails(workspaceId, clientId),
    ).rejects.toMatchObject({ code: 'malformed' });
  },
);

test('duplicate clients across page boundaries, truncated/count-changing pages and row limit are errors', async () => {
  const people = Array.from({ length: 201 }, (_, n) => ({
    ...person,
    id: id(n + 1000),
    archived_at: null as string | null,
  }));
  people[200] = people[199]!;
  setupRead({ client_records: people });
  await expect(loadWorkspaceClients(workspaceId)).rejects.toMatchObject({
    code: 'malformed',
  });
  setupRead({}, (query, response) =>
    query.table === 'client_programs'
      ? { ...response, count: 10001 }
      : response,
  );
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'limit' });
  setupRead({}, (query, response) =>
    query.table === 'bookings' ? { ...response, count: 2 } : response,
  );
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
});

test('exercise position and exercise relation uniqueness fail closed, including >500 hostile rows', async () => {
  setupRead({
    client_program_exercises: [
      exercise,
      { ...exercise, id: id(40), exercise_id: id(41) },
    ],
  });
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
  setupRead({
    client_program_exercises: [
      exercise,
      { ...exercise, id: id(40), position: 1 },
    ],
  });
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
  const paged = setupRead({
    client_program_exercises: Array.from({ length: 501 }, (_, n) => ({
      ...exercise,
      id: id(n + 1000),
      exercise_id: id(n + 2000),
      position: 0,
    })),
  });
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
  expect(
    paged.queries.filter((query) => query.table === 'client_program_exercises'),
  ).toHaveLength(3);
});

test('validates explicit actor/workspace/client UUID and owner scope before client reads', async () => {
  const read = setupRead();
  await expect(loadWorkspaceClients('bad')).rejects.toMatchObject({
    code: 'invalidInput',
  });
  await expect(
    loadWorkspaceClientDetails(workspaceId, 'bad'),
  ).rejects.toMatchObject({ code: 'invalidInput' });
  await expect(
    loadWorkspaceClients(workspaceId, {
      userId: 'bad',
      token: 'original-token',
    }),
  ).rejects.toMatchObject({ code: 'invalidInput' });
  expect(read.from).not.toHaveBeenCalled();
  setupRead({
    trainer_workspaces: [{ id: workspaceId, owner_user_id: id(90) }],
  });
  await expect(loadWorkspaceClients(workspaceId)).rejects.toMatchObject({
    code: 'unavailable',
  });
  setupRead();
  await expect(
    loadWorkspaceClients(workspaceId, {
      userId: id(90),
      token: 'original-token',
    }),
  ).rejects.toMatchObject({ code: 'sessionChanged' });
});

test.each(['logout', 'user', 'session', 'silent'])(
  'cancels %s switch between program and exercise reads',
  async (kind) => {
    const read = setupRead({}, (query, response) => {
      if (query.table === 'client_programs') {
        if (kind === 'logout') read.emit('SIGNED_OUT', null);
        else if (kind === 'silent')
          read.setSession(read.session('new-session'));
        else
          read.emit(
            'SIGNED_IN',
            read.session('new-session', kind === 'user' ? id(90) : userId),
          );
      }
      return response;
    });
    await expect(
      loadWorkspaceClientDetails(workspaceId, clientId),
    ).rejects.toMatchObject({ code: 'sessionChanged' });
    expect(read.from).not.toHaveBeenCalledWith('client_program_exercises');
  },
);

test('refresh event preserves read identity while every related request pins the original bearer', async () => {
  const read = setupRead({}, (query, response) => {
    if (query.table === 'client_programs')
      read.emit('TOKEN_REFRESHED', read.session('refreshed-token'));
    return response;
  });
  expect(
    (await loadWorkspaceClientDetails(workspaceId, clientId))?.program?.items,
  ).toEqual([exercise]);
  expect(read.queries.every((q) => q.token === 'Bearer original-token')).toBe(
    true,
  );
});

test('same-user new session between pages aborts subsequent queries, even if old session returns', async () => {
  const people = Array.from({ length: 601 }, (_, n) => ({
    ...person,
    id: id(n + 1000),
    archived_at: null as string | null,
  }));
  const read = setupRead({ client_records: people }, (query, response) => {
    if (query.table === 'client_records' && query.offset === 200) {
      read.emit('SIGNED_OUT', null);
      read.emit('SIGNED_IN', read.session());
    }
    return response;
  });
  await expect(loadWorkspaceClients(workspaceId)).rejects.toMatchObject({
    code: 'sessionChanged',
  });
  expect(read.queries.filter((q) => q.table === 'client_records')).toHaveLength(
    2,
  );
  expect(read.queries.at(-1)?.signal?.aborted).toBe(true);
});

test('list selects the newest tied program and nearest booking, excluding archived clients', async () => {
  setupRead({
    client_records: [
      person,
      { ...person, id: id(90), archived_at: person.updated_at },
    ],
    client_programs: [
      { ...program, id: id(10), name: 'Latest tied copy' },
      program,
    ],
    bookings: [
      booking,
      {
        ...booking,
        id: id(20),
        starts_at: '2099-10-02T10:00:00Z',
        ends_at: '2099-10-02T11:00:00Z',
      },
    ],
  });
  const result = await loadWorkspaceClients(workspaceId);
  expect(result).toHaveLength(1);
  expect(result[0]?.programName).toBe('Latest tied copy');
  expect(result[0]?.nextStartsAt).toBe(booking.starts_at);
});

test.each([
  'client_records',
  'client_programs',
  'bookings',
  'client_program_exercises',
])('row limit fails explicitly for %s', async (table) => {
  setupRead({}, (query, response) =>
    query.table === table && !query.single
      ? { ...response, count: 10001 }
      : response,
  );
  const load =
    table === 'client_records'
      ? loadWorkspaceClients(workspaceId)
      : loadWorkspaceClientDetails(workspaceId, clientId);
  await expect(load).rejects.toMatchObject({ code: 'limit' });
});

test('a changing exact count and malformed rows after page 500 fail the entire read', async () => {
  const people = Array.from({ length: 201 }, (_, n) => ({
    ...person,
    id: id(n + 1000),
  }));
  setupRead({ client_records: people }, (query, response) =>
    query.table === 'client_records' && query.offset > 0
      ? { ...response, count: 200 }
      : response,
  );
  await expect(loadWorkspaceClients(workspaceId)).rejects.toMatchObject({
    code: 'malformed',
  });
  const bookings = Array.from({ length: 501 }, (_, n) => ({
    ...booking,
    id: id(2000 - n),
    revision: n === 500 ? 0 : 1,
  }));
  setupRead({ bookings });
  await expect(
    loadWorkspaceClientDetails(workspaceId, clientId),
  ).rejects.toMatchObject({ code: 'malformed' });
});

test('a complete read at the exact 10000-row bound succeeds, never a partial prefix', async () => {
  const people = Array.from({ length: 10000 }, (_, n) => ({
    ...person,
    id: id(n + 1000),
  }));
  const read = setupRead({
    client_records: people,
    client_programs: [],
    bookings: [],
  });
  const result = await loadWorkspaceClients(workspaceId);
  expect(result).toHaveLength(10000);
  expect(result[9999]?.id).toBe(id(10999));
  expect(
    read.queries.filter((query) => query.table === 'client_records'),
  ).toHaveLength(50);
});

test('nullable weight, zero rest, reps units, and +00:00 UTC timestamps are preserved', async () => {
  const item = {
    ...exercise,
    measure_snapshot: 'reps',
    planned_seconds: null,
    planned_reps: '8-12',
    planned_weight_g: null,
    rest_seconds: 0,
    created_at: '2026-10-01T10:00:00+00:00',
    updated_at: '2026-10-01T10:00:00+00:00',
  };
  setupRead({ client_program_exercises: [item] });
  expect(
    (await loadWorkspaceClientDetails(workspaceId, clientId))?.program?.items,
  ).toEqual([item]);
});

test('unexpected audit/request fields are excluded from the validated DTO', async () => {
  setupRead({
    client_records: [
      {
        ...person,
        created_by: id(90),
        request_payload: { syntheticPrivate: true },
      },
    ],
    client_programs: [{ ...program, created_by: id(90) }],
    bookings: [{ ...booking, request_payload: { syntheticPrivate: true } }],
  });
  const result = await loadWorkspaceClientDetails(workspaceId, clientId);
  expect(result?.client.created_by).toBeNull();
  expect(result?.client).not.toHaveProperty('request_payload');
  expect(result?.program).not.toHaveProperty('created_by');
  expect(result?.bookings[0]).not.toHaveProperty('request_payload');
});
