import { validateWorkoutPreloadContext } from '@/domain/workout-preload/validation';
import { createWorkoutPreloadReader } from '@/features/workout-preload/service';
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = {
  accountId: id(1),
  workspaceId: id(2),
  accessToken: 'token',
  sessionId: 'login',
};
const start = '2026-10-03T10:00:00Z';
const scoped = { workspace_id: id(2) };
function setup(overrides: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    trainer_workspaces: [{ id: id(2), owner_user_id: id(1) }],
    bookings: [
      {
        ...scoped,
        id: id(3),
        client_record_id: id(4),
        group_session_id: null,
        starts_at: start,
        ends_at: '2026-10-03T11:00:00Z',
        status: 'confirmed',
        revision: 1,
      },
    ],
    client_records: [
      { ...scoped, id: id(4), display_name: 'Client', archived_at: null },
    ],
    booking_programs: [
      {
        ...scoped,
        id: id(6),
        booking_id: id(3),
        name: 'Snapshot',
        description: '',
        base_template_id: id(9),
        base_template_revision: 4,
      },
    ],
    booking_program_exercises: [
      {
        ...scoped,
        id: id(7),
        booking_program_id: id(6),
        exercise_id: id(8),
        exercise_name_snapshot: 'Squat',
        bodyweight_snapshot: false,
        muscle_group_snapshot: 'Legs',
        equipment_snapshot: 'Barbell',
        instructions_snapshot: ['Lift'],
        source_key_snapshot: null,
        measure_snapshot: 'reps',
        position: 0,
        planned_sets: 3,
        planned_reps: '8–10',
        planned_seconds: null,
        planned_weight_g: 0,
        rest_seconds: 60,
      },
    ],
    workout_instances: [],
    ...overrides,
  };
  const calls: URL[] = [];
  const request = jest.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    calls.push(parsed);
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({
      apikey: 'key',
      Authorization: 'Bearer token',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    let data = tables[parsed.pathname.split('/').pop()!] ?? [];
    for (const [key, value] of parsed.searchParams)
      if (value.startsWith('eq.'))
        data = data.filter(
          (row) =>
            typeof row === 'object' &&
            row !== null &&
            (row as Record<string, unknown>)[key] === value.slice(3),
        );
    const offset = Number(parsed.searchParams.get('offset'));
    const limit = Number(parsed.searchParams.get('limit'));
    return {
      ok: true,
      json: async () => data.slice(offset, offset + limit),
    } as Response;
  });
  let next = 100;
  const reader = createWorkoutPreloadReader({
    url: 'https://example.invalid',
    anonKey: 'key',
    fetch: request as unknown as typeof fetch,
    createId: () => id(next++),
    now: () => new Date(start),
  });
  return { reader, calls };
}
const signal = () => new AbortController().signal;
test('reads immutable snapshot with local UUIDs and ranges without notes or writes', async () => {
  const { reader, calls } = setup();
  const result = await reader.load(session, id(3), signal());
  expect(validateWorkoutPreloadContext(result, session)).toEqual(result);
  expect(result.sessionKey).toBe(id(3));
  expect(result.participants[0]).toMatchObject({
    programId: id(6),
    programRevision: 4,
    workoutId: id(101),
    workoutRevision: 0,
    workoutStatus: 'not_created',
    exercises: [
      {
        id: id(100),
        plannedReps: '8–10',
        plannedSeconds: null,
        plannedWeightGrams: 0,
        revision: 0,
      },
    ],
  });
  expect(
    calls.every(
      (call) => !/notes|templates|client_programs/.test(call.pathname),
    ),
  ).toBe(true);
  expect(calls.every((call) => call.searchParams.get('select') !== '*')).toBe(
    true,
  );
});
test('rejects archived clients, missing snapshot and wrong owner', async () => {
  await expect(
    setup({
      client_records: [
        { ...scoped, id: id(4), display_name: 'Client', archived_at: start },
      ],
    }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'unavailable' });
  await expect(
    setup({ booking_programs: [] }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'unavailable' });
  await expect(
    setup({
      trainer_workspaces: [{ id: id(2), owner_user_id: id(9) }],
    }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
test('rejects malformed plan and cross-workspace response', async () => {
  await expect(
    setup({
      booking_programs: [
        {
          ...scoped,
          id: id(6),
          booking_id: id(3),
          name: 'Plan',
          base_template_revision: 0,
        },
      ],
    }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'request' });
  await expect(
    setup({
      client_records: [
        {
          id: id(4),
          workspace_id: id(9),
          display_name: 'Client',
          archived_at: null,
        },
      ],
    }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
test('distinguishes network, permission and abort failures', async () => {
  const make = (fetch: typeof global.fetch) =>
    createWorkoutPreloadReader({
      url: 'https://example.invalid',
      anonKey: 'key',
      fetch,
    });
  await expect(
    make(
      jest.fn(async () => {
        throw new TypeError('offline');
      }),
    ).load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'network' });
  await expect(
    make(jest.fn(async () => ({ ok: false, status: 403 }) as Response)).load(
      session,
      id(3),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    setup().reader.load(session, id(3), controller.signal),
  ).rejects.toMatchObject({ code: 'unavailable' });
});
test('reads current sets and latest finished previous sets without future or draft journals', async () => {
  const instance = (n: number, booking: number, finished: string | null) => ({
    ...scoped,
    id: id(n),
    booking_id: id(booking),
    client_record_id: id(4),
    started_at: '2026-10-01T10:00:00Z',
    finished_at: finished,
    revision: 2,
  });
  const line = (n: number, parent: number) => ({
    ...scoped,
    id: id(n),
    workout_instance_id: id(parent),
    exercise_id: id(8),
    exercise_name_snapshot: 'Journal squat',
    bodyweight_snapshot: false,
    muscle_group_snapshot: 'Legs',
    equipment_snapshot: 'Barbell',
    instructions_snapshot: ['Lift'],
    source_key_snapshot: null,
    skipped: false,
    replaced_from_id: null,
    measure_snapshot: 'reps',
    position: 0,
    planned_sets: 3,
    planned_reps: '10',
    planned_seconds: null,
    planned_weight_g: null,
    rest_seconds: 60,
    revision: 3,
  });
  const set = (n: number, parent: number, lineId: number, reps: number) => ({
    ...scoped,
    id: id(n),
    workout_instance_id: id(parent),
    workout_exercise_id: id(lineId),
    position: 0,
    reps,
    seconds: null,
    weight_g: 55000,
    revision: 4,
    deleted_at: null,
  });
  const { reader } = setup({
    workout_instances: [
      instance(20, 3, null),
      instance(21, 30, '2026-10-02T11:00:00Z'),
      instance(22, 31, '2026-10-04T11:00:00Z'),
      instance(23, 32, null),
    ],
    workout_exercises: [line(40, 20), line(41, 21), line(42, 22), line(43, 23)],
    set_results: [
      set(50, 20, 40, 10),
      set(51, 21, 41, 8),
      set(52, 22, 42, 15),
      set(53, 23, 43, 20),
    ],
  });
  const context = await reader.load(session, id(3), signal());
  expect(validateWorkoutPreloadContext(context, session)).toEqual(context);
  const participant = context.participants[0]!;
  expect(participant.workoutStatus).toBe('in_progress');
  expect(participant.exercises[0]!.sets).toEqual([
    {
      id: id(50),
      position: 0,
      reps: 10,
      seconds: null,
      weightGrams: 55000,
      revision: 4,
    },
  ]);
  expect(participant.exercises[0]!.previousSets[0]!.id).toBe(id(51));
});
test('groups only bookings with the same current window after individual reschedule', async () => {
  const booking = (
    n: number,
    client: number,
    startsAt: string,
    endsAt: string,
  ) => ({
    ...scoped,
    id: id(n),
    client_record_id: id(client),
    group_session_id: id(70),
    starts_at: startsAt,
    ends_at: endsAt,
    status: 'confirmed',
    revision: 2,
  });
  const { reader } = setup({
    bookings: [
      booking(3, 4, start, '2026-10-03T11:00:00Z'),
      booking(71, 72, '2026-10-03T12:00:00Z', '2026-10-03T13:00:00Z'),
    ],
    group_sessions: [
      {
        ...scoped,
        id: id(70),
        starts_at: '2026-10-02T10:00:00Z',
        ends_at: '2026-10-02T11:00:00Z',
      },
    ],
  });
  const result = await reader.load(session, id(3), signal());
  expect(validateWorkoutPreloadContext(result, session)).toEqual(result);
  expect(result.sessionKey).toBe(
    `${id(70)}:2026-10-03T10:00:00.000Z:2026-10-03T11:00:00.000Z`,
  );
  expect(
    result.participants.map((participant) => participant.bookingId),
  ).toEqual([id(3)]);
});
test('pages histories beyond PostgREST default limits', async () => {
  const instances = Array.from({ length: 501 }, (_, index) => ({
    ...scoped,
    id: id(1000 + index),
    booking_id: id(2000 + index),
    client_record_id: id(4),
    started_at: '2026-10-01T10:00:00Z',
    finished_at: null,
    revision: 1,
  }));
  const { reader, calls } = setup({ workout_instances: instances });
  await reader.load(session, id(3), signal());
  expect(
    calls
      .filter((call) => call.pathname.endsWith('/workout_instances'))
      .map((call) => call.searchParams.get('offset')),
  ).toEqual(['0', '500']);
});
test('loads three grouped clients with isolated previous results and captured bearer', async () => {
  const bookings = [3, 73, 83].map((booking, index) => ({
    ...scoped,
    id: id(booking),
    client_record_id: id(4 + index),
    group_session_id: id(70),
    starts_at: start,
    ends_at: '2026-10-03T11:00:00Z',
    status: 'confirmed',
    revision: 1,
  }));
  const clientRecords = [4, 5, 6].map((client) => ({
    ...scoped,
    id: id(client),
    display_name: `Client ${client}`,
    archived_at: null,
  }));
  const programs = bookings.map((booking, index) => ({
    ...scoped,
    id: id(100 + index),
    booking_id: booking.id,
    name: `Plan ${index}`,
    description: '',
    base_template_id: id(9),
    base_template_revision: 1,
  }));
  const plans = programs.map((program, index) => ({
    ...scoped,
    id: id(110 + index),
    booking_program_id: program.id,
    exercise_id: id(8),
    exercise_name_snapshot: 'Squat',
    bodyweight_snapshot: false,
    muscle_group_snapshot: 'Legs',
    equipment_snapshot: 'Barbell',
    instructions_snapshot: ['Lift'],
    source_key_snapshot: null,
    measure_snapshot: 'reps',
    position: 0,
    planned_sets: 3,
    planned_reps: '10',
    planned_seconds: null,
    planned_weight_g: null,
    rest_seconds: 60,
  }));
  const histories = clientRecords.map((client, index) => ({
    ...scoped,
    id: id(120 + index),
    booking_id: id(130 + index),
    client_record_id: client.id,
    started_at: '2026-10-01T10:00:00Z',
    finished_at: '2026-10-01T11:00:00Z',
    revision: 1,
  }));
  const lines = histories.map((history, index) => ({
    ...plans[index]!,
    id: id(140 + index),
    workout_instance_id: history.id,
    skipped: false,
    replaced_from_id: null,
    revision: 1,
  }));
  const sets = histories.map((history, index) => ({
    ...scoped,
    id: id(150 + index),
    workout_instance_id: history.id,
    workout_exercise_id: id(140 + index),
    position: 0,
    reps: 10 + index,
    seconds: null,
    weight_g: 10000 * (index + 1),
    revision: 1,
    deleted_at: null,
  }));
  const { reader, calls } = setup({
    bookings,
    client_records: clientRecords,
    booking_programs: programs,
    booking_program_exercises: plans,
    group_sessions: [
      {
        ...scoped,
        id: id(70),
        starts_at: start,
        ends_at: '2026-10-03T11:00:00Z',
      },
    ],
    workout_instances: histories,
    workout_exercises: lines,
    set_results: sets,
  });
  const result = await reader.load(session, id(3), signal());
  expect(validateWorkoutPreloadContext(result, session)).toEqual(result);
  expect(result.participants).toHaveLength(3);
  result.participants.forEach((participant, index) =>
    expect(participant.exercises[0]!.previousSets).toEqual([
      {
        id: id(150 + index),
        position: 0,
        reps: 10 + index,
        seconds: null,
        weightGrams: 10000 * (index + 1),
        revision: 1,
      },
    ]),
  );
  expect(
    calls
      .filter((call) => call.pathname.endsWith('/workout_instances'))
      .map((call) => call.searchParams.get('client_record_id')),
  ).toEqual([`eq.${id(4)}`, `eq.${id(5)}`, `eq.${id(6)}`]);
  expect(
    calls
      .filter((call) => !call.pathname.endsWith('/trainer_workspaces'))
      .every((call) => call.searchParams.get('workspace_id') === `eq.${id(2)}`),
  ).toBe(true);
});
test('rejects missing group relation and malformed client relation', async () => {
  const booking = {
    ...scoped,
    id: id(3),
    client_record_id: id(4),
    group_session_id: id(70),
    starts_at: start,
    ends_at: '2026-10-03T11:00:00Z',
    status: 'confirmed',
    revision: 1,
  };
  await expect(
    setup({ bookings: [booking], group_sessions: [] }).reader.load(
      session,
      id(3),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'unavailable' });
  await expect(
    setup({
      bookings: [
        { ...booking, group_session_id: null, client_record_id: 'invalid' },
      ],
    }).reader.load(session, id(3), signal()),
  ).rejects.toMatchObject({ code: 'request' });
});
test('rejects replacement ancestry outside the current journal', async () => {
  const { reader } = setup({
    workout_instances: [
      {
        ...scoped,
        id: id(20),
        booking_id: id(3),
        client_record_id: id(4),
        started_at: start,
        finished_at: null,
        revision: 1,
      },
    ],
    workout_exercises: [
      {
        ...scoped,
        id: id(40),
        workout_instance_id: id(20),
        exercise_id: id(8),
        exercise_name_snapshot: 'Squat',
        measure_snapshot: 'reps',
        bodyweight_snapshot: false,
        muscle_group_snapshot: 'Legs',
        equipment_snapshot: '',
        instructions_snapshot: [],
        source_key_snapshot: null,
        position: 0,
        planned_sets: 3,
        planned_reps: '10',
        planned_seconds: null,
        planned_weight_g: null,
        rest_seconds: 60,
        revision: 1,
        skipped: false,
        replaced_from_id: id(41),
      },
    ],
  });
  await expect(reader.load(session, id(3), signal())).rejects.toMatchObject({
    code: 'request',
  });
});
test('retains the assigned snapshot when a current journal has no exercises', async () => {
  const { reader } = setup({
    workout_instances: [
      {
        ...scoped,
        id: id(20),
        booking_id: id(3),
        client_record_id: id(4),
        started_at: start,
        finished_at: null,
        revision: 1,
      },
    ],
  });
  const context = await reader.load(session, id(3), signal());
  expect(validateWorkoutPreloadContext(context, session)).toEqual(context);
  const participant = context.participants[0]!;
  expect(participant.exercises).toEqual([]);
  expect(participant.assignedExercises).toHaveLength(1);
  expect(participant.assignedExercises[0]).toMatchObject({
    name: 'Squat',
    plannedReps: '8–10',
    revision: 0,
  });
});
test('rejects an empty assigned snapshot even when a journal exists', async () => {
  const { reader } = setup({
    booking_program_exercises: [],
    workout_instances: [
      {
        ...scoped,
        id: id(20),
        booking_id: id(3),
        client_record_id: id(4),
        started_at: start,
        finished_at: null,
        revision: 1,
      },
    ],
  });
  await expect(reader.load(session, id(3), signal())).rejects.toMatchObject({
    code: 'unavailable',
  });
});
