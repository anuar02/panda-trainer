import {
  cleanupDeletedAccountCache,
  fenceDeletionLocal,
  canResumeDeletionCleanup,
  readDeletionLocal,
  type DeletionLocalAdapter,
} from '@/features/account-deletion/local';
import type {
  SQLiteDriver,
  SQLiteExecutor,
} from '@/features/workout-sync/storage';

jest.mock('@/features/account-deletion/storage-fence', () => ({
  removeDeletedAccountMarker: jest.fn(),
}));

const accountId = '10000000-0000-4000-8000-000000000001';
const foreign = '10000000-0000-4000-8000-000000000002';
type Row = Record<string, unknown>;
function fixture(
  rows: Record<string, Row[]> = {},
  keys: Record<string, string> = {},
) {
  const closed: string[] = [];
  const deleted: { sql: string; account: unknown }[] = [];
  const databases = new Map<string, SQLiteDriver>();
  const adapter: DeletionLocalAdapter = {
    storage: {
      getAllKeys: jest.fn(async () => Object.keys(keys)),
      getItem: jest.fn(async (key: string) => keys[key] ?? null),
      removeItem: jest.fn(async (key: string) => {
        delete keys[key];
      }),
    },
    hash: jest.fn(async (value: string) => value),
    open: jest.fn(async (name: string) => {
      const transaction: SQLiteExecutor = {
        execAsync: jest.fn(async () => {}),
        runAsync: jest.fn(async (sql, account) => {
          deleted.push({ sql, account });
          const table = sql.match(/DELETE FROM (\w+)/)?.[1];
          if (table)
            rows[table] = (rows[table] ?? []).filter(
              (row) => row.account_id !== account,
            );
          return {};
        }),
        getFirstAsync: async <T>() => null as T | null,
        getAllAsync: async <T>(sql: string, account?: unknown) => {
          if (sql.includes('sqlite_master'))
            return Object.keys(rows).map((table) => ({ name: table })) as T[];
          const table = sql.match(/FROM (\w+)/)?.[1] ?? '';
          return JSON.parse(
            JSON.stringify(
              (rows[table] ?? []).filter((row) => row.account_id === account),
            ),
          ) as T[];
        },
      };
      const database: SQLiteDriver = {
        ...transaction,
        withExclusiveTransactionAsync: async (task) => task(transaction),
        closeAsync: jest.fn(async () => {
          closed.push(name);
        }),
      };
      databases.set(name, database);
      return database;
    }),
  };
  return { adapter, rows, keys, closed, deleted, databases };
}
const guard = async () => {};

test('empty newly installed databases are known empty and each connection closes', async () => {
  const { adapter, closed } = fixture();
  const snapshot = await readDeletionLocal(accountId, guard, adapter);
  expect(snapshot.outstanding).toBe(0);
  expect(snapshot.records).toHaveLength(7);
  expect(closed).toEqual([
    'workout-sync.db',
    'workout-entry.db',
    'workout-preload.db',
  ]);
});

test.each([
  ['workout_entry_drafts', {}],
  ['workout_preload_recovery', {}],
  ['workout_outbox', { confirmed: 0, result_json: null }],
  [
    'workout_outbox',
    { confirmed: 1, result_json: JSON.stringify({ status: 'conflict' }) },
  ],
  [
    'workout_outbox',
    { confirmed: 1, result_json: JSON.stringify({ status: 'error' }) },
  ],
] as const)(
  '%s pending/conflict/rejected record remains outstanding and never purges',
  async (table, values) => {
    const { adapter, deleted } = fixture({
      [table]: [
        {
          account_id: accountId,
          ...(table === 'workout_outbox'
            ? {
                workspace_id: 'workspace-a',
                operation_id: 'operation-a',
                entity_id: 'entity-a',
                sequence: 1,
                operation_json: JSON.stringify({
                  operation_id: 'operation-a',
                  entity_id: 'entity-a',
                  device_id: 'device-a',
                  kind: 'set_note',
                  base_revision: 1,
                  created_at: '2026-10-04T00:00:00Z',
                  payload: {},
                }),
              }
            : {}),
          ...values,
          ...('result_json' in values && values.result_json
            ? {
                result_json: JSON.stringify({
                  ...JSON.parse(values.result_json),
                  operation_id: 'operation-a',
                  entity_id: 'entity-a',
                  revision: null,
                  conflict_id: 'conflict-a',
                }),
              }
            : {}),
        },
      ],
    });
    const snapshot = await readDeletionLocal(accountId, guard, adapter);
    expect(snapshot.outstanding).toBe(1);
    await expect(
      cleanupDeletedAccountCache(snapshot, guard, adapter),
    ).rejects.toThrow();
    expect(deleted).toHaveLength(0);
  },
);

