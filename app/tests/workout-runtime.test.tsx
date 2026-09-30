import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import '../src/lib/i18n';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import {
  afterWorkoutAction,
  adjustRuntimeRest,
  createRuntimeState,
  restSnapshot,
  runtimeKey,
  skipRuntimeRest,
  runtimeExercise,
} from '../src/features/workout-demo/runtime-state';
import {
  WorkoutDemoProvider,
  WorkoutRestPanel,
  useWorkoutDemo,
  useWorkoutRuntime,
} from '../src/features/workout-demo';

const opened = () =>
  workoutReducer(createWorkoutState(), { type: 'open', sessionId: 's1' });
const save = {
  type: 'save',
  clientId: 'c5',
  exerciseId: 'e1',
  setIndex: 0,
  value: { kg: 50, reps: 10 },
} as const;
test('rest uses elapsed wall time, can be adjusted and skipped', () => {
  const before = opened();
  const after = workoutReducer(before, save);
  const runtime = afterWorkoutAction(
    createRuntimeState(),
    before,
    after,
    save,
    1000,
  );
  const key = runtimeKey('s1', 'c5');
  expect(restSnapshot(runtime.rest[key], 1000)).toMatchObject({
    left: 90,
    done: false,
    label: '1:30',
  });
  expect(restSnapshot(runtime.rest[key], 94000)).toMatchObject({
    left: 0,
    over: 3,
    done: true,
    label: '+0:03',
  });
  const changed = adjustRuntimeRest(runtime, key, 15, 11000);
  expect(restSnapshot(changed.rest[key], 11000)?.left).toBe(95);
  expect(skipRuntimeRest(changed, key).rest[key]).toBeUndefined();
});
test('editing existing results does not restart rest, finish clears it', () => {
  const before = opened();
  const after = workoutReducer(before, save);
  const runtime = afterWorkoutAction(
    createRuntimeState(),
    before,
    after,
    save,
    1000,
  );
  const edit = { ...save, value: { kg: 55, reps: 8 } };
  const edited = workoutReducer(after, edit);
  expect(afterWorkoutAction(runtime, after, edited, edit, 20000)).toBe(runtime);
  const pending = workoutReducer(edited, { type: 'finish' });
  const finished = workoutReducer(pending, { type: 'confirmPartial' });
  expect(
    afterWorkoutAction(
      runtime,
      pending,
      finished,
      { type: 'confirmPartial' },
      21000,
    ).rest,
  ).toEqual({});
});
test('participant clocks are isolated and undo clears only the active clock', () => {
  const group = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's6',
  });
  const aliyaSave = { ...save, clientId: 'c3' };
  const saved = workoutReducer(group, aliyaSave);
  const first = afterWorkoutAction(
    createRuntimeState(),
    group,
    saved,
    aliyaSave,
    1000,
  );
  const dana = workoutReducer(saved, { type: 'switch', clientId: 'c5' });
  const danaSaved = workoutReducer(dana, save);
  const both = afterWorkoutAction(first, dana, danaSaved, save, 5000);
  expect(both.rest['s6:c3']?.until).toBe(91000);
  expect(both.rest['s6:c5']?.until).toBe(95000);
  const undone = workoutReducer(danaSaved, { type: 'undo', clientId: 'c5' });
  const runtime = afterWorkoutAction(
    both,
    danaSaved,
    undone,
    { type: 'undo', clientId: 'c5' },
    6000,
  );
  expect(runtime.rest['s6:c5']).toBeUndefined();
  expect(runtime.rest['s6:c3']).toEqual(both.rest['s6:c3']);
});
test('saving the last open set advances focus and stops rest', () => {
  let state = opened();
  const journal = state.sessions.s1;
  for (const exercise of journal?.plans.c5?.exercises ?? []) {
    for (let setIndex = 0; setIndex < exercise.sets; setIndex += 1) {
      state = workoutReducer(state, {
        ...save,
        exerciseId: exercise.id,
        setIndex,
      });
    }
  }
  const last = journal?.plans.c5?.exercises.at(-1);
  const before = workoutReducer(state, { type: 'undo', clientId: 'c5' });
  const finalSave = {
    ...save,
    exerciseId: last?.id ?? '',
    setIndex: (last?.sets ?? 1) - 1,
  };
  const runtime = {
    ...createRuntimeState(),
    focus: { 's1:c5': last?.id ?? null },
    rest: {
      's1:c5': { exerciseId: 'e1', total: 90, until: 91000, startedAt: 1000 },
    },
  };
  const next = afterWorkoutAction(
    runtime,
    before,
    workoutReducer(before, finalSave),
    finalSave,
    2000,
  );
  expect(next.focus['s1:c5']).toBeNull();
  expect(next.rest['s1:c5']).toBeUndefined();
});
test('bodyweight rest is 60 seconds and runtime does not mutate saved data', () => {
  const before = opened();
  const action = { ...save, exerciseId: 'e14', value: { kg: 0, reps: 12 } };
  const exercise = before.sessions.s1?.plans.c5?.exercises.find(
    (entry) => entry.prev.kg === 0,
  );
  expect(exercise).toBeDefined();
  const actual = { ...action, exerciseId: exercise?.id ?? '' };
  const after = workoutReducer(before, actual);
  const frozen = JSON.stringify(after);
  const runtime = afterWorkoutAction(
    createRuntimeState(),
    before,
    after,
    actual,
    0,
  );
  expect(runtime.rest['s1:c5']?.total).toBe(60);
  expect(JSON.stringify(after)).toBe(frozen);
});
test('replacement focus skips hidden original rows', () => {
  const before = opened();
  const after = workoutReducer(before, {
    type: 'replaceExercise',
    clientId: 'c5',
    exerciseId: 'e1',
    spec: { name: 'Выпады с гантелями' },
  });
  const journal = after.sessions.s1;
  expect(journal).toBeDefined();
  if (!journal) return;
  expect(runtimeExercise(journal, 'e1')?.name).toBe('Выпады с гантелями');
  expect(runtimeExercise(journal, 'e1')?.id).not.toBe('e1');
});
test('added exercise rest preferences cannot leak through reused local IDs', () => {
  const first = workoutReducer(opened(), {
    type: 'addExercise',
    clientId: 'c5',
    spec: { name: 'Custom weighted', bodyweight: false },
  });
  const action = { ...save, exerciseId: 'x1' };
  const saved = workoutReducer(first, action);
  const clock = afterWorkoutAction(
    createRuntimeState(),
    first,
    saved,
    action,
    1000,
  );
  expect(clock.rest['s1:c5']?.total).toBe(90);
  const longer = adjustRuntimeRest(clock, 's1:c5', 15, 1000);
  const group = workoutReducer(saved, { type: 'open', sessionId: 's6' });
  const added = workoutReducer(group, {
    type: 'addExercise',
    clientId: 'c3',
    spec: { name: 'Custom bodyweight', bodyweight: true },
  });
  const secondAction = { ...action, clientId: 'c3', value: { kg: 0, reps: 8 } };
  const second = workoutReducer(added, secondAction);
  const runtime = afterWorkoutAction(longer, added, second, secondAction, 2000);
  expect(runtime.rest['s6:c3']?.total).toBe(60);
});

function Controls() {
  const { dispatch, hydrated } = useWorkoutDemo();
  const runtime = useWorkoutRuntime('s1', 'c5');
  return (
    <View>
      <Text>{hydrated ? 'ready' : 'loading'}</Text>
      <Text>{runtime.focusedExerciseId ?? 'automatic'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="open"
        onPress={() => dispatch({ type: 'open', sessionId: 's1' })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="save"
        onPress={() => dispatch(save)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="focus"
        onPress={() => runtime.focusExercise('e1')}
      />
      <WorkoutRestPanel sessionId="s1" clientId="c5" />
    </View>
  );
}
test('provider integrates runtime, timer controls never persist timer ticks', async () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
  };
  await render(
    <WorkoutDemoProvider storage={storage}>
      <Controls />
    </WorkoutDemoProvider>,
  );
  await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'open' }));
  await fireEvent.press(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(screen.getByTestId('workout-rest')).toBeTruthy());
  await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByRole('button', { name: 'focus' }));
  expect(screen.getByText('e1')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отдых на 15 секунд больше' }),
  );
  await act(async () => {});
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByRole('button', { name: 'Хватит' }));
  expect(screen.queryByTestId('workout-rest')).toBeNull();
});
