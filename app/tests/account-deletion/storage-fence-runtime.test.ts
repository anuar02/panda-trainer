import type AsyncStorage from '@react-native-async-storage/async-storage';

let mockRestored: { accountId: string } | null = null;
let mockCorrupt = false;
jest.mock('@/features/account-deletion/pending', () => ({
  readConfirmedDeletion: jest.fn(async () => {
    if (mockCorrupt) throw new Error('recovery_storage');
    return mockRestored;
  }),
}));
jest.mock('@/features/account-export/service', () => ({
  boundedExportStep: (operation: Promise<void>) => operation,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => '{}'),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    mergeItem: jest.fn(async () => {}),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
    multiMerge: jest.fn(async () => {}),
  },
}));
const accountId = '10000000-0000-4000-8000-000000000001';
const foreign = '10000000-0000-4000-8000-000000000002';
const key = `panda-trainer-pending-billing-v1:${accountId}:workspace`;
const foreignKey = `panda-trainer-pending-billing-v1:${foreign}:workspace`;
beforeEach(() => {
  jest.resetModules();
  mockRestored = null;
  mockCorrupt = false;
});
function fixture() {
  const storage = (
    jest.requireMock('@react-native-async-storage/async-storage') as {
      default: typeof AsyncStorage;
    }
  ).default;
  const original = {
    setItem: jest.mocked(storage.setItem),
    removeItem: jest.mocked(storage.removeItem),
    mergeItem: jest.mocked(storage.mergeItem),
    multiSet: jest.mocked(storage.multiSet),
    multiRemove: jest.mocked(storage.multiRemove),
    multiMerge: jest.mocked(storage.multiMerge),
  };
  const fence = jest.requireActual<
    typeof import('@/features/account-deletion/storage-fence')
  >('@/features/account-deletion/storage-fence');
  return {
    storage,
    original,
    fence: fence.fenceDeletionPendingWrites,
    removeMarker: fence.removeDeletedAccountMarker,
  };
}

test('deletion fence blocks all own scoped storage mutations while foreign writes continue', async () => {
  const { storage, original, fence } = fixture();
  await fence(accountId);
  const operations = [
    () => storage.setItem(key, '{}'),
    () => storage.removeItem(key),
    () => storage.mergeItem(key, '{}'),
    () => storage.multiSet([[key, '{}']]),
    () => storage.multiRemove([key]),
    () => storage.multiMerge([[key, '{}']]),
  ];
  for (const operation of operations)
    await expect(operation()).rejects.toThrow('account_deletion_pending');
  expect(
    Object.values(original).every((method) => method.mock.calls.length === 0),
  ).toBe(true);
  await storage.setItem(foreignKey, 'foreign draft');
  expect(original.setItem).toHaveBeenCalledWith(foreignKey, 'foreign draft');
});

test('mixed own and foreign batch fails before changing either account', async () => {
  const { storage, original, fence } = fixture();
  await fence(accountId);
  await expect(
    storage.multiSet([
      [foreignKey, '{}'],
      [key, '{}'],
    ]),
  ).rejects.toThrow('account_deletion_pending');
  expect(original.multiSet).not.toHaveBeenCalled();
});

test('fence drains an already started own write and blocks any new write immediately', async () => {
  const { storage, original, fence } = fixture();
  let finish!: () => void;
  original.setItem.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const writing = storage.setItem(key, 'inflight');
  await Promise.resolve();
  await Promise.resolve();
  expect(original.setItem).toHaveBeenCalledTimes(1);
  let drained = false;
  const draining = fence(accountId).then(() => {
    drained = true;
  });
  await Promise.resolve();
  await expect(storage.setItem(key, 'late')).rejects.toThrow(
    'account_deletion_pending',
  );
  expect(drained).toBe(false);
  finish();
  await writing;
  await draining;
  expect(drained).toBe(true);
  expect(original.setItem).toHaveBeenCalledTimes(1);
});

test('inflight storage failure makes drain fail and retains block for own account', async () => {
  const { storage, original, fence } = fixture();
  let fail!: (error: Error) => void;
  original.setItem.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const writing = storage.setItem(key, '{}');
  const observedWrite = expect(writing).rejects.toThrow('storage failed');
  await Promise.resolve();
  await Promise.resolve();
  const draining = fence(accountId);
  const observedDrain = expect(draining).rejects.toThrow('storage failed');
  await Promise.resolve();
  fail(new Error('storage failed'));
  await observedWrite;
  await observedDrain;
  await expect(storage.removeItem(key)).rejects.toThrow(
    'account_deletion_pending',
  );
  await storage.removeItem(foreignKey);
});

test('restart reads durable confirmed deletion before accepting any own write', async () => {
  mockRestored = { accountId };
  const { storage, original } = fixture();
  await expect(storage.setItem(key, 'restart')).rejects.toThrow(
    'account_deletion_pending',
  );
  await storage.setItem(foreignKey, 'foreign restart');
  expect(original.setItem).toHaveBeenCalledTimes(1);
});

test('unreadable or malformed recovery storage fails closed before storage mutation', async () => {
  mockCorrupt = true;
  const { storage, original, fence } = fixture();
  await expect(storage.setItem(key, 'must survive')).rejects.toThrow(
    'recovery_storage',
  );
  await expect(fence(accountId)).rejects.toThrow('recovery_storage');
  expect(original.setItem).not.toHaveBeenCalled();
});

test('deleted cache marker cleanup bypasses write fence only for exact own raw value', async () => {
  const { storage, original, fence, removeMarker } = fixture();
  await fence(accountId);
  await removeMarker(accountId, key, '{}', async () => {});
  expect(original.removeItem).toHaveBeenCalledWith(key);
  await expect(storage.removeItem(key)).rejects.toThrow(
    'account_deletion_pending',
  );
});

test('marker cleanup cannot remove foreign key or marker before deletion fence', async () => {
  const { original, fence, removeMarker } = fixture();
  await expect(
    removeMarker(accountId, key, '{}', async () => {}),
  ).rejects.toThrow('cleanup_scope');
  await fence(accountId);
  await expect(
    removeMarker(accountId, foreignKey, '{}', async () => {}),
  ).rejects.toThrow('cleanup_scope');
  expect(original.removeItem).not.toHaveBeenCalled();
});

test('late cache marker change or relogin never bypasses own write fence cleanup', async () => {
  const { original, fence, removeMarker } = fixture();
  await fence(accountId);
  await expect(
    removeMarker(accountId, key, 'previous-value', async () => {}),
  ).rejects.toThrow('local_changed');
  await expect(
    removeMarker(accountId, key, '{}', async () => {
      throw new Error('new login');
    }),
  ).rejects.toThrow('new login');
  expect(original.removeItem).not.toHaveBeenCalled();
});
