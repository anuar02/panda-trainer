import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PushObserver } from '@/features/push/observer';
import * as Notifications from 'expo-notifications';
let mockSession: object | null = null;
let mockSegments = ['auth', 'sign-in'];
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock('@/features/push/use-push', () => ({ usePush: () => true }));
jest.mock('@/features/push/native', () => ({
  nativePushController: { update: jest.fn(async () => undefined) },
}));
jest.mock('@/features/auth/service', () => ({
  authService: { getSession: jest.fn(async () => null) },
}));
jest.mock('@/features/onboarding/session', () => ({
  onboardingIdentity: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useSegments: () => mockSegments,
}));
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(),
  addPushTokenListener: jest.fn(),
}));
const payload = {
  version: 1,
  notificationId: '59000000-0000-4000-8000-000000000001',
  workspaceId: '69000000-0000-4000-8000-000000000001',
};
const response = (data: object, id: string) =>
  ({
    notification: { request: { identifier: id, content: { data } } },
  }) as Notifications.NotificationResponse;
beforeEach(() => {
  mockSession = null;
  mockSegments = ['auth', 'sign-in'];
  jest
    .mocked(Notifications.addNotificationResponseReceivedListener)
    .mockReturnValue({ remove: jest.fn() });
  jest
    .mocked(Notifications.addPushTokenListener)
    .mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.clearAllMocks());
test('cold response retains feed IDs through auth redirect, warm open deduplicates and removes listeners', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValue(response(payload, 'cold'));
  const hook = await renderHook(() => PushObserver());
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/push-open',
    params: {
      notificationId: payload.notificationId,
      workspaceId: payload.workspaceId,
    },
  });
  mockSession = { user: { id: 'owner' } };
  await hook.rerender({});
  expect(mockPush).toHaveBeenCalledTimes(1);
  mockSegments = ['auth', 'account'];
  await hook.rerender({});
  expect(mockPush).toHaveBeenCalledTimes(2);
  const callback = jest
    .mocked(Notifications.addNotificationResponseReceivedListener)
    .mock.calls.at(-1)![0];
  await act(async () => {
    callback(response(payload, 'warm'));
    callback(response(payload, 'warm'));
  });
  expect(mockPush).toHaveBeenCalledTimes(3);
  const listeners = jest
    .mocked(Notifications.addNotificationResponseReceivedListener)
    .mock.results.map((value) => value.value as { remove: jest.Mock });
  await hook.unmount();
  expect(listeners.every((value) => value.remove.mock.calls.length === 1)).toBe(
    true,
  );
});
test('untrusted URL produces honest invalid route without executing URL', async () => {
  jest
    .mocked(Notifications.getLastNotificationResponseAsync)
    .mockResolvedValue(
      response({ url: 'https://untrusted.example.test' }, 'invalid'),
    );
  const hook = await renderHook(() => PushObserver());
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/push-open',
      params: { invalid: '1' },
    }),
  );
  await hook.unmount();
});
