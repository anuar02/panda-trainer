import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import '../src/lib/i18n';
import {
  ClientHomeScreen,
  type ClientHomeData,
} from '../src/features/client-home/client-home-screen';
import { router } from 'expo-router';
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
const selected = jest.fn(),
  preview = jest.fn();
const data: ClientHomeData = {
  clientName: 'Настоящий клиент',
  trainerName: 'Настоящий тренер',
  timezone: 'Pacific/Kiritimati',
  bookings: [
    {
      id: 'own-1',
      date: '2030-10-02',
      start: '10:00',
      end: '11:00',
      today: true,
      programName: 'Сохранённая программа',
      group: true,
      status: 'proposed',
    },
    {
      id: 'own-2',
      date: '2030-10-03',
      start: '12:00',
      end: '13:00',
      today: false,
      programName: null,
      group: false,
      status: 'confirmed',
    },
  ],
  onSelectBooking: selected,
  onProgramPreview: preview,
  requests: <Text>Запрос вне текущей недели</Text>,
  renderActions: (row) => <Text>{`Действия ${row.id}`}</Text>,
};
beforeEach(() => {
  selected.mockClear();
  preview.mockClear();
  jest.mocked(router.push).mockClear();
});
test('renders supplied names and sessions without demo billing/history and dispatches exact rows', async () => {
  await render(<ClientHomeScreen data={data} />);
  expect(screen.getByText('Привет, Настоящий клиент')).toBeTruthy();
  expect(screen.getByText('Настоящий тренер')).toBeTruthy();
  expect(screen.getByText('Сохранённая программа')).toBeTruthy();
  expect(screen.getByText('Занятие в мини-группе')).toBeTruthy();
  expect(screen.getByText('Действия own-1')).toBeTruthy();
  expect(screen.getByText('Запрос вне текущей недели')).toBeTruthy();
  expect(screen.queryByText('Остаток пакета')).toBeNull();
  expect(screen.queryByRole('button', { name: 'История занятий' })).toBeNull();
  expect(screen.queryByText('Привет, Айгерим')).toBeNull();
  await fireEvent.press(screen.getByTestId('home-upcoming-own-2'));
  expect(selected).toHaveBeenCalledWith(data.bookings[1]);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Сохранённая программа' }),
  );
  expect(preview).toHaveBeenCalledWith(data.bookings[0]);
  expect(router.push).not.toHaveBeenCalled();
});
test('loading and empty preserve supplied recovery requests without leaked demo sessions', async () => {
  const view = await render(
    <ClientHomeScreen data={{ ...data, loading: true, bookings: [] }} />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.getByText('Запрос вне текущей недели')).toBeTruthy();
  expect(screen.queryByText('21:15–22:00')).toBeNull();
  await view.rerender(<ClientHomeScreen data={{ ...data, bookings: [] }} />);
  expect(screen.getByText('Записей нет')).toBeTruthy();
  expect(screen.getByText('Привет, Настоящий клиент')).toBeTruthy();
  expect(screen.getByText('Запрос вне текущей недели')).toBeTruthy();
});
test('date keys stay on their supplied calendar date in UTC+14', async () => {
  await render(<ClientHomeScreen data={data} />);
  expect(screen.getByText('ср, 2 окт')).toBeTruthy();
});
