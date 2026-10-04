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
import { WorkspaceMutationProvider } from '../src/features/workspace-scheduling/mutation-provider';
import { WorkspaceCreateSessionScreen } from '../src/features/workspace-scheduling/workspace-create-session-screen';
import {
  loadPendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from '../src/features/workspace-scheduling/pending';
import { submitWorkspaceBooking } from '../src/features/workspace-scheduling/creation';
import type { CreateWorkspaceBookingResult } from '../src/features/workspace-scheduling/create-operation';
jest.mock('../src/features/trainer-billing/use-commands', () => ({
  useTrainerBillingCommands: () => ({
    blocked: false,
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
const mockClients = jest.fn();
const mockTemplates = jest.fn();
const mockRetry = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      if (mockFocused) return callback();
    }, [callback, mockFocused]);
  },
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `10000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}`,
}));
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-clients/service', () => ({
  loadWorkspaceClients: (...args: unknown[]) => mockClients(...args),
}));
jest.mock('../src/features/workspace-library/service', () => ({
  loadWorkspaceTemplates: (...args: unknown[]) => mockTemplates(...args),
}));
jest.mock('../src/features/workspace-scheduling/use-schedule', () => ({
  useWorkspaceSchedule: () => ({
    schedule: {
      availability: {
        id: 'workspace',
        timezone: 'Asia/Almaty',
        working_days: [0, 1, 2, 3, 4, 5, 6],
        day_start: '07:00:00',
        day_end: '21:00:00',
        usual_session_minutes: 75,
      },
      bookings: [],
      pendingProposals: [],
    },
    loading: false,
    failed: false,
    retry: mockRetry,
  }),
}));
jest.mock('../src/features/workspace-scheduling/pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/pending')
  >('../src/features/workspace-scheduling/pending'),
  loadPendingWorkspaceBooking: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/creation', () => ({
  submitWorkspaceBooking: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const load = jest.mocked(loadPendingWorkspaceBooking);
const submit = jest.mocked(submitWorkspaceBooking);
const clientA = '20000000-0000-4000-8000-000000000001';
const clientB = '20000000-0000-4000-8000-000000000002';
const created: CreateWorkspaceBookingResult = {
  created: true,
  requiresOverlapAcknowledgement: false,
  groupSessionId: null,
  bookingIds: ['booking'],
  overlaps: [],
  replayed: false,
};
const onCreated = jest.fn();
const mount = () =>
  render(
    <WorkspaceCreateSessionScreen
      userId="user"
      workspaceId="workspace"
      timezone="Asia/Almaty"
      initialDate="2030-10-02"
      initialStart="12:15"
      onClose={jest.fn()}
      onCreated={onCreated}
    />,
  );
const press = (name: string) =>
  fireEvent.press(screen.getByRole('button', { name }));
beforeEach(() => {
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue(bookingAuthFixture('user').client);
  mockFocused = true;
  mockUuid = 0;
  onCreated.mockReset();
  load.mockReset().mockResolvedValue(null);
  submit.mockReset().mockResolvedValue(created);
  mockClients.mockReset().mockResolvedValue([
    {
      id: clientA,
      display_name: 'Real Anna',
      archived_at: null,
      programName: null,
    },
    {
      id: clientB,
      display_name: 'Real Dana',
      archived_at: null,
      programName: null,
    },
  ]);
  mockTemplates.mockReset().mockResolvedValue([]);
});

test('real catalogue and workspace defaults create a program-later booking and return requested date', async () => {
  await mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Real Anna' })).toBeTruthy(),
  );
  expect(screen.queryByText('Дана')).toBeNull();
  await press('Real Anna');
  await press('Продолжить');
  expect(screen.getByRole('button', { name: '75 мин' })).toHaveProp(
    'accessibilityState',
    { selected: true, disabled: false },
  );
  await press('Продолжить');
  await press('Назначить программу позже');
  await press('Создать занятие');
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0]?.[2]).toEqual(
    expect.objectContaining({
      clientRecordIds: [clientA],
      startsAtUtc: '2030-10-02T07:15:00.000Z',
      endsAtUtc: '2030-10-02T08:30:00.000Z',
    }),
  );
  expect(onCreated).toHaveBeenCalledWith('2030-10-02');
});

