import type { SyncScope } from '../../domain/workout-sync/types';
import type {
  WorkoutPreloadContext,
  WorkoutRecovery,
} from '../../domain/workout-preload/types';
import {
  validateWorkoutPreloadContext,
  validateWorkoutRecovery,
} from '../../domain/workout-preload/validation';
import type { SQLiteDriver } from '../workout-sync/storage';

type RecoveryRow = { workspace_id: string; value_json: string };
export async function findWorkoutPreloadRecovery(
  accountId: string,
  driver?: SQLiteDriver,
): Promise<{
  scope: SyncScope;
  context: WorkoutPreloadContext;
  recovery: WorkoutRecovery;
} | null> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(accountId)) throw new Error('Invalid preload account');
  const database =
    driver ??
    (await (
      await import('expo-sqlite')
    ).openDatabaseAsync('workout-preload.db', { useNewConnection: true }));
  try {
    await database.execAsync(`CREATE TABLE IF NOT EXISTS workout_preload_context (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, session_key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (account_id, workspace_id, session_key));
CREATE TABLE IF NOT EXISTS workout_preload_recovery (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (account_id, workspace_id));`);
    const rows = await database.getAllAsync<RecoveryRow>(
      'SELECT workspace_id, value_json FROM workout_preload_recovery WHERE account_id = ?',
      accountId,
    );
    const candidates: {
      scope: SyncScope;
      context: WorkoutPreloadContext;
      recovery: WorkoutRecovery;
    }[] = [];
    for (const row of rows) {
      if (!uuid.test(row.workspace_id))
        throw new Error('Invalid preload workspace');
      const scope = { accountId, workspaceId: row.workspace_id };
      const recovery = validateWorkoutRecovery(
        JSON.parse(row.value_json) as unknown,
      );
      const cached = await database.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM workout_preload_context WHERE account_id = ? AND workspace_id = ? AND session_key = ?',
        accountId,
        scope.workspaceId,
        recovery.sessionKey,
      );
      if (!cached) throw new Error('Unknown workout recovery context');
      const context = validateWorkoutPreloadContext(
        JSON.parse(cached.value_json) as unknown,
        scope,
      );
      if (
        context.sessionKey !== recovery.sessionKey ||
        !context.participants.some(
          (item) =>
            item.bookingId === recovery.bookingId &&
            item.clientRecordId === recovery.clientRecordId,
        )
      )
        throw new Error('Unknown workout recovery participant');
      candidates.push({ scope, context, recovery });
    }
    candidates.sort(
      (left, right) =>
        Date.parse(right.context.loadedAt) -
          Date.parse(left.context.loadedAt) ||
        left.scope.workspaceId.localeCompare(right.scope.workspaceId),
    );
    return candidates[0] ?? null;
  } finally {
    await database.closeAsync();
  }
}
