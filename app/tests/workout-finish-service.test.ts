import { WorkoutEntryService } from '@/features/workout-entry/service';
import { finishParticipant, finishSetup } from './workout-finish-fixtures';
import { session, response } from './workout-sync-fixtures';
import { createOutboxRunner } from '@/features/workout-sync/runner';
import type {
  JournalOperation,
  OutboxTransport,
} from '@/domain/workout-sync/types';

it('durably finishes three isolated journals without clearing their unsaved result drafts', async () => {
  const test = await finishSetup();
  for (let index = 0; index < 3; index++) {
    const person = finishParticipant(index);
    const draft = {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: person.exercises[0]!.id,
      values: {
        [person.exercises[0]!.id]: {
          weightGrams: 125,
          reps: index,
          seconds: null,
        },
      },
    };
    await test.service.saveDraft(person, draft);
    const result = await test.service.finish(person);
    expect(result.finish?.status).toBe('saved_on_phone');
    expect(result.draft.values).toEqual(draft.values);
  }
  const operations = await test.outbox.pending();
  expect(operations).toHaveLength(3);
  expect(operations.map((row) => row.operation.entity_id)).toEqual(
    [0, 1, 2].map((i) => finishParticipant(i).workoutId),
  );
  for (let index = 0; index < 3; index++) {
    const restored = await new WorkoutEntryService(test.options).read(
      finishParticipant(index),
    );
    expect(restored.finish?.operationId).toBe(
      operations[index]!.operation.operation_id,
    );
    expect(restored.workout.participant.exercises[0]!.sets).toEqual([]);
  }
});

it('serializes double finish presses and reopens with one immutable envelope after a lost response', async () => {
  const test = await finishSetup();
  const person = finishParticipant();
  await Promise.all([test.service.finish(person), test.service.finish(person)]);
  const before = await test.outbox.pending();
  expect(before).toHaveLength(1);
  expect(before[0]!.operation).toMatchObject({
    kind: 'finish_workout',
    entity_id: person.workoutId,
    base_revision: 7,
    payload: {},
    device_id: 'finish-phone',
  });
  const reopened = new WorkoutEntryService(test.options);
  await reopened.finish(person);
  expect(await test.outbox.pending()).toEqual(before);
});

it.each(['failInsert', 'failCommit'] as const)(
  'does not report saved completion when durable %s fails',
  async (failure) => {
    const test = await finishSetup();
    test.sqlite[failure] = true;
    await expect(test.service.finish(finishParticipant())).rejects.toThrow();
    expect(await test.outbox.pending()).toEqual([]);
    expect((await test.service.read(finishParticipant())).finish?.status).toBe(
      'available',
    );
    test.sqlite[failure] = false;
    expect(
      (await test.service.finish(finishParticipant())).finish?.status,
    ).toBe('saved_on_phone');
    expect(await test.outbox.pending()).toHaveLength(1);
  },
);

it('orders already queued sets before finish and prevents further result mutations', async () => {
  const test = await finishSetup();
  const person = finishParticipant();
  const exercise = person.exercises[0]!;
  const saved = await test.service.confirm(person, exercise.id, {
    weightGrams: 0,
    reps: 0,
    seconds: null,
  });
  await test.service.finish(person);
  expect(
    (await test.outbox.pending()).map((row) => row.operation.kind),
  ).toEqual(['upsert_set', 'finish_workout']);
  await expect(
    test.service.confirm(person, exercise.id, {
      weightGrams: null,
      reps: 8,
      seconds: null,
    }),
  ).rejects.toThrow();
  await expect(
    test.service.undo(
      person,
      saved.workout.participant.exercises[0]!.sets[0]!.id,
    ),
  ).rejects.toThrow();
  await expect(test.service.add(person, exercise)).rejects.toThrow();
  expect(await test.outbox.pending()).toHaveLength(2);
});

