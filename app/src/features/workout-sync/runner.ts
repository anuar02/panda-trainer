import type {
  OutboxStore,
  OutboxTransport,
  SyncSession,
  SyncState,
} from '@/domain/workout-sync/types';
import { validateResponse } from '@/domain/workout-sync/validation';

const locks = new Set<string>();
const sameSession = (a: SyncSession, b: SyncSession | null) =>
  b !== null &&
  a.accountId === b.accountId &&
  a.workspaceId === b.workspaceId &&
  a.sessionId === b.sessionId &&
  a.accessToken === b.accessToken;

export function createOutboxRunner(options: {
  store: OutboxStore;
  transport: OutboxTransport;
  getSession: () => SyncSession | null;
  onState?: (state: SyncState) => void;
  timeoutMs?: number;
  batchSize?: number;
}) {
  let controller: AbortController | null = null;
  let generation = 0;
  const key = JSON.stringify([
    options.store.scope.accountId,
    options.store.scope.workspaceId,
  ]);
  const publish = (state: SyncState) => options.onState?.(state);
  return {
    stop() {
      generation++;
      controller?.abort();
    },
    async run(): Promise<void> {
      const session = options.getSession();
      if (
        !session ||
        session.accountId !== options.store.scope.accountId ||
        session.workspaceId !== options.store.scope.workspaceId ||
        locks.has(key)
      )
        return;
      const snapshot = { ...session };
      const epoch = generation;
      const active = () =>
        epoch === generation && sameSession(snapshot, options.getSession());
      locks.add(key);
      controller = new AbortController();
      const abortController = controller;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const pending = await options.store.pending(
          Math.min(100, Math.max(1, options.batchSize ?? 50)),
        );
        if (!active()) return;
        if (!pending.length) {
          const issues = (await options.store.confirmedIssues?.()) ?? [];
          if (active())
            publish(
              issues.length
                ? { status: 'conflict', results: issues }
                : { status: 'synced' },
            );
          return;
        }
        publish({ status: 'saved_on_phone', pending: pending.length });
        const operations = pending.map((item) => item.operation);
        const aborted = new Promise<never>((_, reject) => {
          abortController.signal.addEventListener(
            'abort',
            () => reject(new Error('sync_aborted')),
            { once: true },
          );
          timer = setTimeout(
            () => abortController.abort(),
            Math.max(1, options.timeoutMs ?? 15000),
          );
        });
        const raw = await Promise.race([
          options.transport.apply(snapshot, operations, abortController.signal),
          aborted,
        ]);
        if (!active()) return;
        const response = validateResponse(raw, snapshot, operations);
        await options.store.acknowledge(
          response.results.filter((result) => result.status !== 'error'),
        );
        if (!active()) return;
        const conflicts =
          (await options.store.confirmedIssues?.()) ??
          response.results.filter(
            (result) =>
              result.status === 'conflict' ||
              result.status === 'correction_draft',
          );
        const errors = response.results.filter(
          (result) => result.status === 'error',
        );
        if (conflicts.length)
          publish({ status: 'conflict', results: conflicts });
        else if (errors.length)
          publish({
            status: 'error',
            message: errors[0]?.error_code ?? 'sync_failed',
          });
        else {
          const remaining = await options.store.pending(100);
          if (active())
            publish(
              remaining.length
                ? { status: 'saved_on_phone', pending: remaining.length }
                : { status: 'synced' },
            );
        }
      } catch {
        if (active()) publish({ status: 'error', message: 'sync_failed' });
      } finally {
        if (timer) clearTimeout(timer);
        controller = null;
        locks.delete(key);
      }
    },
  };
}
