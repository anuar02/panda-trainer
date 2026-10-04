import { getSupabaseClient } from '../src/features/auth/client';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import { useTrainerBilling } from '../src/features/trainer-billing/use-billing';
import { useTrainerBillingCommands } from '../src/features/trainer-billing/use-commands';
import type { TrainerBillingCommand } from '../src/features/trainer-billing/commands';
import type { PropsWithChildren } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { WorkspaceScheduleScreen } from '../src/features/workspace-scheduling/workspace-schedule-screen';
import { useWorkspaceSchedule } from '../src/features/workspace-scheduling/use-schedule';
import {
  loadPendingWorkspaceBookingStatus,
  type PendingWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-pending';
import {
  resolvePendingWorkspaceBookingStatus,
  submitWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-submission';
import type { WorkspaceSchedule } from '../src/features/workspace-scheduling/service';
import type { TrainerScheduleData } from '../src/features/trainer-schedule/trainer-schedule-screen';

jest.mock('../src/features/trainer-billing/use-billing', () => ({
  useTrainerBilling: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/use-commands', () => ({
  useTrainerBillingCommands: jest.fn(),
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
let mockProposalBusy = false;
let mockProposalPending = false;
jest.mock(
  '../src/features/workspace-scheduling/workspace-proposal-controls',
  () => ({
    WorkspaceProposalProvider: ({
      children,
    }: {
      children: (state: unknown) => import('react').ReactNode;
    }) =>
      children({
        loading: false,
        busy: mockProposalBusy,
        pending: mockProposalPending ? {} : null,
        error: null,
      }),
    WorkspaceProposalRecovery: () => null,
    WorkspaceProposalControls: () => null,
  }),
);
jest.mock('../src/features/workspace-scheduling/use-creation', () => ({
  useWorkspaceBookingCreation: () => ({
    pending: null,
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: jest.fn(),
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-proposal', () => ({
  useWorkspaceProposalCommands: () => ({
    pending: mockProposalPending ? {} : null,
    loading: false,
    busy: mockProposalBusy,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: jest.fn(),
    resolve: jest.fn(),
  }),
}));
let mockPresentation: TrainerScheduleData;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
}));
let mockNow = new Date('2026-10-02T07:00:00Z');
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => mockNow,
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000002',
}));
jest.mock('../src/features/workspace-scheduling/use-schedule', () => ({
  useWorkspaceSchedule: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/status-pending')
  >('../src/features/workspace-scheduling/status-pending'),
  loadPendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-submission', () => ({
  submitWorkspaceBookingStatus: jest.fn(),
  resolvePendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/trainer-schedule/trainer-schedule-screen', () => ({
  TrainerScheduleScreen: ({ data }: { data: TrainerScheduleData }) => {
    mockPresentation = data;
    const { View, Text, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create at window"
          disabled={data.createDisabled}
          onPress={() => data.onCreate(data.date, '12:30')}
        >
          <Text>Create</Text>
        </Pressable>
        {data.sessions.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            onPress={() => data.onSelect(row)}
          >
            <Text>{row.title}</Text>
          </Pressable>
        ))}
      </View>
    );
  },
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const load = jest.mocked(loadPendingWorkspaceBookingStatus);
const submit = jest.mocked(submitWorkspaceBookingStatus);
const read = jest.mocked(useWorkspaceSchedule);
const retry = jest.fn();
const billingRetry = jest.fn();
const attendanceSubmit = jest.fn().mockResolvedValue(true);
const attendanceResume = jest.fn().mockResolvedValue(true);
const attendanceReload = jest.fn();
const billingRead = jest.mocked(useTrainerBilling);
const billingCommands = jest.mocked(useTrainerBillingCommands);
const pendingAttendance: TrainerBillingCommand = {
  action: 'markNoShow',
  bookingId: '20000000-0000-4000-8000-000000000001',
  expectedBookingRevision: 3,
  requestId: 'saved-attendance',
};
const attendanceStore = () => ({
  blocked: false,
  pending: null,
  loading: false,
  busy: false,
  error: null,
  submit: attendanceSubmit,
  resume: attendanceResume,
  reload: attendanceReload,
});
const command: PendingWorkspaceBookingStatus = {
  action: 'cancel',
  bookingId: '20000000-0000-4000-8000-000000000001',
  expectedRevision: 3,
  requestId: '30000000-0000-4000-8000-000000000001',
};
const schedule: WorkspaceSchedule = {
  availability: {
    id: 'workspace-a',
    timezone: 'Asia/Almaty',
    working_days: [0, 1, 2, 3, 4, 5, 6],
    day_start: '09:00:00',
    day_end: '20:00:00',
    usual_session_minutes: 60,
  },
  bookings: ['a', 'b'].map((id) => ({
    id:
      id === 'a'
        ? '20000000-0000-4000-8000-000000000001'
        : '20000000-0000-4000-8000-000000000002',
    workspace_id: 'workspace-a',
    client_record_id: `client-${id}`,
    group_session_id: 'group-a',
    client_name: `Server ${id}`,
    starts_at: '2026-10-02T05:00:00.000Z',
    ends_at: '2026-10-02T06:00:00.000Z',
    status: 'confirmed',
    revision: 3,
  })),
  pendingProposals: [],
};
const mount = () =>
  render(
    <WorkspaceScheduleScreen
      userId="user-a"
      workspaceId="workspace-a"
      timezone="Asia/Almaty"
    />,
  );
const open = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Мини-группа' }));
};
let auth: ReturnType<typeof bookingAuthFixture>;
beforeEach(() => {
  auth = bookingAuthFixture('user-a');
  jest.mocked(getSupabaseClient).mockReturnValue(auth.client);
  load.mockReset().mockResolvedValue(null);
  billingRetry.mockReset();
  attendanceSubmit.mockReset().mockResolvedValue(true);
  attendanceResume.mockReset().mockResolvedValue(true);
  attendanceReload.mockReset();
  billingRead.mockReturnValue({
    data: { purchases: [], attendance: [], revisions: [], credits: [] },
    error: null,
    loading: false,
    retry: billingRetry,
  });
  billingCommands.mockReturnValue(attendanceStore());
  submit.mockReset().mockImplementation(async (_user, _workspace, value) => ({
    bookingId: value.bookingId,
    revision: value.expectedRevision + 1,
    status: 'cancelled_by_trainer',
    replayed: false,
  }));
  retry.mockReset();
  mockPush.mockReset();
  mockNow = new Date('2026-10-02T07:00:00Z');
  mockProposalBusy = false;
  mockProposalPending = false;
  read.mockReturnValue({ schedule, loading: false, failed: false, retry });
});

test('real group cancellation sends only the selected participant revision', async () => {
  await mount();
  await waitFor(() =>
    expect(load).toHaveBeenCalledWith('user-a', 'workspace-a'),
  );
  await open();
  expect(screen.getByText('Server a')).toBeTruthy();
  expect(screen.getByText('Server b')).toBeTruthy();
  expect(screen.queryByText('Дана')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить участие: Server b' }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      'user-a',
      'workspace-a',
      {
        action: 'cancel',
        bookingId: '20000000-0000-4000-8000-000000000002',
        expectedRevision: 3,
        requestId: '30000000-0000-4000-8000-000000000002',
      },
      expect.any(Function),
      undefined,
    ),
  );
  await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Server b')).toBeNull();
});

