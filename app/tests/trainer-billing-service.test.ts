import { financialToken } from './financial-read-fixtures';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  createClientPurchase,
  markAttended,
  markNoShow,
  bindAttendancePurchase,
  undoAttendance,
  chargeLateCancellation,
  loadTrainerBilling,
} from '../src/features/trainer-billing/service';
import {
  minorMoney,
  parseCredit,
} from '../src/features/trainer-billing/validation';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
const id = (n: number) =>
  `51000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const user = id(1),
  workspace = id(2),
  clientRecordId = id(3),
  bookingId = id(4),
  attendanceId = id(5),
  purchaseId = id(6),
  requestId = id(7),
  creditEntryId = id(8);
const identity = { expectedUserId: user, requestId };
const booking = { ...identity, bookingId, expectedBookingRevision: 3 };
const attendance = {
  ...identity,
  attendanceId,
  expectedAttendanceRevision: 7,
  expectedBookingRevision: 3,
};
const scope = { workspaceId: workspace, expectedUserId: user, clientRecordId };
const result = {
  attendance_id: attendanceId,
  booking_id: bookingId,
  revision: 8,
  status: 'present',
  cycle: 2,
  service_date: '2026-10-03',
  purchase_id: null,
  charged: false,
  credit_entry_id: null,
  replayed: true,
};
const getSession = jest.fn();
const rpc = jest.fn();
const rpcHeader = jest.fn();
const from = jest.fn();
const readHeader = jest.fn();
const eq = jest.fn();
const order = jest.fn();
const range = jest.fn();
const select = jest.fn();
const query = {
  select,
  eq,
  order,
  range,
  setHeader: (...args: unknown[]) =>
    Promise.resolve(readHeader(...args)).then((response) => ({
      ...response,
      count:
        response.count ??
        (Array.isArray(response.data) ? response.data.length : null),
    })),
};
const purchase = {
  id: purchaseId,
  workspace_id: workspace,
  client_record_id: clientRecordId,
  title: 'Пакет',
  units: 12,
  price_minor: '9223372036854775807',
  currency: 'KZT',
  expires_on: null,
  created_at: '2026-10-03T00:00:00Z',
};
const grant = {
  id: id(90),
  workspace_id: workspace,
  client_record_id: clientRecordId,
  purchase_id: purchaseId,
  attendance_id: null,
  booking_id: null,
  cycle: null,
  kind: 'grant',
  units: 12,
  reason: null,
  reverses_entry_id: null,
  created_at: purchase.created_at,
};
const getClient = jest.mocked(getSupabaseClient);

beforeEach(() => {
  jest.resetAllMocks();
  getClient.mockReturnValue({
    auth: {
      getSession,
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    rpc,
    from,
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  getSession.mockResolvedValue({
    data: {
      session: { user: { id: user }, access_token: financialToken(user) },
    },
    error: null,
  });
  rpc.mockReturnValue({ setHeader: rpcHeader });
  rpcHeader.mockImplementation(() =>
    Promise.resolve({
      data: {
        ...result,
        status:
          rpc.mock.calls.at(-1)?.[0] === 'mark_no_show'
            ? 'noshow'
            : rpc.mock.calls.at(-1)?.[0] === 'undo_attendance'
              ? 'undone'
              : rpc.mock.calls.at(-1)?.[0] === 'charge_late_cancellation'
                ? 'noshow'
                : 'present',
        charged: rpc.mock.calls.at(-1)?.[0] === 'charge_late_cancellation',
        purchase_id:
          rpc.mock.calls.at(-1)?.[0] === 'charge_late_cancellation'
            ? purchaseId
            : null,
        credit_entry_id:
          rpc.mock.calls.at(-1)?.[0] === 'charge_late_cancellation'
            ? creditEntryId
            : null,
        revision:
          rpc.mock.calls.at(-1)?.[0] === 'bind_attendance_purchase' ? 7 : 8,
      },
      error: null,
    }),
  );
  from.mockReturnValue(query);
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  order.mockReturnValue(query);
  range.mockReturnValue(query);
  readHeader.mockResolvedValue({ data: [], error: null });
});

it('sends exact maximum bigint price as a decimal string and validates purchase identity', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      purchase_id: purchaseId,
      workspace_id: workspace,
      client_record_id: clientRecordId,
      replayed: true,
    },
    error: null,
  });
  const value = await createClientPurchase({
    ...identity,
    clientRecordId,
    title: 'Пакет',
    units: 12,
    priceMinor: '9223372036854775807',
    expiresOn: '2026-12-31',
  });
  expect(value.purchaseId).toBe(purchaseId);
  expect(rpc).toHaveBeenCalledWith('create_client_purchase', {
    p_client_record_id: clientRecordId,
    p_title: 'Пакет',
    p_units: 12,
    p_price_minor: '9223372036854775807',
    p_request_id: requestId,
    p_expires_on: '2026-12-31',
  });
  expect(rpcHeader).toHaveBeenCalledWith(
    'Authorization',
    `Bearer ${financialToken(user)}`,
  );
});

it.each(['01', '-1', '1.2', '1e3', ' 1', '9223372036854775808', '', '000'])(
  'rejects noncanonical money %s before a request',
  (priceMinor) => {
    expect(minorMoney(priceMinor)).toBe(false);
    expect(() =>
      createClientPurchase({
        ...identity,
        clientRecordId,
        title: 'Пакет',
        units: 1,
        priceMinor,
      }),
    ).toThrow(expect.objectContaining({ code: 'invalidInput' }));
    expect(getSession).not.toHaveBeenCalled();
  },
);

it('maps lossless money reads using explicit safe columns and identity filters', async () => {
  readHeader
    .mockResolvedValueOnce({ data: [purchase], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [grant], error: null });
  const value = await loadTrainerBilling(scope);
  expect(value.purchases[0]?.priceMinor).toBe('9223372036854775807');
  expect(select.mock.calls[0][0]).toContain('price_minor::text');
  for (const [columns] of select.mock.calls) {
    expect(columns).not.toContain('created_by');
    expect(columns).not.toContain('request_id');
    expect(columns).not.toContain('*');
  }
  expect(eq).toHaveBeenCalledWith('workspace_id', workspace);
  expect(eq).toHaveBeenCalledWith('client_record_id', clientRecordId);
  expect(readHeader).toHaveBeenCalledTimes(4);
  expect(readHeader).toHaveBeenCalledWith(
    'Authorization',
    `Bearer ${financialToken(user)}`,
  );
});

it.each([
  { price_minor: 9223372036854775807 },
  { price_minor: 100 },
  { workspace_id: id(20) },
  { client_record_id: id(21) },
  { expires_on: '2026-02-30' },
  { currency: 'USD' },
])('rejects malformed or foreign read rows %j', async (patch) => {
  readHeader.mockResolvedValueOnce({
    data: [{ ...purchase, ...patch }],
    error: null,
  });
  await expect(loadTrainerBilling(scope)).rejects.toMatchObject({
    code: 'request',
  });
});

it('retains request IDs and exact revisions for all attendance mutations', async () => {
  await markAttended({ ...booking, charge: true, purchaseId });
  await markNoShow(booking);
  await bindAttendancePurchase({ ...attendance, purchaseId });
  await undoAttendance({ ...attendance, reason: '  Исправление  ' });
  await chargeLateCancellation({ ...booking, reason: 'Неявка', purchaseId });
  expect(rpc.mock.calls).toEqual([
    [
      'mark_attended',
      {
        p_booking_id: bookingId,
        p_expected_booking_revision: 3,
        p_request_id: requestId,
        p_charge: true,
        p_purchase_id: purchaseId,
      },
    ],
    [
      'mark_no_show',
      {
        p_booking_id: bookingId,
        p_expected_booking_revision: 3,
        p_request_id: requestId,
      },
    ],
    [
      'bind_attendance_purchase',
      {
        p_attendance_id: attendanceId,
        p_expected_attendance_revision: 7,
        p_expected_booking_revision: 3,
        p_request_id: requestId,
        p_purchase_id: purchaseId,
      },
    ],
    [
      'undo_attendance',
      {
        p_attendance_id: attendanceId,
        p_expected_attendance_revision: 7,
        p_expected_booking_revision: 3,
        p_reason: 'Исправление',
        p_request_id: requestId,
      },
    ],
    [
      'charge_late_cancellation',
      {
        p_booking_id: bookingId,
        p_expected_booking_revision: 3,
        p_reason: 'Неявка',
        p_request_id: requestId,
        p_purchase_id: purchaseId,
      },
    ],
  ]);
  expect(rpcHeader).toHaveBeenCalledTimes(5);
});

it('snapshots arguments before session lookup so caller mutation cannot alter an in-flight debit', async () => {
  let resolve!: (value: unknown) => void;
  getSession.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const input = { ...booking, charge: true, purchaseId };
  const pending = markAttended(input);
  input.bookingId = id(30);
  input.requestId = id(31);
  input.expectedUserId = id(32);
  resolve({
    data: {
      session: { user: { id: user }, access_token: financialToken(user) },
    },
    error: null,
  });
  await pending;
  expect(rpc.mock.calls[0][1]).toMatchObject({
    p_booking_id: bookingId,
    p_request_id: requestId,
  });
});

it.each(['read', 'write'])(
  'prevents %s under a switched account',
  async (kind) => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: id(99) }, access_token: 'other-token' } },
      error: null,
    });
    await expect(
      kind === 'read' ? loadTrainerBilling(scope) : markNoShow(booking),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  },
);

it.each([
  ['40001', 'conflict'],
  ['55000', 'invalidState'],
  ['42501', 'unavailable'],
  ['P0002', 'unavailable'],
  ['22023', 'invalidInput'],
  ['08006', 'request'],
])('maps SQLSTATE %s to %s', async (code, expected) => {
  rpcHeader.mockResolvedValue({ data: null, error: { code } });
  await expect(markNoShow(booking)).rejects.toMatchObject({ code: expected });
});

it.each([
  { booking_id: id(99) },
  { attendance_id: null },
  { revision: 0 },
  { cycle: 1.2 },
  { status: 'unknown' },
  { service_date: '2026-02-30' },
  { charged: true, purchase_id: null },
  { credit_entry_id: 'bad' },
  { replayed: 'true' },
])('rejects malformed RPC results %j', async (patch) => {
  rpcHeader.mockResolvedValue({ data: { ...result, ...patch }, error: null });
  await expect(markNoShow(booking)).rejects.toMatchObject({ code: 'request' });
});

it('accepts a booking-only cancellation penalty with nullable attendance fields', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      attendance_id: null,
      revision: null,
      cycle: null,
      status: null,
      service_date: null,
      charged: true,
      purchase_id: purchaseId,
      credit_entry_id: creditEntryId,
    },
    error: null,
  });
  await expect(
    chargeLateCancellation({ ...booking, reason: 'Поздняя отмена' }),
  ).resolves.toMatchObject({ attendanceId: null, purchaseId, charged: true });
});

it('rejects invalid ledger signs and foreign client associations', () => {
  const credit = {
    id: creditEntryId,
    workspace_id: workspace,
    client_record_id: clientRecordId,
    purchase_id: purchaseId,
    attendance_id: attendanceId,
    booking_id: bookingId,
    cycle: 2,
    kind: 'consume',
    units: -1,
    reason: null,
    reverses_entry_id: null,
    created_at: purchase.created_at,
  };
  expect(parseCredit(credit, scope).units).toBe(-1);
  expect(() => parseCredit({ ...credit, units: 1 }, scope)).toThrow();
  expect(() =>
    parseCredit({ ...credit, client_record_id: id(99) }, scope),
  ).toThrow();
});

it('accepts full SQL reason boundary and rejects overlong or blank reasons before sending', async () => {
  await undoAttendance({ ...attendance, reason: 'x'.repeat(1000) });
  expect(rpc.mock.calls[0][1].p_reason).toHaveLength(1000);
  expect(() =>
    undoAttendance({ ...attendance, reason: 'x'.repeat(1001) }),
  ).toThrow();
  expect(() => chargeLateCancellation({ ...booking, reason: '   ' })).toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('rejects valid-shaped responses for a different command state', async () => {
  rpcHeader.mockResolvedValue({ data: result, error: null });
  await expect(markNoShow(booking)).rejects.toMatchObject({ code: 'request' });
  await expect(
    undoAttendance({ ...attendance, reason: 'Correction' }),
  ).rejects.toMatchObject({ code: 'request' });
});
it('accepts unchanged unbound binding revision and rejects wrong charged binding revision', async () => {
  await expect(bindAttendancePurchase(attendance)).resolves.toMatchObject({
    revision: 7,
    charged: false,
  });
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      charged: true,
      purchase_id: purchaseId,
      credit_entry_id: creditEntryId,
      revision: 7,
    },
    error: null,
  });
  await expect(bindAttendancePurchase(attendance)).rejects.toMatchObject({
    code: 'request',
  });
});
it('rejects a partially null standalone penalty result', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      attendance_id: null,
      revision: null,
      cycle: null,
      status: null,
      charged: true,
      purchase_id: purchaseId,
      credit_entry_id: creditEntryId,
    },
    error: null,
  });
  await expect(
    chargeLateCancellation({ ...booking, reason: 'Correction' }),
  ).rejects.toMatchObject({ code: 'request' });
});

it('maps all attendance history and credit fields without exposing audit columns', async () => {
  const row = {
    id: attendanceId,
    workspace_id: workspace,
    client_record_id: clientRecordId,
    booking_id: bookingId,
    status: 'undone',
    revision: 8,
    cycle: 2,
    service_date: '2026-10-03',
    created_at: purchase.created_at,
    updated_at: purchase.created_at,
  };
  readHeader
    .mockResolvedValueOnce({ data: [purchase], error: null })
    .mockResolvedValueOnce({ data: [row], error: null })
    .mockResolvedValueOnce({
      data: [
        {
          ...row,
          id: id(15),
          attendance_id: attendanceId,
          reason: 'Correction',
        },
      ],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [
        grant,
        {
          id: creditEntryId,
          workspace_id: workspace,
          client_record_id: clientRecordId,
          purchase_id: purchaseId,
          attendance_id: attendanceId,
          booking_id: bookingId,
          cycle: 2,
          kind: 'consume',
          units: -1,
          reason: 'Correction',
          reverses_entry_id: null,
          created_at: purchase.created_at,
        },
      ],
      error: null,
    });
  const value = await loadTrainerBilling(scope);
  expect(value.attendance[0]).toMatchObject({
    bookingId,
    status: 'undone',
    cycle: 2,
    revision: 8,
  });
  expect(value.revisions[0]).toMatchObject({
    attendanceId,
    reason: 'Correction',
    serviceDate: '2026-10-03',
  });
  expect(value.credits[1]).toMatchObject({
    purchaseId,
    attendanceId,
    bookingId,
    units: -1,
    reversesEntryId: null,
  });
});
it('reads beyond the server page limit with deterministic IDs and a bound token', async () => {
  const page = Array.from({ length: 500 }, (_, index) => ({
    ...purchase,
    id: id(index + 1000),
  }));
  readHeader
    .mockResolvedValueOnce({ data: page, error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({
      data: page.map((purchase, index) => ({
        ...grant,
        id: id(index + 2000),
        purchase_id: purchase.id,
      })),
      error: null,
    });
  const value = await loadTrainerBilling(scope);
  expect(value.purchases).toHaveLength(500);
  expect(range).toHaveBeenCalledWith(0, 499);
  expect(order).toHaveBeenCalledWith('id');
  expect(readHeader).toHaveBeenCalledTimes(4);
});
it('preserves restore IDs even though undo does not report another debit', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      status: 'undone',
      charged: false,
      purchase_id: purchaseId,
      credit_entry_id: creditEntryId,
    },
    error: null,
  });
  await expect(
    undoAttendance({ ...attendance, reason: 'Correction' }),
  ).resolves.toMatchObject({
    status: 'undone',
    charged: false,
    purchaseId,
    creditEntryId,
  });
});

it('rejects an unexpected debit from an attendance-only command', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      charged: true,
      purchase_id: purchaseId,
      credit_entry_id: creditEntryId,
    },
    error: null,
  });
  await expect(
    markAttended({ ...booking, charge: false }),
  ).rejects.toMatchObject({ code: 'request' });
});
it('rejects a debit against a different explicit purchase', async () => {
  rpcHeader.mockResolvedValue({
    data: {
      ...result,
      charged: true,
      purchase_id: id(99),
      credit_entry_id: creditEntryId,
    },
    error: null,
  });
  await expect(
    markAttended({ ...booking, charge: true, purchaseId }),
  ).rejects.toMatchObject({ code: 'request' });
});
