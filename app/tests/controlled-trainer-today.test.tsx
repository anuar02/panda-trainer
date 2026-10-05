import { StyleSheet } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ThemeProvider } from '../src/ui/theme';
import tokens from '../src/ui/tokens.json';
import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  TrainerTodayScreen,
  type TrainerTodayData,
  calmStyles,
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
  participants: [{ id, name, status: 'confirmed' }],
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
  participants: [
    { id: 'anna', name: 'Real Anna', status: 'confirmed' },
    { id: 'dana', name: 'Real Dana', status: 'pending' },
  ],
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
    focusRow: current,
    requests: [],
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
  expect(screen.getByText('Сегодня')).toBeTruthy();
  expect(screen.queryByText('Доброе утро, Real trainer')).toBeNull();
  expect(screen.getByText('ср, 2 окт')).toBeTruthy();
  expect(screen.queryByText('ср, 2 окт · 11:30')).toBeNull();
  expect(screen.getByText('Real Anna')).toBeTruthy();
  expect(screen.getByText(/Real Dana/)).toBeTruthy();
  expect(screen.queryByText('Real past')).toBeNull();
  expect(screen.queryByText('Журнал в работе')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Начать тренировку' }),
  );
  expect(onSelect).toHaveBeenCalledWith(current);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Занятие Real group, 11:00–12:00' }),
  );
  expect(onSelect).toHaveBeenCalledWith(current);
  expect(screen.queryByText('Посещение и списание')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Входящие: 3 запроса требуют ответа' }),
  );
  expect(onRequests).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('Свободно · 1 ч'));
  expect(onCreate).toHaveBeenCalledWith('2030-10-02', '12:00');
  await fireEvent.press(screen.getByText('Показать'));
  expect(screen.getByText('Real past')).toBeTruthy();
  expect(screen.getByText('Дальше')).toBeTruthy();
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
  expect(screen.getByText('Пересечение · 15 мин')).toBeTruthy();
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
          focusRow: null,
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
      focusRow: null,
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

test('each supplied session is rendered once across focus, timeline and expanded past', async () => {
  await render(<TrainerTodayScreen data={data} />);
  for (const session of [current, future]) {
    expect(
      screen.getAllByRole('button', {
        name: `Занятие ${session.name}, ${session.start}–${session.end}`,
      }),
    ).toHaveLength(1);
  }
  await fireEvent.press(screen.getByText('Показать'));
  for (const session of [past, current, future]) {
    expect(
      screen.getAllByRole('button', {
        name: `Занятие ${session.name}, ${session.start}–${session.end}`,
      }),
    ).toHaveLength(1);
  }
});

test('zero pending requests has no count badge and no replies section', async () => {
  await render(
    <TrainerTodayScreen
      data={{ ...data, agenda: { ...data.agenda, pendingRequestCount: 0 } }}
    />,
  );
  expect(
    screen.getByRole('button', {
      name: 'Входящие: нет запросов, требующих ответа',
    }),
  ).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.queryByText('0 запросов')).toBeNull();
  expect(screen.queryByText('Нужен ответ')).toBeNull();
});

test('all sessions behind keeps the collapsed past and omits focus', async () => {
  await render(
    <TrainerTodayScreen
      data={{
        ...data,
        agenda: {
          ...data.agenda,
          rows: [past],
          focusRow: null,
          pastRows: [past],
          items: [],
          pendingRequestCount: 0,
        },
      }}
    />,
  );
  expect(screen.queryByText('Real past')).toBeNull();
  expect(screen.queryByText('Сейчас')).toBeNull();
  expect(screen.queryByText('Следующее')).toBeNull();
  await fireEvent.press(screen.getByText('Показать'));
  expect(screen.getByText('Real past')).toBeTruthy();
});

test('next focus is displayed once when there is no current session', async () => {
  await render(
    <TrainerTodayScreen
      data={{
        ...data,
        agenda: {
          ...data.agenda,
          rows: [future],
          focusRow: future,
          pastRows: [],
          items: [{ kind: 'session', row: future }],
          pendingRequestCount: 0,
        },
      }}
    />,
  );
  expect(
    screen.getAllByRole('button', { name: 'Занятие Real future, 13:00–14:00' }),
  ).toHaveLength(1);
  expect(screen.getByText(/Следующее/)).toBeTruthy();
  expect(screen.queryByText(/Сейчас/)).toBeNull();
});

