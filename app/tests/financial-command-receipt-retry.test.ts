import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../src/features/auth/client';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import { loadPendingTrainerBillingCommand } from '../src/features/trainer-billing/command-storage';
import { mutationAuth, financialId as id } from './financial-mutation-fixtures';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
const user = id(1),
  workspace = id(2),
  clientRecordId = id(3),
  purchaseId = id(4),
  requestId = id(5),
  amount = '9007199254740993';
const cases: {
  command: TrainerBillingCommand;
  receipt: Record<string, unknown>;
}[] = [
  {
    command: {
      action: 'createPurchase',
      clientRecordId,
      title: 'Пакет',
      units: 2,
      priceMinor: amount,
      requestId,
    },
    receipt: {
      purchase_id: purchaseId,
      workspace_id: workspace,
      client_record_id: clientRecordId,
    },
  },
  {
    command: {
      action: 'markAttended',
      bookingId: id(6),
      expectedBookingRevision: 1,
      charge: true,
      purchaseId,
      requestId,
    },
    receipt: {
      attendance_id: id(7),
      booking_id: id(6),
      revision: 2,
      status: 'present',
      cycle: 1,
      service_date: '2026-10-03',
      purchase_id: purchaseId,
      charged: true,
      credit_entry_id: id(8),
    },
  },
  {
    command: {
      action: 'recordPayment',
      purchaseId,
      amountMinor: amount,
      paidOn: '2026-10-03',
      method: 'Kaspi',
      requestId,
    },
    receipt: {
      payment_entry_id: id(9),
      workspace_id: workspace,
      client_record_id: clientRecordId,
      purchase_id: purchaseId,
      kind: 'payment',
      amount_minor: amount,
      currency: 'KZT',
      paid_on: '2026-10-03',
      method: 'Kaspi',
      source: 'manual',
      reason: null,
      reverses_entry_id: null,
      paid_minor: amount,
      due_minor: '0',
    },
  },
  {
    command: {
      action: 'reversePayment',
      paymentEntryId: id(9),
      purchaseId,
      clientRecordId,
      amountMinor: amount,
      reason: 'Ошибка',
      requestId,
    },
    receipt: {
      payment_entry_id: id(10),
      workspace_id: workspace,
      client_record_id: clientRecordId,
      purchase_id: purchaseId,
      kind: 'reversal',
      amount_minor: `-${amount}`,
      currency: 'KZT',
      paid_on: '2026-10-03',
      method: 'Kaspi',
      source: 'manual',
      reason: 'Ошибка',
      reverses_entry_id: id(9),
      paid_minor: '0',
      due_minor: amount,
    },
  },
];
const rows = new Map<string, string>();
beforeEach(() => {
  jest.resetAllMocks();
  rows.clear();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => rows.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    rows.delete(key);
  });
});
test.each(cases)(
  '$command.action uncertain success reopens exact command and accepts receipt replay',
  async ({ command, receipt }) => {
    const auth = mutationAuth(user);
    const wire: {
      name: string;
      args: Record<string, unknown>;
      bearer: string;
    }[] = [];
    const receipts = new Map<
      string,
      { payload: string; value: Record<string, unknown> }
    >();
    let loseResponse = true;
    const rpc = jest.fn((name: string, args: Record<string, unknown>) => ({
      setHeader: async (header: string, bearer: string) => {
        expect(header).toBe('Authorization');
        wire.push({ name, args, bearer });
        const key = String(args.p_request_id);
        const payload = JSON.stringify({ name, args });
        const previous = receipts.get(key);
        if (previous) {
          expect(previous.payload).toBe(payload);
          return { data: { ...previous.value, replayed: true }, error: null };
        }
        receipts.set(key, { payload, value: receipt });
        if (loseResponse) {
          loseResponse = false;
          throw new Error('synthetic lost response');
        }
        return { data: { ...receipt, replayed: false }, error: null };
      },
    }));
    jest
      .mocked(getSupabaseClient)
      .mockReturnValue({ auth: auth.auth, rpc } as unknown as NonNullable<
        ReturnType<typeof getSupabaseClient>
      >);
    await expect(
      submitTrainerBillingCommand(user, workspace, command),
    ).rejects.toMatchObject({ code: 'request' });
    const saved = await loadPendingTrainerBillingCommand(user, workspace);
    expect(saved).toEqual(command);
    expect(
      await loadPendingTrainerBillingCommand(id(20), workspace),
    ).toBeNull();
    if (!saved) throw new Error('Missing synthetic pending command');
    auth.emit('SIGNED_IN', auth.session(user, id(21)));
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValueOnce(new Error('synthetic disk failure'));
    await expect(
      submitTrainerBillingCommand(user, workspace, saved),
    ).rejects.toMatchObject({ code: 'storage' });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
      command,
    );
    const result = await submitTrainerBillingCommand(user, workspace, saved);
    expect(result.replayed).toBe(true);
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
    expect(wire).toHaveLength(3);
    expect(wire.map(({ name, args }) => ({ name, args }))).toEqual(
      Array.from({ length: 3 }, () => ({
        name: wire[0]?.name,
        args: wire[0]?.args,
      })),
    );
    expect(receipts.size).toBe(1);
    expect(wire[1]?.bearer).toBe(wire[2]?.bearer);
    expect(wire[1]?.bearer).not.toBe(wire[0]?.bearer);
  },
);
