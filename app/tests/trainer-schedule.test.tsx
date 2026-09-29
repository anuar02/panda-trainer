import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { TrainerScheduleScreen } from '../src/features/trainer-schedule/trainer-schedule-screen';
import {
  agendaClusters,
  scheduleSessions,
  shiftDate,
  weekDates,
} from '../src/features/trainer-schedule/demo';

jest.mock('react-native-safe-area-context', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

test('selected day, adjacent weeks and today preserve the demo calendar', async () => {
  await render(<TrainerScheduleScreen />);
  expect(screen.getByText('7 занятий · 6 ч 45 мин занятий')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('schedule-date-2026-09-15'));
  expect(screen.getByText('Вторник, 15 сентября')).toBeTruthy();
  expect(screen.getByText('Предложено 16 сен, 11:30')).toBeTruthy();
  expect(screen.queryByText('09:00')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Следующая неделя' }),
  );
  expect(screen.getByText('Вторник, 22 сентября')).toBeTruthy();
  expect(screen.getByText('День свободен')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Предыдущая неделя' }),
  );
  expect(screen.getByText('Вторник, 15 сентября')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Сегодня' }));
  expect(screen.getByText('Понедельник, 14 сентября')).toBeTruthy();
  expect(screen.getByText('Пересечение · 2 занятия')).toBeTruthy();
});

test('empty and loading hide bookings while offline retains the cached agenda', async () => {
  const view = await render(<TrainerScheduleScreen scenario="empty" />);
  expect(screen.getByText('День свободен')).toBeTruthy();
  expect(screen.queryByText('09:00')).toBeNull();
  await view.rerender(<TrainerScheduleScreen scenario="loading" />);
  expect(screen.getByText('Загружаем расписание…')).toBeTruthy();
  expect(screen.queryByText('День свободен')).toBeNull();
  expect(screen.queryByText('09:00')).toBeNull();
  await view.rerender(<TrainerScheduleScreen scenario="offline" />);
  expect(
    screen.getByText('Нет связи. Показано сохранённое расписание.'),
  ).toBeTruthy();
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Добавить занятие на выбранный день' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Дана, 09:00–10:00. Открыть занятие' }),
  ).toBeDisabled();
});

test('calendar arithmetic crosses year boundaries and overlapping bookings occupy one cluster', () => {
  expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  expect(weekDates('2027-01-01')).toEqual([
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ]);
  const clusters = agendaClusters(
    scheduleSessions.filter((session) => session.date === '2026-09-14'),
  );
  expect(
    clusters.map((cluster) => cluster.sessions.map((session) => session.id)),
  ).toEqual([['s1'], ['s2'], ['s3'], ['s4', 's5'], ['s6'], ['s7']]);
  expect(clusters[3]?.end).toBe(19 * 60 + 30);
});
