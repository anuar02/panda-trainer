import { createOutboxRunner } from '../src/features/workout-sync/runner';
import { saveJournalEntry } from '../src/features/workout-sync/save';
import type {
  ApplyResponse,
  SyncSession,
  SyncState,
} from '../src/domain/workout-sync/types';
import {
  deferred,
  memoryStore,
  operation,
  receipt,
  response,
  session,
} from './workout-sync-fixtures';

describe('SOM-31 independent delivery regressions with mocked storage', () => {
  it('isolates three participant projections across success, conflict and rejection', async () => {
    const store = memoryStore();
    const items = [1, 2, 3].map((id) =>
      operation(`operation-${id}`, `workout-${id}`),
    );
    for (const [index, item] of items.entries()) {
      item.payload = { reps: index + 1, weight_grams: index * 1000 };
      await saveJournalEntry(
        store,
        { entityId: item.entity_id, value: item.payload },
        item,
      );
    }
    const states: SyncState[] = [];
    await createOutboxRunner({
      store,
      getSession: () => session,
      transport: {
        async apply() {
          return response(
            items.map((item, index) =>
              receipt(
                item,
                index === 0 ? 'applied' : index === 1 ? 'conflict' : 'error',
              ),
            ),
          );
        },
      },
      onState: (state) => states.push(state),
    }).run();
    for (const item of items)
      expect(await store.read(item.entity_id)).toEqual(item.payload);
    expect(
      (await store.pending()).map((item) => item.operation.entity_id),
    ).toEqual(['workout-3']);
    expect(states.at(-1)).toMatchObject({
      status: 'conflict',
      results: [{ entity_id: 'workout-2' }],
    });
  });

  it.each(['account', 'workspace', 'token', 'session'] as const)(
    'retains three edits and a removal tombstone when %s changes during delivery',
    async (change) => {
      const store = memoryStore();
      const items = [1, 2, 3].map((id) =>
        operation(`fenced-operation-${id}`, `fenced-workout-${id}`),
      );
      const tombstone = { deleted: true, set_id: 'removed-set' };
      for (const [index, item] of items.entries())
        await saveJournalEntry(
          store,
          {
            entityId: item.entity_id,
            value: index === 2 ? tombstone : item.payload,
          },
          item,
        );
      let current: SyncSession = session;
      const entered = deferred<void>();
      const delayed = deferred<ApplyResponse>();
      const states: SyncState[] = [];
      const runner = createOutboxRunner({
        store,
        getSession: () => current,
        transport: {
          async apply() {
            entered.resolve();
            return delayed.promise;
          },
        },
        onState: (state) => states.push(state),
      });
      const running = runner.run();
      await entered.promise;
      current = {
        ...session,
        ...(change === 'account' ? { accountId: 'other-account' } : {}),
        ...(change === 'workspace' ? { workspaceId: 'other-workspace' } : {}),
        ...(change === 'token' ? { accessToken: 'new-token' } : {}),
        ...(change === 'session' ? { sessionId: 'new-login' } : {}),
      };
      delayed.resolve(response(items.map((item) => receipt(item))));
      await running;
      expect(await store.pending()).toHaveLength(3);
      expect(await store.read(items[2]!.entity_id)).toEqual(tombstone);
      expect(states).toEqual([{ status: 'saved_on_phone', pending: 3 }]);
    },
  );
});
