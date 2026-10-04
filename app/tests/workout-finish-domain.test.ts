import {
  summarizeWorkoutFinish,
  reconcileWorkout,
  workoutFinishLocked,
  type EntryWorkout,
} from '@/domain/workout-entry';
import { finishParticipant } from './workout-finish-fixtures';

it.each([0, 1, 3, 4])(
  'counts %i saved sets against the plan and excludes composer drafts',
  (count) => {
    const person = finishParticipant();
    const exercise = person.exercises[0]!;
    exercise.sets = Array.from({ length: count }, (_, index) => ({
      id: `saved-${index}`,
      revision: 1,
      position: index,
      weightGrams: 0,
      reps: 0,
      seconds: null,
    }));
    const summary = summarizeWorkoutFinish(person, {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: exercise.id,
      values: { [exercise.id]: { weightGrams: 125, reps: 8, seconds: null } },
    });
    expect(summary.recordedSets).toBe(count);
    expect(summary.plannedSets).toBe(3);
    expect(summary.unrecordedSets).toBe(Math.max(0, 3 - count));
    expect(summary.draftCount).toBe(1);
  },
);

it('excludes deleted results and skipped planned sets while identifying replacements', () => {
  const person = finishParticipant();
  const exercise = person.exercises[0]!;
  person.exercises = [
    { ...exercise, skipped: true },
    {
      ...exercise,
      id: 'replacement',
      replacedFromId: exercise.id,
      plannedSets: 2,
      sets: [
        {
          id: 'live',
          revision: 1,
          position: 0,
          weightGrams: null,
          reps: 0,
          seconds: null,
        },
        {
          id: 'deleted',
          revision: 2,
          position: 1,
          weightGrams: null,
          reps: 8,
          seconds: null,
          deletedAt: '2026-10-04T10:00:00Z',
        },
      ],
    },
  ];
  const summary = summarizeWorkoutFinish(person);
  expect(summary.plannedSets).toBe(2);
  expect(summary.recordedSets).toBe(1);
  expect(summary.unrecordedSets).toBe(1);
  expect(summary.replacedExerciseIds).toContain('replacement');
});

it('does not count an untouched all-null editor as an unsaved result', () => {
  const person = finishParticipant();
  expect(
    summarizeWorkoutFinish(person, {
      workoutId: person.workoutId,
      bookingId: person.bookingId,
      focusExerciseId: person.exercises[0]!.id,
      values: {
        [person.exercises[0]!.id]: {
          weightGrams: null,
          reps: null,
          seconds: null,
        },
      },
    }).draftCount,
  ).toBe(0);
});

it('does not let extra sets on another exercise offset an unrecorded planned set', () => {
  const person = finishParticipant();
  const exercise = person.exercises[0]!;
  person.exercises = [
    { ...exercise, plannedSets: 1, sets: [] },
    {
      ...exercise,
      id: 'extra-exercise',
      plannedSets: 1,
      sets: [0, 1, 2].map((position) => ({
        id: `extra-set-${position}`,
        revision: 1,
        position,
        weightGrams: null,
        reps: 8,
        seconds: null,
      })),
    },
  ];
  const summary = summarizeWorkoutFinish(person);
  expect(summary.recordedSets).toBe(3);
  expect(summary.plannedSets).toBe(2);
  expect(summary.unrecordedSets).toBe(1);
  expect(summary.needsConfirmation).toBe(true);
});

it.each([
  'matching',
  'stale',
  'foreign_finish',
  'foreign_resolution',
  'incoming',
  'finished',
  'missing',
  'invalid_revision',
] as const)(
  'requires matching durable release metadata for the %s finish state',
  (variant) => {
    const workout: EntryWorkout = {
      participant: { ...finishParticipant(), workoutRevision: 10 },
      tombstones: [],
      finishOperation: {
        operation_id: 'original-finish',
        device_id: 'phone',
        entity_id: 'finish-workout-0',
        base_revision: 7,
        created_at: '2026-10-04T10:00:00Z',
        kind: 'finish_workout',
        payload: {},
      },
      finishResolution: {
        operationId: 'resolution',
        conflictId: 'conflict',
        selection: 'current',
      },
      finishRelease: {
        operationId: 'original-finish',
        resolutionOperationId: 'resolution',
        revision: 10,
      },
    };
    if (variant === 'stale') workout.participant.workoutRevision = 9;
    if (variant === 'foreign_finish')
      workout.finishRelease!.operationId = 'previous-finish';
    if (variant === 'foreign_resolution')
      workout.finishRelease!.resolutionOperationId = 'previous-resolution';
    if (variant === 'incoming')
      workout.finishResolution!.selection = 'incoming';
    if (variant === 'finished') workout.participant.workoutStatus = 'finished';
    if (variant === 'missing') delete workout.finishRelease;
    if (variant === 'invalid_revision')
      workout.finishRelease!.revision = Number.NaN;
    expect(workoutFinishLocked(workout)).toBe(variant !== 'matching');
  },
);

it('accepts a newer remote set revision at the released workout revision', () => {
  const participant = { ...finishParticipant(), workoutRevision: 10 };
  const original = {
    id: 'same-set',
    revision: 1,
    position: 0,
    weightGrams: 125,
    reps: 8,
    seconds: null,
  };
  participant.exercises[0]!.sets = [original];
  const local: EntryWorkout = {
    participant,
    tombstones: [],
    finishOperation: {
      operation_id: 'finish',
      device_id: 'phone',
      entity_id: participant.workoutId,
      base_revision: 7,
      created_at: '2026-10-04T10:00:00Z',
      kind: 'finish_workout',
      payload: {},
    },
    finishResolution: {
      operationId: 'resolve',
      conflictId: 'conflict',
      selection: 'current',
    },
    finishRelease: {
      operationId: 'finish',
      resolutionOperationId: 'resolve',
      revision: 10,
    },
  };
  const remote = structuredClone(participant);
  remote.exercises[0]!.sets = [
    { ...original, revision: 2, weightGrams: 200, reps: 9 },
  ];
  const reconciled = reconcileWorkout(remote, local, [], []);
  expect(reconciled.participant.exercises[0]!.sets).toEqual(
    remote.exercises[0]!.sets,
  );
  expect(workoutFinishLocked(reconciled)).toBe(false);
});
