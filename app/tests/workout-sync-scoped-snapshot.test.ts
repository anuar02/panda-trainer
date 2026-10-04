import * as Crypto from 'expo-crypto';
import type {
  JournalOperation,
  OperationResult,
} from '../src/domain/workout-sync/types';
import {
  openOutboxStore,
  SQLiteOutboxStore,
  type SQLiteDriver,
  type SQLiteExecutor,
  type SQLiteParameter,
} from '../src/features/workout-sync/storage';
import { ScopedOutboxSnapshotError } from '../src/features/workout-sync/snapshot-types';

let snapshotId = 0;
beforeEach(() => {
  jest
    .spyOn(Crypto, 'randomUUID')
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++snapshotId).padStart(12, '0')}`,
    );
});
afterEach(() => {
  jest.restoreAllMocks();
});

const scope = { accountId: 'trainer', workspaceId: 'workspace' };
const request = () => ({
  expectedScope: { ...scope },
  isCurrentSession: () => true,
});
const operation = (id: string): JournalOperation => ({
  operation_id: id,
  entity_id: `entity-${id}`,
  device_id: 'phone',
  base_revision: 0,
  kind: 'set_note',
  payload: {
    note: '雪',
    repetitions: '9007199254740993',
    weight: '0.000000000000001',
    unit: 'kg',
    zero: 0,
    empty: null,
  },
  created_at: '2026-10-03T00:00:00Z',
});
type StoredRow = {
  account_id: string;
  workspace_id: string;
  operation_id: string;
  entity_id: string;
  sequence: number;
  operation_json: string;
  result_json: string | null;
  confirmed: number;
};
type StoredEntry = {
  account_id: string;
  workspace_id: string;
  entity_id: string;
  value_json: string;
};
type Query = { sql: string; parameters: SQLiteParameter[] };
class SnapshotDriver {
  rows: StoredRow[] = [];
  entries: StoredEntry[] = [];
  queries: Query[] = [];
  writes = 0;
  transactions = 0;
  failCommit = false;
  countDelta = 0;
  pageTransform: ((rows: unknown[], sql: string) => unknown[]) | undefined;
  beforeQuery: ((sql: string) => Promise<void>) | undefined;
  afterTransaction: (() => void) | undefined;
  seed(id: string, sequence = this.rows.length + 1): StoredRow {
    const op = operation(id);
    const row = {
      account_id: scope.accountId,
      workspace_id: scope.workspaceId,
      operation_id: id,
      entity_id: op.entity_id,
      sequence,
      operation_json: JSON.stringify(op),
      result_json: null,
      confirmed: 0,
    };
    this.rows.push(row);
    return row;
  }
  connect(): SQLiteDriver {
    let closed = false;
    const prohibited = async (): Promise<never> => {
      throw new Error('global executor query');
    };
    return {
      execAsync: async () => {
        if (closed) throw new Error('closed');
      },
      runAsync: prohibited,
      getAllAsync: prohibited,
      getFirstAsync: prohibited,
      closeAsync: async () => {
        closed = true;
      },
      withExclusiveTransactionAsync: async (task) => {
        if (closed) throw new Error('closed');
        this.transactions++;
        const rows = this.rows.map((row) => ({ ...row }));
        const entries = this.entries.map((row) => ({ ...row }));
        const matching = <
          T extends { account_id: string; workspace_id: string },
        >(
          values: T[],
          p: SQLiteParameter[],
        ) =>
          values.filter(
            (row) => row.account_id === p[0] && row.workspace_id === p[1],
          );
        const query = async (sql: string, p: SQLiteParameter[]) => {
          expect(sql).toMatch(/^SELECT /);
          expect(sql).toContain('account_id = ? AND workspace_id = ?');
          this.queries.push({ sql, parameters: p });
          await this.beforeQuery?.(sql);
        };
        const executor: SQLiteExecutor = {
          execAsync: prohibited,
          runAsync: async (sql, ...p) => {
            this.writes++;
            if (sql.startsWith('INSERT INTO workout_local_entries')) {
              const existing = matching(entries, p).find(
                (row) => row.entity_id === p[2],
              );
              if (existing) existing.value_json = String(p[3]);
              else
                entries.push({
                  account_id: String(p[0]),
                  workspace_id: String(p[1]),
                  entity_id: String(p[2]),
                  value_json: String(p[3]),
                });
            } else if (sql.startsWith('INSERT INTO workout_outbox'))
              rows.push({
                account_id: String(p[0]),
                workspace_id: String(p[1]),
                operation_id: String(p[2]),
                entity_id: String(p[3]),
                operation_json: String(p[4]),
                sequence: rows.length + 1,
                result_json: null,
                confirmed: 0,
              });
            else if (sql.startsWith('UPDATE workout_outbox')) {
              const row = rows.find(
                (row) =>
                  row.account_id === p[2] &&
                  row.workspace_id === p[3] &&
                  row.operation_id === p[4],
              );
              if (row) {
                row.result_json = String(p[0]);
                row.confirmed = Number(p[1]);
              }
            } else throw new Error(sql);
          },
          getFirstAsync: async <T>(
            sql: string,
            ...p: SQLiteParameter[]
          ): Promise<T | null> => {
            await query(sql, p);
            if (sql.includes('COUNT(*)'))
              return {
                count:
                  (sql.includes('workout_outbox')
                    ? matching(rows, p)
                    : matching(entries, p)
                  ).length + this.countDelta,
              } as T;
            return (
              (matching(rows, p).find((row) => row.operation_id === p[2]) as
                T | undefined) ?? null
            );
          },
          getAllAsync: async <T>(
            sql: string,
            ...p: SQLiteParameter[]
          ): Promise<T[]> => {
            await query(sql, p);
            const outbox = sql.includes('workout_outbox');
            expect(sql).toContain(
              outbox
                ? 'ORDER BY sequence ASC'
                : 'ORDER BY entity_id COLLATE BINARY ASC',
            );
            expect(sql).toContain('LIMIT ? OFFSET ?');
            const sorted = outbox
              ? matching(rows, p).sort((a, b) => a.sequence - b.sequence)
              : matching(entries, p).sort((a, b) =>
                  Buffer.compare(
                    Buffer.from(a.entity_id),
                    Buffer.from(b.entity_id),
                  ),
                );
            const page = sorted.slice(
              Number(p[3]),
              Number(p[3]) + Number(p[2]),
            );
            return (this.pageTransform?.(page, sql) ?? page) as T[];
          },
        };
        await task(executor);
        if (this.failCommit) throw new Error('commit failure');
        this.rows = rows;
        this.entries = entries;
        this.afterTransaction?.();
      },
    };
  }
}
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function rejectsCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ScopedOutboxSnapshotError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('independent scoped snapshot SQLite seam', () => {
  test('captures only account and workspace identity fields', async () => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    const extended = {
      ...scope,
      accessToken: 'synthetic-unused-credential',
      sessionId: 'synthetic-session',
    };
    const snapshot = await store.scopedSnapshot({
      ...request(),
      expectedScope: extended,
    });
    expect(snapshot.metadata.scope).toEqual(scope);
    expect(JSON.stringify(snapshot)).not.toContain(extended.accessToken);
    expect(
      driver.queries.every(
        (query) =>
          query.parameters[0] === scope.accountId &&
          query.parameters[1] === scope.workspaceId,
      ),
    ).toBe(true);
  });
  test('matching invalid constructor scope is rejected before enqueue', async () => {
    const driver = new SnapshotDriver();
    const invalidScope = { accountId: '', workspaceId: 'workspace' };
    const store = new SQLiteOutboxStore(invalidScope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot({
        expectedScope: invalidScope,
        isCurrentSession: () => true,
      }),
      'scopeMismatch',
    );
    expect(driver.transactions).toBe(0);
  });
  test.each([
    'operationId',
    'sequence',
    'oversizedPage',
    'extraRow',
    'workspace',
  ])('independently rejects %s driver corruption', async (corruption) => {
    const driver = new SnapshotDriver();
    driver.seed('first');
    const second = driver.seed('second');
    if (corruption === 'operationId') {
      second.operation_id = 'first';
      second.operation_json = JSON.stringify(operation('first'));
      second.entity_id = 'entity-first';
    }
    if (corruption === 'sequence') second.sequence = 1;
    if (corruption === 'extraRow') driver.countDelta = -1;
    if (corruption === 'workspace')
      driver.pageTransform = (rows) =>
        rows.map((row) => ({ ...(row as StoredRow), workspace_id: 'foreign' }));
    if (corruption === 'oversizedPage')
      driver.pageTransform = (rows) =>
        rows.length ? [...rows, ...rows] : rows;
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot({ ...request(), limits: { pageSize: 2 } }),
      corruption === 'workspace' ? 'scopeMismatch' : 'malformed',
    );
    expect(driver.writes).toBe(0);
  });
  test.each(['outboxCount', 'entryCount', 'outboxPage', 'entryPage'])(
    'session identity invalidation during %s await rejects and preserves rows',
    async (phase) => {
      const driver = new SnapshotDriver();
      driver.seed('first');
      driver.entries.push({
        account_id: scope.accountId,
        workspace_id: scope.workspaceId,
        entity_id: 'entry',
        value_json: 'null',
      });
      const store = await openOutboxStore(scope, driver.connect());
      let current = true;
      const original = JSON.stringify([driver.rows, driver.entries]);
      driver.beforeQuery = async (sql) => {
        if (
          (phase.startsWith('outbox')
            ? sql.includes('workout_outbox')
            : sql.includes('workout_local_entries')) &&
          (phase.endsWith('Count')
            ? sql.includes('COUNT')
            : sql.includes('LIMIT'))
        )
          current = false;
      };
      await rejectsCode(
        store.scopedSnapshot({ ...request(), isCurrentSession: () => current }),
        'cancelled',
      );
      expect(JSON.stringify([driver.rows, driver.entries])).toBe(original);
      driver.beforeQuery = undefined;
      expect((await store.scopedSnapshot(request())).entries).toHaveLength(1);
    },
  );

  test('captures all rows and arbitrary local entries with terminal pages, raw JSON and fresh metadata', async () => {
    const driver = new SnapshotDriver();
    for (let i = 0; i < 205; i++) driver.seed(String(i));
    const statuses: OperationResult['status'][] = [
      'applied',
      'error',
      'conflict',
      'correction_draft',
    ];
    statuses.forEach((status, i) => {
      const row = driver.rows[i];
      if (!row) throw new Error('missing fixture row');
      row.result_json = JSON.stringify({
        operation_id: row.operation_id,
        entity_id: row.entity_id,
        status,
        revision: status === 'error' ? null : 1,
        ...(status === 'conflict' ? { conflict_id: 'conflict' } : {}),
        ...(status === 'correction_draft' ? { draft_id: 'draft' } : {}),
      });
      row.confirmed = status === 'error' ? 0 : 1;
    });
    for (const [entity_id, value] of [
      ['z', null],
      ['A', 0],
      ['a', { exact: '9007199254740993', unit: 'кг', value: '0.00000001' }],
      ['雪', [false, '🙂']],
    ] as const)
      driver.entries.push({
        account_id: scope.accountId,
        workspace_id: scope.workspaceId,
        entity_id,
        value_json: JSON.stringify(value),
      });
    const foreign = { ...driver.seed('foreign'), account_id: 'other' };
    driver.rows[driver.rows.length - 1] = foreign;
    const original = JSON.stringify([driver.rows, driver.entries]);
    const store = await openOutboxStore(scope, driver.connect());
    const snapshot = await store.scopedSnapshot(request());
    expect(snapshot.metadata).toMatchObject({
      scope,
      consistency: 'sqlite-exclusive-transaction',
      globalAtomicity: 'unknown',
      outboxCount: 205,
      entryCount: 4,
    });
    expect(Number.isFinite(Date.parse(snapshot.metadata.capturedAt))).toBe(
      true,
    );
    expect(snapshot.operations).toHaveLength(205);
    expect(snapshot.operations.map((row) => row.sequence)).toEqual(
      Array.from({ length: 205 }, (_, i) => i + 1),
    );
    expect(snapshot.operations[0]).toMatchObject({
      operation: operation('0'),
      operationJson: driver.rows[0]?.operation_json,
      confirmed: 1,
      result: { status: 'applied' },
    });
    expect(snapshot.operations[1]).toMatchObject({
      confirmed: 0,
      result: { status: 'error' },
    });
    expect(snapshot.entries.map((row) => row.entityId)).toEqual([
      'A',
      'a',
      'z',
      '雪',
    ]);
    expect(snapshot.entries[1]?.value).toEqual({
      exact: '9007199254740993',
      unit: 'кг',
      value: '0.00000001',
    });
    expect(
      driver.queries
        .filter((q) => q.sql.includes('LIMIT'))
        .map((q) => q.parameters.slice(2)),
    ).toEqual([
      [100, 0],
      [100, 100],
      [100, 200],
      [100, 205],
      [100, 0],
      [100, 4],
    ]);
    expect(driver.writes).toBe(0);
    expect(JSON.stringify([driver.rows, driver.entries])).toBe(original);
    expect((await store.scopedSnapshot(request())).metadata.id).not.toBe(
      snapshot.metadata.id,
    );
  });
  test('orders supplementary Unicode after high BMP according to SQLite binary collation', async () => {
    const driver = new SnapshotDriver();
    for (const entity_id of ['🙂', '\uE000'])
      driver.entries.push({
        account_id: scope.accountId,
        workspace_id: scope.workspaceId,
        entity_id,
        value_json: 'null',
      });
    const store = await openOutboxStore(scope, driver.connect());
    expect(
      (
        await store.scopedSnapshot({ ...request(), limits: { pageSize: 1 } })
      ).entries.map((row) => row.entityId),
    ).toEqual(['\uE000', '🙂']);
  });
  test('cancellation during metadata construction is checked before return', async () => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    const controller = new AbortController();
    jest.mocked(Crypto.randomUUID).mockImplementationOnce(() => {
      controller.abort();
      return '00000000-0000-4000-8000-000000000001';
    });
    await rejectsCode(
      store.scopedSnapshot({ ...request(), signal: controller.signal }),
      'cancelled',
    );
    expect((await store.scopedSnapshot(request())).operations).toEqual([]);
  });
  test('save snapshot acknowledgement run in queue order without snapshot mutation', async () => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    const op = operation('new');
    const saving = store.save({ entityId: op.entity_id, value: null }, op);
    const capturing = store.scopedSnapshot(request());
    const ack = store.acknowledge([
      {
        operation_id: op.operation_id,
        entity_id: op.entity_id,
        status: 'applied',
        revision: 1,
      },
    ]);
    await saving;
    expect((await capturing).operations[0]?.confirmed).toBe(0);
    await ack;
    expect(
      (await store.scopedSnapshot(request())).operations[0]?.confirmed,
    ).toBe(1);
    expect(driver.writes).toBe(3);
  });
  test.each([0, -1, 1.5, NaN, Infinity, 101])(
    'rejects invalid or excessive page size %s',
    async (pageSize) => {
      const driver = new SnapshotDriver();
      const store = await openOutboxStore(scope, driver.connect());
      await rejectsCode(
        store.scopedSnapshot({ ...request(), limits: { pageSize } }),
        'limit',
      );
      expect(driver.transactions).toBe(0);
    },
  );
  test.each([
    { maxRows: 10001 },
    { maxBytes: 4194305 },
    { maxRows: 0 },
    { maxBytes: 0 },
  ])('rejects invalid bounded limits %j', async (limits) => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(store.scopedSnapshot({ ...request(), limits }), 'limit');
    expect(driver.transactions).toBe(0);
  });
  test('combines operation, receipt and local value bytes without normalization', async () => {
    const driver = new SnapshotDriver();
    const row = driver.seed('byte-boundary');
    row.result_json = JSON.stringify({
      operation_id: row.operation_id,
      entity_id: row.entity_id,
      status: 'error',
      revision: null,
      error_code: '雪',
    });
    const value_json = ' [ 0, null, "🙂" ] ';
    driver.entries.push({
      account_id: scope.accountId,
      workspace_id: scope.workspaceId,
      entity_id: 'local',
      value_json,
    });
    const maxBytes =
      Buffer.byteLength(row.operation_json) +
      Buffer.byteLength(row.result_json) +
      Buffer.byteLength(value_json);
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot({
        ...request(),
        limits: { maxBytes: maxBytes - 1 },
      }),
      'limit',
    );
    const snapshot = await store.scopedSnapshot({
      ...request(),
      limits: { maxBytes },
    });
    expect(snapshot.entries[0]).toMatchObject({
      valueJson: value_json,
      value: [0, null, '🙂'],
    });
    expect(snapshot.operations[0]).toMatchObject({
      operationJson: row.operation_json,
      resultJson: row.result_json,
    });
  });
  test('combined rows and UTF-8 bytes obey exact limits', async () => {
    const driver = new SnapshotDriver();
    driver.entries.push({
      account_id: scope.accountId,
      workspace_id: scope.workspaceId,
      entity_id: 'entry',
      value_json: '"🙂"',
    });
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot({ ...request(), limits: { maxBytes: 5 } }),
      'limit',
    );
    expect(
      (await store.scopedSnapshot({ ...request(), limits: { maxBytes: 6 } }))
        .entries[0]?.value,
    ).toBe('🙂');
    driver.seed('row');
    await rejectsCode(
      store.scopedSnapshot({ ...request(), limits: { maxRows: 1 } }),
      'limit',
    );
  });
  test.each([
    'duplicate',
    'reverse',
    'count',
    'json',
    'linkage',
    'foreign',
    'confirmed',
    'sequence',
    'receipt',
  ])('rejects %s corruption and recovers its queue', async (corruption) => {
    const driver = new SnapshotDriver();
    driver.seed('first');
    driver.seed('second');
    const original = driver.rows.map((row) => ({ ...row }));
    if (corruption === 'duplicate') driver.rows[1] = { ...driver.rows[0]! };
    if (corruption === 'reverse')
      driver.pageTransform = (rows) =>
        rows.length ? [...rows].reverse() : rows;
    if (corruption === 'count') driver.countDelta = 1;
    if (corruption === 'json') driver.rows[0]!.operation_json = '{';
    if (corruption === 'linkage') driver.rows[0]!.entity_id = 'different';
    if (corruption === 'foreign')
      driver.pageTransform = (rows, sql) =>
        sql.includes('outbox')
          ? rows.map((row) => ({ ...(row as StoredRow), account_id: 'other' }))
          : rows;
    if (corruption === 'confirmed') driver.rows[0]!.confirmed = 2;
    if (corruption === 'sequence') driver.rows[0]!.sequence = 0;
    if (corruption === 'receipt')
      driver.rows[0]!.result_json = JSON.stringify({
        operation_id: 'different',
        entity_id: 'entity-first',
        status: 'error',
        revision: null,
      });
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot(request()),
      corruption === 'foreign' ? 'scopeMismatch' : 'malformed',
    );
    driver.rows = original;
    driver.pageTransform = undefined;
    driver.countDelta = 0;
    expect((await store.scopedSnapshot(request())).operations).toHaveLength(2);
    expect(driver.writes).toBe(0);
  });
  test('preflight scope, abort, session and close errors avoid transactions', async () => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    await rejectsCode(
      store.scopedSnapshot({
        ...request(),
        expectedScope: { ...scope, workspaceId: 'other' },
      }),
      'scopeMismatch',
    );
    const controller = new AbortController();
    controller.abort();
    await rejectsCode(
      store.scopedSnapshot({ ...request(), signal: controller.signal }),
      'cancelled',
    );
    await rejectsCode(
      store.scopedSnapshot({ ...request(), isCurrentSession: () => false }),
      'cancelled',
    );
    await store.close();
    await rejectsCode(store.scopedSnapshot(request()), 'closed');
    expect(driver.transactions).toBe(0);
  });
  test.each(['count', 'page', 'commit', 'queue'])(
    'cancellation while awaiting %s discards the capture',
    async (phase) => {
      const driver = new SnapshotDriver();
      driver.seed('first');
      const store = await openOutboxStore(scope, driver.connect());
      const controller = new AbortController();
      const entered = deferred();
      const release = deferred();
      let paused = false;
      driver.beforeQuery = async (sql) => {
        if (
          !paused &&
          (phase === 'queue' ||
            (phase === 'count' && sql.includes('COUNT')) ||
            (phase === 'page' && sql.includes('LIMIT')))
        ) {
          paused = true;
          entered.resolve();
          await release.promise;
        }
      };
      if (phase === 'commit')
        driver.afterTransaction = () => controller.abort();
      const predecessor =
        phase === 'queue' ? store.scopedSnapshot(request()) : undefined;
      const capture = store.scopedSnapshot({
        ...request(),
        signal: controller.signal,
      });
      if (phase !== 'commit') {
        await entered.promise;
        controller.abort();
        release.resolve();
      }
      await predecessor;
      await rejectsCode(capture, 'cancelled');
      driver.beforeQuery = undefined;
      driver.afterTransaction = undefined;
      expect((await store.scopedSnapshot(request())).operations).toHaveLength(
        1,
      );
      expect(driver.writes).toBe(0);
    },
  );
  test('captures mutable scope before a queued request and checks session during waits', async () => {
    const driver = new SnapshotDriver();
    driver.seed('first');
    const store = await openOutboxStore(scope, driver.connect());
    const entered = deferred();
    const release = deferred();
    let paused = false;
    let current = true;
    driver.beforeQuery = async () => {
      if (!paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
    };
    const first = store.scopedSnapshot(request());
    await entered.promise;
    const mutable = request();
    const captured = store.scopedSnapshot(mutable);
    mutable.expectedScope.accountId = 'changed';
    const expired = store.scopedSnapshot({
      ...request(),
      isCurrentSession: () => current,
    });
    current = false;
    release.resolve();
    await first;
    expect((await captured).metadata.scope).toEqual(scope);
    await rejectsCode(expired, 'cancelled');
  });
  test('close invalidates queued snapshot and rejects subsequent work', async () => {
    const driver = new SnapshotDriver();
    driver.seed('first');
    const store = await openOutboxStore(scope, driver.connect());
    const capture = store.scopedSnapshot(request());
    const closing = store.close();
    await rejectsCode(capture, 'closed');
    await closing;
    await rejectsCode(store.scopedSnapshot(request()), 'closed');
  });
  test('driver read failure recovers without writes', async () => {
    const driver = new SnapshotDriver();
    const store = await openOutboxStore(scope, driver.connect());
    driver.beforeQuery = async () => {
      throw new Error('read failure');
    };
    await expect(store.scopedSnapshot(request())).rejects.toThrow(
      'read failure',
    );
    driver.beforeQuery = undefined;
    expect((await store.scopedSnapshot(request())).entries).toEqual([]);
    expect(driver.writes).toBe(0);
  });
  test.each(['duplicate', 'foreign', 'json'])(
    'rejects local entry %s corruption',
    async (corruption) => {
      const driver = new SnapshotDriver();
      const entry = {
        account_id: scope.accountId,
        workspace_id: scope.workspaceId,
        entity_id: 'local',
        value_json: 'null',
      };
      driver.entries.push(entry);
      if (corruption === 'duplicate') driver.entries.push({ ...entry });
      if (corruption === 'json') entry.value_json = '{';
      if (corruption === 'foreign')
        driver.pageTransform = (rows) =>
          rows.map((row) => ({
            ...(row as StoredEntry),
            workspace_id: 'foreign',
          }));
      const store = await openOutboxStore(scope, driver.connect());
      await rejectsCode(
        store.scopedSnapshot(request()),
        corruption === 'foreign' ? 'scopeMismatch' : 'malformed',
      );
    },
  );
  test('preserves confirmed error receipts without normalizing persisted state', async () => {
    const driver = new SnapshotDriver();
    const row = driver.seed('error');
    row.result_json = JSON.stringify({
      operation_id: row.operation_id,
      entity_id: row.entity_id,
      status: 'error',
      revision: null,
      error_code: 'offline',
    });
    row.confirmed = 1;
    const store = await openOutboxStore(scope, driver.connect());
    expect((await store.scopedSnapshot(request())).operations[0]).toMatchObject(
      {
        confirmed: 1,
        resultJson: row.result_json,
        result: { status: 'error', revision: null },
      },
    );
    expect(driver.writes).toBe(0);
  });
  test('session expires after transaction and commit failure does not poison queue', async () => {
    const driver = new SnapshotDriver();
    driver.seed('first');
    const store = await openOutboxStore(scope, driver.connect());
    let current = true;
    driver.afterTransaction = () => {
      current = false;
    };
    await rejectsCode(
      store.scopedSnapshot({ ...request(), isCurrentSession: () => current }),
      'cancelled',
    );
    driver.afterTransaction = undefined;
    driver.failCommit = true;
    await expect(store.scopedSnapshot(request())).rejects.toThrow(
      'commit failure',
    );
    driver.failCommit = false;
    expect((await store.scopedSnapshot(request())).operations).toHaveLength(1);
  });
});
