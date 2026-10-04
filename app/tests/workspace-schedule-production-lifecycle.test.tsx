import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { getSupabaseClient } from '../src/features/auth/client';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import {
  WorkspaceMutationProvider,
  useWorkspaceMutations,
} from '../src/features/workspace-scheduling/mutation-provider';
import { WorkspaceTodayScreen } from '../src/features/workspace-scheduling/workspace-today-screen';
import { WorkspaceScheduleScreen } from '../src/features/workspace-scheduling/workspace-schedule-screen';
import { useWorkspaceSchedule } from '../src/features/workspace-scheduling/use-schedule';
import {
  loadWorkspaceSchedule,
  type WorkspaceSchedule,
} from '../src/features/workspace-scheduling/service';
import {
  loadPendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from '../src/features/workspace-scheduling/pending';
import type { TrainerTodayData } from '../src/features/trainer-today/trainer-today-screen';
import type { TrainerScheduleData } from '../src/features/trainer-schedule/trainer-schedule-screen';

const id = (n: number) =>
  `52000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userId = id(1);
const workspaceId = id(2);
let mockAuth: ReturnType<typeof bookingAuthFixture>;
let mockToday: TrainerTodayData;
let mockWeek: TrainerScheduleData;
let mockRead: ReturnType<typeof useWorkspaceSchedule>;
let mockMutations: ReturnType<typeof useWorkspaceMutations>;
const mockPush = jest.fn();

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({
    configured: true,
    loading: false,
    failed: false,
    session: mockAuth.session(),
  }),
}));
jest.mock('../src/features/auth/service', () => ({
  authService: {
    onAuthStateChange: (
      listener: Parameters<typeof mockAuth.auth.onAuthStateChange>[0],
    ) => mockAuth.auth.onAuthStateChange(listener).data.subscription,
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2030-10-02T06:30:00Z'),
}));
jest.mock('../src/features/workspace-scheduling/service', () => ({
  ...jest.requireActual('../src/features/workspace-scheduling/service'),
  loadWorkspaceSchedule: jest.fn(),
}));
jest.mock('../src/features/trainer-today/trainer-today-screen', () => ({
  TrainerTodayScreen: ({ data }: { data: TrainerTodayData }) => {
    mockToday = data;
    return null;
  },
}));
jest.mock('../src/features/trainer-schedule/trainer-schedule-screen', () => ({
  TrainerScheduleScreen: ({ data }: { data: TrainerScheduleData }) => {
    mockWeek = data;
    return null;
  },
}));
jest.mock(
  '../src/features/workspace-scheduling/workspace-session-controls',
  () => ({ WorkspaceSessionControls: () => null }),
);
jest.mock('../src/features/trainer-billing/use-commands', () => ({
  useTrainerBillingCommands: () => ({
    pending: null,
    error: null,
    loading: false,
    busy: false,
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-proposal', () => ({
  useWorkspaceProposalCommands: () => ({
    pending: null,
    error: null,
    loading: false,
    busy: false,
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-status-commands', () => ({
  useWorkspaceStatusCommands: () => ({
    pending: null,
    error: null,
    loading: false,
    busy: false,
  }),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: import('react').ReactNode;
  }) => (open ? children : null),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

function Observer() {
  const read = useWorkspaceSchedule(userId, workspaceId, '2030-10-02');
  const mutations = useWorkspaceMutations();
  const retry = read.retry;
  useEffect(() => {
    if (mutations.generation > 0) retry();
  }, [mutations.generation, retry]);
  useEffect(() => {
    mockRead = read;
    mockMutations = mutations;
  }, [read, mutations]);
  return null;
}
const tree = () => (
  <WorkspaceMutationProvider userId={userId} workspaceId={workspaceId}>
    <WorkspaceTodayScreen
      userId={userId}
      workspaceId={workspaceId}
      timezone="Asia/Almaty"
      trainerName="Synthetic trainer"
    />
    <WorkspaceScheduleScreen
      userId={userId}
      workspaceId={workspaceId}
      timezone="Asia/Almaty"
      initialDate="2030-10-02"
    />
    <Observer />
  </WorkspaceMutationProvider>
);
const empty: WorkspaceSchedule = {
  availability: {
    id: workspaceId,
    timezone: 'Asia/Almaty',
    working_days: [0, 1, 2, 3, 4, 5, 6],
    day_start: '09:00:00',
    day_end: '20:00:00',
    usual_session_minutes: 60,
  },
  bookings: [],
  pendingProposals: [],
};
const command: PendingWorkspaceBooking = {
  clientRecordIds: [id(4), id(3)],
  requestId: id(5),
  startsAtUtc: '2030-10-02T07:00:00.000Z',
  endsAtUtc: '2030-10-02T08:00:00.000Z',
  collisionAcknowledged: true,
  plan: { templateId: id(6), expectedTemplateRevision: 7 },
};
const receipt = {
  created: true,
  booking_ids: [id(7), id(8)],
  group_session_id: id(9),
  overlaps: [],
  replayed: false,
};
const booked: WorkspaceSchedule = {
  ...empty,
  bookings: [id(3), id(4)].map((client, index) => ({
    id: receipt.booking_ids[index]!,
    workspace_id: workspaceId,
    client_record_id: client,
    group_session_id: id(9),
    client_name: `Synthetic ${index}`,
    starts_at: command.startsAtUtc,
    ends_at: command.endsAtUtc,
    status: 'proposed',
    revision: 1,
    program_name: 'Immutable plan',
  })),
};
const load = jest.mocked(loadWorkspaceSchedule);
const rpc = jest.fn();
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(async () => {
  await AsyncStorage.clear();
  mockAuth = bookingAuthFixture(userId);
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ ...mockAuth.client, rpc } as unknown as NonNullable<
      ReturnType<typeof getSupabaseClient>
    >);
  load.mockReset().mockResolvedValue(empty);
  rpc.mockReset();
  mockPush.mockReset();
});

test('lost response replays the exact group plan; Today/week wait for server refresh and can open it', async () => {
  rpc
    .mockImplementationOnce(() => ({
      setHeader: async () => {
        throw new Error('lost response after commit');
      },
    }))
    .mockImplementationOnce(() => ({
      setHeader: async () => ({
        data: { ...receipt, replayed: true },
        error: null,
      }),
    }));
  await render(tree());
  await waitFor(() => expect(mockMutations.blocked).toBe(false));
  await waitFor(() => expect(mockRead.loading).toBe(false));
  await act(async () =>
    expect(await mockMutations.creation.submit(command)).toBeNull(),
  );
  const saved = await loadPendingWorkspaceBooking(userId, workspaceId);
  expect(saved).toMatchObject({ ...command, clientRecordIds: [id(3), id(4)] });
  expect(mockMutations.blocked).toBe(true);
  expect(mockWeek.sessions).toEqual([]);
  expect(mockToday.agenda.rows).toEqual([]);
  const refresh = deferred<WorkspaceSchedule>();
  load.mockImplementation(() => refresh.promise);
  await act(async () =>
    expect(await mockMutations.creation.resume()).toMatchObject({
      created: true,
      replayed: true,
    }),
  );
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(rpc).toHaveBeenLastCalledWith(
    'create_booking_set_with_plan',
    expect.objectContaining({
      p_template_id: id(6),
      p_expected_template_revision: 7,
      p_request_id: command.requestId,
      p_client_record_ids: [id(3), id(4)],
    }),
  );
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toBeNull();
  expect(mockWeek.sessions).toEqual([]);
  expect(mockToday.agenda.rows).toEqual([]);
  expect(mockRead.loading).toBe(true);
  await act(async () => refresh.resolve(booked));
  expect(mockToday.agenda.rows).toHaveLength(1);
  expect(mockToday.agenda.rows[0]).toMatchObject({
    participantNames: ['Synthetic 0', 'Synthetic 1'],
    programName: 'Immutable plan',
    start: '12:00',
    end: '13:00',
  });
  expect(mockWeek.sessions).toHaveLength(1);
  expect(mockWeek.freeWindows).toEqual([
    { date: '2030-10-02', start: '09:00', end: '12:00' },
    { date: '2030-10-02', start: '13:00', end: '20:00' },
  ]);
  await act(async () => {
    mockWeek.onSelect(mockWeek.sessions[0]!);
    mockToday.onSelectSession(mockToday.agenda.rows[0]!);
  });
  expect(mockPush).not.toHaveBeenCalled();
});

test('refresh failure exposes retry without an optimistic session or demo fallback', async () => {
  rpc.mockImplementation(() => ({
    setHeader: async () => ({ data: receipt, error: null }),
  }));
  await render(tree());
  await waitFor(() => expect(mockMutations.blocked).toBe(false));
  load.mockRejectedValue(new Error('offline'));
  await act(async () =>
    expect(await mockMutations.creation.submit(command)).toMatchObject({
      created: true,
    }),
  );
  await waitFor(() => expect(mockRead.failed).toBe(true));
  expect(mockRead.schedule).toBeNull();
  expect(screen.getAllByText('Не получилось загрузить')).toHaveLength(2);
  load.mockResolvedValue(booked);
  for (const retry of screen.getAllByRole('button', {
    name: 'Попробовать снова',
  }))
    await fireEvent.press(retry);
  await waitFor(() => expect(mockToday.agenda.rows).toHaveLength(1));
  expect(mockWeek.sessions).toHaveLength(1);
  expect(screen.queryByText('Не получилось загрузить')).toBeNull();
  expect(mockMutations.generation).toBe(1);
});

test('unmount while a server refresh is pending cannot navigate or restore old data', async () => {
  const refresh = deferred<WorkspaceSchedule>();
  load.mockReturnValue(refresh.promise);
  const view = await render(tree());
  await waitFor(() => expect(mockMutations.blocked).toBe(false));
  const old = mockToday;
  await view.unmount();
  await act(async () => {
    refresh.resolve(booked);
    old.onCreate('2030-10-02', '12:00');
  });
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAuth.listenerCount).toBe(0);
});