it.each(['error', 'conflict', 'correction_draft'] as const)(
  'retains %s receipts across reopen without claiming applied completion',
  async (status) => {
    const test = await finishSetup();
    const person = finishParticipant();
    await test.service.finish(person);
    const operation = (await test.outbox.pending())[0]!.operation;
    const receipt = {
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status,
      revision: status === 'error' ? null : 9,
      ...(status === 'error' ? { error_code: 'stale_revision' } : {}),
      ...(status === 'conflict' ? { conflict_id: 'finish-conflict' } : {}),
      ...(status === 'correction_draft'
        ? { draft_id: 'finish-correction' }
        : {}),
    };
    await test.outbox.acknowledge([receipt]);
    const reopened = new WorkoutEntryService(test.options);
    const remote = {
      ...person,
      workoutRevision: 9,
      workoutStatus:
        status === 'correction_draft'
          ? ('finished' as const)
          : ('in_progress' as const),
    };
    const restored = await reopened.read(remote);
    expect(restored.finish?.status).toBe(status);
    expect(restored.finish?.issue).toEqual(receipt);
    expect(restored.finish?.operationId).toBe(operation.operation_id);
    await reopened.finish(remote);
    expect(test.sqlite.rows).toHaveLength(1);
    expect(JSON.parse(test.sqlite.rows[0]!.operation_json)).toEqual(operation);
  },
);

it('accepts applied acknowledgment and remote completion without enqueueing another finish', async () => {
  const test = await finishSetup();
  const person = finishParticipant();
  await test.service.finish(person);
  const operation = (await test.outbox.pending())[0]!.operation;
  await test.outbox.acknowledge([
    {
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status: 'applied',
      revision: 8,
    },
  ]);
  const remote = {
    ...person,
    workoutRevision: 8,
    workoutStatus: 'finished' as const,
  };
  const reopened = new WorkoutEntryService(test.options);
  expect((await reopened.read(remote)).finish?.status).toBe('applied');
  await reopened.finish(remote);
  expect(await test.outbox.pending()).toEqual([]);
  expect(test.sqlite.rows).toHaveLength(1);
  const other = { ...finishParticipant(1), workoutStatus: 'finished' as const };
  expect((await reopened.read(other)).finish?.status).toBe('applied');
  await reopened.finish(other);
  expect(test.sqlite.rows).toHaveLength(1);
});

it.each([
  null,
  { ...session, sessionId: 'relogin' },
  { ...session, accessToken: 'refreshed' },
])(
  'fences logout or changed login before finishing and preserves saved replay',
  async (next) => {
    const test = await finishSetup();
    const person = finishParticipant();
    await test.service.finish(person);
    const pending = await test.outbox.pending();
    test.changeSession(next);
    await expect(test.service.finish(person)).rejects.toThrow(
      'entry_session_changed',
    );
    expect(await test.outbox.pending()).toEqual(pending);
    test.changeSession(session);
    await new WorkoutEntryService(test.options).finish(person);
    expect(await test.outbox.pending()).toEqual(pending);
  },
);

it('preserves acknowledged results and pending completion across reopen until a fresh server snapshot arrives', async () => {
  const test = await finishSetup();
  const person = finishParticipant();
  const values = { weightGrams: 125, reps: 0, seconds: null };
  await test.service.confirm(person, person.exercises[0]!.id, values);
  await test.service.finish(person);
  const operations = await test.outbox.pending();
  await test.outbox.acknowledge(
    operations.map(({ operation }) => ({
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status: 'applied' as const,
      revision: operation.kind === 'finish_workout' ? 8 : 1,
    })),
  );
  const reopened = new WorkoutEntryService(test.options);
  const stale = await reopened.read(person);
  expect(stale.finish?.status).toBe('saved_on_phone');
  expect(stale.workout.participant.exercises[0]!.sets).toEqual([
    expect.objectContaining(values),
  ]);
  await reopened.finish(person);
  expect(test.sqlite.rows).toHaveLength(2);
});

it('does not let one participant local storage failure prevent another participant finish', async () => {
  const test = await finishSetup();
  test.sqlite.failInsert = true;
  await expect(
    test.service.confirm(
      finishParticipant(),
      finishParticipant().exercises[0]!.id,
      { weightGrams: null, reps: 8, seconds: null },
    ),
  ).rejects.toThrow();
  test.sqlite.failInsert = false;
  const result = await test.service.finish(finishParticipant(1));
  expect(result.finish?.status).toBe('saved_on_phone');
  expect(
    (await test.outbox.pending()).map(({ operation }) => operation.entity_id),
  ).toEqual([finishParticipant(1).workoutId]);
});

