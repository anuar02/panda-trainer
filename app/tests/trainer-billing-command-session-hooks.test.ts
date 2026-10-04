import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTrainerBillingCommands } from '../src/features/trainer-billing/use-commands';
import { loadPendingTrainerBillingCommand } from '../src/features/trainer-billing/command-storage';
import {
  submitTrainerBillingCommand,
  type TrainerBillingCommandResult,
  type TrainerBillingCommand,
} from '../src/features/trainer-billing/commands';
import { TrainerBillingError } from '../src/features/trainer-billing/types';
import {
  mutationAuth,
  mutationDeferred,
  financialId,
} from './financial-mutation-fixtures';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/command-storage', () => ({
  ...jest.requireActual('../src/features/trainer-billing/command-storage'),
  loadPendingTrainerBillingCommand: jest.fn(),
}));
jest.mock('../src/features/trainer-billing/commands', () => ({
  ...jest.requireActual('../src/features/trainer-billing/commands'),
  submitTrainerBillingCommand: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
const rows = new Map<string, string>();
const userId = financialId(1),
  workspaceId = financialId(2);
const command: TrainerBillingCommand = {
  action: 'markNoShow',
  requestId: financialId(3),
  bookingId: financialId(4),
  expectedBookingRevision: 1,
};
const receipt: TrainerBillingCommandResult = {
  purchaseId: financialId(5),
  workspaceId,
  clientRecordId: financialId(6),
  replayed: false,
};
let auth: ReturnType<typeof mutationAuth>;
beforeEach(() => {
  jest.resetAllMocks();
  rows.clear();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async (key) => rows.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    rows.set(key, value);
  });
  auth = mutationAuth(userId);
  auth.install();
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(null);
});
test.each(['success', 'conflict', 'invalidState', 'overpayment'])(
  'same-user relogin hides busy and suppresses late %s callback',
  async (outcome) => {
    const request = mutationDeferred<TrainerBillingCommandResult>();
    jest
      .mocked(submitTrainerBillingCommand)
      .mockReturnValueOnce(request.promise);
    const onChanged = jest.fn();
    const hook = await renderHook(() =>
      useTrainerBillingCommands({ userId, workspaceId, onChanged }),
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    const stale = hook.result.current.submit;
    await act(async () => {
      pending = stale(command);
    });
    expect(hook.result.current.busy).toBe(true);
    await act(async () =>
      auth.emit('SIGNED_IN', auth.session(userId, financialId(9))),
    );
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.error).toBeNull();
    await act(async () => {
      if (outcome === 'success') request.resolve(receipt);
      else
        request.reject(
          new TrainerBillingError(
            outcome as 'conflict' | 'invalidState' | 'overpayment',
          ),
        );
      expect(await pending).toBe(false);
      expect(await stale(command)).toBe(false);
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toBeNull();
  },
);
test('late pending load from old session cannot reveal command in new session', async () => {
  const load = mutationDeferred<TrainerBillingCommand | null>();
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockReturnValueOnce(load.promise)
    .mockResolvedValue(null);
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged: jest.fn() }),
  );
  await waitFor(() =>
    expect(loadPendingTrainerBillingCommand).toHaveBeenCalled(),
  );
  await act(async () =>
    auth.emit('SIGNED_IN', auth.session(userId, financialId(9))),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => load.resolve(command));
  expect(hook.result.current.pending).toBeNull();
});
test('double tap dispatches once and unmount suppresses completion', async () => {
  const request = mutationDeferred<TrainerBillingCommandResult>();
  jest.mocked(submitTrainerBillingCommand).mockReturnValueOnce(request.promise);
  const onChanged = jest.fn();
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged }),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let pending!: Promise<boolean>;
  await act(async () => {
    const submit = hook.result.current.submit;
    pending = submit(command);
    expect(await submit(command)).toBe(false);
  });
  await hook.unmount();
  await act(async () => {
    request.resolve(receipt);
    expect(await pending).toBe(false);
  });
  expect(submitTrainerBillingCommand).toHaveBeenCalledTimes(1);
  expect(onChanged).not.toHaveBeenCalled();
});

