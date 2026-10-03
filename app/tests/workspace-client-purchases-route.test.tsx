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
const mockSubmit = jest.fn();
const mockResume = jest.fn();
let mockPending:
  | import('../src/features/trainer-billing/commands').TrainerBillingCommand
  | null = null;
jest.mock('../src/features/workspace-scheduling/mutation-provider', () => ({
  WorkspaceMutationBoundary: ({
    children,
  }: import('react').PropsWithChildren) => children,
  useWorkspaceMutations: () => ({
    generation: 0,
    blocked: mockPending !== null,
    busy: false,
    billing: {
      pending: mockPending,
      error: null,
      busy: false,
      submit: mockSubmit,
      resume: mockResume,
      reload: jest.fn(),
    },
  }),
}));
jest.mock('../src/features/trainer-payments/use-payments', () => ({
  useTrainerPayments: () => ({
    data: { entries: [] },
    error: null,
    loading: false,
    retry: jest.fn(),
  }),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: import('react').PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'c1000000-0000-4000-8000-000000000001',
}));
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
  mockPending = null;
  mockSubmit.mockResolvedValue(true);
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
  expect(screen.getByRole('button', { name: 'Записать оплату' })).toBeEnabled();
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

test('creates an exact client package through the shared command controller', async () => {
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() => expect(screen.getByText('Реальный пакет')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Добавить пакет' }));
  await fireEvent.changeText(screen.getByLabelText('Название'), 'Новый пакет');
  await fireEvent.changeText(screen.getByLabelText('Количество занятий'), '8');
  await fireEvent.changeText(screen.getByLabelText('Стоимость, ₸'), '12000,50');
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Добавить пакет' }).at(1)!,
  );
  expect(mockSubmit).toHaveBeenCalledWith({
    action: 'createPurchase',
    requestId: 'c1000000-0000-4000-8000-000000000001',
    clientRecordId: clientId,
    title: 'Новый пакет',
    units: 8,
    priceMinor: '1200050',
    expiresOn: null,
  });
});

test('payment rejects over-debt input under the field and records a partial amount on the exact purchase', async () => {
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() => expect(screen.getByText('Реальный пакет')).toBeTruthy());
  await fireEvent.press(
    screen.getByRole('button', { name: 'Записать оплату' }),
  );
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '1250,51');
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Записать оплату' }).at(1)!,
  );
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('Больше долга по пакету (1 250,50 ₸)')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '250,50');
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Записать оплату' }).at(1)!,
  );
  expect(mockSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'recordPayment',
      purchaseId,
      amountMinor: '25050',
      method: 'Kaspi',
    }),
  );
});

test('an unresolved shared command blocks new packages and can be resumed from the client card', async () => {
  mockPending = {
    action: 'createPurchase',
    clientRecordId: clientId,
    title: 'Pending',
    units: 2,
    priceMinor: '100',
    requestId: 'c1000000-0000-4000-8000-000000000001',
  };
  await render(<WorkspaceClientDetailsRoute />);
  await waitFor(() => expect(screen.getByText('Реальный пакет')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Добавить пакет' })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Повторить сохранённую операцию' }),
  );
  expect(mockResume).toHaveBeenCalledTimes(1);
});
