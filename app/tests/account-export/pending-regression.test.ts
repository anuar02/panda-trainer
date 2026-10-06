import { collectAccountExport } from '@/features/account-export/collector';
import { parseAccountExport } from '@/domain/account-export';
import snapshot from './snapshot.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPendingExportReaders } from '@/features/account-export/pending-readers';
jest.mock('expo-crypto', () => {
  const crypto: typeof import('node:crypto') =
    jest.requireActual('node:crypto');
  return {
    randomUUID: () => crypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async (_algorithm: string, input: string) =>
      crypto.createHash('sha256').update(input, 'utf8').digest('hex'),
  };
});
jest.mock('@/features/trainer-billing/command-storage', () => ({
  loadPendingTrainerBillingCommand: jest.fn(async () => null),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  getAllKeys: jest.fn(async () => []),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
const scope = {
  accountId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  sessionId: 'synthetic',
};
const storage = jest.mocked(AsyncStorage);
beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
  storage.getAllKeys.mockResolvedValue([]);
});
const read = () =>
  createPendingExportReaders(
    scope,
    async () => undefined,
    () => true,
  )();
test('foreign pending program keys never trigger foreign reads and all local sources are read-only', async () => {
  storage.getAllKeys.mockResolvedValue([
    'panda-trainer-pending-program-v1:foreign:foreign:foreign',
  ]);
  const result = await read();
  expect(
    result.filter((source) => source.id !== 'pending-content-fingerprint'),
  ).toHaveLength(7);
  expect(result.find((s) => s.id === 'programAssignmentPending')).toEqual({
    id: 'programAssignmentPending',
    state: 'complete',
    records: [],
    gaps: [],
  });
  expect(
    storage.getItem.mock.calls.some(([key]) => key.includes(':foreign')),
  ).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
test('orphan enumerated program record yields an explicit gap rather than known empty', async () => {
  storage.getAllKeys.mockResolvedValue([
    `panda-trainer-pending-program-v1:${scope.accountId}:${scope.workspaceId}:00000000-0000-4000-8000-000000000003`,
  ]);
  expect(
    (await read()).find((s) => s.id === 'programAssignmentPending'),
  ).toMatchObject({
    state: 'incomplete',
    records: [],
    gaps: ['inaccessible_or_malformed'],
  });
});
test.each([
  '{',
  JSON.stringify({
    draft: null,
    baseRevision: 0,
    access_token: 'synthetic-secret',
  }),
  JSON.stringify({
    draft: {
      id: 'draft',
      name: 'name',
      description: '',
      exercises: [],
      signed_url: 'https://synthetic.invalid/?token=secret',
    },
    baseRevision: 0,
  }),
])(
  'malformed or unknown library fields stay gaps and never leak %#',
  async (raw) => {
    storage.getItem.mockImplementation(async (key) =>
      key.startsWith('panda-trainer-workspace-template-v1:') &&
      !key.endsWith(':pending-clear')
        ? raw
        : null,
    );
    const source = (await read()).find((s) => s.id === 'libraryDrafts');
    expect(source).toEqual({
      id: 'libraryDrafts',
      state: 'incomplete',
      records: [],
      gaps: ['inaccessible_or_malformed'],
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  },
);
test('scoped correction pending command retains null and zero revisions without writes', async () => {
  const workoutId = '00000000-0000-4000-8000-000000000003';
  const key = `panda-trainer-pending-correction-v1:${scope.accountId}:${scope.workspaceId}:${workoutId}`;
  const command = {
    draftId: '00000000-0000-4000-8000-000000000004',
    requestId: '00000000-0000-4000-8000-000000000005',
    expectedWorkoutRevision: 1,
    expectedEntityRevision: 0,
    expectedExerciseRevision: null,
  };
  storage.getAllKeys.mockResolvedValue([
    key,
    'panda-trainer-pending-correction-v1:foreign:foreign:foreign',
  ]);
  storage.getItem.mockImplementation(async (currentKey) =>
    currentKey === key ? JSON.stringify(command) : null,
  );
  expect(
    (await read()).find((source) => source.id === 'correctionPending'),
  ).toMatchObject({
    state: 'complete',
    records: [{ workoutId, command }],
    gaps: [],
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
test('oversized library storage becomes explicit gap and cannot escape byte bounds', async () => {
  storage.getItem.mockImplementation(async (key) =>
    key.startsWith('panda-trainer-workspace-template-v1:')
      ? 'я'.repeat(600000)
      : null,
  );
  expect((await read()).find((s) => s.id === 'libraryDrafts')).toMatchObject({
    state: 'incomplete',
    records: [],
    gaps: ['inaccessible_or_malformed'],
  });
});
test('withheld malformed library change preserves same gap but invalidates collector snapshot', async () => {
  const exportScope = {
    accountId: snapshot.owner_user_id,
    workspaceId: snapshot.workspace_id,
    sessionId: 'synthetic',
  };
  const key = `panda-trainer-workspace-template-v1:${exportScope.accountId}:${exportScope.workspaceId}`;
  let raw = '{malformed-first';
  storage.getAllKeys.mockResolvedValue([key]);
  storage.getItem.mockImplementation(async (currentKey) =>
    currentKey === key ? raw : null,
  );
  const result = await collectAccountExport({
    server: parseAccountExport(snapshot, {
      ownerUserId: exportScope.accountId,
      workspaceId: exportScope.workspaceId,
    }),
    scope: exportScope,
    guard: async () => undefined,
    isCurrent: () => true,
    local: null,
    pending: createPendingExportReaders(
      exportScope,
      async () => undefined,
      () => true,
    ),
  });
  expect(result.json).not.toContain(raw);
  raw = '{malformed-second';
  await expect(result.validate()).rejects.toMatchObject({ code: 'stale' });
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
