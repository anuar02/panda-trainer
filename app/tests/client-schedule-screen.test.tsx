import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientScheduleScreen } from '../src/features/client-scheduling/client-schedule-screen';
import {
  ClientHomeScreen,
  type ClientHomeData,
} from '../src/features/client-home/client-home-screen';
import {
  WorkspaceProposalProvider,
  type WorkspaceProposalStore,
} from '../src/features/workspace-scheduling/workspace-proposal-controls';
import {
  ClientBookingControls,
  ClientBookingStatusRecovery,
} from '../src/features/client-scheduling/client-booking-controls';
import { useClientSchedule } from '../src/features/client-scheduling/use-schedule';
import {
  useClientBookingStatus,
  type ClientBookingStatusStore,
} from '../src/features/client-scheduling/use-status';
import type { ClientSchedule } from '../src/features/client-scheduling/service';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2030-10-02T06:00:00Z'),
}));
jest.mock('../src/features/client-scheduling/use-schedule', () => ({
  useClientSchedule: jest.fn(),
}));
jest.mock('../src/features/client-scheduling/use-status', () => ({
  useClientBookingStatus: jest.fn(),
}));
jest.mock('../src/features/client-home/client-home-screen', () => ({
  ClientHomeScreen: jest.fn(({ data }: { data: ClientHomeData }) => {
    const { Text, View, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Text>{data.clientName}</Text>
        <Text>{data.trainerName}</Text>
        <Text>{data.loading ? 'loading' : 'ready'}</Text>
        {data.bookings.map((row) => (
          <Pressable
            key={row.id}
            testID={`select-${row.id}`}
            onPress={() => data.onSelectBooking(row)}
          >
            <Text>{row.programPreview}</Text>
          </Pressable>
        ))}
        {data.requests}
      </View>
    );
  }),
}));
let mockProposal: WorkspaceProposalStore;
jest.mock(
  '../src/features/workspace-scheduling/workspace-proposal-controls',
  () => ({
    WorkspaceProposalProvider: jest.fn(
      ({
        children,
      }: {
        children: (store: WorkspaceProposalStore) => ReactNode;
      }) => children(mockProposal),
    ),
    WorkspaceProposalRecovery: () => {
      const { Text } =
        jest.requireActual<typeof import('react-native')>('react-native');
      return <Text>global proposal recovery</Text>;
    },
  }),
);
jest.mock('../src/features/client-scheduling/client-booking-controls', () => ({
  ClientBookingControls: jest.fn(() => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>own controls</Text>;
  }),
  ClientBookingStatusRecovery: jest.fn(() => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>global status recovery</Text>;
  }),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
}));
const retry = jest.fn();
const props = {
  userId: 'user',
  workspaceId: 'workspace',
  clientRecordId: 'client',
  clientName: 'fallback client',
  trainerName: 'fallback trainer',
};
const schedule: ClientSchedule = {
  context: {
    clientRecordId: 'client',
    workspaceId: 'workspace',
    timezone: 'Asia/Almaty',
    clientName: 'Real client',
    trainerName: 'Real trainer',
  },
  bookings: [
    {
      id: 'own-1',
      workspace_id: 'workspace',
      client_record_id: 'client',
      group_session_id: null,
      starts_at: '2030-10-02T07:00:00Z',
      ends_at: '2030-10-02T08:00:00Z',
      status: 'proposed',
      revision: 3,
      program: {
        id: 'plan',
        name: 'Saved plan',
        description: 'Saved description',
        exercises: [],
      },
    },
  ],
  pendingProposals: [],
};
let status: ClientBookingStatusStore;
const read = jest.mocked(useClientSchedule),
  hook = jest.mocked(useClientBookingStatus),
  home = jest.mocked(ClientHomeScreen),
  controls = jest.mocked(ClientBookingControls),
  provider = jest.mocked(WorkspaceProposalProvider),
  recovery = jest.mocked(ClientBookingStatusRecovery);
