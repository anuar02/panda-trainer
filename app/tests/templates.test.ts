import { scheduleRows } from '../src/features/scheduling-demo/adapters';
import {
  beginTemplate,
  decodeTemplates,
  emptyTemplates,
  prepareTemplate,
  validPlan,
} from '../src/domain/templates';
import { builtInTemplates } from '../src/features/template-editor/provider';
import {
  applySchedulingAction,
  createSchedulingState,
  decodeSchedulingState,
  encodeSchedulingState,
} from '../src/domain/scheduling';
import {
  createWorkoutState,
  workoutReducer,
  decodeWorkoutState,
} from '../src/domain/workout';
const template = builtInTemplates[0]!;
const draft = () => beginTemplate(template, true);
test('copy is independent and normalizes ranges, decimals and timed exercises', () => {
  const copy = draft();
  copy.exercises[0]!.reps = '8 - 12';
  copy.exercises[0]!.target = '12,5';
  const result = prepareTemplate(copy, builtInTemplates, 'copy');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.template.id).toBe('copy');
  expect(result.template.exercises[0]).toMatchObject({
    reps: '8–12',
    target: 12.5,
  });
  expect(result.template.exercises[4]!.reps).toBe('45 сек');
  expect(template.exercises[0]!.reps).toBe('8');
});
test.each([
  ['sets', '0'],
  ['sets', '21'],
  ['sets', '2.5'],
  ['reps', '0'],
  ['reps', '12-8'],
  ['target', '-1'],
  ['target', 'NaN'],
  ['rest', '601'],
] as const)('rejects invalid %s %s', (field, value) => {
  const copy = draft();
  copy.exercises[0]![field] = value;
  expect(prepareTemplate(copy, builtInTemplates, 'copy')).toMatchObject({
    ok: false,
    error: 'exercise',
    index: 0,
  });
});
test('validates names, duplicates, empty plans, limits and draft decoding', () => {
  expect(
    prepareTemplate({ ...draft(), name: ' низ а ' }, builtInTemplates, 'copy'),
  ).toMatchObject({ error: 'duplicate' });
  expect(
    prepareTemplate(
      { ...draft(), name: 'constructor' },
      builtInTemplates,
      'copy',
    ),
  ).toMatchObject({ error: 'name' });
  expect(
    prepareTemplate({ ...draft(), exercises: [] }, builtInTemplates, 'copy'),
  ).toMatchObject({ error: 'empty' });
  expect(
    prepareTemplate(
      {
        ...draft(),
        exercises: Array.from({ length: 51 }, () => draft().exercises[0]!),
      },
      builtInTemplates,
      'copy',
    ),
  ).toMatchObject({ error: 'limit' });
  expect(
    decodeTemplates(JSON.stringify({ ...emptyTemplates(), draft: draft() }))
      ?.draft,
  ).toEqual(draft());
  expect(decodeTemplates('{')).toBeNull();
  expect(
    decodeTemplates(
      JSON.stringify({
        ...emptyTemplates(),
        draft: { ...draft(), exercises: [null] },
      }),
    ),
  ).toBeNull();
  expect(validPlan([{ ...template.exercises[0], reps: '99999' }])).toBe(false);
});
test('edited custom plan survives scheduling and workout reload and later template edits', () => {
  const result = prepareTemplate(draft(), builtInTemplates, 'copy');
  if (!result.ok) throw new Error('template failed');
  const saved = applySchedulingAction(
    createSchedulingState(),
    {
      type: 'create',
      id: 'custom',
      draft: {
        clientIds: ['c1', 'c2'],
        date: '2026-09-16',
        start: '19:00',
        duration: 60,
        program: result.template.name,
        programLater: false,
        collisionAck: true,
      },
    },
    {
      actor: { role: 'trainer' },
      today: '2026-09-16',
      nowTime: '09:00',
      templates: [result.template],
    },
  );
  if (!saved.ok) throw new Error(saved.error);
  result.template.exercises[0]!.sets = 1;
  const restored = decodeSchedulingState(encodeSchedulingState(saved.state))!;
  const session = restored.sessions.find((s) => s.id === 'custom')!;
  expect(session.planSnapshot![0]!.sets).toBe(4);
  expect(
    scheduleRows(restored).find((row) => row.id === 'custom')?.programName,
  ).toBe(result.template.name);
  const workout = workoutReducer(createWorkoutState(restored.sessions), {
    type: 'open',
    sessionId: 'custom',
  });
  expect(workout.sessions.custom!.plans.c1!.exercises[0]!.sets).toBe(4);
  expect(workout.sessions.custom!.plans.c2!.exercises[4]!.unit).toBe('сек');
  expect(decodeWorkoutState(JSON.stringify(workout))).toEqual(workout);
  const corrupted = JSON.parse(JSON.stringify(workout));
  corrupted.catalog.find(
    (s: { id: string }) => s.id === 'custom',
  ).planSnapshot[0].sets = 0;
  expect(decodeWorkoutState(JSON.stringify(corrupted))).toBeNull();
});
