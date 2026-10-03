import type {
  JsonValue,
  JournalOperation,
  LocalEntry,
  OperationResult,
  OutboxStore,
  PendingOperation,
  SyncScope,
} from '../../domain/workout-sync/types';

export type SQLiteParameter = string | number | null;
export interface SQLiteExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...parameters: SQLiteParameter[]): Promise<unknown>;
  getFirstAsync<T>(
    sql: string,
    ...parameters: SQLiteParameter[]
  ): Promise<T | null>;
  getAllAsync<T>(sql: string, ...parameters: SQLiteParameter[]): Promise<T[]>;
}
export interface SQLiteDriver extends SQLiteExecutor {
  withExclusiveTransactionAsync(
    task: (transaction: SQLiteExecutor) => Promise<void>,
  ): Promise<void>;
  closeAsync(): Promise<void>;
}
const kinds = new Set([
  'create_workout',
  'add_exercise',
  'replace_exercise',
  'upsert_set',
  'delete_set',
  'set_note',
  'finish_workout',
  'resolve_conflict',
]);
function validJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(validJson);
  return (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(validJson)
  );
}
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function validate(entry: LocalEntry, operation: JournalOperation): void {
  if (
    !operation ||
    !kinds.has(operation.kind) ||
    ![operation.operation_id, operation.entity_id, operation.device_id].every(
      (value) => typeof value === 'string' && value.length > 0,
    ) ||
    !Number.isSafeInteger(operation.base_revision) ||
    operation.base_revision < 0 ||
    typeof operation.created_at !== 'string' ||
    !Number.isFinite(Date.parse(operation.created_at)) ||
    operation.payload === null ||
    Array.isArray(operation.payload) ||
    typeof operation.payload !== 'object' ||
    !validJson(operation.payload) ||
    entry.entityId !== operation.entity_id ||
    !validJson(entry.value)
  )
    throw new Error('Invalid local operation');
}
type StoredOperation = {
  operation_json: string;
  sequence: number;
  result_json: string | null;
};
export class SQLiteOutboxStore implements OutboxStore {
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
    if (this.closing) return Promise.reject(new Error('Outbox store closed'));
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  save(entry: LocalEntry, operation: JournalOperation): Promise<void> {
    validate(entry, operation);
    const operationJson = canonical(operation as unknown as JsonValue);
    const entryJson = canonical(entry.value);
    const operationId = operation.operation_id;
    const entityId = operation.entity_id;
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        const parameters = [
          this.scope.accountId,
          this.scope.workspaceId,
          operationId,
        ];
        const existing = await transaction.getFirstAsync<StoredOperation>(
          'SELECT operation_json, sequence, result_json FROM workout_outbox WHERE account_id = ? AND workspace_id = ? AND operation_id = ?',
          ...parameters,
        );
        if (existing) {
          if (existing.operation_json !== operationJson)
            throw new Error('Operation ID already has a different payload');
          return;
        }
        await transaction.runAsync(
          'INSERT INTO workout_local_entries (account_id, workspace_id, entity_id, value_json) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, workspace_id, entity_id) DO UPDATE SET value_json = excluded.value_json',
          this.scope.accountId,
          this.scope.workspaceId,
          entityId,
          entryJson,
        );
        await transaction.runAsync(
          'INSERT INTO workout_outbox (account_id, workspace_id, operation_id, entity_id, operation_json) VALUES (?, ?, ?, ?, ?)',
          ...parameters,
          entityId,
          operationJson,
        );
      }),
    );
  }
  pending(limit = 100): Promise<PendingOperation[]> {
    if (!Number.isSafeInteger(limit) || limit < 1)
      return Promise.reject(new Error('Invalid pending limit'));
    return this.serialize(async () => {
      const rows = await this.database.getAllAsync<StoredOperation>(
        'SELECT operation_json, sequence, result_json FROM workout_outbox WHERE account_id = ? AND workspace_id = ? AND confirmed = 0 ORDER BY sequence ASC LIMIT ?',
        this.scope.accountId,
        this.scope.workspaceId,
        limit,
      );
      return rows.map((row) => ({
        operation: JSON.parse(row.operation_json) as JournalOperation,
        sequence: row.sequence,
        result:
          row.result_json === null
            ? null
            : (JSON.parse(row.result_json) as OperationResult),
      }));
    });
  }
  acknowledge(results: OperationResult[]): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(results)) as OperationResult[];
    return this.serialize(() =>
      this.database.withExclusiveTransactionAsync(async (transaction) => {
        for (const result of snapshot) {
          const row = await transaction.getFirstAsync<StoredOperation>(
            'SELECT operation_json, sequence, result_json FROM workout_outbox WHERE account_id = ? AND workspace_id = ? AND operation_id = ?',
            this.scope.accountId,
            this.scope.workspaceId,
            result.operation_id,
          );
          if (!row) throw new Error('Unknown operation receipt');
          const operation = JSON.parse(row.operation_json) as JournalOperation;
          if (
            operation.entity_id !== result.entity_id ||
            !['applied', 'conflict', 'correction_draft', 'error'].includes(
              result.status,
            ) ||
            (result.revision !== null &&
              (!Number.isSafeInteger(result.revision) || result.revision < 0))
          )
            throw new Error('Invalid operation receipt');
          if (
            result.status === 'applied' &&
            (result.revision === null || result.revision < 1)
          )
            throw new Error('Invalid operation receipt');
          if (
            (result.status === 'conflict' &&
              (typeof result.conflict_id !== 'string' ||
                !result.conflict_id)) ||
            (result.status === 'correction_draft' &&
              (typeof result.draft_id !== 'string' || !result.draft_id))
          )
            throw new Error('Invalid operation receipt');
          if (row.result_json !== null) {
            if (
              canonical(JSON.parse(row.result_json) as JsonValue) !==
              canonical(result as unknown as JsonValue)
            )
              throw new Error(
                'Operation receipt already has a different result',
              );
            continue;
          }
          await transaction.runAsync(
            'UPDATE workout_outbox SET result_json = ?, confirmed = ? WHERE account_id = ? AND workspace_id = ? AND operation_id = ?',
            JSON.stringify(result),
            result.status === 'error' ? 0 : 1,
            this.scope.accountId,
            this.scope.workspaceId,
            result.operation_id,
          );
        }
      }),
    );
  }
  confirmedIssues(): Promise<OperationResult[]> {
    return this.serialize(async () => {
      const rows = await this.database.getAllAsync<StoredOperation>(
        'SELECT operation_json, sequence, result_json FROM workout_outbox WHERE account_id = ? AND workspace_id = ? AND confirmed = 1 ORDER BY sequence ASC',
        this.scope.accountId,
        this.scope.workspaceId,
      );
      const resolved = new Set(
        rows.flatMap((row) => {
          const operation = JSON.parse(row.operation_json) as JournalOperation;
          const result =
            row.result_json === null
              ? null
              : (JSON.parse(row.result_json) as OperationResult);
          return operation.kind === 'resolve_conflict' &&
            result?.status === 'applied' &&
            typeof operation.payload.conflict_id === 'string'
            ? [operation.payload.conflict_id]
            : [];
        }),
      );
      return rows.flatMap((row) => {
        const result =
          row.result_json === null
            ? null
            : (JSON.parse(row.result_json) as OperationResult);
        return result &&
          (result.status === 'correction_draft' ||
            (result.status === 'conflict' &&
              !resolved.has(result.conflict_id ?? '')))
          ? [result]
          : [];
      });
    });
  }
  read(entityId: string): Promise<JsonValue | null> {
    return this.serialize(async () => {
      const row = await this.database.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM workout_local_entries WHERE account_id = ? AND workspace_id = ? AND entity_id = ?',
        this.scope.accountId,
        this.scope.workspaceId,
        entityId,
      );
      return row ? (JSON.parse(row.value_json) as JsonValue) : null;
    });
  }
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing = true;
      this.closePromise = this.queue.then(() => this.database.closeAsync());
    }
    return this.closePromise;
  }
}
export async function openOutboxStore(
  scope: SyncScope,
  driver?: SQLiteDriver,
): Promise<SQLiteOutboxStore> {
  if (
    ![scope.accountId, scope.workspaceId].every(
      (value) => typeof value === 'string' && value.length > 0,
    )
  )
    throw new Error('Invalid sync scope');
  const database =
    driver ??
    (await (
      await import('expo-sqlite')
    ).openDatabaseAsync('workout-sync.db', { useNewConnection: true }));
  try {
    await database.execAsync(`PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS workout_local_entries (account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, entity_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (account_id, workspace_id, entity_id));
CREATE TABLE IF NOT EXISTS workout_outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_id TEXT NOT NULL, operation_json TEXT NOT NULL, result_json TEXT, confirmed INTEGER NOT NULL DEFAULT 0, UNIQUE (account_id, workspace_id, operation_id));`);
    return new SQLiteOutboxStore(scope, database);
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
