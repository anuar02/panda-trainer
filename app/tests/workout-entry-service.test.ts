import { WorkoutEntryService } from '@/features/workout-entry/service';
import type { EntryDraft, EntryDraftStore } from '@/domain/workout-entry';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import type { SyncSession } from '@/domain/workout-sync/types';
import { openOutboxStore } from '@/features/workout-sync/storage';
import { TransactionalFixture } from './workout-sync-sqlite-fixture';
const session: SyncSession = {
  accountId: 'account',
  workspaceId: 'workspace',
  sessionId: 'session',
  accessToken: 'token',
};
function participant(index = 0): PreloadParticipant {
  return {
    bookingId: `booking${index}`,
    workoutId: `workout${index}`,
    clientRecordId: `client${index}`,
    clientName: '',
    programId: 'program',
    programName: '',
    programDescription: '',
    baseTemplateId: 'template',
    programRevision: 1,
    workoutRevision: 1,
    workoutStatus: 'in_progress',
    assignedExercises: [],
    exercises: [
      {
        id: `exercise${index}`,
        exerciseId: 'catalog',
        name: '',
        measure: 'reps',
        bodyweight: false,
        muscleGroup: '',
        equipment: '',
        instructions: [],
        sourceKey: null,
        skipped: false,
        replacedFromId: null,
        position: 0,
        plannedSets: 3,
        plannedReps: '8–10',
        plannedSeconds: null,
        plannedWeightGrams: null,
        restSeconds: 60,
        revision: 1,
        sets: [],
        previousSets: [],
      },
    ],
  };
}
async function setup() {
  const sqlite = new TransactionalFixture();
  const outbox = await openOutboxStore(session, sqlite.connect());
  const records = new Map<string, EntryDraft>();
  const drafts: EntryDraftStore = {
    scope: session,
    read: async (id) => records.get(id) ?? null,
    save: async (draft) => {
      records.set(
        draft.workoutId,
        JSON.parse(JSON.stringify(draft)) as EntryDraft,
      );
    },
    close: async () => undefined,
  };
  let current: SyncSession | null = session;
  let sequence = 0;
  const options = {
    session,
    getSession: () => current,
    outbox,
    drafts,
    deviceId: 'phone',
    newId: () => `id${++sequence}`,
    now: () => '2026-10-03T10:00:00Z',
  };
  return {
    options,
    sqlite,
    outbox,
    drafts,
    service: new WorkoutEntryService(options),
    switchSession: (value: SyncSession | null) => {
      current = value;
    },
  };
}
it('keeps three participant drafts and confirmed projections isolated after service reopen', async () => {
  const state = await setup();
  for (let index = 0; index < 3; index++) {
    const person = participant(index);
    await state.service.saveDraft(person, {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: `exercise${index}`,
      values: {
        [`exercise${index}`]: {
          weightGrams: index === 0 ? null : index * 1000,
          reps: index,
          seconds: null,
        },
      },
    });
    await state.service.confirm(person, `exercise${index}`, {
      weightGrams: index * 1000,
      reps: index,
      seconds: null,
    });
  }
  const reopened = new WorkoutEntryService(state.options);
  for (let index = 0; index < 3; index++) {
    const read = await reopened.read(participant(index));
    expect(read.workout.participant.exercises[0]!.sets).toHaveLength(1);
    expect(read.workout.participant.exercises[0]!.sets[0]!.reps).toBe(index);
    expect(read.draft.values[`exercise${index}`]!.weightGrams).toBe(
      index === 0 ? null : index * 1000,
    );
  }
});
it('queues offline confirm then durable undo with predicted set revision and retains exact retry envelope', async () => {
  const state = await setup();
  const person = participant();
  const confirmed = await state.service.confirm(person, 'exercise0', {
    weightGrams: 0,
    reps: 8,
    seconds: null,
  });
  const set = confirmed.workout.participant.exercises[0]!.sets[0]!;
  await state.service.undo(person, set.id);
  const pending = await state.outbox.pending();
  expect(
    pending.map((item) => [item.operation.kind, item.operation.base_revision]),
  ).toEqual([
    ['upsert_set', 0],
    ['delete_set', 1],
  ]);
  expect(await state.outbox.pending()).toEqual(pending);
  expect(
    (await new WorkoutEntryService(state.options).read(person)).workout
      .participant.exercises[0]!.sets,
  ).toEqual([]);
});
it('keeps rejected/conflict values on refresh and restricts issue receipts to their participant', async () => {
  const state = await setup();
  await state.service.confirm(participant(), 'exercise0', {
    weightGrams: 1000,
    reps: 8,
    seconds: null,
  });
  await state.service.confirm(participant(1), 'exercise1', {
    weightGrams: 2000,
    reps: 9,
    seconds: null,
  });
  const operations = await state.outbox.pending();
  const first = operations[0]!.operation;
  const second = operations[1]!.operation;
  await state.outbox.acknowledge([
    {
      operation_id: first.operation_id,
      entity_id: first.entity_id,
      status: 'conflict',
      revision: 4,
      conflict_id: 'conflict',
    },
    {
      operation_id: second.operation_id,
      entity_id: second.entity_id,
      status: 'error',
      revision: null,
      error_code: 'rejected',
    },
  ]);
  const server = participant();
  server.exercises[0]!.sets = [
    {
      id: first.entity_id,
      revision: 4,
      position: 0,
      weightGrams: 9000,
      reps: 12,
      seconds: null,
    },
  ];
  const read = await state.service.read(server);
  expect(read.workout.participant.exercises[0]!.sets[0]!.weightGrams).toBe(
    1000,
  );
  expect(read.issues.map((issue) => issue.status)).toEqual(['conflict']);
  expect(
    (await state.service.read(participant(1))).issues.map(
      (issue) => issue.status,
    ),
  ).toEqual(['error']);
});
it('uses newer server revisions after acknowledgment and emits add/replace scoped journal operations', async () => {
  const state = await setup();
  const person = participant();
  await state.service.confirm(person, 'exercise0', {
    weightGrams: 1000,
    reps: 8,
    seconds: null,
  });
  const operation = (await state.outbox.pending())[0]!.operation;
  await state.outbox.acknowledge([
    {
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status: 'applied',
      revision: 1,
    },
  ]);
  const server = participant();
  server.exercises[0]!.sets = [
    {
      id: operation.entity_id,
      revision: 2,
      position: 0,
      weightGrams: 3000,
      reps: 10,
      seconds: null,
    },
  ];
  expect(
    (await state.service.read(server)).workout.participant.exercises[0]!
      .sets[0]!.revision,
  ).toBe(2);
  await state.service.add(server, server.exercises[0]!);
  await state.service.add(server, server.exercises[0]!, 'exercise0');
  const pending = await state.outbox.pending();
  expect(pending.map((item) => item.operation.kind)).toEqual([
    'add_exercise',
    'replace_exercise',
  ]);
  expect(
    pending.every(
      (item) =>
        item.operation.payload.workout_instance_id === person.workoutId &&
        item.operation.base_revision === 0,
    ),
  ).toBe(true);
});
it('fences account and token changes before writes and during reads without purging pending', async () => {
  const state = await setup();
  await state.service.confirm(participant(), 'exercise0', {
    weightGrams: null,
    reps: 8,
    seconds: null,
  });
  state.switchSession({ ...session, accessToken: 'new-token' });
  await expect(
    state.service.confirm(participant(), 'exercise0', {
      weightGrams: null,
      reps: 9,
      seconds: null,
    }),
  ).rejects.toThrow('entry_session_changed');
  expect(await state.outbox.pending()).toHaveLength(1);
  state.switchSession(session);
  const original = state.drafts.read;
  state.drafts.read = async (id) => {
    const draft = await original(id);
    state.switchSession({ ...session, accountId: 'other' });
    return draft;
  };
  await expect(state.service.read(participant())).rejects.toThrow(
    'entry_session_changed',
  );
  expect(await state.outbox.pending()).toHaveLength(1);
});
it('preserves exact seconds and nullable reps without treating zero as an empty timed result', async () => {
  const state = await setup();
  const person = participant();
  person.exercises[0]!.measure = 'seconds';
  person.exercises[0]!.plannedReps = null;
  person.exercises[0]!.plannedSeconds = '30–60';
  await state.service.confirm(person, 'exercise0', {
    weightGrams: null,
    reps: null,
    seconds: 0,
  });
  await state.service.confirm(person, 'exercise0', {
    weightGrams: 125,
    reps: null,
    seconds: 372,
  });
  const pending = await state.outbox.pending();
  expect(pending.map((row) => row.operation.payload.seconds)).toEqual([0, 372]);
  expect(pending.map((row) => row.operation.payload.reps)).toEqual([
    null,
    null,
  ]);
  expect(pending[1]?.operation.payload.weight_g).toBe(125);
});

