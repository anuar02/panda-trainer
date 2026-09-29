import { render, screen } from '@testing-library/react-native';
import { i18n } from '../src/lib/i18n';
import { ClientProgressScreen } from '../src/features/client-progress/client-progress-screen';
import { clientProgress } from '../src/features/client-progress/ru';

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

beforeAll(() => {
  i18n.addResourceBundle('ru', 'translation', { clientProgress }, true, true);
});

test('canonical progress does not fabricate completed journals or attendance', async () => {
  await render(<ClientProgressScreen />);
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  expect(screen.getByText('Посещения за неделю')).toBeTruthy();
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  expect(
    screen.getByLabelText('пн, 14 сен: нет отметки посещения'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('вс, 20 сен: нет отметки посещения'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Уведомления' })).toBeDisabled();
});

test('empty and offline preserve the canonical unrecorded week, loading hides it', async () => {
  const view = await render(<ClientProgressScreen scenario="empty" />);
  expect(screen.getAllByLabelText(/нет отметки посещения/)).toHaveLength(7);
  await view.rerender(<ClientProgressScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByText('Первые результаты — впереди')).toBeTruthy();
  await view.rerender(<ClientProgressScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Первые результаты — впереди')).toBeNull();
  expect(screen.queryByText('Посещения за неделю')).toBeNull();
});
