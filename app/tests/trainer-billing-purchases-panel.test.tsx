import { fireEvent, render, screen } from '@testing-library/react-native';
import '../src/lib/i18n';
import {
  PurchasesPanel,
  type PurchasesPanelProps,
} from '../src/features/trainer-billing/purchases-panel';
import type { TrainerBilling } from '../src/features/trainer-billing/types';

const scope = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  clientRecordId: '20000000-0000-4000-8000-000000000001',
};
const billing = (): TrainerBilling => ({
  purchases: [
    {
      ...scope,
      id: 'purchase',
      title: 'Пакет 2 занятий',
      units: 2,
      priceMinor: '9223372036854775807',
      currency: 'KZT',
      expiresOn: '2026-10-03',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ],
  attendance: [],
  revisions: [],
  credits: [
    {
      ...scope,
      id: 'grant',
      purchaseId: 'purchase',
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
});
const onRetry = jest.fn();
const props = (): PurchasesPanelProps => ({
  ...scope,
  billing: billing(),
  loading: false,
  error: false,
  onRetry,
});
beforeEach(() => onRetry.mockClear());

it('offers one retry for payment failure and one for combined read failure', async () => {
  const view = await render(<PurchasesPanel {...props()} paymentsError />);
  expect(screen.getAllByText('Повторить')).toHaveLength(1);
  await fireEvent.press(screen.getByText('Повторить'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  await view.rerender(<PurchasesPanel {...props()} paymentsError error />);
  expect(screen.getAllByText('Повторить')).toHaveLength(1);
});

it('renders payment amount, long date, method, note and recorded status', async () => {
  const value = billing();
  const purchase = value.purchases[0];
  const grant = value.credits[0];
  if (!purchase || !grant) throw new Error('Missing purchase fixture');
  purchase.id = '30000000-0000-4000-8000-000000000001';
  grant.purchaseId = purchase.id;
  await render(
    <PurchasesPanel
      {...props()}
      billing={value}
      payments={{
        entries: [
          {
            ...scope,
            id: '40000000-0000-4000-8000-000000000001',
            purchaseId: purchase.id,
            kind: 'payment',
            amountMinor: '10000',
            currency: 'KZT',
            paidOn: '2026-10-03',
            method: 'Kaspi',
            source: 'manual',
            reason: 'Первый взнос',
            reversesEntryId: null,
            createdAt: '2026-10-03T12:00:00Z',
          },
        ],
      }}
      onPayment={jest.fn()}
    />,
  );
  expect(screen.getByText('Записано')).toBeTruthy();
  expect(screen.getByText('сб, 3 окт · Kaspi · Первый взнос')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Записать оплату', disabled: false }),
  ).toBeTruthy();
});

it('distinguishes loading and errors from an empty purchase list', async () => {
  const view = await render(<PurchasesPanel {...props()} loading />);
  expect(screen.getByLabelText('Загрузка покупок…')).toBeTruthy();
  expect(screen.queryByText('Покупок нет')).toBeNull();
  await view.rerender(<PurchasesPanel {...props()} error />);
  expect(screen.getByText('Не удалось загрузить покупки.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Повторить'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Покупок нет')).toBeNull();
  await view.rerender(
    <PurchasesPanel
      {...props()}
      billing={{ purchases: [], attendance: [], revisions: [], credits: [] }}
    />,
  );
  expect(screen.getByText('Покупок нет')).toBeTruthy();
  expect(
    screen.getByText('Разовое занятие или пакет появятся здесь после покупки.'),
  ).toBeTruthy();
});

it('renders exact prices and calendar expiry while payment data stays unknown', async () => {
  await render(<PurchasesPanel {...props()} />);
  expect(
    screen.getByText('92 233 720 368 547 758,07 ₸', {
      normalizer: (value) => value.replace(/\s/g, ' '),
    }),
  ).toBeTruthy();
  expect(screen.getByText('3 окт')).toBeTruthy();
  expect(screen.getByText('2 · использовано 0')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: 'Записать оплату', disabled: true }),
  ).toBeTruthy();
  expect(screen.getByText('История оплат')).toBeTruthy();
  expect(screen.getByText('Данные об оплатах пока недоступны.')).toBeTruthy();
  expect(screen.queryByText('Оплачено')).toBeNull();
  expect(screen.queryByText('Оплат пока нет.')).toBeNull();
});

it('filters foreign packages and refuses an invalid scoped ledger instead of showing zero used', async () => {
  const value = billing();
  value.purchases.push({
    ...value.purchases[0]!,
    id: 'foreign',
    clientRecordId: 'other',
    title: 'Чужая покупка',
  });
  const view = await render(<PurchasesPanel {...props()} billing={value} />);
  expect(screen.queryByText('Чужая покупка')).toBeNull();
  value.credits = [];
  await view.rerender(<PurchasesPanel {...props()} billing={value} />);
  expect(screen.getByText('Не удалось загрузить покупки.')).toBeTruthy();
  expect(screen.queryByText('2 · использовано 0')).toBeNull();
  expect(screen.queryByText('Покупок нет')).toBeNull();
});

it('reflects restored credits and preserves a package without expiry', async () => {
  const value = billing();
  value.purchases[0]!.expiresOn = null;
  value.attendance.push({
    ...scope,
    id: 'attendance',
    bookingId: 'booking',
    status: 'undone',
    revision: 2,
    cycle: 1,
    serviceDate: '2026-10-03',
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  });
  const consume = {
    ...value.credits[0]!,
    id: 'consume',
    attendanceId: 'attendance',
    bookingId: 'booking',
    cycle: 1,
    kind: 'consume' as const,
    units: -1,
  };
  value.credits.push(consume);
  const view = await render(<PurchasesPanel {...props()} billing={value} />);
  expect(screen.getByText('2 · использовано 1')).toBeTruthy();
  value.credits.push({
    ...consume,
    id: 'restore',
    kind: 'restore',
    units: 1,
    reversesEntryId: 'consume',
  });
  await view.rerender(<PurchasesPanel {...props()} billing={value} />);
  expect(screen.getByText('2 · использовано 0')).toBeTruthy();
  expect(screen.getByText('без срока')).toBeTruthy();
});
