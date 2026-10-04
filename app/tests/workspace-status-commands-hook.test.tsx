import { bookingAuthFixture } from './booking-creation-auth-fixture';
import { getSupabaseClient } from '../src/features/auth/client';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWorkspaceStatusCommands } from '../src/features/workspace-scheduling/use-status-commands';
import {
  loadPendingWorkspaceBookingStatus,
  PendingWorkspaceBookingStatusError,
  type PendingWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-pending';
import {
  resolvePendingWorkspaceBookingStatus,
  submitWorkspaceBookingStatus,
} from '../src/features/workspace-scheduling/status-submission';
import {
  WorkspaceBookingStatusError,
  type WorkspaceBookingStatusResult,
} from '../src/features/workspace-scheduling/status-operation';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/status-pending')
  >('../src/features/workspace-scheduling/status-pending'),
  loadPendingWorkspaceBookingStatus: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/status-submission', () => ({
  submitWorkspaceBookingStatus: jest.fn(),
  resolvePendingWorkspaceBookingStatus: jest.fn(),
}));
const load = jest.mocked(loadPendingWorkspaceBookingStatus);
const submit = jest.mocked(submitWorkspaceBookingStatus);
const onChanged = jest.fn();
const bookingId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const command: PendingWorkspaceBookingStatus = {
  action: 'confirm',
  bookingId,
  expectedRevision: 3,
  requestId,
};
const result: WorkspaceBookingStatusResult = {
  bookingId,
  revision: 4,
  status: 'confirmed',
  replayed: false,
};
const props = { userId: 'user-a', workspaceId: 'workspace-a' };
const mount = () =>
  renderHook(
    (scope: typeof props) =>
      useWorkspaceStatusCommands({ ...scope, onChanged }),
    { initialProps: props },
  );
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
let auth: ReturnType<typeof bookingAuthFixture>;
beforeEach(() => {
  auth = bookingAuthFixture(props.userId);
  jest.mocked(getSupabaseClient).mockReturnValue(auth.client);
  load.mockReset().mockResolvedValue(null);
  submit.mockReset().mockResolvedValue(result);
  onChanged.mockReset();
});
test('hydration and synchronous lock prevent new or duplicate commands', async () => {
  const hydrate = deferred<PendingWorkspaceBookingStatus | null>();
  load.mockReturnValueOnce(hydrate.promise);
  const hook = await mount();
  await act(async () => {
    expect(await hook.result.current.submit(command)).toBe(false);
  });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => hydrate.resolve(null));
  const request = deferred<WorkspaceBookingStatusResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
    expect(await hook.result.current.submit(command)).toBe(false);
  });
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(result));
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test('lost response resumes exact persisted command and refuses a replacement UUID', async () => {
  load.mockResolvedValue(command);
  submit.mockRejectedValueOnce(new WorkspaceBookingStatusError('request'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    expect(
      await hook.result.current.submit({
        ...command,
        requestId: '30000000-0000-4000-8000-000000000002',
      }),
    ).toBe(false);
  });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.resume();
  });
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('request');
  load.mockResolvedValue(null);
  await act(async () => {
    await hook.result.current.resume();
  });
  expect(submit.mock.calls[1]?.[2]).toEqual(command);
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test('cross-command server revision conflict keeps the pending proposal recoverable', async () => {
  load.mockResolvedValue(command);
  submit.mockRejectedValueOnce(new WorkspaceBookingStatusError('conflict'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    await hook.result.current.resume();
  });
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('conflict');
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test.each(['invalid', 'storage'] as const)(
  'pending %s blocks mutation until readable retry',
  async (code) => {
    load.mockRejectedValueOnce(new PendingWorkspaceBookingStatusError(code));
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      expect(await hook.result.current.submit(command)).toBe(false);
    });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => hook.result.current.reload());
    await waitFor(() => expect(hook.result.current.error).toBeNull());
  },
);
test('account change and unmount ignore stale server completion', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const request = deferred<WorkspaceBookingStatusResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
  });
  await hook.rerender({ ...props, userId: 'user-b' });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => request.resolve(result));
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
  const next = deferred<WorkspaceBookingStatusResult>();
  submit.mockReturnValueOnce(next.promise);
  await act(async () => {
    void hook.result.current.submit(command);
  });
  await hook.unmount();
  await act(async () => next.resolve(result));
  expect(onChanged).not.toHaveBeenCalled();
});

test('resolution double press locks and clears only verified terminal response', async () => {
  load.mockResolvedValue(command);
  const resolving = deferred<{ outcome: 'abandoned'; result: null }>();
  const resolveRequest = jest.mocked(resolvePendingWorkspaceBookingStatus);
  resolveRequest.mockReset().mockReturnValueOnce(resolving.promise);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    void hook.result.current.resolve();
    expect(await hook.result.current.resolve()).toBe(false);
    expect(await hook.result.current.submit(command)).toBe(false);
  });
  expect(resolveRequest).toHaveBeenCalledTimes(1);
  load.mockResolvedValue(null);
  await act(async () =>
    resolving.resolve({ outcome: 'abandoned', result: null }),
  );
  expect(hook.result.current.pending).toBeNull();
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test('resolution failure retains exact pending and scope switch ignores old completion', async () => {
  load.mockResolvedValue(command);
  const resolveRequest = jest.mocked(resolvePendingWorkspaceBookingStatus);
  resolveRequest
    .mockReset()
    .mockRejectedValueOnce(new WorkspaceBookingStatusError('request'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    await hook.result.current.resolve();
  });
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('request');
  const resolving = deferred<{ outcome: 'abandoned'; result: null }>();
  resolveRequest.mockReturnValueOnce(resolving.promise);
  await act(async () => {
    void hook.result.current.resolve();
  });
  load.mockResolvedValue(null);
  await hook.rerender({ ...props, userId: 'user-b' });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () =>
    resolving.resolve({ outcome: 'abandoned', result: null }),
  );
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
});

test.each(['success', 'late error'] as const)(
  'same-user relogin hides %s and fences retained callbacks',
  async (outcome) => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const staleSubmit = hook.result.current.submit;
    const oldKey = hook.result.current.scopeKey;
    const deferredResult = deferred<typeof result>();
    let reject!: (error: unknown) => void;
    const failed = new Promise<typeof result>((_resolve, no) => {
      reject = no;
    });
    submit.mockReturnValueOnce(
      outcome === 'success' ? deferredResult.promise : failed,
    );
    let oldResult: ReturnType<typeof staleSubmit>;
    await act(async () => {
      oldResult = staleSubmit(command);
    });
    await act(async () => {
      auth.change(auth.session(props.userId, bookingId), 'SIGNED_IN');
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.scopeKey).not.toBe(oldKey);
    await act(async () => {
      if (outcome === 'success') deferredResult.resolve(result);
      else reject(new Error('late private error'));
    });
    expect(await oldResult!).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
    await act(async () => {
      expect(await staleSubmit(command)).toBe(false);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    await hook.unmount();
  },
);
