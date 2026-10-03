import { Dimensions, StyleSheet } from 'react-native';
import { getTodayStyles } from '../src/features/trainer-today/measurements';
import type { PropsWithChildren } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { WorkoutDemoProvider } from '../src/features/workout-demo';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import '../src/lib/i18n';
import {
  createSchedulingState,
  encodeSchedulingState,
} from '../src/domain/scheduling';
import { SchedulingDemoProvider } from '../src/features/scheduling-demo/provider';
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
  ).toBe(false);
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

test('create actions navigate with the canonical date and free-slot time', async () => {
  const view = await render(<TrainerTodayScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Создать занятие' }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/new',
    params: { date: '2026-09-14' },
  });
  await fireEvent.press(
    screen.getByRole('button', { name: /Свободно · 15 мин/ }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/new',
    params: { date: '2026-09-14', start: '21:00' },
  });
  await view.rerender(<TrainerTodayScreen scenario="empty" />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Добавить занятие' }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/new',
    params: { date: '2026-09-14' },
  });
});

test('shared state removes moved appointments and displays newly created entries', async () => {
  const state = createSchedulingState();
  state.sessions.find((session) => session.id === 's7')!.date = '2026-09-15';
  state.sessions.push({
    id: 'created',
    revision: 0,
    date: '2026-09-14',
    start: '22:15',
    end: '23:00',
    kind: 'personal',
    title: 'Айгерим Бекова',
    clientId: 'c1',
    program: null,
    status: 'proposed',
    participants: [{ clientId: 'c1', reply: 'pending', program: null }],
  });
  const storage = {
    getItem: async () => encodeSchedulingState(state),
    setItem: async () => {},
  };
  await render(
    <SchedulingDemoProvider storage={storage}>
      <TrainerTodayScreen />
    </SchedulingDemoProvider>,
  );
  await waitFor(() => expect(screen.getByText('22:15')).toBeTruthy());
  expect(screen.queryByText('21:15')).toBeNull();
  expect(screen.getByText('Последнее занятие до 23:00')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Занятие Айгерим Бекова, 22:15–23:00' }),
  );
  expect(
    screen.getByRole('button', { name: 'Перенести занятие' }),
  ).toBeTruthy();
});

test('request action opens the shared inbox', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} };
  await render(
    <SchedulingDemoProvider storage={storage}>
      <TrainerTodayScreen />
    </SchedulingDemoProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '2 запроса' })).toBeEnabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: '2 запроса' }));
  expect(mockPush).toHaveBeenCalledWith('/inbox');
});

test.each([1.34, 2])(
  'Today keeps sessions and group controls at fontScale %s',
  async (fontScale) => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    await act(async () =>
      Dimensions.set({
        window: { ...originalWindow, width: 390, height: 844, fontScale },
        screen: { ...originalScreen, width: 390, height: 844, fontScale },
      }),
    );
    try {
      await render(<TrainerTodayScreen />);
      const styles = getTodayStyles(fontScale, 390);
      expect(styles.row.flexDirection).toBe('column');
      expect(StyleSheet.flatten(styles.badge).height).toBeUndefined();
      expect(screen.getByText('Мини-группа')).toBeTruthy();
      await fireEvent.press(
        screen.getByRole('button', { name: /Прошло 5 занятий/ }),
      );
      expect(screen.getByText('09:00')).toBeTruthy();
      await fireEvent.press(
        screen.getByRole('button', { name: /Участники мини-группы/ }),
      );
      expect(screen.getByText('Дана Ержанова')).toBeTruthy();
    } finally {
      await act(async () =>
        Dimensions.set({ window: originalWindow, screen: originalScreen }),
      );
    }
  },
);
