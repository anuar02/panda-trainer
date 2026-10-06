import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingWorkspaceBookingStatus,
  loadPendingWorkspaceBookingStatus,
  savePendingWorkspaceBookingStatus,
  type PendingWorkspaceBookingStatus,
} from '@/features/workspace-scheduling/status-pending';

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
const bookingId = '71000000-0000-4000-8000-000000000001';
const pending = (): PendingWorkspaceBookingStatus => ({
  requestId,
  bookingId,
  action: 'confirm',
  expectedRevision: 2,
});
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('restores pending payload and isolates account and workspace', async () => {
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
  expect(
    await loadPendingWorkspaceBookingStatus(otherId, workspaceId),
  ).toBeNull();
  expect(await loadPendingWorkspaceBookingStatus(userId, otherId)).toBeNull();
});
test('snapshots before asynchronous storage access', async () => {
  const value = pending();
  const save = savePendingWorkspaceBookingStatus(userId, workspaceId, value);
  value.action = 'cancel';
  value.requestId = otherId;
  await save;
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('serializes competing saves and blocks replacement of an uncertain command', async () => {
  const results = await Promise.allSettled([
    savePendingWorkspaceBookingStatus(userId, workspaceId, pending()),
    savePendingWorkspaceBookingStatus(userId, workspaceId, {
      ...pending(),
      requestId: otherId,
    }),
  ]);
  expect(results[0].status).toBe('fulfilled');
  expect(results[1]).toMatchObject({
    status: 'rejected',
    reason: { code: 'unresolved' },
  });
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('accepts an identical repeat without writing storage again', async () => {
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
test('a changed action cannot overwrite an unresolved command', async () => {
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  await expect(
    savePendingWorkspaceBookingStatus(userId, workspaceId, {
      ...pending(),
      action: 'cancel',
    }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(
    await clearPendingWorkspaceBookingStatus(userId, workspaceId, requestId),
  ).toBe(true);
  await savePendingWorkspaceBookingStatus(userId, workspaceId, {
    ...pending(),
    requestId: otherId,
    action: 'cancel',
  });
  expect(
    await loadPendingWorkspaceBookingStatus(userId, workspaceId),
  ).toMatchObject({
    requestId: otherId,
    action: 'cancel',
  });
});
test('a stale completion cannot remove another command', async () => {
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  expect(
    await clearPendingWorkspaceBookingStatus(userId, workspaceId, otherId),
  ).toBe(false);
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
  expect(
    await clearPendingWorkspaceBookingStatus(
      userId,
      workspaceId,
      requestId.toUpperCase(),
    ),
  ).toBe(true);
  expect(
    await clearPendingWorkspaceBookingStatus(userId, workspaceId, requestId),
  ).toBe(false);
});
test.each([
  '{',
  JSON.stringify({ ...pending(), requestId: 'invalid' }),
  JSON.stringify({ ...pending(), expectedRevision: 0 }),
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
      loadPendingWorkspaceBookingStatus(userId, workspaceId),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      savePendingWorkspaceBookingStatus(userId, workspaceId, pending()),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      clearPendingWorkspaceBookingStatus(userId, workspaceId, requestId),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  },
);
test('storage failure is reported and does not wedge later operations', async () => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error('disk full'));
  await expect(
    savePendingWorkspaceBookingStatus(userId, workspaceId, pending()),
  ).rejects.toMatchObject({ code: 'storage' });
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
});
test('canonicalizes equivalent UUID case', async () => {
  await savePendingWorkspaceBookingStatus(
    userId.toUpperCase(),
    workspaceId.toUpperCase(),
    { ...pending(), requestId: requestId.toUpperCase() },
  );
  await savePendingWorkspaceBookingStatus(userId, workspaceId, pending());
  expect(await loadPendingWorkspaceBookingStatus(userId, workspaceId)).toEqual(
    pending(),
  );
});

test.each([
  { expectedRevision: 0 },
  { expectedRevision: 1.5 },
  { expectedRevision: 2147483647 },
  { expectedRevision: '2' },
  { action: 'reschedule' },
  { bookingId: 'invalid' },
  { expectedUserId: userId },
])('rejects an invalid stored command: %s', async (fields) => {
  jest
    .mocked(AsyncStorage.getItem)
    .mockResolvedValueOnce(JSON.stringify({ ...pending(), ...fields }));
  await expect(
    loadPendingWorkspaceBookingStatus(userId, workspaceId),
  ).rejects.toMatchObject({ code: 'invalid' });
});

test('invalid account scope never reaches storage', () => {
  expect(() =>
    loadPendingWorkspaceBookingStatus('invalid', workspaceId),
  ).toThrow();
  expect(() =>
    savePendingWorkspaceBookingStatus(userId, 'invalid', pending()),
  ).toThrow();
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
