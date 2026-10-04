import { useFocusEffect } from 'expo-router';
import { getSupabaseClient } from '@/features/auth/client';
import {
  createBookingSessionFence,
  type BookingSessionFence,
} from './creation-session';
import { scheduleSessionId } from './read-session';
import {
  createContext,
  useCallback,
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
  unavailable: boolean;
  retrySession: () => void;
  isCurrent: () => boolean;
  verifyCurrent: () => Promise<boolean>;
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
    <MutationSession
      key={JSON.stringify([props.userId, props.workspaceId])}
      {...props}
    />
  );
}

function MutationSession(props: PropsWithChildren<Scope>) {
  const [epoch, setEpoch] = useState(0);
  const lifecycle = useRef({ active: true });
  useLayoutEffect(() => {
    const token = lifecycle.current;
    token.active = true;
    const client = getSupabaseClient();
    let identity: string | null = null;
    let events = 0;
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (
        event === 'TOKEN_REFRESHED' &&
        identity &&
        session?.user.id === props.userId &&
        scheduleSessionId(session) === identity
      )
        return;
      events += 1;
      token.active = false;
      lifecycle.current = { active: true };
      identity = scheduleSessionId(session);
      setEpoch((value) => value + 1);
    }).data.subscription;
    const version = events;
    void client?.auth.getSession().then(
      (result) => {
        if (
          version === events &&
          !result.error &&
          result.data.session?.user.id === props.userId
        )
          identity = scheduleSessionId(result.data.session);
      },
      () => {},
    );
    return () => {
      token.active = false;
      subscription?.unsubscribe();
    };
  }, [props.userId, epoch]);
  return (
    <MutationContent
      key={JSON.stringify([props.userId, props.workspaceId, epoch])}
      {...props}
      lifecycle={lifecycle}
      onRetrySession={() => {
        if (!lifecycle.current.active) return;
        lifecycle.current.active = false;
        lifecycle.current = { active: true };
        setEpoch((value) => value + 1);
      }}
    />
  );
}

function MutationContent({
  userId,
  workspaceId,
  children,
  lifecycle,
  onRetrySession,
}: PropsWithChildren<Scope> & {
  lifecycle: { current: { active: boolean } };
  onRetrySession: () => void;
}) {
  const [generation, setGeneration] = useState(0);
  const [running, setRunning] = useState(false);
  const control = useRef<{
    active: boolean;
    locked: boolean;
    fence?: BookingSessionFence;
    parent?: { active: boolean };
  }>({ active: false, locked: false });
  const [verified, setVerified] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useLayoutEffect(() => {
    const token: NonNullable<typeof control.current> = {
      active: true,
      locked: false,
      parent: lifecycle.current,
    };
    control.current = token;
    try {
      token.fence = createBookingSessionFence(
        userId,
        () =>
          token.active &&
          control.current === token &&
          Boolean(token.parent?.active),
      );
      void token.fence.assertCurrent().then(
        () => {
          if (token.active && control.current === token && token.parent?.active)
            setVerified(true);
        },
        () => {
          if (token.active && control.current === token && token.parent?.active)
            setUnavailable(true);
        },
      );
    } catch {
      token.active = false;
      void Promise.resolve().then(() => {
        if (control.current === token && token.parent?.active)
          setUnavailable(true);
      });
    }
    return () => {
      token.active = false;
      token.fence?.dispose();
    };
  }, [lifecycle, userId]);
  const isCurrent = useCallback(() => {
    const token = control.current;
    if (!token.active || !token.parent?.active || !token.fence) return false;
    try {
      token.fence.guard();
      return true;
    } catch {
      return false;
    }
  }, []);
  const verifyCurrent = useCallback(async () => {
    if (!isCurrent()) return false;
    const token = control.current;
    try {
      await token.fence!.assertCurrent();
      return control.current === token && isCurrent();
    } catch {
      if (control.current === token && token.active && token.parent?.active)
        setUnavailable(true);
      return false;
    }
  }, [isCurrent]);
  const changed = () => {
    if (isCurrent()) setGeneration((value) => value + 1);
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
    !verified ||
    unavailable ||
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
      !isCurrent() ||
      token.locked ||
      (recovery ? latest.current.busy : latest.current.blocked)
    )
      return fallback;
    token.locked = true;
    setRunning(true);
    try {
      if (!(await verifyCurrent())) return fallback;
      const result = await operation();
      return (await verifyCurrent()) ? result : fallback;
    } catch (error) {
      if (!(await verifyCurrent())) return fallback;
      throw error;
    } finally {
      token.locked = false;
      if (control.current === token && token.active && token.parent?.active) {
        setRunning(false);
      }
    }
  };
  const reload = (operation: () => void) => {
    if (isCurrent() && !control.current.locked && !latest.current.busy)
      operation();
  };
  return (
    <Context.Provider
      value={{
        userId,
        workspaceId,
        unavailable,
        retrySession: () => {
          if (control.current.parent?.active) onRetrySession();
        },
        isCurrent,
        verifyCurrent,
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

export function useWorkspaceScreenScope(key: string) {
  const mutations = useWorkspaceMutations();
  const lifecycle = useRef<{ key: string; active: boolean } | null>(null);
  const focus = useRef({ active: true, epoch: 0 });
  useLayoutEffect(() => {
    const token = { key, active: true };
    lifecycle.current = token;
    return () => {
      token.active = false;
    };
  }, [key]);
  useFocusEffect(
    useCallback(() => {
      focus.current.active = true;
      focus.current.epoch += 1;
      return () => {
        focus.current.active = false;
        focus.current.epoch += 1;
      };
    }, []),
  );
  const isCurrent = () =>
    lifecycle.current?.key === key &&
    lifecycle.current.active &&
    focus.current.active &&
    mutations.isCurrent();
  const verifyCurrent = async () => {
    if (!isCurrent()) return false;
    const token = lifecycle.current;
    const epoch = focus.current.epoch;
    return (
      (await mutations.verifyCurrent()) &&
      isCurrent() &&
      lifecycle.current === token &&
      focus.current.epoch === epoch
    );
  };
  return { isCurrent, verifyCurrent };
}
