import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingWorkspaceBooking,
  loadPendingWorkspaceBooking,
  savePendingWorkspaceBooking,
  type PendingWorkspaceBooking,
} from '@/features/workspace-scheduling/pending';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) =>
        Promise.resolve(values.get(key) ?? null),
      ),
      setItem: jest.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        values.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        values.clear();
        return Promise.resolve();
      }),
    },
  };
});
const userId = '51000000-0000-4000-8000-000000000001';
const otherId = '51000000-0000-4000-8000-000000000002';
const workspaceId = '61000000-0000-4000-8000-000000000001';
const requestId = 'a1000000-0000-4000-8000-000000000001';
const clientId = '71000000-0000-4000-8000-000000000001';
const pending = (): PendingWorkspaceBooking => ({
  requestId,
  clientRecordIds: [clientId],
  collisionAcknowledged: false,
  startsAtUtc: '2026-10-05T10:00:00.000Z',
  endsAtUtc: '2026-10-05T11:00:00.000Z',
});
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('restores pending payload and isolates account and workspace', async () => {
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
  expect(await loadPendingWorkspaceBooking(otherId, workspaceId)).toBeNull();
  expect(await loadPendingWorkspaceBooking(userId, otherId)).toBeNull();
});
test('snapshots before asynchronous storage access', async () => {
  const value = pending();
  const save = savePendingWorkspaceBooking(userId, workspaceId, value);
  value.clientRecordIds = [];
  value.requestId = otherId;
  await save;
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('serializes competing saves and blocks replacement of an uncertain command', async () => {
  const results = await Promise.allSettled([
    savePendingWorkspaceBooking(userId, workspaceId, pending()),
    savePendingWorkspaceBooking(userId, workspaceId, {
      ...pending(),
      requestId: otherId,
    }),
  ]);
  expect(results[0].status).toBe('fulfilled');
  expect(results[1]).toMatchObject({
    status: 'rejected',
    reason: { code: 'unresolved' },
  });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('accepts an identical repeat without writing storage again', async () => {
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
test('acknowledgement cannot overwrite an unresolved unacknowledged command', async () => {
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  await expect(
    savePendingWorkspaceBooking(userId, workspaceId, {
      ...pending(),
      collisionAcknowledged: true,
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(
    await clearPendingWorkspaceBooking(userId, workspaceId, requestId),
  ).toBe(true);
  await savePendingWorkspaceBooking(userId, workspaceId, {
    ...pending(),
    requestId: otherId,
    collisionAcknowledged: true,
  });
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toMatchObject({
    requestId: otherId,
    collisionAcknowledged: true,
  });
});
test('a stale completion cannot remove another command', async () => {
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  expect(await clearPendingWorkspaceBooking(userId, workspaceId, otherId)).toBe(
    false,
  );
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
  expect(
    await clearPendingWorkspaceBooking(
      userId,
      workspaceId,
      requestId.toUpperCase(),
    ),
  ).toBe(true);
  expect(
    await clearPendingWorkspaceBooking(userId, workspaceId, requestId),
  ).toBe(false);
});
test.each([
  '{',
  JSON.stringify({ ...pending(), requestId: 'invalid' }),
  JSON.stringify({ ...pending(), clientRecordIds: [clientId, clientId] }),
  JSON.stringify({ ...pending(), unexpected: true }),
])(
  'corrupt storage blocks reads, replacement and deletion: %s',
  async (raw) => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(raw);
    await expect(
      loadPendingWorkspaceBooking(userId, workspaceId),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      savePendingWorkspaceBooking(userId, workspaceId, pending()),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      clearPendingWorkspaceBooking(userId, workspaceId, requestId),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  },
);
test('storage failure is reported and does not wedge later operations', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('disk full'));
  await expect(
    savePendingWorkspaceBooking(userId, workspaceId, pending()),
  ).rejects.toMatchObject({ code: 'storage' });
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('canonicalizes equivalent UUID case', async () => {
  await savePendingWorkspaceBooking(
    userId.toUpperCase(),
    workspaceId.toUpperCase(),
    { ...pending(), requestId: requestId.toUpperCase() },
  );
  await savePendingWorkspaceBooking(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBooking(userId, workspaceId)).toEqual(
    pending(),
  );
});
