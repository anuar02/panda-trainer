import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useState } from 'react';
import { ClientFinancialMetrics } from '../src/features/trainer-billing/client-financial-metrics';
import '../src/lib/i18n';
import { getSupabaseClient } from '../src/features/auth/client';
import { ClientPurchaseControls } from '../src/features/trainer-billing/client-purchase-controls';
import { useTrainerBillingCommands } from '../src/features/trainer-billing/use-commands';
import { loadTrainerBilling } from '../src/features/trainer-billing/service';
import { loadTrainerPayments } from '../src/features/trainer-payments/service';
import { projectPurchasePayments } from '../src/domain/payments';
import {
  mutationAuth,
  mutationDeferred,
  financialId as id,
} from './financial-mutation-fixtures';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('../src/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: import('react').PropsWithChildren<{ open: boolean }>) =>
    open ? children : null,
}));
jest.mock('../src/features/workspace-scheduling/use-clock', () => ({
  useWorkspaceClock: () => new Date('2026-10-04T12:00:00Z'),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRequestId() }));
jest.mock('../src/features/workspace-scheduling/mutation-provider', () => ({
  useWorkspaceMutations: () =>
    jest.requireActual<typeof import('react')>('react').useContext(mockContext),
}));
const props = {
  userId: id(1),
  workspaceId: id(2),
  clientRecordId: id(3),
  clientName: 'Анна',
  timezone: 'UTC',
};
function useMockMutations() {
  const [generation, changed] = useState(0);
  const billing = useTrainerBillingCommands({
    userId: props.userId,
    workspaceId: props.workspaceId,
    onChanged: () => changed((value) => value + 1),
  });
  return { generation, blocked: billing.blocked, busy: billing.busy, billing };
}
const mockContext = createContext<ReturnType<typeof useMockMutations> | null>(
  null,
);
function Workflow() {
  const mutations = useMockMutations();
  return (
    <mockContext.Provider value={mutations}>
      <ClientFinancialMetrics {...props} />
      <ClientPurchaseControls {...props} />
    </mockContext.Provider>
  );
}
let mockSerial = 100;
const mockRequestId = () => id(++mockSerial);
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const stored = new Map<string, string>();
const receipts = new Map<string, { payload: string; data: Row }>();
const wire: { name: string; args: Row }[] = [];
let auth: ReturnType<typeof mutationAuth>;
let lose = false;
let readFailure = false;
let rpcFailure: string | null = null;
let pause: ReturnType<typeof mutationDeferred<void>> | null = null;
const from = (table: string) => {
  const filters: [string, unknown][] = [];
  let start = 0,
    end = 499;
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    },
    order: () => query,
    range: (a: number, b: number) => {
      start = a;
      end = b;
      return query;
    },
    setHeader: async () => {
      if (readFailure)
        return { data: null, error: { code: 'offline' }, count: null };
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every(([field, value]) => row[field] === value),
      );
      return {
        data: rows.slice(start, end + 1).map((row) => ({ ...row })),
        error: null,
        count: rows.length,
      };
    },
  };
  return query;
};
function purchase(
  purchaseId: string,
  price = '10000',
  expires: string | null = null,
  client = props.clientRecordId,
  workspace = props.workspaceId,
) {
  tables.client_purchases!.push({
    id: purchaseId,
    workspace_id: workspace,
    client_record_id: client,
    title: 'Пакет',
    units: 8,
    price_minor: price,
    currency: 'KZT',
    expires_on: expires,
    created_at: '2026-10-04T10:00:00Z',
  });
  tables.credit_entries!.push({
    id: id(++mockSerial),
    workspace_id: workspace,
    client_record_id: client,
    purchase_id: purchaseId,
    attendance_id: null,
    booking_id: null,
    cycle: null,
    kind: 'grant',
    units: 8,
    reason: null,
    reverses_entry_id: null,
    created_at: '2026-10-04T10:00:00Z',
  });
}
const rpc = jest.fn((name: string, args: Row) => ({
  setHeader: async () => {
    wire.push({ name, args: { ...args } });
    if (rpcFailure) return { data: null, error: { code: rpcFailure } };
    const requestId = String(args.p_request_id);
    const payload = JSON.stringify({ name, args });
    const prior = receipts.get(requestId);
    if (prior) {
      expect(payload).toBe(prior.payload);
      return { data: { ...prior.data, replayed: true }, error: null };
    }
    let data: Row;
    if (name === 'create_client_purchase') {
      const purchaseId = id(++mockSerial);
      purchase(
        purchaseId,
        String(args.p_price_minor),
        (args.p_expires_on as string | null) ?? null,
      );
      data = {
        purchase_id: purchaseId,
        workspace_id: props.workspaceId,
        client_record_id: props.clientRecordId,
      };
    } else {
      const original =
        name === 'reverse_client_payment'
          ? tables.payment_entries!.find(
              (row) => row.id === args.p_payment_entry_id,
            )
          : null;
      const purchaseId = original?.purchase_id ?? args.p_purchase_id;
      const target = tables.client_purchases!.find(
        (row) => row.id === purchaseId,
      );
      if (!target) throw new Error('Missing synthetic purchase');
      const entry: Row = {
        id: id(++mockSerial),
        workspace_id: target.workspace_id,
        client_record_id: target.client_record_id,
        purchase_id: purchaseId,
        kind: original ? 'reversal' : 'payment',
        amount_minor: original
          ? `-${original.amount_minor}`
          : args.p_amount_minor,
        currency: 'KZT',
        paid_on: original?.paid_on ?? args.p_paid_on,
        method: original?.method ?? args.p_method,
        source: 'manual',
        reason: args.p_reason ?? null,
        reverses_entry_id: original?.id ?? null,
        created_at: '2026-10-04T12:00:00Z',
      };
      tables.payment_entries!.push(entry);
      const paid = tables
        .payment_entries!.filter((row) => row.purchase_id === purchaseId)
        .reduce((sum, row) => sum + BigInt(String(row.amount_minor)), 0n);
      data = {
        ...entry,
        payment_entry_id: entry.id,
        paid_minor: paid.toString(),
        due_minor: (BigInt(String(target.price_minor)) - paid).toString(),
      };
    }
    receipts.set(requestId, { payload, data });
    if (pause) await pause.promise;
    if (lose) {
      lose = false;
      throw new Error('Synthetic lost response');
    }
    return { data: { ...data, replayed: false }, error: null };
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  for (const table of [
    'client_purchases',
    'credit_entries',
    'attendance_records',
    'attendance_revisions',
    'payment_entries',
  ])
    tables[table] = [];
  stored.clear();
  receipts.clear();
  wire.length = 0;
  mockSerial = 100;
  lose = false;
  readFailure = false;
  rpcFailure = null;
  pause = null;
  auth = mutationAuth(props.userId);
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ auth: auth.auth, from, rpc } as unknown as NonNullable<
      ReturnType<typeof getSupabaseClient>
    >);
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => stored.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    stored.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    stored.delete(key);
  });
});
const flush = async () => {
  await act(async () => {});
};
async function pay(amount: string, index = 0) {
  await fireEvent.press(screen.getAllByText('Записать оплату')[index]!);
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), amount);
  await fireEvent.press(screen.getAllByText('Записать оплату').at(-1)!);
  await flush();
}
async function projection() {
  const scope = {
    expectedUserId: props.userId,
    workspaceId: props.workspaceId,
    clientRecordId: props.clientRecordId,
  };
  const billing = await loadTrainerBilling(scope);
  const payments = await loadTrainerPayments(scope);
  return {
    billing,
    payments,
    projection: projectPurchasePayments(billing.purchases, payments, scope),
  };
}
test('production read/command/controller purchase → partial → full → reversal → reload with same titles and expired debt', async () => {
  purchase(id(10), '20000', '2026-10-03');
  purchase(id(11), '99000', null, id(20));
  purchase(id(12), '88000', null, props.clientRecordId, id(21));
  const view = await render(<Workflow />);
  await flush();
  await fireEvent.press(screen.getByText('Добавить пакет'));
  await fireEvent.changeText(screen.getByLabelText('Название'), 'Пакет');
  await fireEvent.changeText(screen.getByLabelText('Количество занятий'), '8');
  await fireEvent.changeText(screen.getByLabelText('Стоимость, ₸'), '100');
  await fireEvent.press(screen.getAllByText('Добавить пакет').at(-1)!);
  await flush();
  expect((await projection()).billing.purchases).toHaveLength(2);
  const grants = JSON.stringify(tables.credit_entries);
  await pay('40', 1);
  expect(screen.getByText('К оплате 60 ₸')).toBeTruthy();
  await pay('60', 1);
  expect(screen.getByText('Оплачено')).toBeTruthy();
  await fireEvent.press(screen.getAllByText('Отменить оплату')[0]!);
  await fireEvent.changeText(screen.getByLabelText('Причина отмены'), 'Ошибка');
  await fireEvent.press(screen.getByText('Подтвердить отмену'));
  await flush();
  expect(screen.getByText('Отменена')).toBeTruthy();
  const snapshot = await projection();
  expect(snapshot.projection.purchases.map((row) => row.dueMinor)).toEqual([
    '20000',
    '6000',
  ]);
  expect(
    snapshot.payments.entries.every(
      (entry) => entry.source === 'manual' && entry.paidOn === '2026-10-04',
    ),
  ).toBe(true);
  expect(JSON.stringify(tables.credit_entries)).toBe(grants);
  expect(snapshot.billing.attendance).toEqual([]);
  await view.unmount();
  await render(<Workflow />);
  await flush();
  expect(screen.getByText('К оплате 60 ₸')).toBeTruthy();
  expect(screen.getByText('260 ₸')).toBeTruthy();
  expect(screen.getByText('8')).toBeTruthy();
  expect(screen.getAllByText('Отменена')).toHaveLength(1);
  expect(stored.size).toBe(0);
});
test('lost result, double tap, reopen, clear failure and exact durable replay never create a second payment', async () => {
  purchase(id(10));
  lose = true;
  const view = await render(<Workflow />);
  await flush();
  await pay('40');
  expect(stored.size).toBe(1);
  const original = wire[0];
  await view.unmount();
  await render(<Workflow />);
  await flush();
  jest
    .mocked(AsyncStorage.removeItem)
    .mockRejectedValueOnce(new Error('Synthetic clear failure'));
  await fireEvent.press(screen.getByText('Повторить сохранённую операцию'));
  await flush();
  expect(stored.size).toBe(1);
  await fireEvent.press(screen.getByText('Попробовать снова'));
  await flush();
  const resume = screen.getByText('Повторить сохранённую операцию');
  await act(async () => {
    await fireEvent.press(resume);
    await fireEvent.press(resume);
  });
  await flush();
  expect(wire).toEqual([original, original, original]);
  expect(tables.payment_entries).toHaveLength(1);
  expect(stored.size).toBe(0);
  expect(screen.getByText('К оплате 60 ₸')).toBeTruthy();
});
test('relogin → fresh creation form → old completion does not publish fields, busy, errors or close', async () => {
  purchase(id(10));
  pause = mutationDeferred<void>();
  await render(<Workflow />);
  await flush();
  await pay('40');
  expect(stored.size).toBe(1);
  await act(async () => {
    auth.emit('SIGNED_OUT', null);
    auth.emit('SIGNED_IN', auth.session(props.userId, id(90)));
  });
  await flush();
  expect(screen.queryByLabelText('Сумма, ₸')).toBeNull();
  expect(screen.queryByText('Не удалось записать оплату')).toBeNull();
  await act(async () => pause!.resolve());
  await flush();
  expect(stored.size).toBe(1);
  await fireEvent.press(screen.getByText('Повторить сохранённую операцию'));
  await flush();
  await fireEvent.press(screen.getByText('Добавить пакет'));
  expect(screen.getByLabelText('Название').props.value).toBe('');
  expect(screen.getByLabelText('Название').props.editable).toBe(true);
});
test('read failure after known receipt hides balances and permits honest refresh', async () => {
  purchase(id(10));
  await render(<Workflow />);
  await flush();
  readFailure = true;
  await pay('40');
  expect(screen.queryByText('Оплачено')).toBeNull();
  expect(screen.queryByText('К оплате 60 ₸')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  readFailure = false;
  await fireEvent.press(screen.getByText('Повторить'));
  await flush();
  expect(screen.getByText('К оплате 60 ₸')).toBeTruthy();
});

test('server overpayment refresh keeps its field error for the actual debt and permits a corrected new attempt', async () => {
  purchase(id(10));
  await render(<Workflow />);
  await flush();
  tables.payment_entries!.push({
    id: id(80),
    workspace_id: props.workspaceId,
    client_record_id: props.clientRecordId,
    purchase_id: id(10),
    kind: 'payment',
    amount_minor: '5000',
    currency: 'KZT',
    paid_on: '2026-10-04',
    method: 'Kaspi',
    source: 'manual',
    reason: null,
    reverses_entry_id: null,
    created_at: '2026-10-04T11:00:00Z',
  });
  rpcFailure = 'P0003';
  await pay('60');
  expect(screen.getByText('Больше долга по пакету (50 ₸)')).toBeTruthy();
  expect(screen.getByLabelText('Сумма, ₸')).toBeTruthy();
  expect(stored.size).toBe(0);
  expect(screen.queryByText('Оплачено')).toBeNull();
  rpcFailure = null;
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '40');
  await fireEvent.press(screen.getAllByText('Записать оплату').at(-1)!);
  await flush();
  expect(screen.getByText('К оплате 10 ₸')).toBeTruthy();
  expect(wire[0]?.args.p_request_id).not.toBe(wire[1]?.args.p_request_id);
});
test('unmount and close/reopen while response is deferred preserve one command and fresh UI', async () => {
  purchase(id(10));
  pause = mutationDeferred<void>();
  const view = await render(<Workflow />);
  await flush();
  await fireEvent.press(screen.getByText('Записать оплату'));
  await fireEvent.changeText(screen.getByLabelText('Сумма, ₸'), '40');
  const save = screen.getAllByText('Записать оплату').at(-1)!;
  await act(async () => {
    await fireEvent.press(save);
    await fireEvent.press(save);
  });
  await flush();
  expect(wire).toHaveLength(1);
  await fireEvent.press(screen.getByText('Отмена'));
  expect(screen.queryByLabelText('Сумма, ₸')).toBeNull();
  await view.unmount();
  await render(<Workflow />);
  await flush();
  expect(screen.getByText('Повторить сохранённую операцию')).toBeTruthy();
  await act(async () => pause!.resolve());
  await flush();
  expect(stored.size).toBe(1);
  await fireEvent.press(screen.getByText('Повторить сохранённую операцию'));
  await flush();
  expect(wire[1]).toEqual(wire[0]);
  expect(screen.getByText('К оплате 60 ₸')).toBeTruthy();
});