test('each pending request appears once and opens its own response sheet', async () => {
  const onSelectRequest = jest.fn();
  const requests = [
    {
      id: 'request-a',
      sessionId: 's6',
      name: 'Real Anna',
      fromDate: '2030-10-02',
      fromStart: '11:00',
      toDate: '2030-10-03',
      toStart: '15:00',
    },
    {
      id: 'request-b',
      sessionId: 'other-day',
      name: 'Other day client',
      fromDate: '2030-10-04',
      fromStart: '09:00',
      toDate: '2030-10-05',
      toStart: '12:00',
    },
  ];
  await render(
    <TrainerTodayScreen
      data={{
        ...data,
        onSelectRequest,
        agenda: {
          ...data.agenda,
          requests,
          pendingRequestCount: requests.length,
        },
      }}
    />,
  );
  expect(screen.getByText('Нужен ответ')).toBeTruthy();
  expect(screen.getAllByText('Ответить')).toHaveLength(2);
  const buttons = requests.map((request) =>
    screen.getByTestId(`today-request-${request.id}`),
  );
  expect(buttons).toHaveLength(2);
  for (const [index, request] of requests.entries()) {
    await fireEvent.press(buttons[index]!);
    expect(onSelectRequest).toHaveBeenLastCalledWith(request.id);
  }
  expect(onRequests).not.toHaveBeenCalled();
});

function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels.reduce(
    (sum, channel, index) =>
      sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
    0,
  );
}

test.each(['light', 'dark'] as const)(
  'calm focus follows %s geometry and readable foregrounds',
  async (scheme) => {
    await render(
      <ThemeProvider role={scheme === 'dark' ? 'trainer' : 'client'}>
        <TrainerTodayScreen data={data} />
      </ThemeProvider>,
    );
    const spec = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          `../../prototype-fresh/review/parity/spec-${scheme}.json`,
        ),
        'utf8',
      ),
    ) as { classes: Record<string, Record<string, string>> };
    const focusStyle = StyleSheet.flatten(
      screen.getByTestId('today-session-s6').props.style,
    );
    expect(`${focusStyle.padding}px`).toBe(
      spec.classes['today-focus']?.['padding-top'],
    );
    expect(`${focusStyle.borderRadius}px`).toBe(
      spec.classes['today-focus']?.['border-radius'],
    );
    const titleStyle = StyleSheet.flatten(
      screen.getByText('Сегодня').props.style,
    );
    expect(`${titleStyle.fontSize}px`).toBe(
      spec.classes['today-head__title']?.['font-size'],
    );
    expect(
      (StyleSheet.flatten(calmStyles.title) as import('react-native').TextStyle)
        .fontFamily,
    ).toBe(tokens.font.heading);
    expect(
      `${(StyleSheet.flatten(calmStyles.title) as import('react-native').TextStyle).lineHeight}px`,
    ).toBe(spec.classes['today-head__title']?.['line-height']);
    expect(`${calmStyles.title.letterSpacing}px`).toBe(
      spec.classes['today-head__title']?.['letter-spacing'],
    );
    expect(
      (
        StyleSheet.flatten(
          calmStyles.focusTime,
        ) as import('react-native').TextStyle
      ).fontFamily,
    ).toBe(tokens.font.heading);
    expect(`${calmStyles.focusTime.fontSize}px`).toBe(
      spec.classes['today-focus__time']?.['font-size'],
    );
    expect(
      `${(StyleSheet.flatten(calmStyles.focusTime) as import('react-native').TextStyle).lineHeight}px`,
    ).toBe(spec.classes['today-focus__time']?.['line-height']);

    const eyebrowStyle = StyleSheet.flatten(
      screen.getByText(/Сейчас ·/).props.style,
    );
    const dateStyle = StyleSheet.flatten(
      screen.getByText('ср, 2 окт').props.style,
    );
    expect(dateStyle.color).toBe(tokens.colors[scheme].secondary);
    for (const [foreground, background] of [
      [eyebrowStyle.color, tokens.colors[scheme].surface],
      [dateStyle.color, tokens.colors[scheme].canvas],
    ]) {
      const x = luminance(foreground);
      const y = luminance(background);
      expect(
        (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
  },
);
