import { financialToken } from './financial-read-fixtures';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  loadTrainerPayments,
  parsePaymentEntry,
} from '../src/features/trainer-payments/service';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const id = (n: number) =>
  `82000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = {
  workspaceId: id(1),
  clientRecordId: id(2),
  expectedUserId: id(3),
};
const row = {
  id: id(4),
  workspace_id: scope.workspaceId,
  client_record_id: scope.clientRecordId,
  purchase_id: id(5),
  kind: 'payment',
  amount_minor: '9223372036854775807',
  currency: 'KZT',
  paid_on: '2026-10-03',
  method: 'Kaspi',
  source: 'manual',
  reason: null,
  reverses_entry_id: null,
  created_at: '2026-10-03T00:00:00Z',
};
const session = jest.fn(),
  header = jest.fn(),
  from = jest.fn(),
  select = jest.fn(),
  eq = jest.fn(),
  order = jest.fn(),
  range = jest.fn();
const query = {
  select,
  eq,
  order,
  range,
  setHeader: (...args: unknown[]) =>
    Promise.resolve(header(...args)).then((response) => ({
      ...response,
      count:
        response.count ??
        (Array.isArray(response.data) ? response.data.length : null),
    })),
};
type PurchaseQuery = {
  eq: jest.Mock<PurchaseQuery>;
  order: jest.Mock<PurchaseQuery>;
  range: jest.Mock<PurchaseQuery>;
  setHeader: jest.Mock;
};
const purchaseQuery: PurchaseQuery = {
  eq: jest.fn(() => purchaseQuery),
  order: jest.fn(() => purchaseQuery),
  range: jest.fn(() => purchaseQuery),
  setHeader: jest.fn(async () => ({
    data: [
      {
        id: row.purchase_id,
        workspace_id: scope.workspaceId,
        client_record_id: scope.clientRecordId,
        title: 'Synthetic',
        units: 1,
        price_minor: '9223372036854775807',
        currency: 'KZT',
        expires_on: null,
        created_at: row.created_at,
      },
    ],
    error: null,
    count: 1,
  })),
};
beforeEach(() => {
  jest.clearAllMocks();
  session.mockReset();
  header.mockReset();
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: session,
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from,
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  session.mockResolvedValue({
    data: {
      session: {
        user: { id: scope.expectedUserId },
        access_token: financialToken(scope.expectedUserId),
      },
    },
    error: null,
  });
  for (const mock of [select, eq, order, range]) mock.mockReturnValue(query);
  from.mockImplementation((table) =>
    table === 'client_purchases'
      ? { ...query, select: jest.fn(() => purchaseQuery) }
      : query,
  );
  header.mockResolvedValue({ data: [row], error: null });
});
test('reads safe columns with scoped identity and exact bigint', async () => {
  expect((await loadTrainerPayments(scope)).entries[0]!.amountMinor).toBe(
    row.amount_minor,
  );
  expect(select).toHaveBeenCalledWith(
    'id,workspace_id,client_record_id,purchase_id,kind,amount_minor::text,currency,paid_on,method,source,reason,reverses_entry_id,created_at',
    { count: 'exact' },
  );
  expect(eq).toHaveBeenCalledWith('workspace_id', scope.workspaceId);
  expect(eq).toHaveBeenCalledWith('client_record_id', scope.clientRecordId);
  expect(header).toHaveBeenCalledWith(
    'Authorization',
    `Bearer ${financialToken(scope.expectedUserId)}`,
  );
});
test('paginates scoped pages with bearer on each page', async () => {
  header
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({
        ...row,
        id: id(i + 100),
        amount_minor: '1',
      })),
      error: null,
      count: 501,
    })
    .mockResolvedValueOnce({
      data: [{ ...row, id: id(600), amount_minor: '1' }],
      error: null,
      count: 501,
    });
  expect((await loadTrainerPayments(scope)).entries).toHaveLength(501);
  expect(range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
  ]);
  expect(header).toHaveBeenCalledTimes(2);
  expect(
    eq.mock.calls.filter((call) => call[0] === 'workspace_id'),
  ).toHaveLength(2);
});
test('rejects duplicate ids across pages', async () => {
  header
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({
        ...row,
        id: id(i + 100),
        amount_minor: '1',
      })),
      error: null,
      count: 501,
    })
    .mockResolvedValueOnce({
      data: [{ ...row, id: id(100), amount_minor: '1' }],
      error: null,
      count: 501,
    });
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
});
test('rejects changed auth before requesting', async () => {
  session.mockResolvedValue({
    data: { session: { user: { id: id(9) }, access_token: 'other' } },
    error: null,
  });
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'unavailable',
  });
  expect(from).not.toHaveBeenCalled();
});
test('rejects malformed scope before auth', async () => {
  await expect(
    loadTrainerPayments({ ...scope, workspaceId: 'bad' }),
  ).rejects.toMatchObject({ code: 'invalidInput' });
  expect(session).not.toHaveBeenCalled();
});
test('reports missing configuration', async () => {
  jest.mocked(getSupabaseClient).mockReturnValue(null);
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'configuration',
  });
});
test.each([
  { workspace_id: id(9) },
  { client_record_id: id(9) },
  { amount_minor: 9007199254740992 },
  { amount_minor: '-1' },
  { amount_minor: '0' },
  { amount_minor: '01' },
  { amount_minor: '9223372036854775808' },
  { method: 'Card' },
  { method: ['Kaspi'] },
  { currency: 'USD' },
  { paid_on: '2026-02-30' },
  {
    kind: 'reversal',
    amount_minor: '-1',
    reverses_entry_id: id(10),
    reason: null,
  },
])('rejects unsafe row %j', (patch) => {
  expect(() => parsePaymentEntry({ ...row, ...patch }, scope)).toThrow(
    'request',
  );
});
test('parses signed reversal', () => {
  expect(
    parsePaymentEntry(
      {
        ...row,
        kind: 'reversal',
        amount_minor: '-9223372036854775807',
        reverses_entry_id: id(10),
        reason: 'Исправление',
      },
      scope,
    ),
  ).toMatchObject({ kind: 'reversal', amountMinor: '-9223372036854775807' });
});
test.each([
  { data: null, error: null },
  { data: [], error: { code: '42501' } },
])('fails closed for failed or malformed response %j', async (response) => {
  header.mockResolvedValue(response);
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
});
test('maps unexpected transport rejection', async () => {
  header.mockRejectedValue(new Error('transport'));
  await expect(loadTrainerPayments(scope)).rejects.toMatchObject({
    code: 'request',
  });
});
test('captures scope before asynchronous authentication', async () => {
  let resolveSession: (value: unknown) => void = () => {};
  session.mockReturnValue(
    new Promise((resolve) => {
      resolveSession = resolve;
    }),
  );
  const mutable = { ...scope };
  const result = loadTrainerPayments(mutable);
  mutable.workspaceId = id(90);
  mutable.clientRecordId = id(91);
  resolveSession({
    data: {
      session: {
        user: { id: scope.expectedUserId },
        access_token: financialToken(scope.expectedUserId),
      },
    },
    error: null,
  });
  await expect(result).resolves.toMatchObject({
    entries: [
      { workspaceId: scope.workspaceId, clientRecordId: scope.clientRecordId },
    ],
  });
  expect(eq).not.toHaveBeenCalledWith('workspace_id', id(90));
});
