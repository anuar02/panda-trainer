import { WorkspaceMutationProvider } from '../src/features/workspace-scheduling/mutation-provider';
import { getSupabaseClient } from '../src/features/auth/client';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import { WorkspaceTodayScreen } from '../src/features/workspace-scheduling/workspace-today-screen';
import { useWorkspaceSchedule } from '../src/features/workspace-scheduling/use-schedule';
import type { TrainerTodayData } from '../src/features/trainer-today/trainer-today-screen';
import type { WorkspaceSchedule } from '../src/features/workspace-scheduling/service';
let mockRecoveryCallback: (() => void) | undefined;
jest.mock('../src/ui/button', () => {
  const actual =
    jest.requireActual<typeof import('../src/ui/button')>('../src/ui/button');
  return {
    Button: (props: import('react').ComponentProps<typeof actual.Button>) => {
      if (props.label === 'Повторить создание')
        mockRecoveryCallback = props.onPress as () => void;
      return <actual.Button {...props} />;
    },
  };
});
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
let mockBillingPending:
  | import('../src/features/trainer-billing/commands').TrainerBillingCommand
  | null = null;
const mockAttendanceResume = jest.fn();
jest.mock('../src/features/trainer-billing/use-commands', () => ({
  useTrainerBillingCommands: () => ({
    blocked: false,
    pending: mockBillingPending,
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: mockAttendanceResume,
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-proposal', () => ({
  useWorkspaceProposalCommands: () => ({
    pending: null,
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: jest.fn(),
    resolve: jest.fn(),
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-status-commands', () => ({
  useWorkspaceStatusCommands: () => ({
    blocked: false,
    pending: null,
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: jest.fn(),
    resolve: jest.fn(),
  }),
}));
let mockCreationPending = false;
jest.mock('../src/features/workspace-scheduling/use-creation', () => ({
  useWorkspaceBookingCreation: () => ({
    pending: mockCreationPending ? {} : null,
    loading: false,
    busy: false,
    error: null,
    reload: jest.fn(),
    submit: jest.fn(),
    resume: jest.fn(),
  }),
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/use-billing', () => ({
  useTrainerBilling: () => ({
    data: { purchases: [], credits: [], attendance: [], revisions: [] },
    loading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
let mockPresentation: TrainerTodayData;
const mockPush = jest.fn();
let mockNow = new Date('2026-10-02T07:00:00.000Z');
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => mockNow,
}));
jest.mock('../src/features/workspace-scheduling/use-schedule', () => ({
  useWorkspaceSchedule: jest.fn(),
}));
jest.mock('../src/features/trainer-today/trainer-today-screen', () => ({
  TrainerTodayScreen: ({ data }: { data: TrainerTodayData }) => {
    mockPresentation = data;
    const { View, Text, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Text>{data.trainerName}</Text>
        <Text>{data.agenda.date}</Text>
        {data.agenda.rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.name}
            onPress={() => data.onSelectSession(row)}
          >
            <Text>{row.name}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create"
          disabled={data.createDisabled}
          onPress={() => data.onCreate(data.agenda.date, '14:00')}
        >
          <Text>Create</Text>
        </Pressable>
      </View>
    );
  },
}));
const read = jest.mocked(useWorkspaceSchedule);
const retry = jest.fn();
const data: WorkspaceSchedule = {
  availability: {
    id: 'workspace',
    timezone: 'Asia/Almaty',
    working_days: [0, 1, 2, 3, 4, 5, 6],
    day_start: '07:00:00',
    day_end: '21:00:00',
    usual_session_minutes: 60,
  },
  bookings: [
    {
      id: 'booking',
      workspace_id: 'workspace',
      client_record_id: 'client',
      group_session_id: null,
      starts_at: '2026-10-02T08:00:00.000Z',
      ends_at: '2026-10-02T09:00:00.000Z',
      status: 'proposed',
      revision: 1,
      client_name: 'Реальный клиент',
    },
  ],
  pendingProposals: [],
};
const mount = () =>
  render(
    <WorkspaceTodayScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      trainerName="Реальный тренер"
    />,
  );
let auth: ReturnType<typeof bookingAuthFixture>;
beforeEach(() => {
  auth = bookingAuthFixture('user');
  jest.mocked(getSupabaseClient).mockReturnValue(auth.client);
  mockBillingPending = null;
  mockCreationPending = false;
  mockRecoveryCallback = undefined;
  mockAttendanceResume.mockReset().mockResolvedValue(true);
  mockPush.mockReset();
  mockNow = new Date('2026-10-02T07:00:00.000Z');
  read.mockReturnValue({
    schedule: data,
    loading: false,
    failed: false,
    retry,
  });
});
test('uses real trainer/session and opens the corresponding real detail', async () => {
  await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Реальный клиент' }),
  );
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByText('Посещение и списание')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Пришёл' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/workspace/new',
    params: { date: '2026-10-02', start: '14:00' },
  });
});
test('rolls the read scope to the next workspace day', async () => {
  const view = await mount();
  mockNow = new Date('2026-10-02T19:01:00.000Z');
  await view.rerender(
    <WorkspaceTodayScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      trainerName="Реальный тренер"
    />,
  );
  expect(read).toHaveBeenLastCalledWith('user', 'workspace', '2026-10-03');
});
test('loading carries real identity and an empty agenda without demo data', async () => {
  read.mockReturnValue({ schedule: null, loading: true, failed: false, retry });
  await mount();
  expect(screen.getByText('Реальный тренер')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Реальный клиент' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
  expect(mockPush).not.toHaveBeenCalled();
});

test('pending attendance stays recoverable after midnight removes its selected session', async () => {
  const view = await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Реальный клиент' }),
  );
  mockBillingPending = {
    action: 'markNoShow',
    bookingId: '20000000-0000-4000-8000-000000000001',
    expectedBookingRevision: 1,
    requestId: '30000000-0000-4000-8000-000000000001',
  };
  mockNow = new Date('2026-10-02T19:01:00.000Z');
  read.mockReturnValue({
    schedule: { ...data, bookings: [] },
    loading: false,
    failed: false,
    retry,
  });
  await view.rerender(
    <WorkspaceTodayScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      trainerName="Реальный тренер"
    />,
  );
  expect(screen.queryByRole('button', { name: 'Пришёл' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить сохранённую операцию' }),
  );
  expect(mockAttendanceResume).toHaveBeenCalledTimes(1);
});

test('refresh preserves selection; same-user relogin clears it and fences captured callbacks', async () => {
  await mount();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Реальный клиент' }),
  );
  const old = mockPresentation;
  await act(async () =>
    auth.change(
      auth.session('user', auth.sessionId, 'refreshed'),
      'TOKEN_REFRESHED',
    ),
  );
  expect(screen.getByText('Посещение и списание')).toBeTruthy();
  await act(async () =>
    auth.change(
      auth.session('user', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      'SIGNED_IN',
    ),
  );
  expect(screen.queryByText('Посещение и списание')).toBeNull();
  await act(async () => {
    old.onSelectSession(old.agenda.rows[0]!);
    old.onOpenRequests();
    old.onCreate(old.agenda.date, '14:00');
  });
  expect(screen.queryByText('Посещение и списание')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
});
test('logout during navigation verification prevents the retained router callback', async () => {
  await mount();
  await act(async () => {
    mockPresentation.onCreate(mockPresentation.agenda.date, '14:00');
    auth.change(null, 'SIGNED_OUT');
  });
  expect(mockPush).not.toHaveBeenCalled();
});

test('unmounting Today while its shared provider survives invalidates navigation callbacks', async () => {
  const tree = (visible: boolean) => (
    <WorkspaceMutationProvider userId="user" workspaceId="workspace">
      {visible ? (
        <WorkspaceTodayScreen
          userId="user"
          workspaceId="workspace"
          timezone="Asia/Almaty"
          trainerName="Реальный тренер"
        />
      ) : null}
    </WorkspaceMutationProvider>
  );
  const view = await render(tree(true));
  const old = mockPresentation;
  await view.rerender(tree(false));
  await act(async () => old.onCreate(old.agenda.date, '14:00'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('captured creation recovery route cannot navigate after the Today caller unmounts', async () => {
  mockCreationPending = true;
  const tree = (visible: boolean) => (
    <WorkspaceMutationProvider userId="user" workspaceId="workspace">
      {visible ? (
        <WorkspaceTodayScreen
          userId="user"
          workspaceId="workspace"
          timezone="Asia/Almaty"
          trainerName="Реальный тренер"
        />
      ) : null}
    </WorkspaceMutationProvider>
  );
  const view = await render(tree(true));
  const callback = mockRecoveryCallback!;
  await view.rerender(tree(false));
  await act(async () => callback());
  expect(mockPush).not.toHaveBeenCalled();
});
