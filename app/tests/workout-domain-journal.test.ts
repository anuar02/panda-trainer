import {
  createWorkoutState,
  decodeWorkoutState,
  parseWorkoutSet,
  workoutClientHistory,
  workoutClientProgress,
  workoutExerciseLibrary,
  workoutProgress,
  workoutReducer,
} from '../src/domain/workout';
import type { WorkoutAction, WorkoutState } from '../src/domain/workout';

const open = (sessionId = 's4') =>
  workoutReducer(createWorkoutState(), { type: 'open', sessionId });
const journal = (state: WorkoutState) =>
  state.sessions[state.activeSessionId ?? '']!;
const act = (state: WorkoutState, action: WorkoutAction) =>
  workoutReducer(state, action);
const save = (state: WorkoutState, exerciseId = 'e1', kg = 80, reps = 8) =>
  act(state, {
    type: 'save',
    clientId: journal(state).active,
    exerciseId,
    setIndex: 0,
    value: { kg, reps },
  });
const finish = (state: WorkoutState) =>
  act(act(state, { type: 'finish' }), { type: 'confirmPartial' });
const plan = (state: WorkoutState) =>
  journal(state).plans[journal(state).active]!;

test('undo restores overwritten result, survives storage, and cannot target another client or survive draft edits', () => {
  let state = save(open());
  expect(
    journal(act(state, { type: 'undo', clientId: 'c1' })).values.c1?.e1?.[0],
  ).toBeNull();
  state = save(state, 'e1', 85);
  state = decodeWorkoutState(JSON.stringify(state))!;
  expect(
    journal(act(state, { type: 'undo', clientId: 'c1' })).values.c1?.e1?.[0]
      ?.kg,
  ).toBe(80);
  expect(act(state, { type: 'undo', clientId: 'c5' })).toBe(state);
  state = act(state, {
    type: 'draft',
    clientId: 'c1',
    exerciseId: 'e1',
    setIndex: 0,
    draft: { kg: '90', reps: '' },
  });
  expect(act(state, { type: 'undo', clientId: 'c1' })).toBe(state);
  const grouped = save(open('s6'));
  const switched = act(grouped, { type: 'switch', clientId: 'c5' });
  expect(journal(switched).undo).toBeNull();
  expect(journal(grouped).values.c3?.e1?.[0]?.kg).toBe(80);
});

test('replacement preserves recorded rows, drops old drafts, uses remaining sets and survives roundtrip', () => {
  let state = save(open());
  state = act(state, {
    type: 'draft',
    clientId: 'c1',
    exerciseId: 'e1',
    setIndex: 1,
    draft: { kg: '82', reps: '' },
  });
  state = act(state, {
    type: 'replaceExercise',
    clientId: 'c1',
    exerciseId: 'e1',
    spec: { name: 'Жим гантелей лёжа' },
  });
  const old = plan(state).exercises[0]!;
  const replacement = plan(state).exercises[1]!;
  expect(old).toMatchObject({ skipped: true, replacedBy: replacement.id });
  expect(replacement).toMatchObject({
    sets: 3,
    plannedSets: 3,
    origin: 'replaced',
    replaces: old.name,
  });
  expect(journal(state).values.c1?.e1?.[0]).toEqual({ kg: 80, reps: 8 });
  expect(journal(state).drafts.c1?.e1).toBeUndefined();
  expect(workoutProgress(journal(state))).toEqual({
    done: 1,
    total: 16,
    drafts: 0,
  });
  expect(save(state)).toBe(state);
  expect(
    act(state, {
      type: 'skipExercise',
      clientId: 'c1',
      exerciseId: 'e1',
      skip: false,
    }),
  ).toBe(state);
  expect(decodeWorkoutState(JSON.stringify(state))).toEqual(state);
  const history = workoutClientHistory(finish(state), 'c1')[0]!;
  expect(history.changes).toBe('заменено 1');
  expect(history.exercises[0]?.values).toEqual([{ kg: 80, reps: 8 }]);
});

test('added empty exercises can be removed, recorded skipped exercises retained, and skipped plan exercises restored', () => {
  let state = act(open('s7'), {
    type: 'addExercise',
    clientId: 'c1',
    spec: { name: 'Фермерская прогулка' },
  });
  const id = plan(state).exercises[0]!.id;
  expect(
    parseWorkoutSet(plan(state).exercises[0]!, { kg: '', reps: '8' }),
  ).toBeNull();
  state = act(state, {
    type: 'draft',
    clientId: 'c1',
    exerciseId: id,
    setIndex: 0,
    draft: { kg: '20', reps: '' },
  });
  const removed = act(state, {
    type: 'skipExercise',
    clientId: 'c1',
    exerciseId: id,
  });
  expect(plan(removed).exercises).toEqual([]);
  expect(decodeWorkoutState(JSON.stringify(removed))).toEqual(removed);
  state = save(state, id, 20);
  state = act(state, { type: 'skipExercise', clientId: 'c1', exerciseId: id });
  expect(plan(state).exercises).toHaveLength(1);
  expect(workoutProgress(journal(state))).toEqual({
    done: 1,
    total: 1,
    drafts: 0,
  });
  expect(workoutClientProgress(finish(state), 'c1')[0]?.best.kg).toBe(20);
  const skipped = act(open(), {
    type: 'skipExercise',
    clientId: 'c1',
    exerciseId: 'e1',
  });
  expect(workoutProgress(journal(skipped)).total).toBe(12);
  expect(
    workoutProgress(
      journal(
        act(skipped, {
          type: 'skipExercise',
          clientId: 'c1',
          exerciseId: 'e1',
          skip: false,
        }),
      ),
    ).total,
  ).toBe(16);
});

