import { useReducer, type PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import { WorkoutScreen } from '../src/features/workout';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

const minimize = jest.fn();
const leave = jest.fn();

function Harness({ sessionId = 's1' }: { sessionId?: string }) {
  const [state, dispatch] = useReducer(
    workoutReducer,
    workoutReducer(createWorkoutState(), { type: 'open', sessionId }),
  );
  return (
    <WorkoutScreen
      sessionId={sessionId}
      journal={state.sessions[sessionId] ?? null}
      dispatch={dispatch}
      onMinimize={minimize}
      onLeave={leave}
    />
  );
}

test('composer records a result and sheet validates edits before replacing it', async () => {
  await render(<Harness />);
  expect(screen.getByText('Дана Ержанова')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('workout-composer-kg'), '52,5');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  expect(screen.getByLabelText('Записано 1 из 12 подходов')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Изменить подход 1: Приседания со штангой',
    }),
  );
  await fireEvent.changeText(screen.getByTestId('workout-editor-reps'), '0');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход' }),
  );
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Записано 1 из 12 подходов')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('workout-editor-reps'), '8');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход' }),
  );
  expect(screen.queryByTestId('workout-editor-reps')).toBeNull();
  expect(screen.getAllByText(/52,5 кг × 8/).length).toBeGreaterThan(0);
});

test('partial finish requires explicit confirmation and finished results cannot be edited', async () => {
  await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  expect(screen.getByText('1 из 12 записано · 11 без записи')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Продолжить ввод' }),
  );
  expect(screen.getByTestId('workout-composer-reps')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Завершить' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранить записанное и завершить' }),
  );
  expect(screen.getByText('Журнал завершён')).toBeTruthy();
  expect(screen.getByText('Посещение и списание не изменены.')).toBeTruthy();
  expect(screen.queryByTestId('workout-composer-reps')).toBeNull();
  expect(screen.queryByRole('button', { name: /Изменить подход/ })).toBeNull();
});

test('group switching keeps results separate and cancelled participants readonly', async () => {
  await render(<Harness sessionId="s6" />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: /Дана/ }));
  expect(screen.getByTestId('workout-composer-kg').props.value).toBe('50');
  await fireEvent.press(screen.getByRole('button', { name: /Мади/ }));
  expect(screen.queryByTestId('workout-composer-kg')).toBeNull();
  expect(screen.getByText(/Участник отменил запись/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /Алия/ }));
  expect(screen.getAllByText(/80 кг × 8/).length).toBeGreaterThan(0);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Свернуть тренировку' }),
  );
  expect(minimize).toHaveBeenCalled();
});

test('failed restoration offers retry without opening a fresh editable journal', async () => {
  const retry = jest.fn();
  await render(
    <WorkoutScreen
      sessionId="s1"
      journal={null}
      dispatch={jest.fn()}
      onMinimize={minimize}
      onLeave={leave}
      readError
      readonly
      onRetrySave={retry}
    />,
  );
  expect(screen.queryByTestId('workout-composer-kg')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить загрузку' }),
  );
  expect(retry).toHaveBeenCalled();
});
