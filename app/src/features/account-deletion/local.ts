import { removeDeletedAccountMarker } from './storage-fence';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { SQLiteDriver } from '@/features/workout-sync/storage';
import { validateSnapshotOperation } from '@/features/workout-sync/snapshot-validation';
import { exportUtf8Bytes } from '@/features/account-export/file-contract';

export const deletionTables = {
  'workout-sync.db': ['workout_outbox', 'workout_local_entries'],
  'workout-entry.db': [
    'workout_entry_drafts',
    'workout_entry_resources',
    'workout_entry_devices',
  ],
  'workout-preload.db': ['workout_preload_context', 'workout_preload_recovery'],
} as const;
export type DeletionLocalSnapshot = {
  accountId: string;
  fingerprint: string;
  records: { source: string; rows: Record<string, unknown>[] }[];
  outstanding: number;
};
export type DeletionLocalAdapter = {
  storage: Pick<typeof AsyncStorage, 'getAllKeys' | 'getItem' | 'removeItem'>;
  open(name: string): Promise<SQLiteDriver>;
  hash(value: string): Promise<string>;
};
export const deletionLocalAdapter: DeletionLocalAdapter = {
  storage: AsyncStorage,
  open: async (name) =>
    (await import('expo-sqlite')).openDatabaseAsync(name, {
      useNewConnection: true,
    }),
  hash: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
};
const prefixes = [
  'panda-trainer-pending-program-v1:',
  'panda-trainer-pending-correction-v1:',
  'panda-trainer-pending-booking-v1:',
  'panda-trainer-pending-booking-status-v1:',
  'panda-trainer-pending-reschedule-v1:',
  'panda-trainer-pending-billing-v1:',
  'panda-trainer-workspace-template-v1:',
  'panda-trainer-workspace-exercise-v1:',
];
function scopedKey(key: string, accountId: string) {
  return prefixes.some((prefix) => key.startsWith(`${prefix}${accountId}:`));
}
function safeRaw(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (
        /^(operation_json|result_json|value_json|raw)$/.test(key) &&
        typeof child === 'string'
      )
        safeRaw(JSON.parse(child) as unknown);
    }
  }
  const serialized = JSON.stringify(value);
  if (
    /"[^"\\]*(?:token|password|authorization|secret)[^"\\]*"\s*:|Bearer\s+[A-Za-z0-9._~-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(
      serialized,
    )
  )
    throw new Error('unsafe_local_source');
}
function outstanding(table: string, row: Record<string, unknown>): boolean {
  if (table === 'workout_entry_drafts' || table === 'workout_preload_recovery')
    return true;
  if (table !== 'workout_outbox') return false;
  if (
    typeof row.account_id !== 'string' ||
    typeof row.workspace_id !== 'string'
  )
    throw new Error('invalid_local_scope');
  const operation = validateSnapshotOperation(row, {
    accountId: row.account_id,
    workspaceId: row.workspace_id,
  });
  return operation.confirmed !== 1 || operation.result?.status !== 'applied';
}
function pendingValue(key: string, value: unknown): boolean {
  if (
    key.startsWith('panda-trainer-workspace-exercise-v1:') &&
    (value === null ||
      (typeof value === 'object' &&
        Object.keys(value).join(',') === 'completed' &&
        'completed' in value &&
        value.completed === true))
  )
    return false;
  if (
    key.startsWith('panda-trainer-workspace-template-v1:') &&
    value &&
    typeof value === 'object' &&
    Object.keys(value).sort().join(',') === 'baseRevision,draft' &&
    'draft' in value &&
    value.draft === null &&
    'baseRevision' in value &&
    value.baseRevision === null
  )
    return false;
  return true;
}
export async function readDeletionLocal(
  accountId: string,
  guard: () => Promise<void>,
  adapter = deletionLocalAdapter,
): Promise<DeletionLocalSnapshot> {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error('invalid_account');
  await guard();
  const records: DeletionLocalSnapshot['records'] = [];
  let pending = 0;
  for (const [name, tables] of Object.entries(deletionTables)) {
    const database = await adapter.open(name);
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const schema = await transaction.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        );
        for (const table of tables) {
          await guard();
          const rows = schema.some((item) => item.name === table)
            ? await transaction.getAllAsync<Record<string, unknown>>(
                `SELECT * FROM ${table} WHERE account_id = ? ORDER BY rowid`,
                accountId,
              )
            : [];
          if (
            rows.length > 10000 ||
            rows.some((row) => row.account_id !== accountId)
          )
            throw new Error('invalid_local_scope');
          for (const row of rows) {
            safeRaw(row);
            if (outstanding(table, row)) pending += 1;
          }
          records.push({ source: `${name}/${table}`, rows });
        }
      });
    } finally {
      await database.closeAsync();
    }
    await guard();
  }
  const allKeys = await adapter.storage.getAllKeys();
  if (allKeys.length > 10000) throw new Error('local_limit');
  const unknown = allKeys.filter(
    (key) =>
      key.startsWith('panda-trainer-') &&
      key.split(':').includes(accountId) &&
      !scopedKey(key, accountId),
  );
  if (unknown.length) throw new Error('unknown_local_source');
  for (const key of allKeys
    .filter((item) => scopedKey(item, accountId))
    .sort()) {
    await guard();
    const raw = await adapter.storage.getItem(key);
    if (raw === null) throw new Error('local_changed');
    const value: unknown = JSON.parse(raw);
    safeRaw(value);
    if (pendingValue(key, value)) pending += 1;
    records.push({ source: key, rows: [{ raw }] });
  }
  const json = JSON.stringify(records);
  if (exportUtf8Bytes(json) > 12 * 1024 * 1024) throw new Error('local_limit');
  const fingerprint = await adapter.hash(json);
  await guard();
  return { accountId, fingerprint, records, outstanding: pending };
}
export async function cleanupDeletedAccountCache(
  expected: DeletionLocalSnapshot,
  guard: () => Promise<void>,
  adapter = deletionLocalAdapter,
): Promise<void> {
  const current = await readDeletionLocal(expected.accountId, guard, adapter);
  if (current.fingerprint !== expected.fingerprint || current.outstanding !== 0)
    throw new Error('local_changed');
  for (const [name, tables] of Object.entries(deletionTables)) {
    await guard();
    const database = await adapter.open(name);
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await guard();
        const schema = await transaction.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        );
        const fence = schema.some(
          (item) => item.name === 'account_deletion_local_fences',
        )
          ? await transaction.getFirstAsync<{ fingerprint: string }>(
              'SELECT fingerprint FROM account_deletion_local_fences WHERE account_id = ?',
              expected.accountId,
            )
          : null;
        if (fence)
          await transaction.runAsync(
            'DELETE FROM account_deletion_local_fences WHERE account_id = ?',
            expected.accountId,
          );
        for (const table of tables) {
          if (!schema.some((item) => item.name === table)) continue;
          const rowsNow = await transaction.getAllAsync<
            Record<string, unknown>
          >(
            `SELECT * FROM ${table} WHERE account_id = ? ORDER BY rowid`,
            expected.accountId,
          );
          const captured = expected.records.find(
            (source) => source.source === `${name}/${table}`,
          )?.rows;
          if (JSON.stringify(rowsNow) !== JSON.stringify(captured))
            throw new Error('local_changed');
          if (
            table === 'workout_entry_drafts' ||
            table === 'workout_preload_recovery'
          ) {
            const remaining = await transaction.getAllAsync<
              Record<string, unknown>
            >(
              `SELECT * FROM ${table} WHERE account_id = ?`,
              expected.accountId,
            );
            if (remaining.length) throw new Error('outstanding_local_data');
          } else if (table === 'workout_outbox') {
            const rows = await transaction.getAllAsync<Record<string, unknown>>(
              `SELECT * FROM ${table} WHERE account_id = ?`,
              expected.accountId,
            );
            if (rows.some((row) => outstanding(table, row)))
              throw new Error('outstanding_local_data');
            await transaction.runAsync(
              `DELETE FROM ${table} WHERE account_id = ? AND confirmed = 1`,
              expected.accountId,
            );
          } else
            await transaction.runAsync(
              `DELETE FROM ${table} WHERE account_id = ?`,
              expected.accountId,
            );
        }
        if (
          schema.some((item) => item.name === 'account_deletion_local_fences')
        )
          await transaction.runAsync(
            'INSERT OR IGNORE INTO account_deletion_local_fences(account_id, fingerprint) VALUES(?, ?)',
            expected.accountId,
            fence?.fingerprint ?? expected.fingerprint,
          );
        await guard();
      });
    } finally {
      await database.closeAsync();
    }
  }
  for (const source of expected.records.filter((item) =>
    scopedKey(item.source, expected.accountId),
  )) {
    const raw = source.rows[0]?.raw;
    if (
      typeof raw !== 'string' ||
      pendingValue(source.source, JSON.parse(raw) as unknown)
    )
      throw new Error('outstanding_local_data');
    if (adapter === deletionLocalAdapter)
      await removeDeletedAccountMarker(
        expected.accountId,
        source.source,
        raw,
        guard,
      );
    else {
      await guard();
      if ((await adapter.storage.getItem(source.source)) !== raw)
        throw new Error('local_changed');
      await adapter.storage.removeItem(source.source);
      await guard();
    }
  }
}

