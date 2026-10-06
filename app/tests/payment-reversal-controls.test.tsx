import { act, fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import { ClientPurchaseControls } from '../src/features/trainer-billing/client-purchase-controls';
import type { TrainerBillingCommand } from '../src/features/trainer-billing/commands';
import type { PaymentEntry } from '../src/features/trainer-payments/types';

import { mutationAuth } from './financial-mutation-fixtures';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
let mockAuth: ReturnType<typeof mutationAuth>;
const id = (n: number) =>
  `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const props = {
  userId: id(1),
  workspaceId: id(2),
  clientRecordId: id(3),
  clientName: 'Анна',
  timezone: 'UTC',
};
const payment: PaymentEntry = {
  id: id(4),
  workspaceId: props.workspaceId,
  clientRecordId: props.clientRecordId,
  purchaseId: id(5),
  kind: 'payment',
  amountMinor: '9007199254740993',
  currency: 'KZT',
  paidOn: '2026-10-03',
  method: 'Kaspi',
  source: 'manual',
  reason: null,
  reversesEntryId: null,
  createdAt: '2026-10-03T12:00:00Z',
};
let mockEntries: PaymentEntry[] = [];
let mockPending: TrainerBillingCommand | null = null;
const mockSubmit = jest.fn<Promise<boolean>, [TrainerBillingCommand]>();
const mockResume = jest.fn();
const mockReload = jest.fn();
let mockError: string | null = null;
const mockReadRetry = jest.fn();
const mockPaymentsRetry = jest.fn();
let mockGeneration = 0;
jest.mock('../src/features/workspace-scheduling/mutation-provider', () => ({
  useWorkspaceMutations: () => ({
    generation: mockGeneration,
    blocked: mockPending !== null,
    busy: false,
    billing: {
      pending: mockPending,
      error: mockError ?? (mockPending ? 'request' : null),
      busy: false,
      submit: mockSubmit,
      resume: mockResume,
      reload: mockReload,
    },
  }),
}));
jest.mock('../src/features/trainer-billing/use-billing', () => ({
  useTrainerBilling: (
    _user: string,
    workspaceId: string,
    clientRecordId: string,
  ) => ({
    data: {
      purchases: [
        {
          id: '91000000-0000-4000-8000-000000000005',
          workspaceId,
          clientRecordId,
          title: 'Пакет',
          units: 2,
          priceMinor: '9007199254740993',
          currency: 'KZT',
          expiresOn: null,
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      attendance: [],
      revisions: [],
      credits: [
        {
          id: 'grant',
          workspaceId,
          clientRecordId,
          purchaseId: '91000000-0000-4000-8000-000000000005',
          attendanceId: null,
          bookingId: null,
          cycle: null,
          kind: 'grant',
          units: 2,
          reason: null,
          reversesEntryId: null,
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
    },
    error: null,
    loading: false,
    retry: mockReadRetry,
  }),
}));
jest.mock('../src/features/trainer-payments/use-payments', () => ({
  useTrainerPayments: () => ({
    data: { entries: mockEntries },
    loading: false,
    error: null,
    retry: mockPaymentsRetry,
  }),
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2026-10-03T12:00:00Z'),
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: import('react').PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '91000000-0000-4000-8000-000000000099',
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = mutationAuth(props.userId);
  mockAuth.install();
  mockEntries = [payment];
  mockPending = null;
  mockGeneration = 0;
  mockError = null;
  mockSubmit.mockResolvedValue(true);
});
async function open() {
  await fireEvent.press(screen.getByText('Отменить оплату'));
  await fireEvent.changeText(
    screen.getByLabelText('Причина отмены'),
    ' Ошибка оплаты ',
  );
}
test('cancel sends no command; confirmation sends exact scoped reversal and waits for receipt', async () => {
  let finish: (value: boolean) => void = () => {};
  mockSubmit.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render(<ClientPurchaseControls {...props} />);
  await open();
  await fireEvent.press(screen.getByText('Отмена'));
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.queryByText('Подтвердить отмену')).toBeNull();
  await open();
  const confirm = screen.getByText('Подтвердить отмену');
  await fireEvent.press(confirm);
  await fireEvent.press(confirm);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockSubmit).toHaveBeenCalledWith({
    action: 'reversePayment',
    requestId: id(99),
    paymentEntryId: payment.id,
    clientRecordId: props.clientRecordId,
    purchaseId: payment.purchaseId,
    amountMinor: payment.amountMinor,
    reason: 'Ошибка оплаты',
  });
  expect(screen.getByText('Подтвердить отмену')).toBeTruthy();
  expect(screen.queryByText('Отменена')).toBeNull();
  await act(async () => finish(true));
  expect(screen.queryByText('Подтвердить отмену')).toBeNull();
});
test('reversal history is one struck original row with cancellation date, debt and unchanged units', async () => {
  mockEntries.push({
    ...payment,
    id: id(6),
    kind: 'reversal',
    amountMinor: `-${payment.amountMinor}`,
    reversesEntryId: payment.id,
    reason: 'Ошибка оплаты',
    createdAt: '2026-10-05T09:00:00Z',
  });
  await render(<ClientPurchaseControls {...props} />);
  expect(screen.getAllByText('Отменена')).toHaveLength(1);
  expect(screen.getByText(/Дата отмены:.*5/)).toBeTruthy();
  const amounts = screen.getAllByText('90 071 992 547 409,93 ₸');
  expect(amounts).toHaveLength(2);
  const amount = amounts[1];
  if (!amount) throw new Error('Missing payment history amount');
  expect(amount.props.style).toMatchObject({
    textDecorationLine: 'line-through',
  });
  expect(screen.getByText('К оплате 90 071 992 547 409,93 ₸')).toBeTruthy();
  expect(screen.getByText('2 · использовано 0')).toBeTruthy();
  expect(screen.queryByText('Отменить оплату')).toBeNull();
  expect(screen.queryByText(/−90/)).toBeNull();
});
test('lost response exposes pending exact recovery; client switch disables replay and clears confirmation', async () => {
  mockSubmit.mockResolvedValue(false);
  const view = await render(<ClientPurchaseControls {...props} />);
  await open();
  await fireEvent.press(screen.getByText('Подтвердить отмену'));
  expect(screen.getByRole('alert')).toBeTruthy();
  const call = mockSubmit.mock.calls[0]?.[0];
  if (!call) throw new Error('Missing reversal command');
  mockPending = call;
  await view.rerender(<ClientPurchaseControls {...props} />);
  await fireEvent.press(screen.getByText('Повторить сохранённую операцию'));
  expect(mockResume).toHaveBeenCalledTimes(1);
  await view.rerender(
    <ClientPurchaseControls {...props} clientRecordId={id(7)} />,
  );
  expect(screen.queryByText('Подтвердить отмену')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Попробовать снова' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByText('Попробовать снова'));
  expect(mockResume).toHaveBeenCalledTimes(1);
});
test('account/workspace switch clears confirmation and mutation generation refreshes both reads', async () => {
  const view = await render(<ClientPurchaseControls {...props} />);
  await open();
  await view.rerender(
    <ClientPurchaseControls {...props} userId={id(8)} workspaceId={id(9)} />,
  );
  expect(screen.queryByText('Подтвердить отмену')).toBeNull();
  expect(mockSubmit).not.toHaveBeenCalled();
  mockGeneration = 1;
  await view.rerender(
    <ClientPurchaseControls {...props} userId={id(8)} workspaceId={id(9)} />,
  );
  expect(mockReadRetry).toHaveBeenCalledTimes(1);
  expect(mockPaymentsRetry).toHaveBeenCalledTimes(1);
});

test('same-client storage error allows recovery reload without sending a new reversal', async () => {
  mockPending = {
    action: 'reversePayment',
    requestId: id(99),
    paymentEntryId: payment.id,
    clientRecordId: props.clientRecordId,
    purchaseId: payment.purchaseId,
    amountMinor: payment.amountMinor,
    reason: 'Ошибка оплаты',
  };
  mockError = 'storage';
  await render(<ClientPurchaseControls {...props} />);
  expect(
    screen.getByRole('button', { name: 'Попробовать снова' }).props
      .accessibilityState.disabled,
  ).toBe(false);
  await fireEvent.press(screen.getByText('Попробовать снова'));
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(mockResume).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});

async function openPayment() {
  await fireEvent.press(screen.getByText('Записать оплату'));
}
test.each(['payment', 'purchase', 'reversal'])(
  'generation resets %s draft and old completion cannot close a fresh form',
  async (form) => {
    mockEntries = [];
    if (form === 'reversal') mockEntries = [payment];
    let complete: (value: boolean) => void = () => {};
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const view = await render(<ClientPurchaseControls {...props} />);
    if (form === 'payment') {
      await openPayment();
      await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '1');
      await fireEvent.press(screen.getAllByText('Записать оплату').at(-1)!);
    } else if (form === 'purchase') {
      await fireEvent.press(screen.getByText('Добавить пакет'));
      await fireEvent.changeText(screen.getByLabelText('Название'), 'Черновик');
      await fireEvent.changeText(
        screen.getByLabelText('Количество занятий'),
        '2',
      );
      await fireEvent.changeText(screen.getByLabelText('Стоимость, ₸'), '1');
      await fireEvent.press(screen.getAllByText('Добавить пакет').at(-1)!);
    } else {
      await open();
      await fireEvent.press(screen.getByText('Подтвердить отмену'));
    }
    mockGeneration += 1;
    await view.rerender(<ClientPurchaseControls {...props} />);
    expect(screen.queryByLabelText('Сумма, ₸')).toBeNull();
    expect(screen.queryByLabelText('Название')).toBeNull();
    expect(screen.queryByLabelText('Причина отмены')).toBeNull();
    await fireEvent.press(screen.getByText('Добавить пакет'));
    await fireEvent.changeText(
      screen.getByLabelText('Название'),
      'Новая форма',
    );
    await act(async () => complete(true));
    expect(screen.getByLabelText('Название').props.value).toBe('Новая форма');
    expect(screen.getByLabelText('Название').props.editable).toBe(true);
    expect(mockReadRetry).toHaveBeenCalledTimes(1);
    expect(mockPaymentsRetry).toHaveBeenCalledTimes(1);
  },
);
test.each([true, false])(
  'same-user relogin fresh form rejects late outcome %s',
  async (outcome) => {
    mockEntries = [];
    let complete: (value: boolean) => void = () => {};
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await render(<ClientPurchaseControls {...props} />);
    await openPayment();
    await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '1');
    await fireEvent.press(screen.getAllByText('Записать оплату').at(-1)!);
    await act(async () => {
      mockAuth.emit('SIGNED_OUT', null);
      mockAuth.emit('SIGNED_IN', mockAuth.session(props.userId, id(90)));
    });
    expect(screen.queryByLabelText('Сумма, ₸')).toBeNull();
    await openPayment();
    await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '2');
    await act(async () => complete(outcome));
    expect(screen.getByLabelText('Сумма, ₸').props.value).toBe('2');
    expect(screen.getByLabelText('Сумма, ₸').props.editable).toBe(true);
    expect(
      screen.queryByText('Не удалось записать оплату. Попробуйте ещё раз.'),
    ).toBeNull();
  },
);
test('verified token refresh preserves current form and permits its normal completion', async () => {
  mockEntries = [];
  let complete: (value: boolean) => void = () => {};
  mockSubmit.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await render(<ClientPurchaseControls {...props} />);
  await openPayment();
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '1');
  await fireEvent.press(screen.getAllByText('Записать оплату').at(-1)!);
  await act(async () =>
    mockAuth.emit(
      'TOKEN_REFRESHED',
      mockAuth.session(props.userId, undefined, 2),
    ),
  );
  expect(screen.getByLabelText('Сумма, ₸').props.value).toBe('1');
  await act(async () => complete(true));
  expect(screen.queryByLabelText('Сумма, ₸')).toBeNull();
});

test('dismissal of a busy reversal preserves the command and old completion cannot close a reopened confirmation', async () => {
  let complete: (value: boolean) => void = () => {};
  mockSubmit.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await render(<ClientPurchaseControls {...props} />);
  await open();
  await fireEvent.press(screen.getByText('Подтвердить отмену'));
  await fireEvent.press(screen.getByText('Отмена'));
  expect(screen.queryByLabelText('Причина отмены')).toBeNull();
  await fireEvent.press(screen.getByText('Отменить оплату'));
  expect(screen.getByLabelText('Причина отмены').props.value).toBe('');
  await fireEvent.changeText(
    screen.getByLabelText('Причина отмены'),
    'Новая причина',
  );
  await act(async () => complete(true));
  expect(screen.getByLabelText('Причина отмены').props.value).toBe(
    'Новая причина',
  );
  expect(screen.getByLabelText('Причина отмены').props.editable).toBe(true);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
test.each(['recordPayment', 'createPurchase'])(
  'a foreign-client %s pending cannot resume from this client',
  async (action) => {
    mockPending =
      action === 'recordPayment'
        ? {
            action: 'recordPayment',
            purchaseId: id(80),
            amountMinor: '100',
            method: 'Kaspi',
            paidOn: '2026-10-04',
            requestId: id(99),
          }
        : {
            action: 'createPurchase',
            clientRecordId: id(80),
            title: 'Пакет',
            units: 8,
            priceMinor: '100',
            requestId: id(99),
          };
    await render(<ClientPurchaseControls {...props} />);
    const retry = screen.getByRole('button', { name: 'Попробовать снова' });
    expect(retry.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(retry);
    expect(mockResume).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  },
);
