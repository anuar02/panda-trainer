import { AppState, type AppStateStatus } from 'react-native';
import type { OutboxStore, SyncSession } from '@/domain/workout-sync/types';
import { openOutboxStore, createOutboxRunner } from '@/features/workout-sync';
import { startWorkoutPreloadSyncRuntime } from '@/features/workout-preload/sync-runtime';

jest.mock('../src/features/workout-sync', () => ({
  openOutboxStore: jest.fn(),
  createOutboxRunner: jest.fn(),
  createWorkoutSyncTransport: jest.fn(),
}));
const session: SyncSession = {
  accountId: 'account',
  workspaceId: 'workspace',
  sessionId: 'session',
  accessToken: 'token',
};
const openStore = openOutboxStore as unknown as jest.Mock<
  Promise<OutboxStore>,
  [unknown]
>;
let change: (state: AppStateStatus) => void;
const remove = jest.fn();
const run = jest.fn(async () => {});
const stop = jest.fn();
const originalAppState = AppState.currentState;
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
function store(): OutboxStore {
  return {
    scope: session,
    save: jest.fn(async () => {}),
    pending: jest.fn(async () => []),
    acknowledge: jest.fn(async () => {}),
    read: jest.fn(async () => null),
    close: jest.fn(async () => {}),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      change = listener;
      return { remove };
    });
  AppState.currentState = 'active';
  jest.mocked(createOutboxRunner).mockReturnValue({ run, stop });
});
afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});
afterAll(() => {
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined)
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('runs on startup and foreground, stops on background, and closes without clearing queued data', async () => {
  const local = store();
  openStore.mockResolvedValue(local);
  const cleanup = startWorkoutPreloadSyncRuntime({
    session,
    getSession: () => session,
    onState: jest.fn(),
  });
  await flush();
  expect(run).toHaveBeenCalledTimes(1);
  change('background');
  expect(stop).toHaveBeenCalledTimes(1);
  change('active');
  expect(run).toHaveBeenCalledTimes(2);
  cleanup();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(2);
  expect(local.close).toHaveBeenCalledTimes(1);
  expect(local.acknowledge).not.toHaveBeenCalled();
  expect(local.save).not.toHaveBeenCalled();
});

it('closes a late store after logout without starting a runner', async () => {
  const local = store();
  let resolve!: (value: OutboxStore) => void;
  openStore.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const cleanup = startWorkoutPreloadSyncRuntime({
    session,
    getSession: () => session,
    onState: jest.fn(),
  });
  cleanup();
  resolve(local);
  await flush();
  expect(local.close).toHaveBeenCalledTimes(1);
  expect(createOutboxRunner).not.toHaveBeenCalled();
  expect(local.acknowledge).not.toHaveBeenCalled();
});

it('gates runner credentials and publications after account switch and suppresses generic synced state', async () => {
  openStore.mockResolvedValue(store());
  let current: SyncSession | null = session;
  const onState = jest.fn();
  const cleanup = startWorkoutPreloadSyncRuntime({
    session,
    getSession: () => current,
    onState,
  });
  await flush();
  const options = jest.mocked(createOutboxRunner).mock.calls[0]?.[0];
  expect(options?.getSession()).toEqual(session);
  options?.onState?.({ status: 'synced' });
  expect(onState).not.toHaveBeenCalled();
  options?.onState?.({ status: 'saved_on_phone', pending: 2 });
  expect(onState).toHaveBeenCalledWith({
    status: 'saved_on_phone',
    pending: 2,
  });
  current = { ...session, accountId: 'other' };
  expect(options?.getSession()).toBeNull();
  options?.onState?.({ status: 'error', message: 'stale' });
  expect(onState).toHaveBeenCalledTimes(1);
  change('active');
  expect(run).toHaveBeenCalledTimes(1);
  cleanup();
});
