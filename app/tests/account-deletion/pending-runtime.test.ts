import {
  clearConfirmedDeletion,
  readConfirmedDeletion,
  saveConfirmedDeletion,
  type ConfirmedDeletion,
  type DeletionSecretStorage,
} from '@/features/account-deletion/pending';
const intent: ConfirmedDeletion = {
  accountId: '31000000-0000-4000-8000-000000000001',
  requestId: '31000000-0000-4000-8000-000000000002',
  snapshotId: '31000000-0000-4000-8000-000000000003',
  fingerprint: 'a'.repeat(64),
  exportSha256: 'b'.repeat(64),
  recoveryToken: 'c'.repeat(64),
  exportBytes: 123,
  confirmed: true,
};
function storage() {
  const values = new Map<string, string>();
  const adapter: DeletionSecretStorage = {
    getItem: jest.fn(async (key) => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      values.delete(key);
    }),
  };
  return { values, adapter };
}
test('confirmed intent round trips exact request identity without JWT or local raw content', async () => {
  const { values, adapter } = storage();
  await saveConfirmedDeletion(intent, adapter);
  expect(await readConfirmedDeletion(adapter)).toEqual(intent);
  expect([...values.values()][0]).not.toMatch(
    /access_token|refresh_token|Bearer|records|operation_json/,
  );
  await clearConfirmedDeletion(intent, adapter);
  expect(await readConfirmedDeletion(adapter)).toBeNull();
});
test('pending request cannot be replaced by another account or request', async () => {
  const { adapter } = storage();
  await saveConfirmedDeletion(intent, adapter);
  await expect(
    saveConfirmedDeletion(
      { ...intent, requestId: '31000000-0000-4000-8000-000000000004' },
      adapter,
    ),
  ).rejects.toThrow('recovery_already_pending');
  expect(await readConfirmedDeletion(adapter)).toEqual(intent);
});
test('write committed then transport error retains exact recoverable identity', async () => {
  const { adapter } = storage();
  const original = adapter.setItem;
  adapter.setItem = async (key, value) => {
    await original(key, value);
    throw new Error('lost_storage_response');
  };
  await expect(saveConfirmedDeletion(intent, adapter)).rejects.toThrow();
  expect(await readConfirmedDeletion(adapter)).toEqual(intent);
  adapter.setItem = original;
  await saveConfirmedDeletion(intent, adapter);
});
test('write silently failed cannot create durable proof', async () => {
  const { adapter } = storage();
  adapter.setItem = async () => {};
  await expect(saveConfirmedDeletion(intent, adapter)).rejects.toThrow(
    'recovery_storage',
  );
});
test('malformed or credential-bearing recovery fails closed and is not cleared', async () => {
  const { values, adapter } = storage();
  await saveConfirmedDeletion(intent, adapter);
  const key = [...values.keys()][0]!;
  values.set(key, JSON.stringify({ ...intent, access_token: 'synthetic' }));
  await expect(readConfirmedDeletion(adapter)).rejects.toThrow(
    'recovery_storage',
  );
  await expect(clearConfirmedDeletion(intent, adapter)).rejects.toThrow(
    'recovery_changed',
  );
  expect(values.size).toBe(1);
});
test('clear requires the original bytes so newer recovery cannot be erased', async () => {
  const { values, adapter } = storage();
  await saveConfirmedDeletion(intent, adapter);
  const key = [...values.keys()][0]!;
  values.set(key, JSON.stringify({ ...intent, fingerprint: 'd'.repeat(64) }));
  await expect(clearConfirmedDeletion(intent, adapter)).rejects.toThrow(
    'recovery_changed',
  );
  expect(values.size).toBe(1);
});