test('lost response offers the identical durable command and blocks new cancellation', async () => {
  load.mockResolvedValue(command);
  submit.mockRejectedValueOnce(new Error('response lost'));
  await mount();
  await waitFor(() =>
    expect(screen.getByText('Изменение занятия ещё не завершено')).toBeTruthy(),
  );
  await open();
  expect(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить изменение' }),
  );
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      'user-a',
      'workspace-a',
      command,
      expect.any(Function),
      undefined,
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByText('Не удалось изменить занятие. Повторите попытку.'),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить изменение' }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1]?.[2]).toEqual(command);
});

test('unreadable pending storage blocks mutations until a successful read retry', async () => {
  load.mockRejectedValueOnce(new Error('corrupt'));
  await mount();
  await open();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отменить участие: Server a' }),
    ).toBeDisabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  );
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отменить участие: Server a' }),
    ).toBeEnabled(),
  );
});

test('unmounted account ignores an old successful request and does not refresh its schedule', async () => {
  let resolve!: () => void;
  submit.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = () =>
        yes({
          bookingId: '20000000-0000-4000-8000-000000000001',
          revision: 4,
          status: 'cancelled_by_trainer',
          replayed: false,
        });
    }),
  );
  const view = await mount();
  await open();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отменить участие: Server a' }),
    ).toBeEnabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  );
  await view.unmount();
  await act(async () => resolve());
  expect(retry).not.toHaveBeenCalled();
});

