import type { PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { createWorkoutState, workoutReducer } from '@/domain/workout';
import { createSchedulingState, schedulingToday } from '@/domain/scheduling';
import { WorkoutDemoProvider } from '@/features/workout-demo';
import {
  TrainerTodayScreen,
  type TrainerTodayData,
} from '@/features/trainer-today/trainer-today-screen';
import {
  workspaceTodayAgenda,
  journalTodayAgenda,
} from '@/features/workspace-scheduling/today-adapter';
import type { WorkspaceSchedule } from '@/features/workspace-scheduling/service';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));

const mockServerJournals = {
  finishedIds: new Set<string>(),
  scoped: false,
  failed: false,
  loading: false,
  retry: jest.fn(),
};
jest.mock('../src/features/workspace-scheduling/today-journal-hook', () => ({
  useTodayFinishedBookingIds: () => mockServerJournals,
}));
beforeEach(() => {
  mockServerJournals.finishedIds = new Set();
  mockServerJournals.scoped = false;
  mockServerJournals.failed = false;
  mockServerJournals.retry.mockClear();
});

const schedule: WorkspaceSchedule = {
  availability: {
    id: 'workspace',
    timezone: 'UTC',
    working_days: [0],
    day_start: '08:00',
    day_end: '23:00',
    usual_session_minutes: 60,
  },
  pendingProposals: [],
  bookings: createSchedulingState()
    .sessions.filter((row) => row.date === schedulingToday)
    .map((row) => ({
      id: row.id,
      workspace_id: 'workspace',
      client_record_id: row.clientId ?? row.id,
      group_session_id: null,
      starts_at: `2026-10-05T${row.start}:00Z`,
      ends_at: `2026-10-05T${row.end}:00Z`,
      status: row.status === 'cancelled' ? 'cancelled_by_trainer' : 'confirmed',
      revision: 1,
      client_name: row.title,
      program_name: row.program,
    })),
};
const serverData: TrainerTodayData = {
  trainerName: 'Trainer',
  timezone: 'UTC',
  dateLabel: 'пн, 5 окт',
  clockLabel: '20:30',
  agenda: workspaceTodayAgenda(
    schedule,
    new Date('2026-10-05T20:30:00Z'),
    'Мини-группа',
  ),
  onSelectSession: jest.fn(),
  onCreate: jest.fn(),
  onOpenRequests: jest.fn(),
};
async function show(
  finished: string[],
  data?: TrainerTodayData,
  draft?: string,
) {
  let state = createWorkoutState();
  for (const sessionId of [...finished, ...(draft ? [draft] : [])]) {
    state = workoutReducer(state, { type: 'open', sessionId });
    state.sessions[sessionId]!.finished = finished.includes(sessionId);
  }
  await render(
    <WorkoutDemoProvider
      storage={{
        getItem: async () => JSON.stringify(state),
        setItem: async () => {},
      }}
    >
      <TrainerTodayScreen data={data} />
    </WorkoutDemoProvider>,
  );
}

test.each(['demo', 'server'] as const)(
  '%s completed 20:00 and 21:15 journals leave seven collapsed past rows at 20:30',
  async (mode) => {
    await show(['s6', 's7'], mode === 'server' ? serverData : undefined);
    await waitFor(() =>
      expect(screen.getByText('Все занятия на сегодня позади')).toBeTruthy(),
    );
    expect(screen.queryByText(/Сейчас ·/)).toBeNull();
    expect(screen.queryByText(/Следующее ·/)).toBeNull();
    expect(screen.queryByText('Дальше')).toBeNull();
    expect(screen.queryByText(/^до /)).toBeNull();
    expect(screen.queryByText(/Свободно ·/)).toBeNull();
    expect(screen.queryByTestId('today-session-s6')).toBeNull();
    expect(screen.queryByTestId('today-session-s7')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: /Прошло 7 занятий/ }),
    );
    expect(screen.getAllByTestId('today-session-s6')).toHaveLength(1);
    expect(screen.getAllByTestId('today-session-s7')).toHaveLength(1);
  },
);

test.each(['demo', 'server'] as const)(
  '%s completed current journal moves focus to the next unfinished journal',
  async (mode) => {
    await show(['s6'], mode === 'server' ? serverData : undefined);
    await waitFor(() => expect(screen.getByText(/Следующее ·/)).toBeTruthy());
    expect(screen.queryByText(/Сейчас ·/)).toBeNull();
    expect(screen.getByTestId('today-session-s7')).toBeTruthy();
    expect(screen.queryByTestId('today-session-s6')).toBeNull();
    expect(screen.queryByText('Дальше')).toBeNull();
    expect(screen.queryByText('Все занятия на сегодня позади')).toBeNull();
  },
);

