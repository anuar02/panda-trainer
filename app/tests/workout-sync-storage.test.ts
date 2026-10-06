import type { JournalOperation } from '../src/domain/workout-sync/types';
import { openOutboxStore } from '../src/features/workout-sync/storage';
import { TransactionalFixture } from './workout-sync-sqlite-fixture';
const scope = { accountId: 'trainer', workspaceId: 'workspace' };
const operation = (id = 'op'): JournalOperation => ({
  operation_id: id,
  entity_id: 'workout',
  device_id: 'phone',
  base_revision: 0,
  kind: 'set_note',
  payload: { note: id },
  created_at: '2026-10-03T00:00:00Z',
});
const entry = { entityId: 'workout', value: 1 };
describe('SQLite outbox with transactional memory fixture', () => {
  test('atomic rollback and retry', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    fixture.failInsert = true;
    await expect(store.save(entry, operation())).rejects.toThrow(
      'insert failure',
    );
    expect(await store.read('workout')).toBeNull();
    expect(await store.pending()).toEqual([]);
    fixture.failInsert = false;
    await store.save(entry, operation());
    expect(await store.read('workout')).toBe(1);
  });
  test('concurrent writes, close and reopen preserve order', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    const first = store.save(entry, operation('first'));
    const second = store.save({ ...entry, value: 2 }, operation('second'));
    await Promise.all([first, second, store.close()]);
    await expect(store.pending()).rejects.toThrow('closed');
    const reopened = await openOutboxStore(scope, fixture.connect());
    expect(
      (await reopened.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['first', 'second']);
    expect(await reopened.read('workout')).toBe(2);
  });
  test('immutable duplicates and entity validation', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    await store.save(entry, operation());
    await store.save({ ...entry, value: 2 }, operation());
    expect(await store.read('workout')).toBe(1);
    await expect(
      store.save(entry, { ...operation(), payload: { note: 'changed' } }),
    ).rejects.toThrow('different payload');
    expect(() =>
      store.save({ ...entry, entityId: 'other' }, operation()),
    ).toThrow('Invalid');
    expect(await store.pending()).toHaveLength(1);
  });
  test('account/workspace isolation and logout retain data', async () => {
    const fixture = new TransactionalFixture();
    const original = await openOutboxStore(scope, fixture.connect());
    await original.save(entry, operation());
    for (const otherScope of [
      { ...scope, accountId: 'other' },
      { ...scope, workspaceId: 'other' },
    ]) {
      const other = await openOutboxStore(otherScope, fixture.connect());
      expect(await other.read('workout')).toBeNull();
      expect(await other.pending()).toEqual([]);
      await expect(
        other.acknowledge([
          {
            operation_id: 'op',
            entity_id: 'workout',
            status: 'applied',
            revision: 1,
          },
        ]),
      ).rejects.toThrow('Unknown');
      await other.save({ ...entry, value: 2 }, operation());
      await other.close();
    }
    await original.close();
    expect(
      await (await openOutboxStore(scope, fixture.connect())).read('workout'),
    ).toBe(1);
  });
  test('errors retry, retained conflict/draft reopen and explicit conflict resolution', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    for (const id of ['error', 'conflict', 'draft'])
      await store.save(entry, operation(id));
    await store.acknowledge([
      {
        operation_id: 'error',
        entity_id: 'workout',
        status: 'error',
        revision: null,
      },
      {
        operation_id: 'conflict',
        entity_id: 'workout',
        status: 'conflict',
        revision: 1,
        conflict_id: 'c',
      },
      {
        operation_id: 'draft',
        entity_id: 'workout',
        status: 'correction_draft',
        revision: 1,
        draft_id: 'd',
      },
    ]);
    expect(
      (await store.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['error']);
    await store.close();
    const reopened = await openOutboxStore(scope, fixture.connect());
    expect(await reopened.confirmedIssues()).toHaveLength(2);
    await reopened.save(entry, {
      ...operation('resolve'),
      kind: 'resolve_conflict',
      payload: { conflict_id: 'c' },
    });
    await reopened.acknowledge([
      {
        operation_id: 'resolve',
        entity_id: 'workout',
        status: 'applied',
        revision: 2,
      },
    ]);
    expect(
      (await reopened.confirmedIssues()).map((result) => result.status),
    ).toEqual(['correction_draft']);
    expect(fixture.rows).toHaveLength(4);
  });
  test('receipt batches rollback on invalid entity', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    await store.save(entry, operation());
    await expect(
      store.acknowledge([
        {
          operation_id: 'op',
          entity_id: 'workout',
          status: 'applied',
          revision: 1,
        },
        {
          operation_id: 'op',
          entity_id: 'other',
          status: 'applied',
          revision: 1,
        },
      ]),
    ).rejects.toThrow('Invalid');
    expect(await store.pending()).toHaveLength(1);
  });
  test('commit failure rejects saves and acknowledgements without persisted success', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    await store.save(entry, operation('first'));
    fixture.failCommit = true;
    await expect(
      store.save({ ...entry, value: 2 }, operation('second')),
    ).rejects.toThrow('commit failure');
    expect(await store.read('workout')).toBe(1);
    await expect(
      store.acknowledge([
        {
          operation_id: 'first',
          entity_id: 'workout',
          status: 'applied',
          revision: 1,
        },
      ]),
    ).rejects.toThrow('commit failure');
    await store.close();
    const reopened = await openOutboxStore(scope, fixture.connect());
    expect(
      (await reopened.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['first']);
    expect((await reopened.pending())[0]?.result).toBeNull();
  });
  test('queued save snapshots identity before callers mutate the operation', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    const mutableOperation = operation();
    const mutableEntry = { ...entry };
    const saving = store.save(mutableEntry, mutableOperation);
    mutableOperation.operation_id = 'changed';
    mutableOperation.entity_id = 'changed';
    mutableEntry.entityId = 'changed';
    await saving;
    expect(await store.read('workout')).toBe(1);
    expect(await store.read('changed')).toBeNull();
    expect((await store.pending())[0]?.operation).toEqual(operation());
    await store.acknowledge([
      {
        operation_id: 'op',
        entity_id: 'workout',
        status: 'applied',
        revision: 1,
      },
    ]);
    expect(await store.pending()).toEqual([]);
  });
  test('exact duplicate receipts are idempotent and divergent batches roll back', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    for (const id of ['first', 'second'])
      await store.save(entry, operation(id));
    const receipt = {
      operation_id: 'first',
      entity_id: 'workout',
      status: 'applied' as const,
      revision: 1,
    };
    await store.acknowledge([receipt, { ...receipt }]);
    await expect(
      store.acknowledge([
        { ...receipt, operation_id: 'second' },
        { ...receipt, revision: 2 },
      ]),
    ).rejects.toThrow('different result');
    expect(
      (await store.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['second']);
    await store.close();
    const reopened = await openOutboxStore(scope, fixture.connect());
    await reopened.acknowledge([{ ...receipt }]);
    expect(
      (await reopened.pending()).map((item) => item.operation.operation_id),
    ).toEqual(['second']);
  });
  test('error receipts remain stable, pending and isolated after logout', async () => {
    const fixture = new TransactionalFixture();
    const store = await openOutboxStore(scope, fixture.connect());
    await store.save(entry, operation());
    const receipt = {
      operation_id: 'op',
      entity_id: 'workout',
      status: 'error' as const,
      revision: null,
      error_code: 'invalid_payload',
    };
    await store.acknowledge([receipt]);
    await store.close();
    const other = await openOutboxStore(
      { ...scope, accountId: 'other' },
      fixture.connect(),
    );
    expect(await other.pending()).toEqual([]);
    expect(await other.confirmedIssues()).toEqual([]);
    await other.close();
    const reopened = await openOutboxStore(scope, fixture.connect());
    await reopened.acknowledge([{ ...receipt }]);
    await expect(
      reopened.acknowledge([{ ...receipt, status: 'applied', revision: 1 }]),
    ).rejects.toThrow('different result');
    expect((await reopened.pending())[0]?.result).toEqual(receipt);
  });
});
