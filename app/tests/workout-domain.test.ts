import {
  createWorkoutState,
  decodeWorkoutState,
  parseWorkoutSet,
  workoutEligible,
  workoutExercises,
  workoutProgress,
  workoutReducer,
} from '../src/domain/workout';
import type { WorkoutState } from '../src/domain/workout';

const open = (id = 's1') =>
  workoutReducer(createWorkoutState(), { type: 'open', sessionId: id });
const journal = (state: WorkoutState) => {
  const value = state.sessions[state.activeSessionId ?? ''];
  if (!value) throw new Error('Expected journal');
  return value;
};
const save = (state: WorkoutState, clientId = 'c5', kg = 50, reps = 10) =>
  workoutReducer(state, {
    type: 'save',
    clientId,
    exerciseId: 'e1',
    setIndex: 0,
    value: { kg, reps },
  });

test('canonical personal and group plans start empty with correct participant eligibility', () => {
  expect(workoutProgress(journal(open()))).toEqual({
    total: 12,
    done: 0,
    drafts: 0,
  });
  const group = journal(open('s6'));
  expect(group.active).toBe('c3');
  expect(group.plans.c3?.name).toBe('Низ А');
  expect(workoutProgress(group).total).toBe(16);
  expect(workoutEligible(group, 'c4')).toBe(false);
  expect(workoutEligible(group, 'c5')).toBe(true);
  expect(
    workoutReducer(createWorkoutState(), {
      type: 'open',
      sessionId: 'unknown',
    }),
  ).toEqual(createWorkoutState());
  expect(
    workoutReducer(createWorkoutState(), {
      type: 'open',
      sessionId: '__proto__',
    }),
  ).toEqual(createWorkoutState());
});

test('participant and session results stay isolated across switching and reopening', () => {
  let state = open('s6');
  const original = state;
  state = save(state, 'c3', 80, 8);
  expect(original.sessions.s6?.values).toEqual({});
  state = workoutReducer(state, { type: 'switch', clientId: 'c5' });
  expect(workoutProgress(journal(state)).done).toBe(0);
  state = save(state);
  state = workoutReducer(state, { type: 'open', sessionId: 's1' });
  expect(workoutProgress(journal(state)).done).toBe(0);
  state = workoutReducer(state, {
    type: 'open',
    sessionId: 's6',
    participantId: 'c3',
  });
  expect(journal(state).values.c3?.e1?.[0]).toEqual({ kg: 80, reps: 8 });
  expect(journal(state).values.c5?.e1?.[0]).toEqual({ kg: 50, reps: 10 });
});

test('draft edits preserve saved results until a valid save and survive serialization', () => {
  let state = save(open());
  state = workoutReducer(state, {
    type: 'draft',
    clientId: 'c5',
    exerciseId: 'e1',
    setIndex: 0,
    draft: { kg: '52,5', reps: '' },
  });
  expect(journal(state).values.c5?.e1?.[0]).toEqual({ kg: 50, reps: 10 });
  expect(workoutProgress(journal(state)).drafts).toBe(1);
  expect(decodeWorkoutState(JSON.stringify(state))).toEqual(state);
  expect(save(state, 'c5', -1)).toBe(state);
  expect(save(state, 'c5', 0, 1.5)).toBe(state);
  expect(save(state, 'c5', 0, 0)).toBe(state);
  state = save(state, 'c5', 0, 12);
  expect(workoutProgress(journal(state))).toEqual({
    total: 12,
    done: 1,
    drafts: 0,
  });
  expect(journal(state).values.c5?.e1?.[0]).toEqual({ kg: 0, reps: 12 });
});

