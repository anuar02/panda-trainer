import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useTrainerBillingCommands } from '../trainer-billing/use-commands';
import { useWorkspaceProposalCommands } from './use-proposal';
import { useWorkspaceBookingCreation } from './use-creation';
import { useWorkspaceStatusCommands } from './use-status-commands';

type Scope = { userId: string; workspaceId: string };
type MutationState = Scope & {
  generation: number;
  blocked: boolean;
  busy: boolean;
  billing: ReturnType<typeof useTrainerBillingCommands>;
  proposal: ReturnType<typeof useWorkspaceProposalCommands>;
  creation: ReturnType<typeof useWorkspaceBookingCreation>;
  status: ReturnType<typeof useWorkspaceStatusCommands>;
};
const Context = createContext<MutationState | null>(null);

export function WorkspaceMutationProvider(props: PropsWithChildren<Scope>) {
  return (
    <MutationContent
      key={JSON.stringify([props.userId, props.workspaceId])}
      {...props}
    />
  );
}

function MutationContent({
  userId,
  workspaceId,
  children,
}: PropsWithChildren<Scope>) {
  const [generation, setGeneration] = useState(0);
  const [running, setRunning] = useState(false);
  const control = useRef({ active: true, locked: false });
  useLayoutEffect(() => {
    const token = control.current;
    token.active = true;
    return () => {
      token.active = false;
    };
  }, []);
  const changed = () => {
    if (control.current.active) setGeneration((value) => value + 1);
  };
  const billing = useTrainerBillingCommands({
    userId,
    workspaceId,
    onChanged: changed,
  });
  const proposal = useWorkspaceProposalCommands({
    userId,
    workspaceId,
    onChanged: changed,
  });
  const creation = useWorkspaceBookingCreation({
    userId,
    workspaceId,
    onCreated: changed,
  });
  const status = useWorkspaceStatusCommands({
    userId,
    workspaceId,
    onChanged: changed,
  });
  const stores = [billing, proposal, creation, status];
  const busy = running || stores.some((store) => store.busy);
  const blocked =
    busy ||
    stores.some(
      (store) =>
        store.loading ||
        store.pending !== null ||
        store.error === 'storage' ||
        store.error === 'invalidPending',
    );
  const latest = useRef({ blocked, busy });
  useLayoutEffect(() => {
    latest.current = { blocked, busy };
  }, [blocked, busy]);
  const run = async <T,>(
    operation: () => Promise<T>,
    fallback: T,
    recovery = false,
  ): Promise<T> => {
    const token = control.current;
    if (
      !token.active ||
      token.locked ||
      (recovery ? latest.current.busy : latest.current.blocked)
    )
      return fallback;
    token.locked = true;
    latest.current = { blocked: true, busy: true };
    setRunning(true);
    try {
      const result = await operation();
      return token.active ? result : fallback;
    } finally {
      token.locked = false;
      latest.current.busy = false;
      if (token.active) setRunning(false);
    }
  };
  const reload = (operation: () => void) => {
    if (
      control.current.active &&
      !control.current.locked &&
      !latest.current.busy
    )
      operation();
  };
  return (
    <Context.Provider
      value={{
        userId,
        workspaceId,
        generation,
        blocked,
        busy,
        billing: {
          ...billing,
          submit: (command) => run(() => billing.submit(command), false),
          resume: () => run(billing.resume, false, true),
          reload: () => reload(billing.reload),
        },
        proposal: {
          ...proposal,
          submit: (command) => run(() => proposal.submit(command), null),
          resume: () => run(proposal.resume, null, true),
          resolve: () => run(proposal.resolve, null, true),
          reload: () => reload(proposal.reload),
        },
        creation: {
          ...creation,
          submit: (command) => run(() => creation.submit(command), null),
          resume: () => run(creation.resume, null, true),
          reload: () => reload(creation.reload),
        },
        status: {
          ...status,
          submit: (command) => run(() => status.submit(command), false),
          resume: () => run(status.resume, false, true),
          resolve: () => run(status.resolve, false, true),
          reload: () => reload(status.reload),
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function WorkspaceMutationBoundary({
  userId,
  workspaceId,
  children,
}: PropsWithChildren<Scope>) {
  const current = useContext(Context);
  return current?.userId === userId && current.workspaceId === workspaceId ? (
    <>{children}</>
  ) : (
    <WorkspaceMutationProvider userId={userId} workspaceId={workspaceId}>
      {children}
    </WorkspaceMutationProvider>
  );
}

export function useWorkspaceMutations() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace mutation provider is missing');
  return value;
}
