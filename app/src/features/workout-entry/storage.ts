import {
  validateDraft,
  type EntryDraft,
  type EntryDraftStore,
} from '../../domain/workout-entry';
import type { JsonValue, SyncScope } from '../../domain/workout-sync/types';
import type { SQLiteDriver } from '../workout-sync/storage';

export class SQLiteEntryDraftStore implements EntryDraftStore {
  readonly scope: SyncScope;
  private queue: Promise<void> = Promise.resolve();
  private closing = false;
  private closePromise: Promise<void> | null = null;
  constructor(
    scope: SyncScope,
    private readonly database: SQLiteDriver,
  ) {
    this.scope = Object.freeze({ ...scope });
  }
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('entry_drafts_closed'));
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  getDeviceId(newId: () => string): Promise<string> {
    return this.serialize(async () => {
      let deviceId = '';
      await this.database.withExclusiveTransactionAsync(async (transaction) => {
        const row = await transaction.getFirstAsync<{ device_id: string }>(
          'SELECT device_id FROM workout_entry_devices WHERE account_id = ? AND workspace_id = ?',
          this.scope.accountId,
          this.scope.workspaceId,
        );
        deviceId = row?.device_id ?? newId();
        if (!deviceId) throw new Error('invalid_device_id');
        if (!row)
          await transaction.runAsync(
            'INSERT INTO workout_entry_devices (account_id, workspace_id, device_id) VALUES (?, ?, ?)',
            this.scope.accountId,
            this.scope.workspaceId,
            deviceId,
          );
      });
      return deviceId;
    });
  }
  read(workoutId: string): Promise<EntryDraft | null> {
    return this.serialize(async () => {
      const row = await this.database.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM workout_entry_drafts WHERE account_id = ? AND workspace_id = ? AND workout_id = ?',
        this.scope.accountId,
        this.scope.workspaceId,
        workoutId,
      );
      if (!row) return null;
      const draft = JSON.parse(row.value_json) as EntryDraft;
      validateDraft(draft);
      if (draft.workoutId !== workoutId) throw new Error('invalid_entry_draft');
      return draft;
    });
  }
  save(draft: EntryDraft): Promise<void> {
    validateDraft(draft);
    const serialized = JSON.stringify(draft);
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          'INSERT INTO workout_entry_drafts (account_id, workspace_id, workout_id, value_json) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, workspace_id, workout_id) DO UPDATE SET value_json = excluded.value_json',
          this.scope.accountId,
          this.scope.workspaceId,
          draft.workoutId,
          serialized,
        );
      }),
    );
  }
  readResources(workoutId: string): Promise<JsonValue | null> {
    return this.serialize(async () => {
      const row = await this.database.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM workout_entry_resources WHERE account_id = ? AND workspace_id = ? AND workout_id = ?',
        this.scope.accountId,
        this.scope.workspaceId,
        workoutId,
      );
      return row ? (JSON.parse(row.value_json) as JsonValue) : null;
    });
  }
  saveResources(workoutId: string, value: JsonValue): Promise<void> {
    const serialized = JSON.stringify(value);
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          'INSERT INTO workout_entry_resources (account_id, workspace_id, workout_id, value_json) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, workspace_id, workout_id) DO UPDATE SET value_json = excluded.value_json',
          this.scope.accountId,
          this.scope.workspaceId,
          workoutId,
          serialized,
        );
      }),
    );
  }
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing = true;
      this.closePromise = this.queue.then(() => this.database.closeAsync());
    }
    return this.closePromise;
  }
}
export async function openEntryDraftStore(
  scope: SyncScope,
  driver?: SQLiteDriver,
): Promise<SQLiteEntryDraftStore> {
  const database =
    driver ??
    (await (
      await import('expo-sqlite')
    ).openDatabaseAsync('workout-entry.db', { useNewConnection: true }));
  try {
    await database.execAsync(`PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS workout_entry_resources (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, workout_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, workout_id));
CREATE TABLE IF NOT EXISTS workout_entry_devices (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id));
CREATE TABLE IF NOT EXISTS workout_entry_drafts (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, workout_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, workout_id));`);
    return new SQLiteEntryDraftStore(scope, database);
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
