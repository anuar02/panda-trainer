import { getSupabaseClient } from '../src/features/auth/client';
import { financialToken } from './financial-read-fixtures';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import {
  loadPendingTrainerBillingCommand,
  savePendingTrainerBillingCommand,
} from '../src/features/trainer-billing/command-storage';
import {
  markNoShow,
  recordClientPayment,
  reverseClientPayment,
} from '../src/features/trainer-billing/service';
import { TrainerBillingError } from '../src/features/trainer-billing/types';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/service', () => ({
  markNoShow: jest.fn(),
  recordClientPayment: jest.fn(),
  reverseClientPayment: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
const user = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const command: TrainerBillingCommand = {
  action: 'markNoShow',
  bookingId: other,
  expectedBookingRevision: 2,
  requestId: '44444444-4444-4444-8444-444444444444',
};
const rpc = jest.mocked(markNoShow);
const rows = new Map<string, string>();
let sessionId = other;
const listeners = new Set<(event: string, session: unknown) => void>();
const authSession = () => ({
  user: { id: user },
  access_token: financialToken(user, sessionId),
});
const relogin = () => {
  sessionId = command.requestId;
  for (const listener of listeners) listener('SIGNED_IN', authSession());
};
beforeEach(() => {
  jest.resetAllMocks();
  rows.clear();
  listeners.clear();
  sessionId = other;
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: authSession() },
        error: null,
      })),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
    },
  } as unknown as NonNullable<ReturnType<typeof getSupabaseClient>>);
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => rows.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
    rows.delete(key);
  });
  rpc.mockResolvedValue({
    attendanceId: other,
    bookingId: other,
    revision: 1,
    status: 'noshow',
    cycle: 1,
    serviceDate: '2026-10-03',
    purchaseId: null,
    charged: false,
    creditEntryId: null,
    replayed: false,
  });
});
const paymentCommand: TrainerBillingCommand = {
  action: 'recordPayment',
  purchaseId: other,
  amountMinor: '9007199254740993',
  paidOn: '2026-10-03',
  method: 'Kaspi',
  requestId: '54444444-4444-4444-8444-444444444444',
};
const paymentResult = {
  paymentEntryId: other,
  workspaceId: workspace,
  clientRecordId: other,
  purchaseId: other,
  kind: 'payment' as const,
  amountMinor: '9007199254740993',
  currency: 'KZT' as const,
  paidOn: '2026-10-03',
  method: 'Kaspi' as const,
  source: 'manual' as const,
  reason: null,
  reversesEntryId: null,
  paidMinor: '9007199254740993',
  dueMinor: '0',
  replayed: false,
};
test('lost payment response retains exact amount and request for replay', async () => {
  const paymentRpc = jest.mocked(recordClientPayment);
  paymentRpc
    .mockRejectedValueOnce(new TrainerBillingError('request'))
    .mockResolvedValue(paymentResult);
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    paymentCommand,
  );
  await submitTrainerBillingCommand(user, workspace, paymentCommand);
  const initialCall = paymentRpc.mock.calls[0];
  const replayCall = paymentRpc.mock.calls[1];
  if (!initialCall || !replayCall) {
    throw new Error('Expected initial payment and replay calls');
  }
  expect(initialCall[0]).toEqual(replayCall[0]);
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test('definitive overpayment removes pending command so a corrected amount can be submitted', async () => {
  jest
    .mocked(recordClientPayment)
    .mockRejectedValue(new TrainerBillingError('overpayment'));
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'overpayment' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test('payment receipt from another workspace is not accepted and remains recoverable', async () => {
  jest
    .mocked(recordClientPayment)
    .mockResolvedValue({ ...paymentResult, workspaceId: other });
  await expect(
    submitTrainerBillingCommand(user, workspace, paymentCommand),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    paymentCommand,
  );
});
test('transport loss preserves exact request across reload and refuses replacement', async () => {
  rpc.mockRejectedValueOnce(new TrainerBillingError('request'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
  await expect(
    submitTrainerBillingCommand(user, workspace, {
      ...command,
      expectedBookingRevision: 3,
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(rpc).toHaveBeenCalledTimes(1);
  await submitTrainerBillingCommand(user, workspace, command);
  expect(rpc.mock.calls[1]?.[0]).toMatchObject({
    ...command,
    expectedUserId: user,
  });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test.each(['conflict', 'invalidState'] as const)(
  'proven %s rejection clears lock',
  async (code) => {
    rpc.mockRejectedValueOnce(new TrainerBillingError(code));
    await expect(
      submitTrainerBillingCommand(user, workspace, command),
    ).rejects.toMatchObject({ code });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
  },
);
test('storage write failure never reaches RPC', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(rpc).not.toHaveBeenCalled();
});
test('successful RPC with failed cleanup retains replayable lock', async () => {
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('disk'));
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
  await submitTrainerBillingCommand(user, workspace, command);
  expect(rpc).toHaveBeenCalledTimes(2);
});
test('pending scopes isolate accounts and workspaces', async () => {
  await savePendingTrainerBillingCommand(user, workspace, command);
  expect(await loadPendingTrainerBillingCommand(other, workspace)).toBeNull();
  expect(await loadPendingTrainerBillingCommand(user, other)).toBeNull();
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('corrupt storage is preserved and blocks all commands', async () => {
  rows.set(
    `panda-trainer-pending-billing-v1:${user}:${workspace}`,
    '{"action":"markNoShow"}',
  );
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
  expect(rows.size).toBe(1);
});

const reversalCommand: TrainerBillingCommand = {
  action: 'reversePayment',
  requestId: command.requestId,
  paymentEntryId: other,
  clientRecordId: other,
  purchaseId: other,
  amountMinor: paymentResult.amountMinor,
  reason: 'Ошибка оплаты',
};
const reversalResult = {
  ...paymentResult,
  paymentEntryId: command.requestId,
  kind: 'reversal' as const,
  amountMinor: `-${paymentResult.amountMinor}`,
  reason: reversalCommand.reason,
  reversesEntryId: other,
  paidMinor: '0',
  dueMinor: paymentResult.amountMinor,
};
test('lost reversal response persists exact command across reload and isolates actor/workspace', async () => {
  const reverse = jest.mocked(reverseClientPayment);
  reverse
    .mockRejectedValueOnce(new TrainerBillingError('request'))
    .mockResolvedValue(reversalResult);
  await expect(
    submitTrainerBillingCommand(user, workspace, reversalCommand),
  ).rejects.toMatchObject({ code: 'request' });
  const saved = await loadPendingTrainerBillingCommand(user, workspace);
  expect(saved).toEqual(reversalCommand);
  expect(await loadPendingTrainerBillingCommand(other, workspace)).toBeNull();
  expect(await loadPendingTrainerBillingCommand(user, other)).toBeNull();
  if (!saved) throw new Error('Missing saved reversal');
  await submitTrainerBillingCommand(user, workspace, saved);
  expect(reverse.mock.calls[0]?.[0]).toEqual(reverse.mock.calls[1]?.[0]);
  expect(reverse.mock.calls[1]?.[0]).toMatchObject({
    expectedUserId: user,
    requestId: command.requestId,
  });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
});
test.each([
  { clientRecordId: user },
  { workspaceId: other },
  { purchaseId: user },
  { amountMinor: '-1' },
])('mismatched reversal receipt retains recovery %j', async (change) => {
  jest
    .mocked(reverseClientPayment)
    .mockResolvedValue({ ...reversalResult, ...change });
  await expect(
    submitTrainerBillingCommand(user, workspace, reversalCommand),
  ).rejects.toMatchObject({ code: 'request' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    reversalCommand,
  );
});
test.each(['conflict', 'invalidState'] as const)(
  'definitive reversal %s clears pending',
  async (code) => {
    jest
      .mocked(reverseClientPayment)
      .mockRejectedValue(new TrainerBillingError(code));
    await expect(
      submitTrainerBillingCommand(user, workspace, reversalCommand),
    ).rejects.toMatchObject({ code });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toBeNull();
  },
);

test.each(['conflict', 'invalidState', 'overpayment'] as const)(
  'same-user relogin while RPC returns %s keeps durable command',
  async (code) => {
    rpc.mockImplementationOnce(async () => {
      relogin();
      throw new TrainerBillingError(code);
    });
    await expect(
      submitTrainerBillingCommand(user, workspace, command),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
      command,
    );
  },
);
test('same-user relogin after successful RPC keeps durable command for receipt replay', async () => {
  const result = await rpc({ ...command, expectedUserId: user });
  rpc.mockClear();
  rpc.mockImplementationOnce(async () => {
    relogin();
    return result;
  });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('same-user relogin during durable save prevents dispatch but preserves saved request', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementationOnce(async (key, value) => {
      rows.set(key, value);
      relogin();
    });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('same-user relogin during clear read prevents deletion', async () => {
  rpc.mockImplementationOnce(async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(async (key) => {
      relogin();
      return rows.get(key) ?? null;
    });
    return {
      attendanceId: other,
      bookingId: other,
      revision: 1,
      status: 'noshow',
      cycle: 1,
      serviceDate: '2026-10-03',
      purchaseId: null,
      charged: false,
      creditEntryId: null,
      replayed: false,
    };
  });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});

test('relogin while removal completes restores original command for reopen retry', async () => {
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    rows.delete(key);
    relogin();
  });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('failed removal after deleting data restores the same request for retry', async () => {
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    rows.delete(key);
    throw new Error('uncertain storage completion');
  });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});

test('clear never removes a newer pending request', async () => {
  const newer = { ...command, requestId: other };
  rpc.mockImplementationOnce(async () => {
    rows.set(
      `panda-trainer-pending-billing-v1:${user}:${workspace}`,
      JSON.stringify(newer),
    );
    return {
      attendanceId: other,
      bookingId: other,
      revision: 1,
      status: 'noshow',
      cycle: 1,
      serviceDate: '2026-10-03',
      purchaseId: null,
      charged: false,
      creditEntryId: null,
      replayed: false,
    };
  });
  await submitTrainerBillingCommand(user, workspace, command);
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    newer,
  );
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
test('cancelled clear restoration does not overwrite newer pending', async () => {
  const newer = { ...command, requestId: other };
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    rows.set(key, JSON.stringify(newer));
    relogin();
  });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    newer,
  );
});
test('same-session refresh while saving permits RPC and durable keys/payload contain no credentials', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementationOnce(async (key, value) => {
      rows.set(key, value);
      for (const listener of listeners)
        listener('TOKEN_REFRESHED', {
          user: { id: user },
          access_token: financialToken(user, sessionId, 2),
        });
    });
  await submitTrainerBillingCommand(user, workspace, command);
  expect(rpc).toHaveBeenCalledTimes(1);
  const saved = jest.mocked(AsyncStorage.setItem).mock.calls[0];
  expect(saved?.[0]).toBe(
    `panda-trainer-pending-billing-v1:${user}:${workspace}`,
  );
  expect(JSON.parse(saved?.[1] ?? '{}')).toEqual(command);
  expect(
    JSON.stringify(jest.mocked(AsyncStorage.setItem).mock.calls),
  ).not.toContain('synthetic.');
});
test('late storage error after relogin is auth cancellation and never dispatches', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockImplementationOnce(async (key, value) => {
      rows.set(key, value);
      relogin();
      throw new Error('private storage error');
    });
  await expect(
    submitTrainerBillingCommand(user, workspace, command),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    command,
  );
});
test('same request id cannot replace canonical payload', async () => {
  await savePendingTrainerBillingCommand(user, workspace, paymentCommand);
  await expect(
    savePendingTrainerBillingCommand(user, workspace, {
      ...paymentCommand,
      amountMinor: '1',
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
    paymentCommand,
  );
});

test.each(['success', 'conflict', 'invalidState', 'overpayment'] as const)(
  'relogin at final command guard after %s clear retains request',
  async (outcome) => {
    if (outcome !== 'success')
      rpc.mockRejectedValueOnce(new TrainerBillingError(outcome));
    const client = getSupabaseClient();
    if (!client) throw new Error('Missing synthetic auth');
    const getSession = jest.mocked(client.auth.getSession);
    jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
      rows.delete(key);
      getSession.mockImplementationOnce(
        async () =>
          ({ data: { session: authSession() }, error: null }) as Awaited<
            ReturnType<typeof client.auth.getSession>
          >,
      );
      getSession.mockImplementationOnce(async () => {
        relogin();
        return { data: { session: authSession() }, error: null } as Awaited<
          ReturnType<typeof client.auth.getSession>
        >;
      });
    });
    await expect(
      submitTrainerBillingCommand(user, workspace, command),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(await loadPendingTrainerBillingCommand(user, workspace)).toEqual(
      command,
    );
  },
);