it('replays identical ordered set and finish envelopes through the real runner after a lost response', async () => {
  const test = await finishSetup();
  const person = finishParticipant();
  const confirmed = await test.service.confirm(
    person,
    person.exercises[0]!.id,
    { weightGrams: 125, reps: 8, seconds: null },
  );
  await test.service.finish(person);
  const captured: JournalOperation[][] = [];
  const transport: OutboxTransport = {
    async apply(_session, operations) {
      captured.push(structuredClone(operations));
      if (captured.length === 1)
        throw new Error('response_lost_after_server_commit');
      return response(
        operations.map((operation) => ({
          operation_id: operation.operation_id,
          entity_id: operation.entity_id,
          status: 'applied' as const,
          revision: operation.kind === 'finish_workout' ? 8 : 1,
        })),
      );
    },
  };
  const first = createOutboxRunner({
    store: test.outbox,
    getSession: test.options.getSession,
    transport,
  });
  await first.run();
  first.stop();
  expect(await test.outbox.pending()).toHaveLength(2);
  const reopened = new WorkoutEntryService(test.options);
  await reopened.finish(person);
  await createOutboxRunner({
    store: test.outbox,
    getSession: test.options.getSession,
    transport,
  }).run();
  expect(captured).toHaveLength(2);
  expect(captured[1]).toEqual(captured[0]);
  expect(captured[1]!.map((operation) => operation.kind)).toEqual([
    'upsert_set',
    'finish_workout',
  ]);
  expect(await test.outbox.pending()).toEqual([]);
  const remote = {
    ...confirmed.workout.participant,
    workoutStatus: 'finished' as const,
    workoutRevision: 8,
  };
  const restored = await reopened.read(remote);
  expect(restored.finish?.status).toBe('applied');
  expect(restored.workout.participant.exercises[0]!.sets).toEqual(
    confirmed.workout.participant.exercises[0]!.sets,
  );
  expect(test.sqlite.rows).toHaveLength(2);
});

