import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingCorrectionCommand,
  loadPendingCorrectionCommand,
  savePendingCorrectionCommand,
} from '@/features/workout-corrections/pending';
import { validateCommand } from '@/features/workout-corrections/types';

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
const scope = [ids[0], ids[1], ids[2]] as const;
const command = {
  draftId: ids[3],
  requestId: ids[4],
  expectedWorkoutRevision: 2,
  expectedEntityRevision: 0,
  expectedExerciseRevision: null,
};
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});
test('lost result survives reopen with identical request and zero revision', async () => {
  await savePendingCorrectionCommand(...scope, command);
  await savePendingCorrectionCommand(...scope, command);
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
test('second confirmation cannot overwrite unresolved command', async () => {
  await savePendingCorrectionCommand(...scope, command);
  await expect(
    savePendingCorrectionCommand(...scope, { ...command, requestId: ids[5] }),
  ).rejects.toMatchObject({ code: 'unresolved' });
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
});
test('conditional cleanup cannot remove another request', async () => {
  await savePendingCorrectionCommand(...scope, command);
  expect(await clearPendingCorrectionCommand(...scope, ids[5])).toBe(false);
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
  expect(await clearPendingCorrectionCommand(...scope, command.requestId)).toBe(
    true,
  );
  expect(await loadPendingCorrectionCommand(...scope)).toBeNull();
});
test('participant and workout scopes isolate saved confirmations', async () => {
  await savePendingCorrectionCommand(...scope, command);
  expect(
    await loadPendingCorrectionCommand(ids[5], scope[1], scope[2]),
  ).toBeNull();
  expect(
    await loadPendingCorrectionCommand(scope[0], scope[1], ids[5]),
  ).toBeNull();
});
test('expired lifecycle does not write or clear pending command', async () => {
  await savePendingCorrectionCommand(...scope, command, () => false);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await savePendingCorrectionCommand(...scope, command);
  expect(
    await clearPendingCorrectionCommand(
      ...scope,
      command.requestId,
      () => false,
    ),
  ).toBe(false);
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
});
test('cleanup storage failure retains pending request for retry', async () => {
  await savePendingCorrectionCommand(...scope, command);
  jest
    .mocked(AsyncStorage.removeItem)
    .mockRejectedValueOnce(new Error('disk failed'));
  await expect(
    clearPendingCorrectionCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
});
test.each([
  { ...command, expectedWorkoutRevision: 0 },
  { ...command, expectedEntityRevision: -1 },
  { ...command, expectedExerciseRevision: undefined },
  { ...command, expectedExerciseRevision: 0 },
  { ...command, expectedEntityRevision: 1.5 },
  { ...command, unknown: true },
])('malformed persisted confirmation rejected: %p', (value) => {
  expect(() => validateCommand(value)).toThrow('correction_invalid');
});
test('cleanup restores original request when storage removes it then throws', async () => {
  await savePendingCorrectionCommand(...scope, command);
  const remove = jest.mocked(AsyncStorage.removeItem).getMockImplementation();
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    await remove?.(key);
    throw new Error('removed before storage error');
  });
  await expect(
    clearPendingCorrectionCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
});
test('cleanup restores pending identity when participant expires during removal', async () => {
  await savePendingCorrectionCommand(...scope, command);
  let current = true;
  const remove = jest.mocked(AsyncStorage.removeItem).getMockImplementation();
  jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(async (key) => {
    await remove?.(key);
    current = false;
  });
  expect(
    await clearPendingCorrectionCommand(
      ...scope,
      command.requestId,
      () => current,
    ),
  ).toBe(false);
  expect(await loadPendingCorrectionCommand(...scope)).toEqual(command);
});
test('corrupt saved command fails closed and cannot be silently cleared', async () => {
  await AsyncStorage.setItem(
    `panda-trainer-pending-correction-v1:${scope.join(':')}`,
    '{',
  );
  await expect(loadPendingCorrectionCommand(...scope)).rejects.toMatchObject({
    code: 'invalid',
  });
  await expect(
    clearPendingCorrectionCommand(...scope, command.requestId),
  ).rejects.toMatchObject({ code: 'invalid' });
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
