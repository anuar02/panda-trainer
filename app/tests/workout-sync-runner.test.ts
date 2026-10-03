import { saveJournalEntry } from '../src/features/workout-sync/save';
import { createOutboxRunner } from '../src/features/workout-sync/runner';
import type {
  ApplyResponse,
  OutboxTransport,
  SyncSession,
  SyncState,
} from '../src/domain/workout-sync/types';
import {
  deferred,
  enqueue,
  memoryStore,
  operation,
  receipt,
  response,
  scope,
  session,
} from './workout-sync-fixtures';

const online: OutboxTransport = {
  async apply(_session, items) {
    return response(items.map((item) => receipt(item)));
  },
};

describe('workout outbox delivery invariants', () => {
  test('publishes saved on phone only after a successful local commit', async () => {
    const store = memoryStore();
    const item = operation('local');
    const states: SyncState[] = [];
    const commit = deferred<void>();
    const originalSave = store.save.bind(store);
    store.save = async (entry, operation) => {
      await commit.promise;
      await originalSave(entry, operation);
    };
    const saving = saveJournalEntry(
      store,
      { entityId: item.entity_id, value: item.payload },
      item,
      (state) => states.push(state),
    );
    expect(states).toEqual([{ status: 'saving' }]);
    expect(await store.pending()).toHaveLength(0);
    commit.resolve();
    await saving;
    expect(states).toEqual([
      { status: 'saving' },
      { status: 'saved_on_phone', pending: 1 },
    ]);
    expect(await store.read(item.entity_id)).toEqual(item.payload);
  });

  test('failed local commit retains error state and never promises saved data', async () => {
    const store = memoryStore();
    store.save = async () => {
      throw new Error('disk full');
    };
    const states: SyncState[] = [];
    const item = operation('failed-local');
    await expect(
      saveJournalEntry(
        store,
        { entityId: item.entity_id, value: item.payload },
        item,
        (state) => states.push(state),
      ),
    ).rejects.toThrow('disk full');
    expect(states).toEqual([
      { status: 'saving' },
      { status: 'error', message: 'local_save_failed' },
    ]);
    expect(await store.pending()).toHaveLength(0);
    expect(await store.read(item.entity_id)).toBeNull();
  });

  test('switch away and back with a new session generation discards old receipts', async () => {
    const store = memoryStore();
    const item = operation('old-generation');
    await enqueue(store, item);
    let current: SyncSession = session;
    const waiting = deferred<ApplyResponse>();
    const entered = deferred<void>();
    const runner = createOutboxRunner({
      store,
      getSession: () => current,
      transport: {
        async apply() {
          entered.resolve();
          return waiting.promise;
        },
      },
    });
    const running = runner.run();
    await entered.promise;
    current = { ...session, accountId: 'other', sessionId: 'login-other' };
    current = { ...session, sessionId: 'login-new-generation' };
    waiting.resolve(response([receipt(item)]));
    await running;
    expect(await store.pending()).toHaveLength(1);
    await createOutboxRunner({
      store,
      getSession: () => current,
      transport: online,
    }).run();
    expect(await store.pending()).toHaveLength(0);
  });

  test('retries lost receipts with stable IDs and applies each of three participants once', async () => {
    const store = memoryStore();
    const items = ['participant-a', 'participant-b', 'participant-c'].map(
      (id) => operation(`op-${id}`, id),
    );
    await enqueue(store, ...items);
    const ledger = new Map<string, ReturnType<typeof receipt>>();
    let lost = true;
    const batches: string[] = [];
    const transport: OutboxTransport = {
      async apply(_session, batch) {
        batches.push(JSON.stringify(batch));
        for (const item of batch)
          if (!ledger.has(item.operation_id))
            ledger.set(item.operation_id, receipt(item));
        if (lost) {
          lost = false;
          throw new Error('response lost');
        }
        return response(batch.map((item) => ledger.get(item.operation_id)!));
      },
    };
    const runner = createOutboxRunner({
      store,
      transport,
      getSession: () => session,
    });
    await runner.run();
    expect(
      (await store.pending()).map((item) => item.operation.operation_id),
    ).toEqual(items.map((item) => item.operation_id));
    for (const item of items)
      expect(await store.read(item.entity_id)).toEqual(item.payload);
    await runner.run();
    expect(await store.pending()).toEqual([]);
    expect(ledger.size).toBe(3);
    expect(batches).toEqual([JSON.stringify(items), JSON.stringify(items)]);
  });

  test('offline retains local values and an explicit online run confirms them', async () => {
    const store = memoryStore();
    await enqueue(store, operation('offline'));
    let connected = false;
    const transport: OutboxTransport = {
      async apply(owner, items, signal) {
        if (!connected) throw new Error('offline');
        return online.apply(owner, items, signal);
      },
    };
    const runner = createOutboxRunner({
      store,
      transport,
      getSession: () => session,
    });
    await runner.run();
    expect(await store.read('workout-a')).toEqual(operation('offline').payload);
    expect(await store.pending()).toHaveLength(1);
    connected = true;
    await runner.run();
    expect(await store.pending()).toHaveLength(0);
  });

  test('partial errors remain retryable while conflict and correction receipts are confirmed', async () => {
    const store = memoryStore();
    const items = ['applied', 'error', 'conflict', 'correction_draft'].map(
      (id) => operation(id),
    );
    await enqueue(store, ...items);
    const states: SyncState[] = [];
    const transport: OutboxTransport = {
      async apply() {
        return response(
          items.map((item) =>
            receipt(
              item,
              item.operation_id as ReturnType<typeof receipt>['status'],
            ),
          ),
        );
      },
    };
    await createOutboxRunner({
      store,
      transport,
      getSession: () => session,
      onState: (state) => states.push(state),
    }).run();
    expect(
      (await store.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['error']);
    expect(states.some((state) => state.status === 'synced')).toBe(false);
  });

  test.each([
    'foreign scope',
    'foreign operation',
    'wrong entity',
    'duplicate',
  ])('rejects %s receipts without confirming local work', async (variant) => {
    const store = memoryStore();
    const item = operation('safe');
    await enqueue(store, item);
    let result = response([receipt(item)]);
    if (variant === 'foreign scope')
      result = response([receipt(item)], { ...scope, accountId: 'other' });
    if (variant === 'foreign operation')
      result = response([receipt(operation('foreign'))]);
    if (variant === 'wrong entity')
      result = response([{ ...receipt(item), entity_id: 'other' }]);
    if (variant === 'duplicate')
      result = response([receipt(item), receipt(item)]);
    await createOutboxRunner({
      store,
      transport: {
        async apply() {
          return result;
        },
      },
      getSession: () => session,
    }).run();
    expect(await store.pending()).toHaveLength(1);
  });

  test('parallel runs across runners share one scope flight and leave later batches pending', async () => {
    const store = memoryStore();
    await enqueue(store, operation('first'), operation('second'));
    const waiting = deferred<ApplyResponse>();
    const entered = deferred<void>();
    let calls = 0;
    const transport: OutboxTransport = {
      async apply() {
        calls += 1;
        entered.resolve();
        return waiting.promise;
      },
    };
    const options = {
      store,
      transport,
      getSession: () => session,
      batchSize: 1,
    };
    const first = createOutboxRunner(options);
    const running = first.run();
    await entered.promise;
    const other = createOutboxRunner(options).run();
    const repeated = first.run();
    waiting.resolve(response([receipt(operation('first'))]));
    await Promise.all([running, other, repeated]);
    expect(calls).toBe(1);
    expect(
      (await store.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['second']);
  });

  test.each(['logout', 'account', 'workspace', 'session', 'token', 'stop'])(
    'discards a response after %s',
    async (change) => {
      const store = memoryStore();
      const item = operation('late');
      await enqueue(store, item);
      let current: SyncSession | null = session;
      const waiting = deferred<ApplyResponse>();
      const entered = deferred<void>();
      const runner = createOutboxRunner({
        store,
        getSession: () => current,
        transport: {
          async apply() {
            entered.resolve();
            return waiting.promise;
          },
        },
      });
      const running = runner.run();
      await entered.promise;
      if (change === 'logout') current = null;
      if (change === 'account') current = { ...session, accountId: 'other' };
      if (change === 'workspace')
        current = { ...session, workspaceId: 'other' };
      if (change === 'session') current = { ...session, sessionId: 'login-b' };
      if (change === 'token') current = { ...session, accessToken: 'token-b' };
      if (change === 'stop') runner.stop();
      waiting.resolve(response([receipt(item)]));
      await running;
      expect(await store.pending()).toHaveLength(1);
    },
  );

  test('timeout aborts an uncooperative transport and does not retry automatically', async () => {
    jest.useFakeTimers();
    try {
      const store = memoryStore();
      await enqueue(store, operation('timeout'));
      const entered = deferred<void>();
      const lateResponse = deferred<ApplyResponse>();
      const states: SyncState[] = [];
      let signal: AbortSignal | undefined;
      let calls = 0;
      const runner = createOutboxRunner({
        store,
        getSession: () => session,
        timeoutMs: 20,
        onState: (state) => states.push(state),
        transport: {
          async apply(_session, _items, currentSignal) {
            signal = currentSignal;
            calls += 1;
            entered.resolve();
            return lateResponse.promise;
          },
        },
      });
      const running = runner.run();
      await entered.promise;
      await jest.advanceTimersByTimeAsync(100);
      await running;
      expect(signal?.aborted).toBe(true);
      expect(calls).toBe(1);
      expect(await store.pending()).toHaveLength(1);
      lateResponse.resolve(response([receipt(operation('timeout'))]));
      await Promise.resolve();
      expect(await store.pending()).toHaveLength(1);
      expect(states).toEqual([
        { status: 'saved_on_phone', pending: 1 },
        { status: 'error', message: 'sync_failed' },
      ]);
      await createOutboxRunner({
        store,
        transport: online,
        getSession: () => session,
      }).run();
      expect(await store.pending()).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });
  test('confirmed conflict and draft remain visible on later runs without resending', async () => {
    const store = memoryStore();
    const items = [
      operation('conflict', 'participant-a'),
      operation('draft', 'participant-b'),
    ];
    await enqueue(store, ...items);
    const issues = [
      receipt(items[0]!, 'conflict'),
      receipt(items[1]!, 'correction_draft'),
    ];
    const confirmed: typeof issues = [];
    const acknowledge = store.acknowledge.bind(store);
    store.acknowledge = async (results) => {
      await acknowledge(results);
      confirmed.push(...results);
    };
    store.confirmedIssues = async () => confirmed;
    const apply = jest.fn(async () => response(issues));
    const states: SyncState[] = [];
    const runner = createOutboxRunner({
      store,
      transport: { apply },
      getSession: () => session,
      onState: (state) => states.push(state),
    });
    await runner.run();
    await runner.run();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(await store.pending()).toEqual([]);
    expect(states.slice(-2)).toEqual([
      { status: 'conflict', results: issues },
      { status: 'conflict', results: issues },
    ]);
    for (const item of items)
      expect(await store.read(item.entity_id)).toEqual(item.payload);
  });

  test.each(['logout', 'same-account login'])(
    'does not publish stale issues after %s during their read',
    async (change) => {
      const store = memoryStore();
      const item = operation('delayed-issues');
      await enqueue(store, item);
      const waiting = deferred<ReturnType<typeof receipt>[]>();
      const entered = deferred<void>();
      let current: SyncSession | null = session;
      store.confirmedIssues = async () => {
        entered.resolve();
        return waiting.promise;
      };
      const states: SyncState[] = [];
      const running = createOutboxRunner({
        store,
        transport: online,
        getSession: () => current,
        onState: (state) => states.push(state),
      }).run();
      await entered.promise;
      current =
        change === 'logout' ? null : { ...session, sessionId: 'new-login' };
      waiting.resolve([receipt(item, 'conflict')]);
      await running;
      expect(states).toEqual([{ status: 'saved_on_phone', pending: 1 }]);
    },
  );

  test('mutating the current session object cannot authenticate an old response', async () => {
    const store = memoryStore();
    const item = operation('mutable-session');
    await enqueue(store, item);
    const current = { ...session };
    const waiting = deferred<ApplyResponse>();
    const entered = deferred<void>();
    const states: SyncState[] = [];
    const running = createOutboxRunner({
      store,
      getSession: () => current,
      onState: (state) => states.push(state),
      transport: {
        async apply(snapshot) {
          expect(snapshot).not.toBe(current);
          entered.resolve();
          return waiting.promise;
        },
      },
    }).run();
    await entered.promise;
    current.sessionId = 'replacement-login';
    waiting.resolve(response([receipt(item)]));
    await running;
    expect(await store.pending()).toHaveLength(1);
    expect(states).toEqual([{ status: 'saved_on_phone', pending: 1 }]);
  });
});
