import * as SQLite from 'expo-sqlite';
import { SQLiteOutboxStore } from '@/features/workout-sync/storage';
import { createRuntimeAccountExportCollector } from '@/features/account-export/local-adapter-runtime';
import { parseAccountExport } from '@/domain/account-export';
import snapshot from './snapshot.json';
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('@/features/account-export/pending-readers', () => ({
  createPendingExportReaders: () => async () => [],
}));
jest.mock('@/features/workout-sync/storage', () => ({
  SQLiteOutboxStore: jest.fn(),
}));
const scope = {
  accountId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  sessionId: 'synthetic-runtime',
};
const server = parseAccountExport(snapshot, {
  ownerUserId: scope.accountId,
  workspaceId: scope.workspaceId,
});
const opening = jest.mocked(SQLite.openDatabaseAsync);
const storeConstructor = jest.mocked(SQLiteOutboxStore);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
function database() {
  return {
    closeAsync: jest.fn(async () => undefined),
    execAsync: jest.fn(),
    runAsync: jest.fn(),
  } as unknown as Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;
}
beforeEach(() => {
  jest.clearAllMocks();
  opening.mockReset();
  storeConstructor.mockReset();
});
test('open failure yields explicit local source gap and performs no storage initialization', async () => {
  opening.mockRejectedValueOnce(new Error('synthetic-open-failure'));
  const runtime = createRuntimeAccountExportCollector(
    scope,
    async () => undefined,
    () => true,
    undefined,
    async () => ({ openDatabaseAsync: opening }),
  );
  const result = await runtime.collect(server, scope, async () => undefined);
  expect(
    result.envelope.sources.find((source) => source.id === 'sqlite-journal'),
  ).toMatchObject({ state: 'unknown', records: [] });
  expect(storeConstructor).not.toHaveBeenCalled();
  expect(opening).toHaveBeenCalledWith('workout-sync.db', {
    useNewConnection: true,
  });
});
test('timed out open is bounded and late connection is closed without constructing store', async () => {
  jest.useFakeTimers();
  try {
    const pending =
      deferred<Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>>();
    opening.mockReturnValueOnce(pending.promise);
    const runtime = createRuntimeAccountExportCollector(
      scope,
      async () => undefined,
      () => true,
      undefined,
      async () => ({ openDatabaseAsync: opening }),
    );
    const reading = runtime.collect(server, scope, async () => undefined);
    await jest.advanceTimersByTimeAsync(5001);
    const result = await reading;
    expect(
      result.envelope.sources.find((source) => source.id === 'sqlite-journal')
        ?.state,
    ).toBe('unknown');
    const db = database();
    pending.resolve(db);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.closeAsync).toHaveBeenCalledTimes(1);
    expect(storeConstructor).not.toHaveBeenCalled();
    expect(db.execAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
test('unmount during open rejects collection and closes late database', async () => {
  const pending =
    deferred<Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>>();
  opening.mockReturnValueOnce(pending.promise);
  let current = true;
  const abort = new AbortController();
  const runtime = createRuntimeAccountExportCollector(
    scope,
    async () => undefined,
    () => current,
    undefined,
    async () => ({ openDatabaseAsync: opening }),
  );
  const reading = runtime.collect(
    server,
    scope,
    async () => undefined,
    abort.signal,
  );
  for (let i = 0; i < 50 && !opening.mock.calls.length; i += 1)
    await Promise.resolve();
  expect(opening).toHaveBeenCalledTimes(1);
  current = false;
  abort.abort();
  await expect(reading).rejects.toMatchObject({ code: 'sessionChanged' });
  const db = database();
  pending.resolve(db);
  await Promise.resolve();
  await Promise.resolve();
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  expect(storeConstructor).not.toHaveBeenCalled();
});
test('opened read connection closes when snapshot read fails and never initializes or writes', async () => {
  const db = database();
  opening.mockResolvedValueOnce(db);
  const read = jest.fn(async () => {
    throw new Error('synthetic-read-failure');
  });
  storeConstructor.mockImplementationOnce(
    () =>
      ({
        scopedSnapshot: read,
        close: () => db.closeAsync(),
      }) as unknown as SQLiteOutboxStore,
  );
  const runtime = createRuntimeAccountExportCollector(
    scope,
    async () => undefined,
    () => true,
    undefined,
    async () => ({ openDatabaseAsync: opening }),
  );
  const result = await runtime.collect(server, scope, async () => undefined);
  expect(
    result.envelope.sources.find((source) => source.id === 'sqlite-journal')
      ?.state,
  ).toBe('unknown');
  expect(read).toHaveBeenCalledTimes(1);
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  expect(db.execAsync).not.toHaveBeenCalled();
  expect(db.runAsync).not.toHaveBeenCalled();
});
