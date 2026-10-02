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
import { submitWorkspaceBookingStatus } from '../src/features/workspace-scheduling/status-submission';
import type { WorkspaceSchedule } from '../src/features/workspace-scheduling/service';
import type { TrainerScheduleData } from '../src/features/trainer-schedule/trainer-schedule-screen';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-request' }));
jest.mock('../src/features/workspace-scheduling/use-schedule', () => ({
  useWorkspaceSchedule: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-pending', () => ({
  loadPendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-submission', () => ({
  submitWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/trainer-schedule/trainer-schedule-screen', () => ({
  TrainerScheduleScreen: ({ data }: { data: TrainerScheduleData }) => {
    const { View, Text, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
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
const command: PendingWorkspaceBookingStatus = {
  action: 'cancel',
  bookingId: 'booking-a',
  expectedRevision: 3,
  requestId: 'saved-request',
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
    id: `booking-${id}`,
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
beforeEach(() => {
  load.mockReset().mockResolvedValue(null);
  submit.mockReset();
  retry.mockReset();
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
    expect(submit).toHaveBeenCalledWith('user-a', 'workspace-a', {
      action: 'cancel',
      bookingId: 'booking-b',
      expectedRevision: 3,
      requestId: 'new-request',
    }),
  );
  await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
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
    expect(submit).toHaveBeenCalledWith('user-a', 'workspace-a', command),
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
          bookingId: 'booking-a',
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
          bookingId: 'booking-a',
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
