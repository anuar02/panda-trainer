import type { PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { WorkoutDemoProvider } from '../src/features/workout-demo';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import '../src/lib/i18n';
import { TrainerTodayScreen } from '../src/features/trainer-today/trainer-today-screen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
beforeEach(() => mockPush.mockClear());

test.each([false, true])(
  'Today reflects group journal completion=%s in its entry and details',
  async (finished) => {
    const state = workoutReducer(createWorkoutState(), {
      type: 'open',
      sessionId: 's6',
    });
    state.sessions.s6!.finished = finished;
    const storage = {
      getItem: async () => JSON.stringify(state),
      setItem: async () => {},
    };
    await render(
      <WorkoutDemoProvider storage={storage}>
        <TrainerTodayScreen />
      </WorkoutDemoProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(finished ? 'Журнал завершён' : 'Журнал в работе'),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole('button', { name: 'Начать тренировку' }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: /Участники мини-группы/ }),
    );
    const label = finished ? 'Посмотреть результаты' : 'Продолжить тренировку';
    await fireEvent.press(
      screen.getAllByRole('button', { name: label }).at(-1)!,
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session/[id]',
      params: { id: 's6' },
    });
  },
);

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('past sessions expand and collapse without changing the current group', async () => {
  await render(<TrainerTodayScreen />);
  expect(screen.queryByText('09:00')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: /Прошло 5 занятий/ }),
  );
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(screen.getByText('Мини-группа')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: /Прошло 5 занятий/ }),
  );
  expect(screen.queryByText('09:00')).toBeNull();
});

test('group participants open with all original attendance unmarked', async () => {
  await render(<TrainerTodayScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: /Участники мини-группы/ }),
  );
  expect(screen.getByText('Алия Нурлановa')).toBeTruthy();
  expect(screen.getByText('Мади Касымов')).toBeTruthy();
  expect(screen.getByText('Дана Ержанова')).toBeTruthy();
  expect(screen.getAllByText('Пока не отмечено')).toHaveLength(3);
  expect(
    screen
      .getAllByRole('button', { name: 'Пришёл' })
      .every((button) => button.props.accessibilityState.disabled),
  ).toBe(true);
});

test('empty and loading omit bookings, offline preserves cached day', async () => {
  const view = await render(<TrainerTodayScreen scenario="empty" />);
  expect(screen.getByText('Сегодня занятий нет')).toBeTruthy();
  expect(screen.queryByText('Мини-группа')).toBeNull();
  await view.rerender(<TrainerTodayScreen scenario="loading" />);
  expect(screen.getByTestId('trainer-today-loading')).toBeTruthy();
  expect(screen.queryByText('Сегодня занятий нет')).toBeNull();
  await view.rerender(<TrainerTodayScreen scenario="offline" />);
  expect(
    screen.getByText(
      'Нет связи. Показано из последней загрузки, изменения могут быть не отправлены.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Мини-группа')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Создать занятие' }).props
      .accessibilityState.disabled,
  ).toBe(true);
});

test('current group starts the canonical group journal', async () => {
  await render(<TrainerTodayScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Начать тренировку' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/session/[id]',
    params: { id: 's6' },
  });
});

test.each([
  ['s1', 'Дана', '09:00–10:00'],
  ['s7', 'Айгерим', '21:15–22:00'],
])(
  'session details open the canonical %s journal offline',
  async (id, name, time) => {
    await render(<TrainerTodayScreen scenario="offline" />);
    if (id === 's1')
      await fireEvent.press(
        screen.getByRole('button', { name: /Прошло 5 занятий/ }),
      );
    await fireEvent.press(
      screen.getByRole('button', { name: `Занятие ${name}, ${time}` }),
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Начать тренировку' })[1]!,
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session/[id]',
      params: { id },
    });
    expect(screen.queryByText('Посещение и списание')).toBeNull();
  },
);
