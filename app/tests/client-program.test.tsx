import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import '../src/lib/i18n';
import { ClientProgramScreen } from '../src/features/client-program/client-program-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('opens local exercise detail with its actual previous result and record', async () => {
  await render(<ClientProgramScreen />);
  expect(screen.getByText('чт, 17 сен · 18:00–19:00')).toBeTruthy();
  expect(screen.getByText('План: 4 × 8 · 80 кг')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Румынская тяга' }));
  expect(screen.getByText('60 кг × 10')).toBeTruthy();
  expect(screen.getByText('75 кг')).toBeTruthy();
  expect(screen.getByText('Как выполнять')).toBeTruthy();
});

test('bodyweight timed exercise has seconds and no fabricated weight or record', async () => {
  await render(<ClientProgramScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Планка' }));
  expect(screen.getByText('45 сек')).toBeTruthy();
  expect(screen.queryByText('Личный рекорд')).toBeNull();
  expect(screen.queryByText('0 кг')).toBeNull();
});

test('empty state links to home and loading hides program', async () => {
  const view = await render(<ClientProgramScreen scenario="empty" />);
  expect(screen.getByText('Программа появится здесь')).toBeTruthy();
  expect(screen.queryByText('Низ А')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Посмотреть расписание' }),
  );
  expect(router.push).toHaveBeenCalledWith('/(client)/home');
  await view.rerender(<ClientProgramScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Программа')).toBeNull();
});

test('offline preserves readable program and notifications are explicitly disabled', async () => {
  await render(<ClientProgramScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Уведомления' })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Приседания со штангой' }),
  );
  expect(screen.getByText('Как выполнять')).toBeTruthy();
  expect(screen.getByText('100 кг')).toBeTruthy();
});