test('server overlap warns, requires explicit acknowledgement and sends a new request identity', async () => {
  submit.mockResolvedValueOnce({
    ...created,
    created: false,
    bookingIds: [],
    requiresOverlapAcknowledgement: true,
    overlaps: [
      {
        bookingIds: ['existing'],
        startsAtUtc: '2030-10-02T07:00:00.000Z',
        endsAtUtc: '2030-10-02T08:00:00.000Z',
      },
    ],
  });
  await mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Real Anna' })).toBeTruthy(),
  );
  await press('Real Anna');
  await press('Продолжить');
  await press('Продолжить');
  await press('Назначить программу позже');
  await press('Создать занятие');
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
  expect(onCreated).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('checkbox'));
  await press('Создать занятие');
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1]?.[2].collisionAcknowledged).toBe(true);
  expect(submit.mock.calls[1]?.[2].requestId).not.toEqual(
    submit.mock.calls[0]?.[2].requestId,
  );
});

test('pending command restores all participants duration and later program and survives catalogue failure', async () => {
  const pending: PendingWorkspaceBooking = {
    clientRecordIds: [clientA, clientB],
    startsAtUtc: '2030-10-03T06:30:00.000Z',
    endsAtUtc: '2030-10-03T08:00:00.000Z',
    collisionAcknowledged: false,
    requestId: '30000000-0000-4000-8000-000000000001',
    plan: null,
  };
  load.mockResolvedValue(pending);
  mockClients.mockRejectedValueOnce(new Error('catalogue'));
  await mount();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Повторить создание' }),
    ).toBeTruthy(),
  );
  await press('Повторить создание');
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      'user',
      'workspace',
      expect.objectContaining({
        requestId: pending.requestId,
        clientRecordIds: [clientA, clientB],
        startsAtUtc: pending.startsAtUtc,
        endsAtUtc: pending.endsAtUtc,
      }),
      expect.any(Function),
    ),
  );
  expect(onCreated).toHaveBeenCalledWith('2030-10-03');
});

test('noncreation on saved recovery preserves the full restored draft for explicit acknowledgement', async () => {
  const pending: PendingWorkspaceBooking = {
    clientRecordIds: [clientA, clientB],
    startsAtUtc: '2030-10-03T06:30:00.000Z',
    endsAtUtc: '2030-10-03T08:00:00.000Z',
    collisionAcknowledged: false,
    requestId: '30000000-0000-4000-8000-000000000001',
  };
  load.mockResolvedValueOnce(pending).mockResolvedValue(null);
  submit.mockResolvedValueOnce({
    ...created,
    created: false,
    bookingIds: [],
    requiresOverlapAcknowledgement: true,
    overlaps: [
      {
        bookingIds: ['existing'],
        startsAtUtc: pending.startsAtUtc,
        endsAtUtc: pending.endsAtUtc,
      },
    ],
  });
  await mount();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Real Anna' })).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: true },
    ),
  );
  expect(screen.getByRole('button', { name: 'Real Dana' })).toHaveProp(
    'accessibilityState',
    { selected: true, disabled: true },
  );
  await press('Повторить создание');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled(),
  );
  await press('Продолжить');
  expect(screen.getByRole('button', { name: '11:30' })).toHaveProp(
    'accessibilityState',
    { selected: true, disabled: false },
  );
  expect(screen.getByRole('button', { name: '90 мин' })).toHaveProp(
    'accessibilityState',
    { selected: true, disabled: false },
  );
  await press('Продолжить');
  expect(
    screen.getByRole('button', { name: 'Назначить программу позже' }),
  ).toHaveProp('accessibilityState', { selected: true, disabled: false });
  expect(screen.getByRole('checkbox')).toBeTruthy();
  expect(onCreated).not.toHaveBeenCalled();
});

test('blurring the retained creator while shared provider survives suppresses late navigation', async () => {
  let resolve!: (value: CreateWorkspaceBookingResult) => void;
  const request = new Promise<CreateWorkspaceBookingResult>((done) => {
    resolve = done;
  });
  submit.mockReturnValueOnce(request);
  const tree = (open: boolean) => (
    <WorkspaceMutationProvider userId="user" workspaceId="workspace">
      {open ? (
        <WorkspaceCreateSessionScreen
          userId="user"
          workspaceId="workspace"
          timezone="Asia/Almaty"
          initialDate="2030-10-02"
          initialStart="12:15"
          onClose={jest.fn()}
          onCreated={onCreated}
        />
      ) : null}
    </WorkspaceMutationProvider>
  );
  const view = await render(tree(true));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Real Anna' })).toBeTruthy(),
  );
  await press('Real Anna');
  await press('Продолжить');
  await press('Продолжить');
  await press('Назначить программу позже');
  const saving = press('Создать занятие');
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  mockFocused = false;
  await view.rerender(tree(true));
  await act(async () => resolve(created));
  await saving;
  expect(onCreated).not.toHaveBeenCalled();
});
