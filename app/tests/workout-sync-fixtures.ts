import type {
  ApplyResponse,
  JournalOperation,
  JsonValue,
  LocalEntry,
  OperationResult,
  OutboxStore,
  PendingOperation,
  SyncScope,
  SyncSession,
} from '../src/domain/workout-sync/types';

export const scope: SyncScope = {
  accountId: 'trainer-a',
  workspaceId: 'studio-a',
};
export const session: SyncSession = {
  ...scope,
  sessionId: 'login-a',
  accessToken: 'token-a',
};
export const operation = (
  id: string,
  entity = 'workout-a',
): JournalOperation => ({
  operation_id: id,
  kind: 'upsert_set',
  entity_id: entity,
  base_revision: 0,
  device_id: 'phone-a',
  payload: { participant_id: entity, weight: 40, reps: 8 },
  created_at: '2026-10-03T09:00:00Z',
});
export const receipt = (
  item: JournalOperation,
  status: OperationResult['status'] = 'applied',
): OperationResult => ({
  operation_id: item.operation_id,
  entity_id: item.entity_id,
  status,
  revision: status === 'error' ? null : 1,
  ...(status === 'error' ? { error_code: 'temporary' } : {}),
  ...(status === 'conflict' ? { conflict_id: 'conflict-a' } : {}),
  ...(status === 'correction_draft' ? { draft_id: 'draft-a' } : {}),
});
export const response = (
  results: OperationResult[],
  owner = scope,
): ApplyResponse => ({
  account_id: owner.accountId,
  workspace_id: owner.workspaceId,
  results,
});
export function memoryStore(owner = scope): OutboxStore {
  const entries = new Map<string, JsonValue>();
  const queue: PendingOperation[] = [];
  return {
    scope: owner,
    async save(entry: LocalEntry, item: JournalOperation) {
      entries.set(entry.entityId, entry.value);
      if (
        !queue.some(
          (pending) => pending.operation.operation_id === item.operation_id,
        )
      ) {
        queue.push({
          operation: item,
          sequence: queue.length + 1,
          result: null,
        });
      }
    },
    async pending(limit = 100) {
      return queue
        .filter(
          (item) => item.result === null || item.result.status === 'error',
        )
        .slice(0, limit);
    },
    async acknowledge(results) {
      for (const result of results) {
        const item = queue.find(
          (pending) => pending.operation.operation_id === result.operation_id,
        );
        if (item) item.result = result;
      }
    },
    async read(entityId) {
      return entries.get(entityId) ?? null;
    },
    async close() {},
  };
}
export async function enqueue(
  store: OutboxStore,
  ...items: JournalOperation[]
) {
  for (const item of items)
    await store.save({ entityId: item.entity_id, value: item.payload }, item);
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