test('switching account remounts the controller and rejects stale request completion', async () => {
  let resolve!: () => void;
  submit.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = () =>
        yes({
          bookingId: '20000000-0000-4000-8000-000000000001',
          revision: 4,
          status: 'cancelled_by_trainer',
          replayed: false,
        });
    }),
  );
  const view = await mount();
  await open();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Отменить участие: Server a' }),
    ).toBeEnabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  );
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(bookingAuthFixture('user-b').client);
  await view.rerender(
    <WorkspaceScheduleScreen
      userId="user-b"
      workspaceId="workspace-b"
      timezone="Asia/Almaty"
    />,
  );
  await waitFor(() =>
    expect(load).toHaveBeenCalledWith('user-b', 'workspace-b'),
  );
  expect(screen.queryByText('Server a')).toBeNull();
  await act(async () => resolve());
  expect(retry).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('creates from the selected date and free window', async () => {
  await render(
    <WorkspaceScheduleScreen
      userId="user-a"
      workspaceId="workspace-a"
      timezone="Asia/Almaty"
      initialDate="2026-10-06"
    />,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Create at window' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workspace/new',
    params: { date: '2026-10-06', start: '12:30' },
  });
});

test('opens the real selected session from Today navigation', async () => {
  const sessionId = `${schedule.bookings[0]!.group_session_id}:${new Date(schedule.bookings[0]!.starts_at).toISOString()}:${new Date(schedule.bookings[0]!.ends_at).toISOString()}`;
  await render(
    <WorkspaceScheduleScreen
      userId="user-a"
      workspaceId="workspace-a"
      timezone="Asia/Almaty"
      initialDate="2026-10-02"
      initialSelectedId={sessionId}
    />,
  );
  expect(screen.getByText('Server a')).toBeTruthy();
});

test('an unresolved proposal blocks a new cancellation for the same workspace', async () => {
  mockProposalPending = true;
  await mount();
  await open();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  );
  expect(submit).not.toHaveBeenCalled();
});

test('trainer pending resolution shares lock and refreshes verified terminal result', async () => {
  const command: PendingWorkspaceBookingStatus = {
    action: 'cancel',
    bookingId: '20000000-0000-4000-8000-000000000001',
    expectedRevision: 2,
    requestId: 'old-request',
  };
  load.mockResolvedValue(command);
  const resolveRequest = jest.mocked(resolvePendingWorkspaceBookingStatus);
  let finish!: (value: { outcome: 'abandoned'; result: null }) => void;
  resolveRequest.mockReturnValueOnce(
    new Promise((yes) => {
      finish = yes;
    }),
  );
  await mount();
  const button = await screen.findByRole('button', {
    name: 'Проверить результат и завершить запрос',
  });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(resolveRequest).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  load.mockResolvedValue(null);
  await act(async () => finish({ outcome: 'abandoned', result: null }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', {
      name: 'Проверить результат и завершить запрос',
    }),
  ).toBeNull();
});