it.each(['current', 'incoming'] as const)(
  'reconciles replacement after explicit %s receipt, refresh and durable reopen while retaining audit snapshots',
  async (selection) => {
    const state = await setup();
    const person = participant();
    const values = { weightGrams: 125, reps: 0, seconds: null };
    await state.service.saveDraft(person, {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: 'exercise0',
      values: { exercise0: values },
    });
    const replacement = await state.service.add(
      person,
      { ...person.exercises[0]!, exerciseId: 'replacement-catalog' },
      'exercise0',
    );
    const operation = (await state.outbox.pending())[0]!.operation;
    const audit = {
      current: { exercise: person.exercises[0], device_id: 'second-phone' },
      incoming: { operation, device_id: 'phone' },
    };
    const savedAudit = JSON.stringify(audit);
    const conflict = {
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status: 'conflict' as const,
      revision: 2,
      conflict_id: 'replacement-conflict',
    };
    await state.outbox.acknowledge([conflict]);
    const server = participant();
    server.exercises[0]!.revision = 2;
    const unresolved = await new WorkoutEntryService(state.options).read(
      server,
    );
    expect(unresolved.issues).toEqual([conflict]);
    expect(unresolved.workout.participant.exercises).toHaveLength(2);
    expect(unresolved.workout.participant.exercises[0]!.skipped).toBe(true);
    await state.service.resolve(
      server,
      operation.entity_id,
      conflict.conflict_id,
      selection,
      2,
    );
    const resolution = (await state.outbox.pending())[0]!.operation;
    expect(resolution.payload).toEqual({
      conflict_id: conflict.conflict_id,
      selected_version: selection,
      expected_revision: 2,
    });
    expect((await state.service.read(server)).issues).toEqual([conflict]);
    const applied = {
      operation_id: resolution.operation_id,
      entity_id: resolution.entity_id,
      status: 'applied' as const,
      revision: 3,
    };
    await state.outbox.acknowledge([applied]);
    await state.outbox.acknowledge([applied]);
    expect(await state.outbox.pending()).toEqual([]);
    expect(await state.outbox.confirmedIssues()).toEqual([]);
    expect(JSON.parse(state.sqlite.rows[0]!.result_json!)).toEqual(conflict);
    expect(JSON.parse(state.sqlite.rows[0]!.operation_json)).toEqual(operation);
    expect(await state.outbox.read(operation.entity_id)).toEqual(
      expect.objectContaining({
        participant: expect.objectContaining({
          exercises: expect.arrayContaining([
            expect.objectContaining({ id: operation.entity_id }),
          ]),
        }),
      }),
    );
    if (selection === 'incoming') {
      server.exercises = replacement.workout.participant.exercises.map(
        (exercise) => ({
          ...exercise,
          revision: 3,
        }),
      );
    } else {
      server.exercises[0]!.revision = 3;
    }
    for (const service of [
      state.service,
      new WorkoutEntryService(state.options),
    ]) {
      const refreshed = await service.read(server);
      expect(refreshed.workout.participant.exercises).toEqual(server.exercises);
      expect(refreshed.issues).toEqual([]);
      expect(refreshed.draft.values.exercise0).toEqual(values);
      expect(refreshed.draft.focusExerciseId).toBe('exercise0');
    }
    expect(JSON.stringify(audit)).toBe(savedAudit);
    expect(audit.current.device_id).toBe('second-phone');
    expect(audit.incoming.operation).toEqual(operation);
  },
);

