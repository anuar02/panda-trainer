import {
  copyPreviousSet,
  reconcileWorkout,
  validateSetValues,
} from '@/domain/workout-entry';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
import type { PendingOperation } from '@/domain/workout-sync/types';
const participant = (): PreloadParticipant => ({
  bookingId: 'booking',
  clientRecordId: 'client',
  clientName: 'Client',
  programId: 'program',
  programName: 'Program',
  programDescription: '',
  baseTemplateId: 'template',
  programRevision: 1,
  workoutId: 'workout',
  workoutRevision: 1,
  workoutStatus: 'in_progress',
  assignedExercises: [],
  exercises: [
    {
      id: 'exercise',
      exerciseId: 'catalog',
      name: 'Squat',
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
});
const pending = (
  id: string,
  kind: 'upsert_set' | 'delete_set',
): PendingOperation => ({
  sequence: 1,
  result: null,
  operation: {
    operation_id: 'op',
    entity_id: id,
    kind,
    base_revision: 0,
    device_id: 'device',
    payload: {
      workout_instance_id: 'workout',
      workout_exercise_id: 'exercise',
    },
    created_at: '2026-10-03T10:00:00Z',
  },
});
it('copies exact nullable integers and preserves zero without interpreting planned ranges', () => {
  expect(copyPreviousSet({ weightGrams: 0, reps: 0, seconds: null })).toEqual({
    weightGrams: 0,
    reps: 0,
    seconds: null,
  });
  expect(() =>
    validateSetValues({ weightGrams: 1.5, reps: 8, seconds: null }),
  ).toThrow('invalid_set_values');
});
it('merges different set IDs and preserves rejected local versions against fresh revisions', () => {
  const server = participant();
  server.exercises[0]!.sets = [
    {
      id: 'remote',
      position: 0,
      revision: 3,
      weightGrams: 20000,
      reps: 9,
      seconds: null,
    },
  ];
  const local = participant();
  local.exercises[0]!.sets = [
    {
      id: 'local',
      position: 1,
      revision: 1,
      weightGrams: 0,
      reps: 0,
      seconds: null,
    },
  ];
  const operation = pending('local', 'upsert_set');
  operation.result = {
    operation_id: 'op',
    entity_id: 'local',
    status: 'error',
    revision: null,
    error_code: 'invalid',
  };
  const result = reconcileWorkout(
    server,
    { participant: local, tombstones: [] },
    [operation],
    [],
  );
  expect(result.participant.exercises[0]!.sets.map((set) => set.id)).toEqual([
    'remote',
    'local',
  ]);
});
it('keeps durable undo against stale server and accepts server tombstones', () => {
  const server = participant();
  server.exercises[0]!.sets = [
    {
      id: 'set',
      position: 0,
      revision: 1,
      weightGrams: null,
      reps: 8,
      seconds: null,
    },
  ];
  const local = { participant: participant(), tombstones: ['set'] };
  expect(
    reconcileWorkout(server, local, [pending('set', 'delete_set')], [])
      .participant.exercises[0]!.sets,
  ).toEqual([]);
  expect(
    reconcileWorkout(server, local, [], []).participant.exercises[0]!.sets,
  ).toEqual([]);
  const deleted = {
    ...server.exercises[0]!.sets[0]!,
    deletedAt: '2026-10-03T11:00:00Z',
  };
  server.exercises[0]!.sets = [deleted];
  expect(reconcileWorkout(server, local, [], []).tombstones).toEqual([]);
});
it('does not merge another participant local projection', () => {
  const other = participant();
  other.workoutId = 'other';
  other.exercises[0]!.sets = [
    {
      id: 'other-set',
      position: 0,
      revision: 1,
      weightGrams: 0,
      reps: 1,
      seconds: null,
    },
  ];
  expect(
    reconcileWorkout(
      participant(),
      { participant: other, tombstones: [] },
      [],
      [],
    ).participant.exercises[0]!.sets,
  ).toEqual([]);
});
it('accepts a newer server restoration after an acknowledged local deletion', () => {
  const server = participant();
  server.exercises[0]!.sets = [
    {
      id: 'set',
      position: 0,
      revision: 3,
      weightGrams: 0,
      reps: 7,
      seconds: null,
    },
  ];
  const result = reconcileWorkout(
    server,
    {
      participant: participant(),
      tombstones: ['set'],
      tombstoneRevisions: { set: 2 },
    },
    [],
    [],
  );
  expect(result.participant.exercises[0]!.sets[0]?.revision).toBe(3);
  expect(result.tombstones).toEqual([]);
});

const replacementProjection = () => {
  const local = participant();
  local.exercises[0]!.skipped = true;
  local.exercises.push({
    ...local.exercises[0]!,
    id: 'replacement',
    replacedFromId: 'exercise',
    skipped: false,
    revision: 4,
    sets: [],
  });
  return { participant: local, tombstones: [] };
};
it.each([0, 1, 4])(
  'drops absent replacement revision %i after current receipt',
  (revision) => {
    const local = replacementProjection();
    local.participant.exercises[1]!.revision = revision;
    const server = participant();
    server.exercises[0]!.revision = 5;
    expect(
      reconcileWorkout(server, local, [], []).participant.exercises,
    ).toEqual(server.exercises);
  },
);
it.each(['conflict', 'error', 'correction_draft'] as const)(
  'retains replacement and original with %s provenance',
  (status) => {
    const local = replacementProjection();
    expect(
      reconcileWorkout(
        participant(),
        local,
        [],
        [{ operation_id: 'op', entity_id: 'replacement', status, revision: 2 }],
      ).participant.exercises,
    ).toEqual(local.participant.exercises);
  },
);
it('protects pending replacement and resolution until successful receipt', () => {
  for (const kind of ['replace_exercise', 'resolve_conflict'] as const) {
    const operation = pending('replacement', 'upsert_set');
    operation.operation.kind = kind;
    operation.operation.payload =
      kind === 'replace_exercise'
        ? { replaced_from_id: 'exercise' }
        : {
            conflict_id: 'conflict',
            selected_version: 'current',
            expected_revision: 2,
          };
    const local = replacementProjection();
    expect(
      reconcileWorkout(participant(), local, [operation], []).participant
        .exercises,
    ).toEqual(local.participant.exercises);
    operation.result = {
      operation_id: 'op',
      entity_id: 'replacement',
      status: 'applied',
      revision: 3,
    };
    expect(
      reconcileWorkout(participant(), local, [operation], []).participant
        .exercises,
    ).toEqual(participant().exercises);
  }
});
it('accepts server incoming selection after successful receipt', () => {
  const server = replacementProjection().participant;
  server.exercises[1]!.name = 'Accepted replacement';
  server.exercises[1]!.revision = 5;
  expect(
    reconcileWorkout(server, replacementProjection(), [], []).participant
      .exercises,
  ).toEqual(server.exercises);
});
it('retains absent parent for dependent pending sets without overriding server original', () => {
  const local = replacementProjection();
  const set = {
    id: 'dependent',
    position: 0,
    revision: 0,
    weightGrams: 0,
    reps: 8,
    seconds: null,
  };
  local.participant.exercises[1]!.sets = [set];
  const operation = pending('dependent', 'upsert_set');
  operation.operation.payload.workout_exercise_id = 'replacement';
  const result = reconcileWorkout(participant(), local, [operation], []);
  expect(result.participant.exercises[0]!.skipped).toBe(false);
  expect(result.participant.exercises[1]!.sets).toEqual([set]);
  expect(
    reconcileWorkout(participant(), result, [], []).participant.exercises,
  ).toEqual(participant().exercises);
});
it('drops unprotected absent sets and preserves unresolved versions', () => {
  const local = participant();
  const set = {
    id: 'absent',
    position: 0,
    revision: 8,
    weightGrams: 0,
    reps: 8,
    seconds: null,
  };
  local.exercises[0]!.sets = [set];
  expect(
    reconcileWorkout(
      participant(),
      { participant: local, tombstones: [] },
      [],
      [],
    ).participant.exercises[0]!.sets,
  ).toEqual([]);
  expect(
    reconcileWorkout(
      participant(),
      { participant: local, tombstones: [] },
      [],
      [
        {
          operation_id: 'op',
          entity_id: 'absent',
          status: 'conflict',
          revision: 9,
        },
      ],
    ).participant.exercises[0]!.sets,
  ).toEqual([set]);
});
it('retains deletion watermark after server absence or tombstone against stale cache', () => {
  const server = participant();
  const set = {
    id: 'set',
    position: 0,
    revision: 2,
    weightGrams: null,
    reps: 8,
    seconds: null,
  };
  const local = {
    participant: participant(),
    tombstones: ['set'],
    tombstoneRevisions: { set: 3 },
  };
  for (const sets of [[], [{ ...set, revision: 3, deletedAt: 'deleted' }]]) {
    server.exercises[0]!.sets = sets;
    const acknowledged = reconcileWorkout(server, local, [], []);
    expect(acknowledged.tombstones).toEqual([]);
    server.exercises[0]!.sets = [set];
    expect(
      reconcileWorkout(server, acknowledged, [], []).participant.exercises[0]!
        .sets,
    ).toEqual([]);
    server.exercises[0]!.sets = [{ ...set, revision: 4 }];
    expect(
      reconcileWorkout(server, acknowledged, [], []).participant.exercises[0]!
        .sets[0]?.revision,
    ).toBe(4);
  }
});
it('retains original and replacement when both are absent with conflict provenance', () => {
  const server = participant();
  server.exercises = [];
  const local = replacementProjection();
  const result = reconcileWorkout(
    server,
    local,
    [],
    [
      {
        operation_id: 'replace-op',
        entity_id: 'replacement',
        status: 'conflict',
        revision: 2,
      },
    ],
  );
  expect(result.participant.exercises).toEqual(local.participant.exercises);
});
it('accepts a newer server set tombstone after pending provenance clears', () => {
  const server = participant();
  const local = participant();
  const set = {
    id: 'set',
    position: 0,
    revision: 2,
    weightGrams: 20000,
    reps: 8,
    seconds: null,
  };
  local.exercises[0]!.sets = [set];
  server.exercises[0]!.sets = [
    { ...set, revision: 3, deletedAt: '2026-10-03T12:00:00Z' },
  ];
  const protectedResult = reconcileWorkout(
    server,
    { participant: local, tombstones: [] },
    [pending('set', 'upsert_set')],
    [],
  );
  expect(protectedResult.participant.exercises[0]!.sets).toEqual([set]);
  expect(
    reconcileWorkout(server, protectedResult, [], []).participant.exercises[0]!
      .sets,
  ).toEqual([]);
});
