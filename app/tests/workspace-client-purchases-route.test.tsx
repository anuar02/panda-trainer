import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import '../src/lib/i18n';
import WorkspaceClientDetailsRoute from '../app/workspace/client/[id]';
import { loadWorkspaceClientDetails } from '../src/features/workspace-clients/service';
import { useTrainerBilling } from '../src/features/trainer-billing/use-billing';
import type { WorkspaceClientDetailsData } from '../src/features/workspace-clients/details-screen';
import type { TrainerBilling } from '../src/features/trainer-billing/types';

const workspaceId = '61000000-0000-4000-8000-000000000001';
const clientId = '71000000-0000-4000-8000-000000000001';
const userId = '81000000-0000-4000-8000-000000000001';
let mockTab: string | undefined = 'billing';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({
    id: '71000000-0000-4000-8000-000000000001',
    tab: mockTab,
  }),
  useFocusEffect: (callback: () => void) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]);
  },
  Redirect: () => null,
}));
jest.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({
    loading: false,
    failed: false,
    session: { user: { id: '81000000-0000-4000-8000-000000000001' } },
  }),
}));
jest.mock('../src/features/onboarding/use-onboarding-context', () => ({
  useOnboardingContext: () => ({
    loading: false,
    failed: false,
    context: {
      workspace: {
        id: '61000000-0000-4000-8000-000000000001',
        timezone: 'Asia/Almaty',
      },
    },
  }),
}));
jest.mock('../src/features/workspace-programs/use-assignment', () => ({
  useClientProgramAssignment: () => ({
    pending: null,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));
jest.mock('../src/features/workspace-clients/service', () => ({
  loadWorkspaceClientDetails: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/use-billing', () => ({
  useTrainerBilling: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
const retry = jest.fn();
const read = jest.mocked(useTrainerBilling);
const purchaseId = '91000000-0000-4000-8000-000000000001';
const billing: TrainerBilling = {
  purchases: [
    {
      id: purchaseId,
      workspaceId,
      clientRecordId: clientId,
      title: 'Реальный пакет',
      units: 5,
      priceMinor: '125050',
      currency: 'KZT',
      expiresOn: null,
      createdAt: '2026-10-03T00:00:00Z',
    },
  ],
  attendance: [],
  revisions: [],
  credits: [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      workspaceId,
      clientRecordId: clientId,
      purchaseId,
      attendanceId: null,
      bookingId: null,
      cycle: null,
      kind: 'grant',
      units: 5,
      reason: null,
      reversesEntryId: null,
      createdAt: '2026-10-03T00:00:00Z',
    },
  ],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockTab = 'billing';
  jest.mocked(loadWorkspaceClientDetails).mockResolvedValue({
    client: {
      id: clientId,
      workspace_id: workspaceId,
      display_name: 'Настоящий клиент',
      phone: '',
      user_id: null,
    } as WorkspaceClientDetailsData['client'],
    program: null,
    bookings: [],
  });
  read.mockReturnValue({ data: billing, error: null, loading: false, retry });
});

test('opens the real billing tab from its route and reads only the selected client scope', async () => {
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() => expect(screen.getByText('Реальный пакет')).toBeTruthy());
  expect(read).toHaveBeenCalledWith(userId, workspaceId, clientId);
  expect(screen.getByRole('tab', { name: 'Оплаты' })).toBeSelected();
  expect(screen.getByText('1 250,50 ₸')).toBeTruthy();
  expect(screen.getByText('5 · использовано 0')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Записать оплату' }),
  ).toBeDisabled();
  expect(screen.queryByText('Оплачено')).toBeNull();
});

test('billing read failure preserves the client and exposes retry without a fake empty state', async () => {
  read.mockReturnValue({ data: null, error: 'request', loading: false, retry });
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() =>
    expect(screen.getByText('Настоящий клиент')).toBeTruthy(),
  );
  expect(screen.getByText('Не удалось загрузить покупки.')).toBeTruthy();
  expect(screen.queryByText('Покупок нет')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Повторить' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('package loading is independent of core client loading and remains accessible after tab navigation', async () => {
  mockTab = undefined;
  read.mockReturnValue({ data: null, error: null, loading: true, retry });
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() =>
    expect(screen.getByText('Настоящий клиент')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('tab', { name: 'Оплаты' }));
  expect(
    screen.getByRole('progressbar', { name: 'Загрузка покупок…' }),
  ).toBeTruthy();
  expect(screen.queryByText('Покупок нет')).toBeNull();
});
