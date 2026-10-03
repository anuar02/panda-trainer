import { WorkoutPreloadReadError } from './service';
import type { SyncSession } from '@/domain/workout-sync/types';
import type {
  WorkoutPreloadContext,
  WorkoutPreloadReader,
  WorkoutPreloadStore,
  WorkoutRecovery,
} from '@/domain/workout-preload/types';

export type PreloadState = {
  status: 'hydrating' | 'ready' | 'loading' | 'error';
  context: WorkoutPreloadContext | null;
  recovery: WorkoutRecovery | null;
  error: 'storage' | 'unavailable' | null;
  cached: boolean;
};
const initialState = (): PreloadState => ({
  status: 'hydrating',
  context: null,
  recovery: null,
  error: null,
  cached: false,
});
export function createWorkoutPreloadLifecycle(options: {
  session: SyncSession;
  getSession: () => SyncSession | null;
  store: WorkoutPreloadStore;
  reader: WorkoutPreloadReader;
  onState: (state: PreloadState) => void;
  timeoutMs?: number;
}) {
  let state = initialState();
  let stopped = false;
  let generation = 0;
  let controller: AbortController | null = null;
  let queue = Promise.resolve();
  const active = () => {
    const current = options.getSession();
    return (
      !stopped &&
      current?.accountId === options.session.accountId &&
      current.workspaceId === options.session.workspaceId &&
      current.sessionId === options.session.sessionId &&
      current.accessToken === options.session.accessToken
    );
  };
  const publish = (next: PreloadState) => {
    if (!active()) return;
    state = next;
    options.onState(next);
  };
  const serialize = (task: () => Promise<void>) => {
    const result = queue.then(async () => {
      if (active()) await task();
    });
    queue = result.catch(() => {});
    return result;
  };
  const persist = async (
    context: WorkoutPreloadContext,
    recovery: WorkoutRecovery,
  ) => {
    await options.store.saveRecovery(recovery);
    publish({
      status: 'ready',
      context,
      recovery,
      error: null,
      cached: state.cached,
    });
  };
  return {
    hydrate: () =>
      serialize(async () => {
        try {
          const recovery = await options.store.readRecovery();
          if (!active()) return;
          const context = recovery
            ? await options.store.read(recovery.sessionKey)
            : null;
          if (recovery && !context) throw new Error('Missing recovery context');
          publish({
            status: 'ready',
            context,
            recovery,
            error: null,
            cached: Boolean(context),
          });
        } catch {
          publish({ ...initialState(), status: 'error', error: 'storage' });
        }
      }),
    open: (bookingId: string) =>
      serialize(async () => {
        if (state.status === 'hydrating' || state.error === 'storage') return;
        const epoch = ++generation;
        controller?.abort();
        controller = new AbortController();
        const requestController = controller;
        const valid = () => active() && generation === epoch;
        publish({ ...state, status: 'loading', error: null });
        let context: WorkoutPreloadContext | null = null;
        let cached = false;
        try {
          context = await options.store.read(bookingId);
          if (!valid()) return;
        } catch {
          publish({ ...state, status: 'error', error: 'storage' });
          return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              requestController.abort();
              reject(new WorkoutPreloadReadError('network'));
            }, options.timeoutMs ?? 15000);
          });
          const loaded = await Promise.race([
            options.reader.load(
              options.session,
              bookingId,
              requestController.signal,
            ),
            timeout,
          ]);
          if (!valid()) return;
          try {
            const selected = loaded.participants.find(
              (value) => value.bookingId === bookingId,
            );
            if (!selected) throw new Error('Missing preload booking');
            await options.store.save(loaded, {
              version: 1,
              sessionKey: loaded.sessionKey,
              bookingId,
              clientRecordId: selected.clientRecordId,
              collapsed: false,
            });
            if (!valid()) return;
            context = await options.store.read(loaded.sessionKey);
          } catch {
            publish({ ...state, status: 'error', error: 'storage' });
            return;
          }
        } catch (error) {
          if (
            !(error instanceof WorkoutPreloadReadError) ||
            error.code !== 'network'
          ) {
            publish({ ...state, status: 'error', error: 'unavailable' });
            return;
          }
          cached = true;
        } finally {
          clearTimeout(timer);
        }
        if (!valid()) return;
        const participant = context?.participants.find(
          (value) => value.bookingId === bookingId,
        );
        if (!context || !participant) {
          publish({ ...state, status: 'error', error: 'unavailable' });
          return;
        }
        state = { ...state, cached };
        try {
          await persist(context, {
            version: 1,
            sessionKey: context.sessionKey,
            bookingId,
            clientRecordId: participant.clientRecordId,
            collapsed: false,
          });
        } catch {
          publish({ ...state, status: 'error', error: 'storage' });
        }
      }),
    select: (clientRecordId: string) =>
      serialize(async () => {
        const { context, recovery } = state;
        const participant = context?.participants.find(
          (value) => value.clientRecordId === clientRecordId,
        );
        if (!context || !recovery || !participant || state.error === 'storage')
          return;
        try {
          await persist(context, {
            ...recovery,
            clientRecordId,
            bookingId: participant.bookingId,
          });
        } catch {
          publish({ ...state, status: 'error', error: 'storage' });
        }
      }),
    collapse: (collapsed: boolean) =>
      serialize(async () => {
        if (!state.context || !state.recovery || state.error === 'storage')
          return;
        try {
          await persist(state.context, { ...state.recovery, collapsed });
        } catch {
          publish({ ...state, status: 'error', error: 'storage' });
        }
      }),
    stop() {
      stopped = true;
      generation++;
      controller?.abort();
      return queue.then(() => options.store.close());
    },
  };
}
