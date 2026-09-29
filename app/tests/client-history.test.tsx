import { render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientHistoryScreen } from '../src/features/client-history/client-history-screen';

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