it.each(['current', 'incoming'] as const)(
  'retains an honest finish outcome after explicit %s conflict resolution and reopen',
  async (selection) => {
    const test = await finishSetup();
    const person = finishParticipant();
    const values = { weightGrams: 125, reps: 8, seconds: null };
    await test.service.saveDraft(person, {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: person.exercises[0]!.id,
      values: { [person.exercises[0]!.id]: values },
    });
    const confirmed = await test.service.confirm(
      person,
      person.exercises[0]!.id,
      values,
    );
    await test.service.finish(person);
    const operations = await test.outbox.pending();
    const set = operations[0]!.operation;
    const finish = operations[1]!.operation;
    const conflict = {
      operation_id: finish.operation_id,
      entity_id: finish.entity_id,
      status: 'conflict' as const,
      revision: 9,
      conflict_id: 'finish-choice',
    };
    await test.outbox.acknowledge([
      {
        operation_id: set.operation_id,
        entity_id: set.entity_id,
        status: 'applied',
        revision: 1,
      },
      conflict,
    ]);
    const before = { ...confirmed.workout.participant, workoutRevision: 9 };
    await test.service.resolve(
      before,
      person.workoutId,
      conflict.conflict_id,
      selection,
      9,
    );
    const resolution = (await test.outbox.pending())[0]!.operation;
    expect(resolution.kind).toBe('resolve_conflict');
    const pending = await new WorkoutEntryService(test.options).read(before);
    expect(pending.finish?.status).toBe('conflict');
    expect(pending.finish?.issue).toEqual(conflict);
    expect(pending.draft.values[person.exercises[0]!.id]).toEqual(values);
    await test.outbox.acknowledge([
      {
        operation_id: resolution.operation_id,
        entity_id: resolution.entity_id,
        status: 'applied',
        revision: 10,
      },
    ]);
    const remote = {
      ...before,
      workoutRevision: 10,
      workoutStatus:
        selection === 'incoming'
          ? ('finished' as const)
          : ('in_progress' as const),
    };
    const reopened = new WorkoutEntryService(test.options);
    const restored = await reopened.read(remote);
    expect(restored.finish?.status).toBe(
      selection === 'incoming' ? 'applied' : 'not_finished',
    );
    expect(restored.workout.participant.exercises[0]!.sets).toEqual(
      confirmed.workout.participant.exercises[0]!.sets,
    );
    expect(restored.draft.values[person.exercises[0]!.id]).toEqual(values);
    expect(restored.issues).toEqual([]);
    if (selection === 'current') {
      const updated = await reopened.confirm(remote, remote.exercises[0]!.id, {
        weightGrams: 200,
        reps: 9,
        seconds: null,
      });
      expect(updated.workout.participant.exercises[0]!.sets).toHaveLength(2);
      await reopened.undo(
        remote,
        updated.workout.participant.exercises[0]!.sets[1]!.id,
      );
      await reopened.add(remote, remote.exercises[0]!);
      const fresh = await reopened.finish(remote);
      const queued = await test.outbox.pending();
      expect(queued.map(({ operation }) => operation.kind)).toEqual([
        'upsert_set',
        'delete_set',
        'add_exercise',
        'finish_workout',
      ]);
      const nextFinish = queued[3]!.operation;
      expect(nextFinish.operation_id).not.toBe(finish.operation_id);
      expect(nextFinish.base_revision).toBe(10);
      expect(fresh.finish?.status).toBe('saved_on_phone');
      await test.outbox.acknowledge([
        {
          operation_id: resolution.operation_id,
          entity_id: resolution.entity_id,
          status: 'applied',
          revision: 10,
        },
      ]);
      await expect(
        reopened.confirm(remote, remote.exercises[0]!.id, {
          weightGrams: 250,
          reps: 10,
          seconds: null,
        }),
      ).rejects.toThrow('entry_workout_not_ready');
      const secondReopen = new WorkoutEntryService(test.options);
      expect((await secondReopen.read(remote)).finish?.operationId).toBe(
        nextFinish.operation_id,
      );
      await secondReopen.finish(remote);
      expect(await test.outbox.pending()).toEqual(queued);
      expect(test.sqlite.rows).toHaveLength(7);
    } else {
      await expect(
        reopened.confirm(remote, remote.exercises[0]!.id, {
          weightGrams: 200,
          reps: 9,
          seconds: null,
        }),
      ).rejects.toThrow('entry_workout_not_ready');
      await reopened.finish(remote);
      expect(test.sqlite.rows).toHaveLength(3);
      expect(await test.outbox.pending()).toEqual([]);
    }
    expect(JSON.parse(test.sqlite.rows[1]!.operation_json)).toEqual(finish);
    expect(JSON.parse(test.sqlite.rows[1]!.result_json!)).toEqual(conflict);
    expect(JSON.parse(test.sqlite.rows[2]!.operation_json)).toEqual(resolution);
  },
);

it.each([
  'pending',
  'stale',
  'foreign',
  'error',
  'correction_draft',
  'ambiguous',
] as const)(
  'keeps result entry locked for a %s current finish resolution',
  async (outcome) => {
    const test = await finishSetup();
    const person = finishParticipant();
    await test.service.finish(person);
    const finish = (await test.outbox.pending())[0]!.operation;
    await test.outbox.acknowledge([
      {
        operation_id: finish.operation_id,
        entity_id: person.workoutId,
        status: 'conflict',
        revision: 9,
        conflict_id: 'guarded-conflict',
      },
    ]);
    const conflicted = { ...person, workoutRevision: 9 };
    await test.service.resolve(
      conflicted,
      person.workoutId,
      'guarded-conflict',
      'current',
      9,
    );
    const resolution = (await test.outbox.pending())[0]!.operation;
    if (outcome === 'foreign') {
      await expect(
        test.outbox.acknowledge([
          {
            operation_id: 'unrelated-resolution',
            entity_id: person.workoutId,
            status: 'applied',
            revision: 10,
          },
        ]),
      ).rejects.toThrow('Unknown operation receipt');
    }
    if (outcome !== 'pending' && outcome !== 'foreign') {
      await test.outbox.acknowledge([
        {
          operation_id: resolution.operation_id,
          entity_id: person.workoutId,
          status:
            outcome === 'error' || outcome === 'correction_draft'
              ? outcome
              : 'applied',
          revision: outcome === 'error' ? null : 10,
          ...(outcome === 'error' ? { error_code: 'stale_revision' } : {}),
          ...(outcome === 'correction_draft'
            ? { draft_id: 'guarded-draft' }
            : {}),
        },
      ]);
    }
    if (outcome === 'ambiguous')
      Object.defineProperty(test.outbox, 'scopedSnapshot', {
        value: undefined,
      });
    const remote = { ...person, workoutRevision: outcome === 'stale' ? 9 : 10 };
    const reopened = new WorkoutEntryService(test.options);
    await expect(
      reopened.confirm(remote, remote.exercises[0]!.id, {
        weightGrams: 200,
        reps: 9,
        seconds: null,
      }),
    ).rejects.toThrow('entry_workout_not_ready');
    await expect(reopened.add(remote, remote.exercises[0]!)).rejects.toThrow(
      'entry_workout_not_ready',
    );
    const before = test.sqlite.rows.map((row) => row.operation_json);
    await reopened.finish(remote);
    expect(test.sqlite.rows.map((row) => row.operation_json)).toEqual(before);
    expect(JSON.parse(test.sqlite.rows[0]!.operation_json)).toEqual(finish);
  },
);

