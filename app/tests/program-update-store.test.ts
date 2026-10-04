import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingUpdateCommand,
  loadPendingUpdateCommand,
  savePendingUpdateCommand,
} from '@/features/program-update/pending';
import { validateCommand } from '@/domain/program-update';

jest.mock('@react-native-async-storage/async-storage', () => {
  const rows = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => rows.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      rows.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      rows.delete(key);
    }),
    clear: jest.fn(async () => {
      rows.clear();
    }),
  };
});
const ids = [
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000005',
  '51000000-0000-4000-8000-000000000006',
] as const;
const scope = [ids[0], ids[1], ids[2], ids[3]] as const;
const command = {
  programId: ids[3],
  requestId: ids[4],
  expectedWorkoutRevision: 2,
  expectedProgramRevision: 1,
  selectedKeys: ['values:' + ids[3]],
};
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
test('lost result survives reopen with identical request and revisions', async () => {
  await savePendingUpdateCommand(...scope, command);
  await savePendingUpdateCommand(...scope, command);
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
test('second confirmation cannot overwrite unresolved command', async () => {
  await savePendingUpdateCommand(...scope, command);
  await expect(
    savePendingUpdateCommand(...scope, { ...command, requestId: ids[5] }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
test('conditional cleanup cannot remove another request', async () => {
  await savePendingUpdateCommand(...scope, command);
  expect(await clearPendingUpdateCommand(...scope, ids[5])).toBe(false);
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
  expect(await clearPendingUpdateCommand(...scope, command.requestId)).toBe(
    true,
  );
  expect(await loadPendingUpdateCommand(...scope)).toBeNull();
});
test('participant and workout scopes isolate saved confirmations', async () => {
  await savePendingUpdateCommand(...scope, command);
  expect(
    await loadPendingUpdateCommand(ids[5], scope[1], scope[2], scope[3]),
  ).toBeNull();
  expect(
    await loadPendingUpdateCommand(scope[0], scope[1], ids[5], scope[3]),
  ).toBeNull();
});
test('expired lifecycle does not write or clear pending command', async () => {
  await savePendingUpdateCommand(...scope, command, () => false);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await savePendingUpdateCommand(...scope, command);
  expect(
    await clearPendingUpdateCommand(...scope, command.requestId, () => false),
  ).toBe(false);
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
test('cleanup storage failure retains pending request for retry', async () => {
  await savePendingUpdateCommand(...scope, command);
  jest
    .mocked(AsyncStorage.removeItem)
    .mockRejectedValueOnce(new Error('disk failed'));
  await expect(
    clearPendingUpdateCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
test.each([
  { ...command, expectedWorkoutRevision: 0 },
  { ...command, expectedProgramRevision: -1 },
  { ...command, selectedKeys: undefined },
  { ...command, expectedExerciseRevision: 0 },
  { ...command, expectedProgramRevision: 1.5 },
  { ...command, unknown: true },
])('malformed persisted confirmation rejected: %p', (value) => {
  expect(() => validateCommand(value)).toThrow('update_invalid');
});
test('cleanup restores original request when storage removes it then throws', async () => {
  await savePendingUpdateCommand(...scope, command);
  const remove = jest.mocked(AsyncStorage.removeItem).getMockImplementation();
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    await remove?.(key);
    throw new Error('removed before storage error');
  });
  await expect(
    clearPendingUpdateCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
test('cleanup restores pending identity when participant expires during removal', async () => {
  await savePendingUpdateCommand(...scope, command);
  let current = true;
  const remove = jest.mocked(AsyncStorage.removeItem).getMockImplementation();
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    await remove?.(key);
    current = false;
  });
  expect(
    await clearPendingUpdateCommand(...scope, command.requestId, () => current),
  ).toBe(false);
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
test('corrupt saved command fails closed and cannot be silently cleared', async () => {
  await AsyncStorage.setItem(
    `panda-trainer-pending-program-update-v1:${scope.join(':')}`,
    '{',
  );
  await expect(loadPendingUpdateCommand(...scope)).rejects.toMatchObject({
    code: 'invalid',
  });
  await expect(
    clearPendingUpdateCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});

test('client context is part of pending intent identity', async () => {
  await savePendingUpdateCommand(...scope, command);
  expect(
    await loadPendingUpdateCommand(scope[0], scope[1], scope[2], ids[5]),
  ).toBeNull();
  expect(await loadPendingUpdateCommand(...scope)).toEqual(command);
});
