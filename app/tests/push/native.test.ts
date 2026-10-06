import { nativePushAdapter } from '@/features/push/native';
import { getSupabaseClient } from '@/features/auth/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    easConfig: { projectId: 'synthetic-project' },
    executionEnvironment: 'standalone',
  },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'synthetic-installation-uuid'),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
afterEach(() => jest.clearAllMocks());
test('service uses captured bearer and exact device generation for rotation/unregister', async () => {
  const header = jest.fn(async () => ({ error: null }));
  const rpc = jest.fn(() => ({ setHeader: header }));
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ rpc } as unknown as SupabaseClient<Database>);
  const owner = {
    userId: 'owner',
    sessionId: 'session',
    token: 'captured-bearer',
  };
  await nativePushAdapter.register(
    owner,
    'device',
    'synthetic-token',
    'generation',
  );
  await nativePushAdapter.unregister(owner, 'device', 'generation');
  expect(rpc).toHaveBeenNthCalledWith(
    1,
    'register_push_device',
    expect.objectContaining({
      p_device_id: 'device',
      p_token: 'synthetic-token',
      p_generation: 'generation',
      p_device_secret: expect.any(String),
    }),
  );
  expect(rpc).toHaveBeenNthCalledWith(
    2,
    'unregister_push_device',
    expect.objectContaining({
      p_device_id: 'device',
      p_generation: 'generation',
    }),
  );
  expect(header).toHaveBeenCalledWith(
    'Authorization',
    'Bearer captured-bearer',
  );
});
test('installation command sequence is durable and increases before every RPC', async () => {
  const saved = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => saved.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      saved.set(key, value);
    });
  const rpc = jest.fn(() => ({ setHeader: async () => ({ error: null }) }));
  jest
    .mocked(getSupabaseClient)
    .mockReturnValue({ rpc } as unknown as SupabaseClient<Database>);
  const owner = { userId: 'owner', sessionId: 'session', token: 'bearer' };
  await nativePushAdapter.reconcile?.(owner, 'device');
  await nativePushAdapter.register(
    owner,
    'device',
    'synthetic-token',
    'generation',
  );
  await nativePushAdapter.unregister(owner, 'device', 'generation');
  expect(
    rpc.mock.calls.map(
      (call) =>
        (call as unknown as [string, { p_sequence: number }])[1].p_sequence,
    ),
  ).toEqual([1, 2, 3]);
  expect(saved.get('push-device-sequence-v1')).toBe('3');
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
});
test('native permission reads distinguish denial from undetermined, prompt persisted separately', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    canAskAgain: false,
    status: 'denied',
  } as Notifications.NotificationPermissionsStatus);
  expect(await nativePushAdapter.permission()).toBe('denied');
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
  } as Notifications.NotificationPermissionsStatus);
  expect(await nativePushAdapter.permission()).toBe('undetermined');
  await nativePushAdapter.rememberAsked();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'push-prompt-v1',
    'asked',
  );
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('service rejects network errors with a safe error and no token interpolation', async () => {
  const header = jest.fn(async () => ({
    error: { message: 'private-response' },
  }));
  jest.mocked(getSupabaseClient).mockReturnValue({
    rpc: () => ({ setHeader: header }),
  } as unknown as SupabaseClient<Database>);
  await expect(
    nativePushAdapter.register(
      { userId: 'owner', sessionId: 'session', token: 'bearer' },
      'device',
      'synthetic-token',
      'generation',
    ),
  ).rejects.toThrow('Push unavailable');
});