test.each(['billing', 'program-update'])(
  'own scoped %s pending survives and foreign key is excluded from export',
  async (kind) => {
    const own = `panda-trainer-pending-${kind}-v1:${accountId}:workspace`;
    const other = `panda-trainer-pending-${kind}-v1:${foreign}:workspace`;
    const { adapter, keys, deleted } = fixture(
      {},
      {
        [own]: JSON.stringify({ command: 'synthetic' }),
        [other]: JSON.stringify({ command: 'foreign' }),
      },
    );
    const snapshot = await readDeletionLocal(accountId, guard, adapter);
    expect(snapshot.outstanding).toBe(1);
    expect(snapshot.records.map((record) => record.source)).toContain(own);
    expect(snapshot.records.map((record) => record.source)).not.toContain(
      other,
    );
    await expect(
      cleanupDeletedAccountCache(snapshot, guard, adapter),
    ).rejects.toThrow();
    expect(Object.keys(keys)).toEqual([own, other]);
    expect(deleted).toHaveLength(0);
  },
);

test('unknown own storage key fails closed instead of reporting no work', async () => {
  const { adapter } = fixture(
    {},
    { [`panda-trainer-new-command:${accountId}:workspace`]: '{}' },
  );
  await expect(readDeletionLocal(accountId, guard, adapter)).rejects.toThrow(
    'unknown_local_source',
  );
});

test.each([
  { password: 'synthetic-only' },
  { authorization: 'synthetic-only' },
  { text: 'Bearer synthetic-secret' },
])('sensitive pending payload is rejected before export', async (value) => {
  const { adapter } = fixture(
    {},
    {
      [`panda-trainer-pending-billing-v1:${accountId}:workspace`]:
        JSON.stringify(value),
    },
  );
  await expect(readDeletionLocal(accountId, guard, adapter)).rejects.toThrow(
    'unsafe_local_source',
  );
});

test('nested JSON credential in SQLite text fails closed', async () => {
  const { adapter } = fixture({
    workout_local_entries: [
      {
        account_id: accountId,
        value_json: JSON.stringify({ token: 'synthetic-private' }),
      },
    ],
  });
  await expect(readDeletionLocal(accountId, guard, adapter)).rejects.toThrow(
    'unsafe_local_source',
  );
});

test('unverifiable applied receipt does not authorize dropping an outbox record', async () => {
  const { adapter, deleted } = fixture({
    workout_outbox: [
      {
        account_id: accountId,
        operation_id: 'synthetic',
        operation_json: '{}',
        result_json: JSON.stringify({ status: 'applied' }),
        confirmed: 1,
      },
    ],
  });
  await expect(readDeletionLocal(accountId, guard, adapter)).rejects.toThrow();
  expect(deleted).toHaveLength(0);
});

test('cache-only cleanup uses exact account WHERE and retains all foreign rows', async () => {
  const { adapter, rows, deleted } = fixture({
    workout_local_entries: [
      { account_id: accountId, text: 'own' },
      { account_id: foreign, text: 'foreign' },
    ],
    workout_entry_resources: [{ account_id: accountId, text: 'own' }],
  });
  const snapshot = await readDeletionLocal(accountId, guard, adapter);
  await cleanupDeletedAccountCache(snapshot, guard, adapter);
  expect(rows.workout_local_entries).toEqual([
    { account_id: foreign, text: 'foreign' },
  ]);
  expect(rows.workout_entry_resources).toEqual([]);
  expect(
    deleted.every(
      (entry) =>
        entry.sql.includes('WHERE account_id = ?') &&
        entry.account === accountId,
    ),
  ).toBe(true);
});