test.each(['demo', 'server'] as const)(
  '%s until reflects the last displayed unfinished timeline row',
  async (mode) => {
    await show(['s7'], mode === 'server' ? serverData : undefined, 's1');
    await waitFor(() =>
      expect(screen.getByTestId('today-session-s1')).toBeTruthy(),
    );
    expect(screen.getByText('Дальше')).toBeTruthy();
    expect(screen.getByText('до 10:00')).toBeTruthy();
    expect(screen.queryByText('до 22:15')).toBeNull();
  },
);

test('unfinished elapsed draft without focus keeps timeline and omits all-behind', async () => {
  const first = serverData.agenda.rows[0]!;
  await show(
    [],
    {
      ...serverData,
      agenda: {
        ...serverData.agenda,
        rows: [first],
        focusRow: null,
        items: [],
        pastRows: [first],
      },
    },
    's1',
  );
  await waitFor(() =>
    expect(screen.getByTestId('today-session-s1')).toBeTruthy(),
  );
  expect(screen.getByText('Дальше')).toBeTruthy();
  expect(screen.queryByText('Все занятия на сегодня позади')).toBeNull();
});

test('completed row leaves no overlap or gap artifacts alongside unfinished rows', () => {
  const rows = serverData.agenda.rows;
  const result = journalTodayAgenda(serverData.agenda, 'UTC', {
    finished: (id) => id === 's6',
    draft: () => false,
  });
  expect(result.focusRow?.id).toBe('s7');
  expect(result.focusRow?.role).toBe('next');
  expect(result.items).toEqual([]);
  expect(result.pastRows.map((row) => row.id)).toEqual(
    rows.filter((row) => row.id !== 's7').map((row) => row.id),
  );
});

test('production group completes only when every noncancelled booking journal is finished', async () => {
  mockServerJournals.scoped = true;
  mockServerJournals.finishedIds = new Set(['booking-a']);
  const current = serverData.agenda.focusRow!;
  const group = {
    ...current,
    id: 'group:utc',
    groupSessionId: 'group',
    participants: [
      { id: 'booking-a', name: 'Anna', status: 'confirmed' as const },
      { id: 'booking-b', name: 'Dana', status: 'confirmed' as const },
      { id: 'booking-c', name: 'Cancelled', status: 'cancelled' as const },
    ],
  };
  const supplied = {
    ...serverData,
    agenda: { ...serverData.agenda, rows: [group], focusRow: group, items: [] },
  };
  const view = await render(<TrainerTodayScreen data={supplied} />);
  expect(screen.getByTestId('today-session-group:utc')).toBeTruthy();
  mockServerJournals.finishedIds = new Set(['booking-a', 'booking-b']);
  await view.rerender(<TrainerTodayScreen data={supplied} />);
  expect(screen.queryByTestId('today-session-group:utc')).toBeNull();
  expect(screen.getByText('Все занятия на сегодня позади')).toBeTruthy();
  await fireEvent.press(screen.getByText('Показать'));
  expect(screen.getByText('Журнал завершён')).toBeTruthy();
});

test('failed production journal status read is visible with retry', async () => {
  mockServerJournals.scoped = true;
  mockServerJournals.failed = true;
  await render(<TrainerTodayScreen data={serverData} />);
  expect(
    screen.getByText(
      'Не удалось загрузить статусы журналов. Показаны последние загруженные данные.',
    ),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(mockServerJournals.retry).toHaveBeenCalledTimes(1);
});

test('completed elapsed overlap row cannot leave a phantom timeline beside unfinished current focus', () => {
  const original = workspaceTodayAgenda(
    {
      ...schedule,
      bookings: schedule.bookings.slice(0, 2).map((booking, index) => ({
        ...booking,
        starts_at:
          index === 0 ? '2026-10-05T09:00:00Z' : '2026-10-05T09:30:00Z',
        ends_at: index === 0 ? '2026-10-05T10:00:00Z' : '2026-10-05T10:30:00Z',
      })),
    },
    new Date('2026-10-05T10:15:00Z'),
    'Группа',
  );
  expect(original.items.length).toBeGreaterThan(0);
  const completed = original.rows[0]!.id;
  const projected = journalTodayAgenda(original, 'UTC', {
    finished: (id) => id === completed,
    draft: () => false,
  });
  expect(projected.focusRow?.id).toBe(original.rows[1]!.id);
  expect(projected.items).toEqual([]);
  expect(projected.pastRows.map((row) => row.id)).toEqual([completed]);
  expect(projected.endTime).toBeNull();
});

test('cancelled session stays past even when its journal has a draft', () => {
  const cancelled = {
    ...serverData.agenda.rows[0]!,
    cancelled: true,
    past: true,
  };
  const projected = journalTodayAgenda(
    {
      ...serverData.agenda,
      rows: [cancelled],
      focusRow: null,
      items: [],
      pastRows: [cancelled],
    },
    'UTC',
    { finished: () => false, draft: () => true },
  );
  expect(projected.rows[0]?.past).toBe(true);
  expect(projected.items).toEqual([]);
  expect(projected.pastRows).toEqual([cancelled]);
});
