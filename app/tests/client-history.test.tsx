import type { PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientHistoryScreen } from '../src/features/client-history/client-history-screen';
import { createWorkoutState, workoutReducer } from '../src/domain/workout';
import { useOptionalWorkoutDemo } from '../src/features/workout-demo';

jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('../src/features/workout-demo', () => ({
  useOptionalWorkoutDemo: jest.fn(() => null),
}));

beforeEach(() => jest.mocked(useOptionalWorkoutDemo).mockReturnValue(null));

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('keeps attendance independent from package charges in the canonical history', async () => {
  await render(<ClientHistoryScreen />);
  expect(screen.getByText('Низ А')).toBeTruthy();
  expect(screen.getByText('Нет отметки')).toBeTruthy();
  expect(screen.queryByText('Посещение')).toBeNull();
  expect(screen.getAllByText('Проведённое занятие')).toHaveLength(2);
  expect(screen.getByText('9 сен')).toBeTruthy();
  expect(screen.getByText('2 сен')).toBeTruthy();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Уведомления' })).toBeDisabled();
});

test('empty and loading states do not expose stale history or charges', async () => {
  const view = await render(<ClientHistoryScreen scenario="empty" />);
  expect(screen.getByText('Занятий пока нет')).toBeTruthy();
  expect(screen.getByText('Списаний пока нет')).toBeTruthy();
  expect(screen.queryByText('Низ А')).toBeNull();
  expect(screen.queryByText('Проведённое занятие')).toBeNull();
  await view.rerender(<ClientHistoryScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('История')).toBeNull();
  expect(screen.queryByText('Занятий пока нет')).toBeNull();
});

test('offline history preserves saved entries with the canonical notice', async () => {
  await render(<ClientHistoryScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByText('Низ А')).toBeTruthy();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
});

test('only finished journals expose this client’s shared notes without changing charges', async () => {
  let state = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's4',
  });
  state = workoutReducer(state, {
    type: 'addNote',
    clientId: 'c1',
    text: 'Для Айгерим',
    at: '19:00',
  });
  state = workoutReducer(state, {
    type: 'shareNote',
    clientId: 'c1',
    index: 0,
  });
  state = workoutReducer(state, {
    type: 'addNote',
    clientId: 'c1',
    text: 'Приватная заметка',
    at: '19:01',
  });
  const demo = {
    state,
    hydrated: true,
    readError: false,
    storageStatus: 'saved' as const,
    dispatch: jest.fn(),
    retrySave: jest.fn(),
  };
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue(demo);
  const view = await render(<ClientHistoryScreen />);
  expect(screen.queryByText(/Для Айгерим/)).toBeNull();
  state = workoutReducer(state, { type: 'finish' });
  state = workoutReducer(state, { type: 'confirmPartial' });
  state = workoutReducer(state, { type: 'open', sessionId: 's1' });
  state = workoutReducer(state, {
    type: 'addNote',
    clientId: 'c5',
    text: 'Для Даны',
    at: '10:00',
  });
  state = workoutReducer(state, {
    type: 'shareNote',
    clientId: 'c5',
    index: 0,
  });
  state = workoutReducer(state, { type: 'finish' });
  state = workoutReducer(state, { type: 'confirmPartial' });
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue({ ...demo, state });
  await view.rerender(<ClientHistoryScreen scenario="offline" />);
  expect(screen.getByText(/Для Айгерим/)).toBeTruthy();
  expect(screen.queryByText(/Приватная заметка|Для Даны/)).toBeNull();
  expect(screen.getByText('Журнал завершён')).toBeTruthy();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
  expect(screen.queryByText('Посещение')).toBeNull();
  await view.rerender(<ClientHistoryScreen scenario="empty" />);
  expect(screen.queryByText(/Для Айгерим/)).toBeNull();
  expect(screen.getByText('Занятий пока нет')).toBeTruthy();
});

test('finished later client sessions join history without attendance or charges being inferred', async () => {
  let state = workoutReducer(createWorkoutState(), {
    type: 'open',
    sessionId: 's7',
  });
  const demo = {
    state,
    hydrated: true,
    readError: false,
    storageStatus: 'saved' as const,
    dispatch: jest.fn(),
    retrySave: jest.fn(),
  };
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue(demo);
  const view = await render(<ClientHistoryScreen />);
  expect(screen.queryByText('Без программы')).toBeNull();
  state = workoutReducer(state, { type: 'finish' });
  state = workoutReducer(state, { type: 'confirmPartial' });
  jest.mocked(useOptionalWorkoutDemo).mockReturnValue({ ...demo, state });
  await view.rerender(<ClientHistoryScreen />);
  expect(screen.getByText('Без программы')).toBeTruthy();
  expect(screen.getByText('21:15')).toBeTruthy();
  expect(screen.getByText('Журнал завершён')).toBeTruthy();
  expect(screen.getByText('Нет отметки')).toBeTruthy();
  expect(screen.getAllByLabelText('Списание: 1')).toHaveLength(2);
  jest
    .mocked(useOptionalWorkoutDemo)
    .mockReturnValue({ ...demo, state, hydrated: false });
  await view.rerender(<ClientHistoryScreen />);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  expect(screen.queryByText('Без программы')).toBeNull();
});
