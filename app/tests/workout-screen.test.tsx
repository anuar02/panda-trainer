import { useReducer, type PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  createWorkoutState,
  workoutReducer,
  type WorkoutAction,
} from '../src/domain/workout';
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

function Harness({
  sessionId = 's1',
  actions = [],
}: {
  sessionId?: string;
  actions?: WorkoutAction[];
}) {
  const [state, dispatch] = useReducer(
    workoutReducer,
    actions.reduce(
      workoutReducer,
      workoutReducer(createWorkoutState(), { type: 'open', sessionId }),
    ),
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

test('undo removes the latest saved result and disappears after use', async () => {
  await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  expect(screen.getByLabelText('Записано 0 из 12 подходов')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Отменить запись' })).toBeNull();
});

test('exercise skip and restore retain saved sets and replacement keeps old results', async () => {
  await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать подход 1' }),
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Изменить упражнение: Приседания со штангой',
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Пропустить' }));
  expect(screen.getByLabelText('Записано 1 из 10 подходов')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Приседания со штангой' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Вернуть упражнение' }),
  );
  expect(screen.getByLabelText('Записано 1 из 12 подходов')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Приседания со штангой' }),
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Изменить упражнение: Приседания со штангой',
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Заменить' }));
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнения'),
    'планка',
  );
  await fireEvent.press(screen.getByTestId('workout-pick-Планка'));
  expect(screen.getAllByText('заменено').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/50 кг × 10/).length).toBeGreaterThan(0);
});

test('adding a custom exercise supports weighted input and removing it before recording', async () => {
  await render(<Harness />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Добавить упражнение' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Поиск упражнения'),
    'Новое упражнение',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать своё: «Новое упражнение»' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Новое упражнение' }),
  );
  expect(screen.getByTestId('workout-composer-kg').props.value).toBe('');
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Изменить упражнение: Новое упражнение',
    }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Убрать из тренировки' }),
  );
  expect(screen.queryByText('Новое упражнение')).toBeNull();
});

test('notes start private, can be shared and deleted and finished controls stay readonly', async () => {
  const opened = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's1',
  });
  const clientId = opened.sessions.s1!.active;
  const note: WorkoutAction = {
    type: 'addNote',
    clientId,
    text: 'Следить за техникой',
    at: '12:30',
  };
  const first = await render(<Harness actions={[note]} />);
  expect(
    screen.getByRole('switch', { name: 'Видно клиенту · нет' }).props
      .accessibilityState.checked,
  ).toBe(false);
  await fireEvent.press(
    screen.getByRole('switch', { name: 'Видно клиенту · нет' }),
  );
  expect(
    screen.getByRole('switch', { name: 'Видно клиенту · да' }).props
      .accessibilityState.checked,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Удалить заметку: Следить за техникой',
    }),
  );
  expect(screen.queryByText('Следить за техникой')).toBeNull();
  await first.unmount();
  await render(
    <Harness
      actions={[note, { type: 'finish' }, { type: 'confirmPartial' }]}
    />,
  );
  expect(
    screen.getByRole('switch', { name: 'Видно клиенту · нет' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(
    screen.queryByRole('button', { name: 'Добавить упражнение' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: /Удалить заметку/ })).toBeNull();
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
