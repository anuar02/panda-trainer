import { useLayoutEffect } from 'react';
import { act, render } from '@testing-library/react-native';
import { ClientSchedulingCommandBoundary } from '../src/features/client-scheduling/command-coordinator';
import type { ClientBookingStatusStore } from '../src/features/client-scheduling/use-status';
import type { WorkspaceProposalStore } from '../src/features/workspace-scheduling/workspace-proposal-controls';

const statusCommand = {
  action: 'cancel' as const,
  bookingId: 'booking',
  expectedRevision: 1,
  requestId: 'status-request',
};
const proposalCommand = {
  action: 'withdraw' as const,
  bookingId: 'booking',
  expectedBookingRevision: 1,
  proposalId: 'proposal',
  expectedProposalRevision: 1,
  requestId: 'proposal-request',
};
function fixture(scopeKey: string) {
  const status: ClientBookingStatusStore = {
    scopeKey,
    busy: false,
    loading: false,
    pending: null,
    error: null,
    submit: jest.fn(async () => null),
    resume: jest.fn(async () => null),
    resolve: jest.fn(async () => null),
    reload: jest.fn(),
  };
  const proposal: WorkspaceProposalStore = {
    ...status,
    pending: null,
    error: null,
    userId: 'user',
    workspaceId: 'workspace',
    externalBlocked: false,
    externalBusy: false,
    submit: jest.fn(async () => null),
    resume: jest.fn(async () => null),
    resolve: jest.fn(async () => null),
  };
  return { status, proposal };
}
let current: ReturnType<typeof fixture>;
function Capture({ stores }: { stores: ReturnType<typeof fixture> }) {
  useLayoutEffect(() => {
    current = stores;
  });
  return null;
}
function Harness({ stores }: { stores: ReturnType<typeof fixture> }) {
  return (
    <ClientSchedulingCommandBoundary {...stores}>
      {(status, proposal) => <Capture stores={{ status, proposal }} />}
    </ClientSchedulingCommandBoundary>
  );
}
test.each(['status', 'proposal'] as const)(
  '%s atomically blocks the other command family before a rerender',
  async (first) => {
    const stores = fixture('session-one');
    let release!: () => void;
    const deferred = new Promise<null>((resolve) => {
      release = () => resolve(null);
    });
    jest.mocked(stores[first].submit).mockReturnValue(deferred);
    await render(<Harness stores={stores} />);
    const captured = current;
    let pending!: Promise<unknown>;
    await act(async () => {
      pending =
        first === 'status'
          ? captured.status.submit(statusCommand)
          : captured.proposal.submit(proposalCommand);
      if (first === 'status') await captured.proposal.submit(proposalCommand);
      else await captured.status.submit(statusCommand);
    });
    expect(stores[first].submit).toHaveBeenCalledTimes(1);
    expect(
      stores[first === 'status' ? 'proposal' : 'status'].submit,
    ).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await pending;
    });
  },
);
test('old completion and retained callbacks cannot unlock or submit in a new session', async () => {
  const old = fixture('old');
  let releaseOld!: () => void;
  jest.mocked(old.status.submit).mockReturnValue(
    new Promise((resolve) => {
      releaseOld = () => resolve(null);
    }),
  );
  const view = await render(<Harness stores={old} />);
  const oldCallbacks = current;
  let oldPending!: Promise<unknown>;
  await act(async () => {
    oldPending = oldCallbacks.status.submit(statusCommand);
  });
  const fresh = fixture('fresh');
  let releaseFresh!: () => void;
  jest.mocked(fresh.proposal.submit).mockReturnValue(
    new Promise((resolve) => {
      releaseFresh = () => resolve(null);
    }),
  );
  await view.rerender(<Harness stores={fresh} />);
  let freshPending!: Promise<unknown>;
  await act(async () => {
    freshPending = current.proposal.submit(proposalCommand);
  });
  await act(async () => {
    releaseOld();
    expect(await oldPending).toBeNull();
    expect(await oldCallbacks.status.submit(statusCommand)).toBeNull();
    expect(await current.status.submit(statusCommand)).toBeNull();
  });
  expect(fresh.status.submit).not.toHaveBeenCalled();
  expect(old.status.submit).toHaveBeenCalledTimes(1);
  expect(current.status.busy).toBe(true);
  await act(async () => {
    releaseFresh();
    await freshPending;
  });
});
