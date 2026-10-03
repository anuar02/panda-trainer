import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { startWorkoutPreloadSyncRuntime } from './sync-runtime';
import type { SyncState, SyncSession } from '@/domain/workout-sync/types';
import { useAuth } from '@/features/auth/provider';
import { createWorkoutPreloadLifecycle, type PreloadState } from './lifecycle';
import { openWorkoutPreloadStore } from './storage';
import { createWorkoutPreloadReader } from './service';
import { flushEntryWriters } from '@/features/workout-entry/coordination';
import { withPreparedWorkoutJournals } from './prepare';

type PreloadActions = {
  session: SyncSession | null;
  getSession(): SyncSession | null;
  state: PreloadState;
  syncState: SyncState | null;
  open(bookingId: string): Promise<void>;
  select(clientId: string): Promise<void>;
  collapse(collapsed: boolean): Promise<void>;
  resume(): Promise<void>;
  retry(): void;
};
const Context = createContext<PreloadActions | null>(null);
export const useOptionalWorkoutPreload = () => useContext(Context);
export function WorkoutPreloadProvider({
  children,
  workspaceId,
}: PropsWithChildren<{ workspaceId: string }>) {
  const auth = useAuth();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const accountId = auth.session?.user.id;
  const accessToken = auth.session?.access_token;
  const sessionId = useMemo(
    () => ({
      accountId,
      accessToken,
      workspaceId,
      attempt,
      loading: auth.loading,
      failed: auth.failed,
      id: randomUUID(),
    }),
    [accountId, accessToken, workspaceId, attempt, auth.loading, auth.failed],
  ).id;
  const [loaded, setLoaded] = useState<{
    key: string;
    state: PreloadState;
  } | null>(null);
  const state: PreloadState =
    loaded?.key === sessionId
      ? loaded.state
      : {
          status: 'hydrating',
          context: null,
          recovery: null,
          error: null,
          cached: false,
        };
  const [loadedSync, setLoadedSync] = useState<{
    key: string;
    state: SyncState;
  } | null>(null);
  const syncState = loadedSync?.key === sessionId ? loadedSync.state : null;
  const lifecycle = useRef<ReturnType<
    typeof createWorkoutPreloadLifecycle
  > | null>(null);
  const session = useRef<SyncSession | null>(null);
  const activeSession = useMemo<SyncSession | null>(
    () =>
      auth.session && !auth.loading && !auth.failed
        ? {
            accountId: auth.session.user.id,
            workspaceId,
            accessToken: auth.session.access_token,
            sessionId,
          }
        : null,
    [auth.session, auth.loading, auth.failed, workspaceId, sessionId],
  );
  useLayoutEffect(() => {
    session.current = activeSession;
  }, [activeSession]);
  useEffect(() => {
    let active = true;
    const snapshot = session.current;
    if (!snapshot) return;
    const stopSync = startWorkoutPreloadSyncRuntime({
      session: snapshot,
      getSession: () => (active ? session.current : null),
      onState: (state) => setLoadedSync({ key: sessionId, state }),
    });
    void openWorkoutPreloadStore(snapshot)
      .then(async (store) => {
        if (!active) {
          await store.close();
          return;
        }
        const coordinator = createWorkoutPreloadLifecycle({
          session: snapshot,
          getSession: () => (active ? session.current : null),
          store,
          reader: withPreparedWorkoutJournals(createWorkoutPreloadReader()),
          onState: (state) => setLoaded({ key: sessionId, state }),
        });
        lifecycle.current = coordinator;
        await coordinator.hydrate();
      })
      .catch(() => {
        if (active)
          setLoaded({
            key: sessionId,
            state: {
              status: 'error',
              context: null,
              recovery: null,
              error: 'storage',
              cached: false,
            },
          });
      });
    return () => {
      active = false;
      stopSync();
      const previous = lifecycle.current;
      lifecycle.current = null;
      void previous?.stop().catch(() => {});
    };
  }, [accountId, accessToken, workspaceId, attempt, sessionId]);
  const isCurrent = () =>
    activeSession !== null &&
    session.current?.sessionId === activeSession.sessionId &&
    session.current.accountId === activeSession.accountId &&
    session.current.workspaceId === activeSession.workspaceId &&
    session.current.accessToken === activeSession.accessToken;
  const navigate = () => router.push('/workspace/journal');
  return (
    <Context.Provider
      value={{
        session: activeSession,
        getSession: () => session.current,
        state,
        syncState,
        open: async (bookingId) => {
          if (!isCurrent()) return;
          navigate();
          await lifecycle.current?.open(bookingId);
        },
        select: async (clientId) => {
          if (!isCurrent()) return;
          await flushEntryWriters(activeSession);
          if (!isCurrent()) return;
          await lifecycle.current?.select(clientId);
        },
        collapse: async (collapsed) => {
          if (!isCurrent()) return;
          await flushEntryWriters(activeSession);
          if (!isCurrent()) return;
          await lifecycle.current?.collapse(collapsed);
        },
        resume: async () => {
          if (!isCurrent()) return;
          await lifecycle.current?.collapse(false);
          navigate();
        },
        retry: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