test('attendance commands target one participant and preserve the booking revision', async () => {
  await mount();
  await open();
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Не пришёл' })[1]!,
  );
  await waitFor(() =>
    expect(attendanceSubmit).toHaveBeenCalledWith({
      action: 'markNoShow',
      bookingId: '20000000-0000-4000-8000-000000000002',
      expectedBookingRevision: 3,
      requestId: '30000000-0000-4000-8000-000000000002',
    }),
  );
  expect(submit).not.toHaveBeenCalled();
});

test('pending attendance blocks cancellation and creation while retry reuses its saved command', async () => {
  billingCommands.mockReturnValue({
    ...attendanceStore(),
    blocked: true,
    pending: pendingAttendance,
  });
  await mount();
  await open();
  expect(
    screen.getByRole('button', { name: 'Отменить участие: Server a' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Create at window' }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить сохранённую операцию' }),
  );
  expect(attendanceResume).toHaveBeenCalledTimes(1);
  expect(attendanceSubmit).not.toHaveBeenCalled();
});

test('billing read failure does not display unmarked state or enable attendance', async () => {
  billingRead.mockReturnValue({
    data: null,
    error: 'request',
    loading: false,
    retry: billingRetry,
  });
  await mount();
  await open();
  expect(screen.queryByRole('button', { name: 'Пришёл' })).toBeNull();
  expect(screen.queryByText('Пока не отмечено')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(billingRetry).toHaveBeenCalledTimes(1);
});

test('same-user relogin clears selection and old date/create/select callbacks', async () => {
  await mount();
  await open();
  const old = mockPresentation;
  await act(async () =>
    auth.change(
      auth.session('user-a', auth.sessionId, 'refresh'),
      'TOKEN_REFRESHED',
    ),
  );
  expect(screen.getByText('Server a')).toBeTruthy();
  await act(async () =>
    auth.change(
      auth.session('user-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      'SIGNED_IN',
    ),
  );
  expect(screen.queryByText('Server a')).toBeNull();
  await act(async () => {
    old.onSelect(old.sessions[0]!);
    old.onDateChange('2030-01-01');
    old.onCreate(old.date);
  });
  expect(screen.queryByText('Server a')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockPresentation.date).not.toBe('2030-01-01');
});
test('the default selected day and plus follow the workspace week rollover', async () => {
  mockNow = new Date('2026-10-04T18:59:00Z');
  const view = await mount();
  expect(mockPresentation.date).toBe('2026-10-04');
  mockNow = new Date('2026-10-04T19:01:00Z');
  await view.rerender(
    <WorkspaceScheduleScreen
      userId="user-a"
      workspaceId="workspace-a"
      timezone="Asia/Almaty"
    />,
  );
  expect(read).toHaveBeenLastCalledWith('user-a', 'workspace-a', '2026-10-05');
  await act(async () => mockPresentation.onCreate(mockPresentation.date));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/workspace/new',
    params: { date: '2026-10-05' },
  });
});

test('a second Today link for the same date applies its new selected session', async () => {
  const first = `${schedule.bookings[0]!.group_session_id}:${new Date(schedule.bookings[0]!.starts_at).toISOString()}:${new Date(schedule.bookings[0]!.ends_at).toISOString()}`;
  const tree = (session: string) => (
    <WorkspaceScheduleScreen
      userId="user-a"
      workspaceId="workspace-a"
      timezone="Asia/Almaty"
      initialDate="2026-10-02"
      initialSelectedId={session}
    />
  );
  const view = await render(tree(first));
  expect(screen.getByText('Server a')).toBeTruthy();
  await view.rerender(tree('no-longer-selected'));
  expect(screen.queryByText('Server a')).toBeNull();
});
