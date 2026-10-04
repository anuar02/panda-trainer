import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientHomeScreen } from '../src/features/client-home/client-home-screen';

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

test('withdraws only the request and preserves the original booking and package', async () => {
  await render(<ClientHomeScreen />);
  expect(screen.getByText('21:15–22:00')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отозвать запрос' }),
  );
  expect(screen.queryByText('Переносы других занятий')).toBeNull();
  expect(screen.getByText('17 сен · 18:00')).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
});

test('cancel requires confirmation and advances to the next booking without spending units', async () => {
  await render(<ClientHomeScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Оставить занятие' }),
  );
  expect(screen.getByText('21:15–22:00')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
  );
  expect(screen.queryByText('21:15–22:00')).toBeNull();
  expect(screen.getByText('Есть перенос')).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить запись' }),
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Отменить запись' })[1]!,
  );
  expect(screen.getByText('Записей нет')).toBeTruthy();
});

test('renders empty and loading without stale bookings', async () => {
  const view = await render(<ClientHomeScreen scenario="empty" />);
  expect(screen.getByText('Записей нет')).toBeTruthy();
  expect(screen.queryByText('Остаток пакета')).toBeNull();
  await view.rerender(<ClientHomeScreen scenario="loading" />);
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Привет, Айгерим')).toBeNull();
});

test('matches prototype-fresh offline local withdrawal while unavailable actions stay disabled', async () => {
  await render(<ClientHomeScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показаны сохранённые данные.'),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Предложить перенос' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Уведомления' }),
  ).not.toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отозвать запрос' }),
  );
  expect(screen.queryByText('Переносы других занятий')).toBeNull();
});
