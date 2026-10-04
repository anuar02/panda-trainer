import type { AccountExport } from '@/domain/account-export';
import type { Scope } from '@/domain/account-local-export';
import { SQLiteOutboxStore, type SQLiteDriver } from '../workout-sync/storage';
import { createPendingExportReaders } from './pending-readers';
import { boundedExportStep } from './service';
import { createAccountExportCollector } from './collector';
import type { ServerContextReader, SnapshotReader } from './collector-types';
export function createRuntimeAccountExportCollector(
  scope: Scope,
  guard: () => Promise<void>,
  isCurrent: () => boolean,
  context?: ServerContextReader,
  loadSQLite: () => Promise<{
    openDatabaseAsync(
      name: string,
      options: { useNewConnection: true },
    ): Promise<SQLiteDriver>;
  }> = () => import('expo-sqlite'),
) {
  const collect = (
    server: AccountExport,
    currentScope: Scope,
    callerGuard: () => Promise<void>,
    signal?: AbortSignal,
    callerCurrent: () => boolean = isCurrent,
  ) => {
    const current = () => !signal?.aborted && isCurrent() && callerCurrent();
    const readGuard = async () => {
      if (!current()) throw new Error('cancelled');
      await boundedExportStep(callerGuard(), signal, 5000);
      await boundedExportStep(guard(), signal, 5000);
      if (!current()) throw new Error('cancelled');
    };
    const local: SnapshotReader = {
      async scopedSnapshot(request) {
        await readGuard();
        const sqlite = await boundedExportStep(loadSQLite(), signal, 5000);
        const opening = sqlite.openDatabaseAsync('workout-sync.db', {
          useNewConnection: true,
        });
        let expired = false;
        void opening
          .then(async (opened) => {
            if (expired) await opened.closeAsync();
          })
          .catch(() => {});
        const database = await boundedExportStep(opening, signal, 5000).catch(
          (error: unknown) => {
            expired = true;
            throw error;
          },
        );
        const store = new SQLiteOutboxStore(
          { accountId: scope.accountId, workspaceId: scope.workspaceId },
          database,
        );
        try {
          await readGuard();
          return await store.scopedSnapshot(request);
        } finally {
          await boundedExportStep(store.close(), undefined, 5000);
        }
      },
    };
    return createAccountExportCollector({
      local,
      context,
      pending: createPendingExportReaders(scope, readGuard, current),
    })(server, currentScope, readGuard, signal, current);
  };
  return { collect, close: async () => {} };
}