it('retains an offline replacement and rejected explicit choice across reopen and exact retry', async () => {
  const state = await setup();
  const person = participant();
  await state.service.add(person, person.exercises[0]!, 'exercise0');
  const replacement = (await state.outbox.pending())[0]!.operation;
  expect(
    (await new WorkoutEntryService(state.options).read(person)).workout
      .participant.exercises,
  ).toHaveLength(2);
  await state.outbox.acknowledge([
    {
      operation_id: replacement.operation_id,
      entity_id: replacement.entity_id,
      status: 'conflict',
      revision: 2,
      conflict_id: 'conflict',
    },
  ]);
  await state.service.resolve(
    person,
    replacement.entity_id,
    'conflict',
    'current',
    2,
  );
  const pending = await state.outbox.pending();
  const resolution = pending[0]!.operation;
  const rejected = {
    operation_id: resolution.operation_id,
    entity_id: resolution.entity_id,
    status: 'error' as const,
    revision: null,
    error_code: 'stale_revision',
  };
  await state.outbox.acknowledge([rejected]);
  await state.outbox.acknowledge([rejected]);
  const reopened = await new WorkoutEntryService(state.options).read(person);
  expect(reopened.workout.participant.exercises).toHaveLength(2);
  expect(reopened.issues.map((issue) => issue.status)).toEqual([
    'conflict',
    'error',
  ]);
  expect((await state.outbox.pending())[0]!.operation).toEqual(resolution);
});

it.each(['absence', 'tombstone'] as const)(
  'drops acknowledged local sets after server %s and reopen while preserving another pending set',
  async (deletion) => {
    const state = await setup();
    const person = participant();
    const first = await state.service.confirm(person, 'exercise0', {
      weightGrams: 125,
      reps: 0,
      seconds: null,
    });
    await state.service.confirm(person, 'exercise0', {
      weightGrams: null,
      reps: 9,
      seconds: null,
    });
    const operations = await state.outbox.pending();
    const acknowledged = operations[0]!.operation;
    const pending = operations[1]!.operation;
    await state.outbox.acknowledge([
      {
        operation_id: acknowledged.operation_id,
        entity_id: acknowledged.entity_id,
        status: 'applied',
        revision: 1,
      },
    ]);
    const server = participant();
    if (deletion === 'tombstone')
      server.exercises[0]!.sets = [
        {
          ...first.workout.participant.exercises[0]!.sets[0]!,
          revision: 2,
          deletedAt: '2026-10-03T11:00:00Z',
        },
      ];
    const reopened = await new WorkoutEntryService(state.options).read(server);
    expect(reopened.workout.participant.exercises[0]!.sets).toEqual([
      expect.objectContaining({ id: pending.entity_id, reps: 9 }),
    ]);
    expect((await state.outbox.pending()).map((row) => row.operation)).toEqual([
      pending,
    ]);
    expect(await state.outbox.read(acknowledged.entity_id)).not.toBeNull();
  },
);
