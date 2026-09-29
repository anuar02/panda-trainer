import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import '../src/lib/i18n';
import {
  ClientProfileScreen,
  TrainerProfileScreen,
} from '../src/features/profiles/profile-screens';
import { ThemeProvider } from '../src/ui/theme';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('trainer profile routes to library and exposes unavailable destinations', async () => {
  await render(<TrainerProfileScreen />);
  expect(screen.getByText('Данияр Сериков')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Библиотека и шаблоны' }),
  );
  expect(router.push).toHaveBeenCalledWith('/(trainer)/library');
  expect(screen.getByRole('button', { name: 'Мои упражнения' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Пакеты и оплаты' }),
  ).toBeDisabled();
});

test('theme selection updates the actual shared theme preference', async () => {
  await render(
    <ThemeProvider role="trainer">
      <TrainerProfileScreen />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Светлая' }));
  expect(
    screen.getByRole('button', { name: 'Светлая', selected: true }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'По роли', selected: false }),
  ).toBeTruthy();
});

test('client empty package retains personal details and hides payment', async () => {
  await render(<ClientProfileScreen scenario="empty" />);
  expect(screen.getByText('Пакета пока нет')).toBeTruthy();
  expect(screen.getByText('+7 701 214 88 03')).toBeTruthy();
  expect(screen.queryByText('40 000 ₸')).toBeNull();
});

test('client loading hides personal content and offline retains saved profile', async () => {
  const view = await render(<ClientProfileScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Айгерим Бекова')).toBeNull();
  await view.rerender(<ClientProfileScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByText('Айгерим Бекова')).toBeTruthy();
  expect(screen.getByText('40 000 ₸')).toBeTruthy();
});

test('trainer scenarios retain prototype profile content', async () => {
  const view = await render(<TrainerProfileScreen scenario="loading" />);
  expect(screen.getByText('занятий сегодня')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  await view.rerender(<TrainerProfileScreen scenario="empty" />);
  expect(screen.getByText('6')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Сменить роль' }));
  expect(router.replace).toHaveBeenCalledWith('/');
});
