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