test('normal refresh keeps pending visible and resume uses original request', async () => {
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  jest.mocked(submitTrainerBillingCommand).mockResolvedValue(receipt);
  const onChanged = jest.fn();
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged }),
  );
  await waitFor(() => expect(hook.result.current.pending).toEqual(command));
  await act(async () =>
    auth.emit('TOKEN_REFRESHED', auth.session(userId, undefined, 2)),
  );
  expect(hook.result.current.pending).toEqual(command);
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(null);
  await act(async () => expect(await hook.result.current.resume()).toBe(true));
  expect(submitTrainerBillingCommand).toHaveBeenCalledWith(
    userId,
    workspaceId,
    command,
    expect.objectContaining({ guard: expect.any(Function) }),
  );
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test('late storage load failure after session change does not reveal old errors', async () => {
  const load = mutationDeferred<TrainerBillingCommand | null>();
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockReturnValueOnce(load.promise)
    .mockResolvedValue(null);
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged: jest.fn() }),
  );
  await waitFor(() =>
    expect(loadPendingTrainerBillingCommand).toHaveBeenCalled(),
  );
  await act(async () =>
    auth.emit('SIGNED_IN', auth.session(userId, financialId(9))),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => load.reject(new Error('private disk details')));
  expect(hook.result.current.error).toBeNull();
});
test('relogin during post-RPC pending reload suppresses changed and stale reload', async () => {
  const load = mutationDeferred<TrainerBillingCommand | null>();
  jest.mocked(submitTrainerBillingCommand).mockResolvedValue(receipt);
  const onChanged = jest.fn();
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged }),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const reload = hook.result.current.reload;
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockReturnValueOnce(load.promise)
    .mockResolvedValue(null);
  let submitted!: Promise<boolean>;
  await act(async () => {
    submitted = hook.result.current.submit(command);
  });
  await waitFor(() =>
    expect(loadPendingTrainerBillingCommand).toHaveBeenCalledTimes(2),
  );
  await act(async () =>
    auth.emit('SIGNED_IN', auth.session(userId, financialId(9))),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const calls = jest.mocked(loadPendingTrainerBillingCommand).mock.calls.length;
  await act(async () => {
    load.resolve(command);
    expect(await submitted).toBe(false);
    reload();
  });
  expect(loadPendingTrainerBillingCommand).toHaveBeenCalledTimes(calls);
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
});
test('workspace switch invalidates old resume and ignores late result', async () => {
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  const request = mutationDeferred<TrainerBillingCommandResult>();
  jest.mocked(submitTrainerBillingCommand).mockReturnValueOnce(request.promise);
  const onChanged = jest.fn();
  const hook = await renderHook(
    ({ workspace }: { workspace: string }) =>
      useTrainerBillingCommands({ userId, workspaceId: workspace, onChanged }),
    { initialProps: { workspace: workspaceId } },
  );
  await waitFor(() => expect(hook.result.current.pending).toEqual(command));
  const resume = hook.result.current.resume;
  let submitted!: Promise<boolean>;
  await act(async () => {
    submitted = resume();
  });
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(null);
  await hook.rerender({ workspace: financialId(10) });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    request.resolve(receipt);
    expect(await submitted).toBe(false);
    expect(await resume()).toBe(false);
  });
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
});
test('malformed refresh hides pending and blocks submission until valid session reload', async () => {
  jest.mocked(loadPendingTrainerBillingCommand).mockResolvedValue(command);
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged: jest.fn() }),
  );
  await waitFor(() => expect(hook.result.current.pending).toEqual(command));
  await act(async () =>
    auth.emit('TOKEN_REFRESHED', {
      ...auth.session(),
      access_token: 'malformed',
    }),
  );
  await waitFor(() => expect(hook.result.current.error).toBe('unavailable'));
  expect(hook.result.current.pending).toBeNull();
  expect(hook.result.current.blocked).toBe(true);
  await act(async () =>
    expect(await hook.result.current.submit(command)).toBe(false),
  );
  expect(submitTrainerBillingCommand).not.toHaveBeenCalled();
});

test('silent session mismatch during terminal post-RPC reload cannot call onChanged', async () => {
  jest
    .mocked(submitTrainerBillingCommand)
    .mockRejectedValue(new TrainerBillingError('conflict'));
  const onChanged = jest.fn();
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged }),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  jest
    .mocked(loadPendingTrainerBillingCommand)
    .mockImplementationOnce(async () => {
      auth.getSession.mockResolvedValue({
        data: { session: auth.session(userId, financialId(9)) },
        error: null,
      });
      return null;
    });
  await act(async () =>
    expect(await hook.result.current.submit(command)).toBe(false),
  );
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.error).toBe('unavailable');
});

test('auth cancellation at hook result guard retains exact request after submit success', async () => {
  const onChanged = jest.fn();
  const hook = await renderHook(() =>
    useTrainerBillingCommands({ userId, workspaceId, onChanged }),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  jest.mocked(submitTrainerBillingCommand).mockImplementationOnce(async () => {
    auth.getSession.mockResolvedValue({
      data: { session: auth.session(userId, financialId(9)) },
      error: null,
    });
    return receipt;
  });
  await act(async () =>
    expect(await hook.result.current.submit(command)).toBe(false),
  );
  expect(onChanged).not.toHaveBeenCalled();
  expect(
    JSON.parse(
      rows.get(`panda-trainer-pending-billing-v1:${userId}:${workspaceId}`) ??
        '{}',
    ),
  ).toEqual(command);
});
