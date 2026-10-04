import { bookingAuthFixture } from './booking-creation-auth-fixture';
import { getSupabaseClient } from '../src/features/auth/client';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWorkspaceProposalCommands } from '../src/features/workspace-scheduling/use-proposal';
import {
  loadPendingWorkspaceProposal,
  PendingWorkspaceProposalError,
} from '../src/features/workspace-scheduling/proposal-pending';
import {
  resolvePendingWorkspaceProposal,
  submitWorkspaceProposal,
} from '../src/features/workspace-scheduling/proposal-submission';
import {
  WorkspaceProposalError,
  type WorkspaceProposalCommand,
  type WorkspaceProposalResult,
} from '../src/features/workspace-scheduling/proposal-operation';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/proposal-pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/proposal-pending')
  >('../src/features/workspace-scheduling/proposal-pending'),
  loadPendingWorkspaceProposal: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/proposal-submission', () => ({
  submitWorkspaceProposal: jest.fn(),
  resolvePendingWorkspaceProposal: jest.fn(),
}));
const load = jest.mocked(loadPendingWorkspaceProposal);
const submit = jest.mocked(submitWorkspaceProposal);
const onChanged = jest.fn();
const bookingId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const command: WorkspaceProposalCommand = {
  action: 'propose',
  bookingId,
  expectedBookingRevision: 3,
  requestId,
  proposedStartsAtUtc: '2030-10-02T06:00:00.000Z',
};
const result: WorkspaceProposalResult = {
  proposalId: 'proposal',
  proposalRevision: 1,
  proposalStatus: 'pending',
  bookingId,
  bookingRevision: 3,
  bookingStatus: 'confirmed',
  startsAtUtc: '2030-10-02T05:00:00.000Z',
  endsAtUtc: '2030-10-02T06:00:00.000Z',
  replayed: false,
};
const props = { userId: 'user-a', workspaceId: 'workspace-a' };
const mount = () =>
  renderHook(
    (scope: typeof props) =>
      useWorkspaceProposalCommands({ ...scope, onChanged }),
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
  const hydrate = deferred<WorkspaceProposalCommand | null>();
  load.mockReturnValueOnce(hydrate.promise);
  const hook = await mount();
  await act(async () => {
    expect(await hook.result.current.submit(command)).toBeNull();
  });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => hydrate.resolve(null));
  const request = deferred<WorkspaceProposalResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
    expect(await hook.result.current.submit(command)).toBeNull();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(result));
  expect(onChanged).toHaveBeenCalledTimes(1);
});
test('lost response resumes exact persisted command and refuses a replacement UUID', async () => {
  load.mockResolvedValue(command);
  submit.mockRejectedValueOnce(new WorkspaceProposalError('request'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    expect(
      await hook.result.current.submit({
        ...command,
        requestId: '30000000-0000-4000-8000-000000000002',
      }),
    ).toBeNull();
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
  submit.mockRejectedValueOnce(new WorkspaceProposalError('conflict'));
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
    load.mockRejectedValueOnce(new PendingWorkspaceProposalError(code));
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      expect(await hook.result.current.submit(command)).toBeNull();
    });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => hook.result.current.reload());
    await waitFor(() => expect(hook.result.current.error).toBeNull());
  },
);
test('account change and unmount ignore stale server completion', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const request = deferred<WorkspaceProposalResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
  });
  await hook.rerender({ ...props, userId: 'user-b' });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => request.resolve(result));
  expect(onChanged).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
  const next = deferred<WorkspaceProposalResult>();
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
  const resolveRequest = jest.mocked(resolvePendingWorkspaceProposal);
  resolveRequest.mockReset().mockReturnValueOnce(resolving.promise);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    void hook.result.current.resolve();
    expect(await hook.result.current.resolve()).toBeNull();
    expect(await hook.result.current.submit(command)).toBeNull();
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
  const resolveRequest = jest.mocked(resolvePendingWorkspaceProposal);
  resolveRequest
    .mockReset()
    .mockRejectedValueOnce(new WorkspaceProposalError('request'));
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
    expect(await oldResult!).toBe(null);
    expect(onChanged).not.toHaveBeenCalled();
    await act(async () => {
      expect(await staleSubmit(command)).toBe(null);
    });
    expect(submit).toHaveBeenCalledTimes(1);
    await hook.unmount();
  },
);
