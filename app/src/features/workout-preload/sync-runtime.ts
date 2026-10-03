import { AppState } from 'react-native';
import type { SyncSession, SyncState } from '@/domain/workout-sync/types';
import {
  openOutboxStore,
  createOutboxRunner,
  createWorkoutSyncTransport,
} from '@/features/workout-sync';

export function startWorkoutPreloadSyncRuntime(options: {
  session: SyncSession;
  getSession: () => SyncSession | null;
  onState: (state: SyncState) => void;
}) {
  let stopped = false;
  let hadPending = false;
  let runner: ReturnType<typeof createOutboxRunner> | null = null;
  let close: (() => Promise<void>) | null = null;
  const current = () => {
    const session = options.getSession();
    return (
      !stopped &&
      session?.accountId === options.session.accountId &&
      session.workspaceId === options.session.workspaceId &&
      session.sessionId === options.session.sessionId &&
      session.accessToken === options.session.accessToken
    );
  };
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey)
    void openOutboxStore(options.session)
      .then(async (store) => {
        if (!current()) {
          await store.close();
          return;
        }
        close = () => store.close();
        runner = createOutboxRunner({
          store,
          transport: createWorkoutSyncTransport({ url, anonKey }),
          getSession: () => (current() ? options.getSession() : null),
          onState: (state) => {
            if (state.status !== 'synced') hadPending = true;
            if (current() && (hadPending || state.status !== 'synced'))
              options.onState(state);
          },
        });
        if (AppState.currentState === 'active') await runner.run();
      })
      .catch(() => {
        if (current())
          options.onState({ status: 'error', message: 'local_save_failed' });
      });
  const listener = AppState.addEventListener('change', (state) => {
    if (state === 'active' && current()) void runner?.run();
    else runner?.stop();
  });
  return () => {
    stopped = true;
    listener.remove();
    runner?.stop();
    void close?.().catch(() => {});
  };
}
