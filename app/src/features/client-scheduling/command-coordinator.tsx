import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkspaceProposalStore } from '../workspace-scheduling/workspace-proposal-controls';
import type { ClientBookingStatusStore } from './use-status';

export function ClientSchedulingCommandBoundary({
  status,
  proposal,
  children,
}: {
  status: ClientBookingStatusStore;
  proposal: WorkspaceProposalStore;
  children: (
    status: ClientBookingStatusStore,
    proposal: WorkspaceProposalStore,
  ) => ReactNode;
}) {
  const stores = useClientSchedulingCommands(status, proposal);
  return children(stores.status, stores.proposal);
}

function useClientSchedulingCommands(
  status: ClientBookingStatusStore,
  proposal: WorkspaceProposalStore,
): { status: ClientBookingStatusStore; proposal: WorkspaceProposalStore } {
  const key = JSON.stringify([status.scopeKey, proposal.scopeKey]);
  const control = useRef({ key, active: true, locked: false });
  const [running, setRunning] = useState<string | null>(null);
  useLayoutEffect(() => {
    const token = { key, active: true, locked: false };
    control.current = token;
    return () => {
      token.active = false;
    };
  }, [key]);
  const stores = [status, proposal];
  const busy = running === key || stores.some((store) => store.busy);
  const blocked =
    busy ||
    proposal.externalBlocked ||
    stores.some(
      (store) =>
        store.loading ||
        store.pending !== null ||
        store.error === 'storage' ||
        store.error === 'invalidPending',
    );
  const latest = useRef({ key, busy, blocked });
  useLayoutEffect(() => {
    latest.current = { key, busy, blocked };
  }, [key, busy, blocked]);
  const run = async <T,>(
    operation: () => Promise<T>,
    fallback: T,
    recovery = false,
  ): Promise<T> => {
    const token = control.current;
    if (
      !token.active ||
      token.key !== key ||
      token.locked ||
      latest.current.key !== key ||
      (recovery ? latest.current.busy : latest.current.blocked)
    )
      return fallback;
    token.locked = true;
    latest.current = { key, busy: true, blocked: true };
    setRunning(key);
    try {
      const result = await operation();
      return token.active && control.current === token ? result : fallback;
    } finally {
      token.locked = false;
      if (token.active && control.current === token) {
        latest.current.busy = false;
        setRunning(null);
      }
    }
  };
  const reload = (action: () => void) => {
    if (
      control.current.active &&
      control.current.key === key &&
      !control.current.locked &&
      !latest.current.busy
    )
      action();
  };
  return {
    status: {
      ...status,
      busy,
      submit: (command) => run(() => status.submit(command), null),
      resume: () => run(status.resume, null, true),
      resolve: () => run(status.resolve, null, true),
      reload: () => reload(status.reload),
    },
    proposal: {
      ...proposal,
      externalBlocked: blocked,
      externalBusy: busy,
      submit: (command) => run(() => proposal.submit(command), null),
      resume: () => run(proposal.resume, null, true),
      resolve: () => run(proposal.resolve, null, true),
      reload: () => reload(proposal.reload),
    },
  };
}