it.each(['participant', 'logout'] as const)(
  'rejects a %s change while the finish refresh reads receipts',
  async (change) => {
    const test = await finishSetup();
    const person = finishParticipant();
    await test.service.finish(person);
    const envelopes = test.sqlite.rows.map((row) => row.operation_json);
    let current = true;
    const readIssues = test.outbox.confirmedIssues!.bind(test.outbox);
    test.outbox.confirmedIssues = async () => {
      const issues = await readIssues();
      if (change === 'participant') current = false;
      else test.changeSession(null);
      return issues;
    };
    const reopened = new WorkoutEntryService({
      ...test.options,
      isParticipantCurrent: () => current,
    });
    await expect(reopened.read(person)).rejects.toThrow(
      change === 'participant'
        ? 'entry_participant_changed'
        : 'entry_session_changed',
    );
    expect(test.sqlite.rows.map((row) => row.operation_json)).toEqual(
      envelopes,
    );
  },
);

it.each(['participant', 'session'] as const)(
  'fences a %s change while awaiting durable terminal resolution proof',
  async (change) => {
    const test = await finishSetup();
    const person = finishParticipant();
    await test.service.finish(person);
    const finish = (await test.outbox.pending())[0]!.operation;
    await test.outbox.acknowledge([
      {
        operation_id: finish.operation_id,
        entity_id: person.workoutId,
        status: 'conflict',
        revision: 9,
        conflict_id: 'async-proof',
      },
    ]);
    await test.service.resolve(
      { ...person, workoutRevision: 9 },
      person.workoutId,
      'async-proof',
      'current',
      9,
    );
    const resolution = (await test.outbox.pending())[0]!.operation;
    await test.outbox.acknowledge([
      {
        operation_id: resolution.operation_id,
        entity_id: person.workoutId,
        status: 'applied',
        revision: 10,
      },
    ]);
    const snapshot = test.outbox.scopedSnapshot!.bind(test.outbox);
    let arrive!: () => void;
    let release!: () => void;
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    test.outbox.scopedSnapshot = async (request) => {
      const actual = await snapshot(request);
      arrive();
      await barrier;
      return actual;
    };
    let current = true;
    const reopened = new WorkoutEntryService({
      ...test.options,
      isParticipantCurrent: () => current,
    });
    const envelopes = test.sqlite.rows.map((row) => row.operation_json);
    const reading = reopened.read({ ...person, workoutRevision: 10 });
    const rejected = expect(reading).rejects.toThrow(
      change === 'participant'
        ? 'entry_participant_changed'
        : 'entry_session_changed',
    );
    await arrived;
    if (change === 'participant') current = false;
    else test.changeSession({ ...session, accessToken: 'changed-at-proof' });
    release();
    await rejected;
    expect(test.sqlite.rows.map((row) => row.operation_json)).toEqual(
      envelopes,
    );
  },
);