test('local change after snapshot prevents every cache DELETE', async () => {
  const { adapter, rows, deleted } = fixture({
    workout_local_entries: [{ account_id: accountId, text: 'original' }],
  });
  const snapshot = await readDeletionLocal(accountId, guard, adapter);
  rows.workout_local_entries![0]!.text = 'new draft';
  await expect(
    cleanupDeletedAccountCache(snapshot, guard, adapter),
  ).rejects.toThrow('local_changed');
  expect(deleted).toHaveLength(0);
});

test('database read failure still closes connection and never fabricates empty inventory', async () => {
  const { adapter, closed } = fixture();
  const open = adapter.open;
  adapter.open = async (name) => {
    const database = await open(name);
    database.withExclusiveTransactionAsync = async () => {
      throw new Error('sqlite unavailable');
    };
    return database;
  };
  await expect(readDeletionLocal(accountId, guard, adapter)).rejects.toThrow(
    'sqlite unavailable',
  );
  expect(closed).toEqual(['workout-sync.db']);
});

test('local fence compares captured rows before installing account mutation interlock', async () => {
  const { adapter, rows, deleted, closed } = fixture({
    workout_local_entries: [{ account_id: accountId, text: 'captured' }],
  });
  const snapshot = await readDeletionLocal(accountId, guard, adapter);
  rows.workout_local_entries![0]!.text = 'changed';
  await expect(fenceDeletionLocal(snapshot, guard, adapter)).rejects.toThrow(
    'local_changed',
  );
  expect(deleted).toHaveLength(0);
  expect(closed.at(-1)).toBe('workout-sync.db');
});

test.each([false, true])(
  'cleanup resume requires identical marker in every scoped database: %s',
  async (match) => {
    const { adapter, closed } = fixture();
    const original = adapter.open;
    let index = 0;
    adapter.open = async (name) => {
      const database = await original(name);
      index += 1;
      database.getFirstAsync = async <T>() =>
        ({ fingerprint: match || index < 3 ? 'expected' : 'foreign' }) as T;
      return database;
    };
    await expect(
      canResumeDeletionCleanup(accountId, 'expected', guard, adapter),
    ).resolves.toBe(match);
    expect(closed).toHaveLength(3);
  },
);

test.each([
  ['panda-trainer-workspace-exercise-v1:', { completed: true }],
  ['panda-trainer-workspace-exercise-v1:', null],
  ['panda-trainer-workspace-template-v1:', { baseRevision: null, draft: null }],
] as const)(
  'completed %s marker is cache-only and exact own marker cleanup preserves foreign copy',
  async (prefix, value) => {
    const own = `${prefix}${accountId}:workspace`;
    const other = `${prefix}${foreign}:workspace`;
    const raw = JSON.stringify(value);
    const { adapter, keys } = fixture({}, { [own]: raw, [other]: raw });
    const snapshot = await readDeletionLocal(accountId, guard, adapter);
    expect(snapshot.outstanding).toBe(0);
    await cleanupDeletedAccountCache(snapshot, guard, adapter);
    expect(keys[own]).toBeUndefined();
    expect(keys[other]).toBe(raw);
  },
);

test.each([
  [
    'panda-trainer-workspace-exercise-v1:',
    { completed: true, pending: 'still here' },
  ],
  ['panda-trainer-workspace-exercise-v1:', { completed: false }],
  ['panda-trainer-workspace-template-v1:', { baseRevision: 1, draft: null }],
  [
    'panda-trainer-workspace-template-v1:',
    { baseRevision: null, draft: { name: 'unsaved' } },
  ],
] as const)(
  'unsettled or extended %s marker remains outstanding',
  async (prefix, value) => {
    const { adapter } = fixture(
      {},
      { [`${prefix}${accountId}:workspace`]: JSON.stringify(value) },
    );
    expect(
      (await readDeletionLocal(accountId, guard, adapter)).outstanding,
    ).toBe(1);
  },
);
