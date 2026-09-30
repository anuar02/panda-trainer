import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Circle } from 'react-native-svg';
import type { ComponentProps } from 'react';
import '../src/lib/i18n';
import {
  createWorkoutState,
  workoutReducer,
  type WorkoutState,
} from '../src/domain/workout';
import { WorkoutDock } from '../src/features/workout-demo/dock';
import { useOptionalWorkoutDemo } from '../src/features/workout-demo/provider';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-svg', () => {
  const actual =
    jest.requireActual<typeof import('react-native-svg')>('react-native-svg');
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    ...actual,
    Circle: jest.fn((props: ComponentProps<typeof Circle>) =>
      createElement(actual.Circle, props),
    ),
  };
});
jest.mock('../src/features/workout-demo/provider', () => ({
  useOptionalWorkoutDemo: jest.fn(),
}));

function show(state: WorkoutState, storageStatus: 'saved' | 'error' = 'saved') {
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue({
    state,
    hydrated: true,
    readError: false,
    storageStatus,
    dispatch: jest.fn(),
    retrySave: jest.fn(),
  });
  return render(<WorkoutDock />);
}
const open = (id: string, state = createWorkoutState()) =>
  workoutReducer(state, { type: 'open', sessionId: id });

test('personal dock names the client, includes draft detail and resumes the actual journal', async () => {
  const state = workoutReducer(open('s1'), {
    type: 'draft',
    clientId: 'c5',
    exerciseId: 'e1',
    setIndex: 0,
    draft: { kg: '5,', reps: '' },
  });
  await show(state);
  expect(screen.getByText('Дана Ержанова')).toBeTruthy();
  expect(
    screen.getByText('Приседания со штангой · Есть черновик'),
  ).toBeTruthy();
  const dock = screen.getByRole('button', {
    name: 'Вернуться к тренировке: Дана Ержанова, 09:00. 0 из 12 подходов · Есть черновик. Сейчас: Приседания со штангой',
  });
  await fireEvent.press(dock);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/session/[id]',
    params: { id: 's1' },
  });
});

test('group drafts aggregate participants while progress remains per active participant', async () => {
  let state = workoutReducer(open('s6'), {
    type: 'draft',
    clientId: 'c3',
    exerciseId: 'e1',
    setIndex: 0,
    draft: { kg: '80', reps: '' },
  });
  state = workoutReducer(state, { type: 'switch', clientId: 'c5' });
  state = workoutReducer(state, {
    type: 'draft',
    clientId: 'c5',
    exerciseId: 'e2',
    setIndex: 0,
    draft: { kg: '', reps: '1' },
  });
  await show(state);
  expect(screen.getByText('Мини-группа · Дана Ержанова')).toBeTruthy();
  expect(screen.getByText('0/12')).toBeTruthy();
  expect(
    screen.getByText('Приседания со штангой · Черновики: 2 участн.'),
  ).toBeTruthy();
});

test('cancelled participant and no-program states hide misleading set counters', async () => {
  const cancelled = workoutReducer(open('s6'), {
    type: 'switch',
    clientId: 'c4',
  });
  const first = await show(cancelled);
  expect(screen.getByText('Участник не участвует')).toBeTruthy();
  expect(screen.queryByText('0/13')).toBeNull();
  await first.unmount();
  await show(open('s7'));
  expect(screen.getByText('Без программы')).toBeTruthy();
  expect(screen.queryByText('0/0')).toBeNull();
});

test('finished active journal falls back to latest unfinished today and does not select future bookings', async () => {
  let state = open('s6', open('s4', open('s9')));
  state = open('s1', state);
  state = workoutReducer(workoutReducer(state, { type: 'finish' }), {
    type: 'confirmPartial',
  });
  await show(state);
  expect(screen.getByText('Мини-группа · Алия Нурлановa')).toBeTruthy();
  expect(screen.getByText('20:00 · 0 из 16 подходов')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('workout-dock'));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/session/[id]',
    params: { id: 's6' },
  });
});

test('storage error hides progress and no unfinished journal produces no dock', async () => {
  const first = await show(open('s1'), 'error');
  expect(
    screen.getByText('Ошибка сохранения · вернитесь к журналу'),
  ).toBeTruthy();
  expect(screen.queryByText('0/12')).toBeNull();
  await first.unmount();
  await show(createWorkoutState());
  expect(screen.queryByTestId('workout-dock')).toBeNull();
});

test('progress ring uses portable SVG transform without DOM transform-origin', async () => {
  jest.mocked(Circle).mockClear();
  await show(open('s1'));
  const progress = jest
    .mocked(Circle)
    .mock.calls.find(([props]) => props.strokeDasharray !== undefined)?.[0];
  expect(progress?.transform).toBe('rotate(-90 21 21)');
  expect(progress?.origin).toBeUndefined();
  expect(progress?.rotation).toBeUndefined();
});
