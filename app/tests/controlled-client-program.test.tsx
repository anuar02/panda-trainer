import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  ClientProgramScreen,
  type ClientProgramData,
} from '../src/features/client-program/client-program-screen';
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
const schedule = jest.fn();
const data: ClientProgramData = {
  trainerName: 'Actual trainer',
  programName: 'Immutable personal plan',
  sessionLabel: '3 окт · 10:00–11:00',
  onSiteLabel: 'Real nearest slot has no plan',
  onOpenSchedule: schedule,
  exercises: [
    {
      id: 'saved-1',
      name: 'Own snapshot exercise',
      sets: 3,
      plannedReps: '8–10',
      plannedSeconds: null,
      weightGrams: 1250,
      restSeconds: 45,
      instructions: ['Own historical instruction'],
      equipment: 'Гантели',
      muscleGroup: 'Ноги',
      bodyweight: false,
      note: 'Public plan note',
    },
  ],
};
beforeEach(() => {
  schedule.mockClear();
  jest.mocked(router.push).mockClear();
});
test('real immutable plan sheet uses snapshot targets and instructions without demo history/media', async () => {
  await render(<ClientProgramScreen data={data} />);
  expect(screen.getByText('Actual trainer')).toBeTruthy();
  expect(screen.getByText('Immutable personal plan')).toBeTruthy();
  expect(screen.getByText('Real nearest slot has no plan')).toBeTruthy();
  expect(screen.getByText('План: 3 × 8–10 · 1,25 кг')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Own snapshot exercise' }),
  );
  expect(screen.getByText('1. Own historical instruction')).toBeTruthy();
  expect(screen.getByText('Public plan note')).toBeTruthy();
  expect(screen.getByText('45 сек')).toBeTruthy();
  expect(screen.getByText('Гантели')).toBeTruthy();
  expect(screen.queryByText('Прошлый раз')).toBeNull();
  expect(screen.queryByText('Личный рекорд')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(router.push).not.toHaveBeenCalled();
});
test('timed ranges, zero weight and missing targets retain true snapshot semantics', async () => {
  await render(
    <ClientProgramScreen
      data={{
        ...data,
        exercises: [
          {
            ...data.exercises[0]!,
            id: 'timer',
            name: 'Own timer',
            plannedReps: null,
            plannedSeconds: '20–30',
            weightGrams: 0,
            instructions: [],
          },
          {
            ...data.exercises[0]!,
            id: 'unset',
            name: 'Own unset',
            plannedReps: null,
            plannedSeconds: null,
            weightGrams: null,
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('План: 3 × 20–30 сек · 0 кг')).toBeTruthy();
  expect(screen.getByText('План: 3 подходов')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Own timer' }));
  expect(
    screen.getByText(
      'Подсказка тренера по этому упражнению пока не добавлена.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Встаньте, ноги на ширине плеч/)).toBeNull();
});
test('controlled loading and empty remove demo and previous selection, schedule callback remains scoped', async () => {
  const view = await render(<ClientProgramScreen data={data} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Own snapshot exercise' }),
  );
  await view.rerender(
    <ClientProgramScreen data={{ ...data, loading: true, exercises: [] }} />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка раздела' }),
  ).toBeTruthy();
  expect(screen.queryByText('1. Own historical instruction')).toBeNull();
  await view.rerender(
    <ClientProgramScreen
      data={{ ...data, programName: null, exercises: [] }}
    />,
  );
  expect(screen.getByText('Программа появится здесь')).toBeTruthy();
  expect(screen.queryByText('Низ А')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Посмотреть расписание' }),
  );
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});
