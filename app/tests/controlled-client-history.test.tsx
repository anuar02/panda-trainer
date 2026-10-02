import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  ClientHistoryScreen,
  type ClientHistoryData,
} from '../src/features/client-history/client-history-screen';
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});
const data: ClientHistoryData = {
  trainerName: 'Own trainer',
  timezone: 'Pacific/Kiritimati',
  rows: [
    {
      id: 'finished-own',
      date: '2030-10-02',
      start: '10:03',
      exercises: [
        {
          id: 'snapshot',
          name: 'Historical squat',
          measure: 'reps',
          bodyweight: false,
          skipped: false,
          replaced: false,
          sets: [
            {
              id: 'set-0',
              position: 0,
              reps: 0,
              seconds: null,
              weightGrams: 0,
            },
            {
              id: 'set-1',
              position: 1,
              reps: null,
              seconds: null,
              weightGrams: null,
            },
          ],
        },
      ],
      notes: [{ id: 'public', text: 'Shared historical note' }],
    },
  ],
};
test('finished own history omits billing and unproved group/program/attendance labels', async () => {
  await render(<ClientHistoryScreen data={data} />);
  expect(screen.getByText('Own trainer')).toBeTruthy();
  expect(screen.getByText('окт')).toBeTruthy();
  expect(screen.getByText('10:03')).toBeTruthy();
  expect(screen.getByText(/Shared historical note/)).toBeTruthy();
  expect(screen.queryByText('Списания и возвраты')).toBeNull();
  expect(screen.queryByText('Проведённое занятие')).toBeNull();
  expect(screen.queryByText('Индивидуальное занятие')).toBeNull();
  expect(screen.queryByText('Низ А')).toBeNull();
  expect(screen.queryByText('Данияр')).toBeNull();
});
test('readonly journal detail uses actual zero/null values and historical snapshots', async () => {
  await render(<ClientHistoryScreen data={data} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  expect(screen.getByText('Historical squat')).toBeTruthy();
  expect(screen.getByText('0 повт.')).toBeTruthy();
  expect(screen.getByText('0 кг')).toBeTruthy();
  expect(screen.getByText('Повторы не записаны')).toBeTruthy();
  expect(screen.getByText('Вес не записан')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
});
test('loading and empty controlled state remove stale journal detail and default demo rows', async () => {
  const view = await render(<ClientHistoryScreen data={data} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'ср, 2 окт · 10:03' }),
  );
  await view.rerender(
    <ClientHistoryScreen data={{ ...data, loading: true, rows: [] }} />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('Historical squat')).toBeNull();
  await view.rerender(<ClientHistoryScreen data={{ ...data, rows: [] }} />);
  expect(screen.getByText('Занятий пока нет')).toBeTruthy();
  expect(screen.queryByText('Списаний пока нет')).toBeNull();
  expect(screen.queryByText('Низ А')).toBeNull();
});