test('parser accepts decimal comma, bodyweight and zero weight, rejecting invalid reps and numbers', () => {
  const [weighted, bodyweight] = workoutExercises('Full Body');
  if (!weighted || !bodyweight) throw new Error('Expected exercises');
  expect(parseWorkoutSet(weighted, { kg: '52,5', reps: '8' })).toEqual({
    kg: 52.5,
    reps: 8,
  });
  expect(parseWorkoutSet(weighted, { kg: '0', reps: '8' })).toEqual({
    kg: 0,
    reps: 8,
  });
  expect(parseWorkoutSet(bodyweight, { kg: '', reps: '12' })).toEqual({
    kg: 0,
    reps: 12,
  });
  for (const [kg, reps] of [
    ['', '8'],
    ['-1', '8'],
    ['Infinity', '8'],
    ['50', '1.5'],
    ['50', '0'],
    ['50', '9007199254740992'],
  ]) {
    expect(
      parseWorkoutSet(weighted, { kg: kg ?? '', reps: reps ?? '' }),
    ).toBeNull();
  }
});

test('only empty extra sets can be removed and cancelled or inactive clients cannot be edited', () => {
  let state = open();
  const remove = {
    type: 'removeSet' as const,
    clientId: 'c5',
    exerciseId: 'e1',
  };
  expect(workoutReducer(state, remove)).toBe(state);
  state = workoutReducer(state, { ...remove, type: 'addSet' });
  expect(workoutProgress(journal(state)).total).toBe(13);
  expect(workoutProgress(journal(workoutReducer(state, remove))).total).toBe(
    12,
  );
  state = workoutReducer(state, {
    type: 'draft',
    clientId: 'c5',
    exerciseId: 'e1',
    setIndex: 3,
    draft: { kg: '50', reps: '' },
  });
  expect(workoutReducer(state, remove)).toBe(state);
  const group = open('s6');
  expect(save(group)).toBe(group);
  const cancelled = workoutReducer(group, { type: 'switch', clientId: 'c4' });
  expect(save(cancelled, 'c4')).toBe(cancelled);
});

test('partial finish requires confirmation and completed journals remain readonly', () => {
  let state = save(open());
  expect(workoutReducer(state, { type: 'confirmPartial' })).toBe(state);
  state = workoutReducer(state, { type: 'finish' });
  expect(journal(state).finished).toBe(false);
  expect(journal(state).finishPending).toBe(true);
  state = workoutReducer(state, { type: 'continueInput' });
  expect(journal(state).finishPending).toBe(false);
  state = workoutReducer(workoutReducer(state, { type: 'finish' }), {
    type: 'confirmPartial',
  });
  expect(journal(state).finished).toBe(true);
  expect(save(state)).toBe(state);
  expect(
    workoutReducer(state, { type: 'addSet', clientId: 'c5', exerciseId: 'e1' }),
  ).toBe(state);
  expect(decodeWorkoutState(JSON.stringify(state))).toEqual(state);
});

test('fully recorded session finishes directly, while an empty plan requires confirmation', () => {
  let state = open();
  for (const exercise of journal(state).plans.c5?.exercises ?? []) {
    for (let i = 0; i < exercise.sets; i++)
      state = workoutReducer(state, {
        type: 'save',
        clientId: 'c5',
        exerciseId: exercise.id,
        setIndex: i,
        value: exercise.prev,
      });
  }
  expect(journal(workoutReducer(state, { type: 'finish' })).finished).toBe(
    true,
  );
  expect(
    journal(workoutReducer(open('s7'), { type: 'finish' })).finishPending,
  ).toBe(true);
});

test('decoder rejects corrupt, future, foreign and invalid saved data without fabricating results', () => {
  expect(decodeWorkoutState(null)).toEqual(createWorkoutState());
  for (const raw of [
    '{',
    '{}',
    JSON.stringify({ ...open(), version: 2 }),
    JSON.stringify({ ...open(), activeSessionId: 'missing' }),
  ])
    expect(decodeWorkoutState(raw)).toBeNull();
  const invalid = open();
  journal(invalid).values.c5 = { e1: [{ kg: -1, reps: 8 }] };
  expect(decodeWorkoutState(JSON.stringify(invalid))).toBeNull();
  const unknown = open();
  journal(unknown).drafts.intruder = { e1: [{ kg: '', reps: '' }] };
  expect(decodeWorkoutState(JSON.stringify(unknown))).toBeNull();
  const altered = open();
  const exercise = journal(altered).plans.c5?.exercises[0];
  if (exercise) exercise.name = 'Changed';
  expect(decodeWorkoutState(JSON.stringify(altered))).toBeNull();
});