const deletionSchemas: Record<string, string> = {
  workout_outbox:
    'sequence INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_id TEXT NOT NULL, operation_json TEXT NOT NULL, result_json TEXT, confirmed INTEGER NOT NULL DEFAULT 0, UNIQUE(account_id, workspace_id, operation_id)',
  workout_local_entries:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, entity_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, entity_id)',
  workout_entry_drafts:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, workout_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, workout_id)',
  workout_entry_resources:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, workout_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, workout_id)',
  workout_entry_devices:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id)',
  workout_preload_context:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, session_key TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id, session_key)',
  workout_preload_recovery:
    'account_id TEXT NOT NULL, workspace_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(account_id, workspace_id)',
};
export async function fenceDeletionLocal(
  expected: DeletionLocalSnapshot,
  guard: () => Promise<void>,
  adapter = deletionLocalAdapter,
): Promise<void> {
  for (const [name, tables] of Object.entries(deletionTables)) {
    await guard();
    const database = await adapter.open(name);
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(
          'CREATE TABLE IF NOT EXISTS account_deletion_local_fences(account_id TEXT PRIMARY KEY NOT NULL, fingerprint TEXT NOT NULL)',
        );
        for (const table of tables) {
          await transaction.execAsync(
            `CREATE TABLE IF NOT EXISTS ${table}(${deletionSchemas[table]})`,
          );
          const rows = await transaction.getAllAsync<Record<string, unknown>>(
            `SELECT * FROM ${table} WHERE account_id = ? ORDER BY rowid`,
            expected.accountId,
          );
          const captured = expected.records.find(
            (source) => source.source === `${name}/${table}`,
          )?.rows;
          if (JSON.stringify(rows) !== JSON.stringify(captured))
            throw new Error('local_changed');
          for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
            const reference = operation === 'DELETE' ? 'OLD' : 'NEW';
            const old =
              operation === 'UPDATE' ? ' OR account_id = OLD.account_id' : '';
            await transaction.execAsync(
              `CREATE TRIGGER IF NOT EXISTS account_deletion_${table}_${operation} BEFORE ${operation} ON ${table} WHEN EXISTS(SELECT 1 FROM account_deletion_local_fences WHERE account_id = ${reference}.account_id${old}) BEGIN SELECT RAISE(ABORT, 'account_deletion_pending'); END`,
            );
          }
        }
        await transaction.runAsync(
          'INSERT OR IGNORE INTO account_deletion_local_fences(account_id, fingerprint) VALUES(?, ?)',
          expected.accountId,
          expected.fingerprint,
        );
        await guard();
      });
    } finally {
      await database.closeAsync();
    }
  }
}

export async function canResumeDeletionCleanup(
  accountId: string,
  fingerprint: string,
  guard: () => Promise<void>,
  adapter = deletionLocalAdapter,
): Promise<boolean> {
  for (const name of Object.keys(deletionTables)) {
    await guard();
    const database = await adapter.open(name);
    try {
      const row = await database.getFirstAsync<{ fingerprint: string }>(
        'SELECT fingerprint FROM account_deletion_local_fences WHERE account_id = ?',
        accountId,
      );
      if (row?.fingerprint !== fingerprint) return false;
    } finally {
      await database.closeAsync();
    }
  }
  await guard();
  return true;
}