const homeData = () => home.mock.calls.at(-1)![0].data!;
beforeEach(() => {
  jest.clearAllMocks();
  status = {
    pending: null,
    loading: false,
    busy: false,
    error: null,
    submit: jest.fn(),
    resume: jest.fn(),
    reload: jest.fn(),
  };
  mockProposal = {
    ...status,
    pending: null,
    resume: jest.fn().mockResolvedValue(null),
    submit: jest.fn(),
    userId: 'user',
    workspaceId: 'workspace',
    externalBusy: false,
    externalBlocked: false,
  };
  read.mockReturnValue({
    schedule,
    loading: false,
    failed: false,
    error: null,
    retry,
  });
  hook.mockImplementation(() => status);
});
test('real data maps immutable program preview and selecting own booking supplies explicit portal store', async () => {
  await render(<ClientScheduleScreen {...props} />);
  expect(screen.getByText('Real client')).toBeTruthy();
  expect(homeData().bookings[0]).toEqual(
    expect.objectContaining({
      id: 'own-1',
      programName: 'Saved plan',
      programPreview: 'Тренер подберёт упражнения на месте',
    }),
  );
  await fireEvent.press(screen.getByTestId('select-own-1'));
  expect(controls.mock.calls.at(-1)![0]).toEqual(
    expect.objectContaining({
      booking: schedule.bookings[0],
      proposalStore: mockProposal,
      statusStore: status,
      clientRecordId: 'client',
    }),
  );
  expect(screen.getByText('Saved description')).toBeTruthy();
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      startsAtUtc: '2030-10-01T00:00:00.000Z',
      endsAtUtc: '2030-11-11T00:00:00.000Z',
    }),
  );
});
test('loading supplies empty controlled home data and original profile names', async () => {
  read.mockReturnValue({
    schedule: null,
    loading: true,
    failed: false,
    error: null,
    retry,
  });
  await render(<ClientScheduleScreen {...props} />);
  expect(homeData()).toEqual(
    expect.objectContaining({
      clientName: 'fallback client',
      trainerName: 'fallback trainer',
      loading: true,
      bookings: [],
    }),
  );
  expect(provider.mock.calls.at(-1)![0].externalBlocked).toBe(true);
});
test('mismatched workspace blocks rendering and keeps both global recovery surfaces', async () => {
  read.mockReturnValue({
    schedule: {
      ...schedule,
      context: { ...schedule.context, workspaceId: 'foreign' },
    },
    loading: false,
    failed: false,
    error: null,
    retry,
  });
  await render(<ClientScheduleScreen {...props} />);
  expect(home).not.toHaveBeenCalled();
  expect(screen.getByText('global proposal recovery')).toBeTruthy();
  expect(screen.getByText('global status recovery')).toBeTruthy();
  expect(provider.mock.calls.at(-1)![0].externalBlocked).toBe(true);
});
test('read failure retains both durable recovery controls and retry', async () => {
  read.mockReturnValue({
    schedule: null,
    loading: false,
    failed: true,
    error: 'request',
    retry,
  });
  await render(<ClientScheduleScreen {...props} />);
  expect(home).not.toHaveBeenCalled();
  expect(screen.getByText('global proposal recovery')).toBeTruthy();
  expect(screen.getByText('global status recovery')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Попробовать снова' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});
test('pending status blocks new proposal commands but exact recoveries stay unlocked until other store is busy', async () => {
  status.pending = {
    action: 'confirm',
    bookingId: 'own-1',
    expectedRevision: 3,
    requestId: 'request',
  };
  mockProposal.pending = {
    action: 'propose',
    bookingId: 'own-1',
    expectedBookingRevision: 3,
    requestId: 'proposalrequest',
    proposedStartsAtUtc: '2030-10-03T07:00:00Z',
  };
  const view = await render(<ClientScheduleScreen {...props} />);
  expect(provider.mock.calls.at(-1)![0].externalBlocked).toBe(true);
  expect(provider.mock.calls.at(-1)![0].externalBusy).toBe(false);
  expect(recovery.mock.calls.at(-1)![0].externalBusy).toBe(false);
  mockProposal.busy = true;
  await view.rerender(<ClientScheduleScreen {...props} />);
  expect(recovery.mock.calls.at(-1)![0].externalBusy).toBe(true);
});
test('account and card scope remount clears prior selection', async () => {
  const view = await render(<ClientScheduleScreen {...props} />);
  await fireEvent.press(screen.getByTestId('select-own-1'));
  expect(screen.getByText('own controls')).toBeTruthy();
  await view.rerender(
    <ClientScheduleScreen
      {...props}
      userId="other"
      clientRecordId="other-card"
    />,
  );
  expect(screen.queryByText('own controls')).toBeNull();
  expect(hook).toHaveBeenLastCalledWith(
    expect.objectContaining({ userId: 'other', workspaceId: 'workspace' }),
  );
  expect(read).toHaveBeenLastCalledWith(
    expect.objectContaining({ clientRecordId: 'other-card' }),
  );
});
test('proposal outside upcoming slice renders request-only controls for its original own booking', async () => {
  const past = {
    ...schedule.bookings[0]!,
    id: 'proposal-only',
    starts_at: '2030-09-28T07:00:00Z',
    ends_at: '2030-09-28T08:00:00Z',
  };
  read.mockReturnValue({
    schedule: {
      ...schedule,
      pendingProposals: [
        {
          id: 'pending',
          bookingId: past.id,
          proposedStartsAtUtc: '2030-10-04T07:00:00Z',
          proposedEndsAtUtc: '2030-10-04T08:00:00Z',
          revision: 5,
          baseRevision: 3,
          authorRole: 'trainer',
          booking: past,
        },
      ],
    },
    loading: false,
    failed: false,
    error: null,
    retry,
  });
  await render(<ClientScheduleScreen {...props} />);
  expect(controls.mock.calls.at(-1)![0]).toEqual(
    expect.objectContaining({
      booking: past,
      proposalStore: mockProposal,
      proposalOnly: true,
    }),
  );
});