test('notes default private and selectors expose only shared notes for eligible finished client', () => {
  let state = act(open(), {
    type: 'addNote',
    clientId: 'c1',
    text: '  держи   спину ',
    at: '18:20',
  });
  state = act(state, {
    type: 'addNote',
    clientId: 'c1',
    text: 'private',
    at: '18:21',
  });
  expect(journal(state).notes?.c1?.[0]).toEqual({
    text: 'держи спину',
    at: '18:20',
    shared: false,
  });
  state = act(state, { type: 'shareNote', clientId: 'c1', index: 0 });
  expect(workoutClientHistory(state, 'c1')).toEqual([]);
  const finished = finish(state);
  expect(workoutClientHistory(finished, 'c1')[0]?.notes).toEqual([
    { text: 'держи спину', at: '18:20' },
  ]);
  expect(workoutClientHistory(finished, 'c5')).toEqual([]);
  expect(workoutClientHistory(finish(open('s6')), 'c4')).toEqual([]);
  expect(decodeWorkoutState(JSON.stringify(finished))).toEqual(finished);
  const history = workoutClientHistory(finished, 'c1');
  history[0]!.notes[0]!.text = 'mutated';
  expect(journal(finished).notes?.c1?.[0]?.text).toBe('держи спину');
});

test('all new mutations honor inactive, cancelled and finished guards', () => {
  const actions: Extract<WorkoutAction, { clientId: string }>[] = [
    { type: 'undo', clientId: 'c1' },
    { type: 'addExercise', clientId: 'c1', spec: { name: 'Планка' } },
    {
      type: 'replaceExercise',
      clientId: 'c1',
      exerciseId: 'e1',
      spec: { name: 'Планка' },
    },
    { type: 'skipExercise', clientId: 'c1', exerciseId: 'e1' },
    { type: 'addNote', clientId: 'c1', text: 'x', at: '18:20' },
    { type: 'shareNote', clientId: 'c1', index: 0 },
    { type: 'removeNote', clientId: 'c1', index: 0 },
  ];
  const complete = finish(save(open()));
  const group = act(open('s6'), { type: 'switch', clientId: 'c4' });
  for (const action of actions) {
    expect(act(complete, action)).toBe(complete);
    expect(act(group, { ...action, clientId: 'c4' })).toBe(group);
    expect(act(group, action)).toBe(group);
  }
});

test('v1 legacy drafts decode unchanged and malformed new fields are rejected', () => {
  const legacy = act(open(), {
    type: 'draft',
    clientId: 'c1',
    exerciseId: 'e1',
    setIndex: 0,
    draft: { kg: '80', reps: '' },
  });
  delete journal(legacy).undo;
  expect(decodeWorkoutState(JSON.stringify(legacy))).toEqual(legacy);
  for (const extension of [
    { notes: null },
    { notes: { c1: [{ text: 'x', at: '18:00', shared: 'yes' }] } },
    { notes: { c5: [] } },
    {
      undo: {
        clientId: 'c1',
        exerciseId: 'e1',
        setIndex: 0,
        value: { kg: 80, reps: 8 },
        previous: null,
      },
    },
  ]) {
    const state = open();
    Object.assign(journal(state), extension);
    expect(decodeWorkoutState(JSON.stringify(state))).toBeNull();
  }
  const replaced = act(open(), {
    type: 'replaceExercise',
    clientId: 'c1',
    exerciseId: 'e1',
    spec: { name: 'Планка' },
  });
  plan(replaced).exercises[0]!.replacedBy = 'missing';
  expect(decodeWorkoutState(JSON.stringify(replaced))).toBeNull();
});

test('progress matches daily best, baseline cutoff, future exclusion and rep/time units without inventing attendance', () => {
  let state = finish(save(open()));
  state = act(state, { type: 'open', sessionId: 's7' });
  state = act(state, {
    type: 'addExercise',
    clientId: 'c1',
    spec: { name: 'присед' },
  });
  const id = plan(state).exercises[0]!.id;
  state = finish(save(state, id, 90, 6));
  expect(workoutClientProgress(state, 'c1')[0]).toMatchObject({
    best: { kg: 90, reps: 6, date: '2026-09-14' },
    delta: null,
    series: [{ date: '2026-09-14', value: 90 }],
  });
  expect(workoutClientProgress(state, 'c1', '2026-10-12')[0]).toMatchObject({
    delta: 0,
    baselineDate: '2026-09-14',
  });
  expect(workoutClientProgress(state, 'c1', '2026-09-13')).toEqual([]);
  expect(workoutClientProgress(state, 'c1', '2026-11-10')[0]?.series).toEqual(
    [],
  );
  const timed = finish(save(open(), 'e5', 0, 60));
  expect(workoutClientProgress(timed, 'c1')[0]).toMatchObject({
    unit: 'сек',
    deltaUnit: 'сек',
    best: { kg: 0, reps: 60 },
  });
  expect(workoutExerciseLibrary).toHaveLength(81);
});

test('progress delta compares best result to the 28-day baseline and merges same-day records', () => {
  let state = finish(save(open(), 'e1', 80, 8));
  state = act(state, { type: 'open', sessionId: 's8' });
  state = finish(save(state, 'e1', 92.5, 6));
  expect(workoutClientProgress(state, 'c1')[0]?.best.kg).toBe(80);
  expect(workoutClientProgress(state, 'c1', '2026-10-12')[0]).toMatchObject({
    best: { kg: 92.5, reps: 6, date: '2026-09-17' },
    delta: 12.5,
    baselineDate: '2026-09-14',
    series: [
      { date: '2026-09-14', value: 80 },
      { date: '2026-09-17', value: 92.5 },
    ],
  });
});
