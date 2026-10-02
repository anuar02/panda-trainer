import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  TrainerTodayScreen,
  type TrainerTodayData,
} from '../src/features/trainer-today/trainer-today-screen';
import type { TrainerTodaySessionRow } from '../src/features/workspace-scheduling/today-adapter';
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const row = (
  id: string,
  name: string,
  start: string,
  end: string,
  extra: Partial<TrainerTodaySessionRow> = {},
): TrainerTodaySessionRow => ({
  id,
  name,
  start,
  end,
  groupSessionId: null,
  participantNames: [name],
  programName: 'Server saved program',
  startsAtUtc: `2030-10-02T${start}:00.000Z`,
  endsAtUtc: `2030-10-02T${end}:00.000Z`,
  durationMinutes: 60,
  role: null,
  past: false,
  cancelled: false,
  replies: { confirmed: 1, pending: 0, cancelled: 0 },
  pendingProposalIds: [],
  ...extra,
});
const past = row('past', 'Real past', '09:00', '10:00', { past: true });
const current = row('s6', 'Real group', '11:00', '12:00', {
  groupSessionId: 'server-group',
  participantNames: ['Real Anna', 'Real Dana'],
  replies: { confirmed: 1, pending: 1, cancelled: 2 },
  role: 'now',
  pendingProposalIds: ['proposal'],
});
const future = row('future', 'Real future', '13:00', '14:00', { role: 'next' });
const onSelect = jest.fn();
const onCreate = jest.fn();
const onRequests = jest.fn();
const onOverlap = jest.fn();
const data: TrainerTodayData = {
  trainerName: 'Real trainer',
  timezone: 'UTC',
  dateLabel: 'ср, 2 окт',
  clockLabel: '11:30',
  agenda: {
    date: '2030-10-02',
    clock: '11:30',
    rows: [past, current, future],
    pastRows: [past],
    items: [
      { kind: 'session', row: current },
      {
        kind: 'gap',
        start: '12:00',
        end: '13:00',
        startsAtUtc: '2030-10-02T12:00:00.000Z',
        endsAtUtc: '2030-10-02T13:00:00.000Z',
        durationMinutes: 60,
      },
      { kind: 'session', row: future },
    ],
    pendingRequestCount: 3,
    summary: { total: 3, past: 1, current: 1, future: 1, progressPercent: 33 },
    endTime: '14:00',
  },
  onSelectSession: onSelect,
  onCreate,
  onOpenRequests: onRequests,
  onOpenOverlap: onOverlap,
};
beforeEach(() => {
  onSelect.mockReset();
  onCreate.mockReset();
  onRequests.mockReset();
  onOverlap.mockReset();
  mockPush.mockReset();
});

test('controlled Today displays supplied labels, reply counts and collapsed past without demo journals or navigation', async () => {
  await render(<TrainerTodayScreen data={data} />);
  expect(screen.getByText('Доброе утро, Real trainer')).toBeTruthy();
  expect(screen.getByText('ср, 2 окт · 11:30')).toBeTruthy();
  expect(screen.getByText('Real Anna, Real Dana')).toBeTruthy();
  expect(screen.queryByText('Real past')).toBeNull();
  expect(screen.queryByText('Журнал в работе')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Начать тренировку' }),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Занятие Real group, 11:00–12:00' }),
  );
  expect(onSelect).toHaveBeenCalledWith(current);
  expect(screen.queryByText('Посещение и списание')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Входящие: 3 запроса требуют ответа' }),
  );
  await fireEvent.press(screen.getByText('Перенос · ответить'));
  expect(onRequests).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByText('Свободно · 60 мин'));
  expect(onCreate).toHaveBeenCalledWith('2030-10-02', '12:00');
  await fireEvent.press(screen.getByText('Показать'));
  expect(screen.getByText('Real past')).toBeTruthy();
  expect(screen.getByText('Следующая тренировка')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

test('supplied overlap has its UTC duration and opens controlled details rather than requests', async () => {
  const overlap = {
    kind: 'overlap' as const,
    startsAtUtc: '2030-10-02T11:15:00.000Z',
    endsAtUtc: '2030-10-02T11:30:00.000Z',
    durationMinutes: 15,
  };
  await render(
    <TrainerTodayScreen
      data={{
        ...data,
        agenda: {
          ...data.agenda,
          items: [
            { kind: 'session', row: current },
            overlap,
            { kind: 'session', row: future },
          ],
        },
      }}
    />,
  );
  await fireEvent.press(screen.getByText('Пересечение · 15 мин'));
  expect(onOverlap).toHaveBeenCalledWith(overlap);
  expect(onRequests).not.toHaveBeenCalled();
  expect(screen.getByText('11:15–11:30 · отдельные занятия')).toBeTruthy();
});

test('canceled rows remain collapsed and show cancellation without made-up attendance', async () => {
  const canceled = { ...past, cancelled: true };
  await render(
    <TrainerTodayScreen
      data={{
        ...data,
        agenda: {
          ...data.agenda,
          rows: [canceled],
          pastRows: [canceled],
          items: [],
          summary: {
            total: 0,
            past: 0,
            current: 0,
            future: 0,
            progressPercent: 0,
          },
          endTime: null,
        },
      }}
    />,
  );
  await fireEvent.press(screen.getByText('Показать'));
  expect(screen.getByText('Отменено')).toBeTruthy();
  expect(screen.queryByText('время прошло')).toBeNull();
  expect(screen.queryByText('Последнее занятие до ')).toBeNull();
});

test('real empty and loading states omit the demo agenda and honor disabled creation', async () => {
  const empty = {
    ...data,
    createDisabled: true,
    agenda: {
      ...data.agenda,
      rows: [],
      pastRows: [],
      items: [],
      summary: { total: 0, past: 0, current: 0, future: 0, progressPercent: 0 },
      endTime: null,
    },
  };
  const view = await render(<TrainerTodayScreen data={empty} />);
  expect(
    screen.getByRole('button', { name: 'Создать занятие' }),
  ).toBeDisabled();
  expect(screen.queryByText('Real group')).toBeNull();
  await view.rerender(<TrainerTodayScreen data={data} scenario="loading" />);
  expect(screen.queryByText('Real group')).toBeNull();
  expect(screen.queryByText('Мини-группа')).toBeNull();
});
