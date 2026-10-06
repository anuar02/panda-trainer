import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useNotifications } from '@/features/notifications/use-notifications';
import { notificationService } from '@/features/notifications/service';
import { watchNotifications } from '@/features/notifications/realtime';
import { scope, page, row, deferred, userId } from './fixtures';
import { clientReadToken } from '../client-read-auth-fixture';
import { AppState, type AppStateStatus } from 'react-native';
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
let mockToken = scope.token;
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({
    session: {
      user: { id: '59000000-0000-4000-8000-000000000002' },
      access_token: mockToken,
    },
    loading: false,
    failed: false,
  }),
}));
jest.mock('@/features/notifications/service', () => ({
  notificationService: { page: jest.fn(), mark: jest.fn(), target: jest.fn() },
}));
jest.mock('@/features/notifications/realtime', () => ({
  watchNotifications: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (fn: () => void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(fn, [fn]);
  },
}));
beforeEach(() => {
  mockToken = scope.token;
  jest.mocked(notificationService.page).mockResolvedValue(page());
  jest.mocked(watchNotifications).mockReturnValue(jest.fn());
});
afterEach(() => jest.resetAllMocks());
test('scope switch/relogin clears rows immediately, removes old channel, fences late error and target publication', async () => {
  const late = deferred<ReturnType<typeof page>>();
  const target =
    deferred<Awaited<ReturnType<typeof notificationService.target>>>();
  const stop = jest.fn();
  jest.mocked(watchNotifications).mockReturnValue(stop);
  const hook = await renderHook(
    ({ workspaceId }: { workspaceId: string }) =>
      useNotifications({ ...scope, workspaceId }),
    { initialProps: { workspaceId: scope.workspaceId } },
  );
  await waitFor(() => expect(hook.result.current.rows).toHaveLength(1));
  jest.mocked(notificationService.target).mockReturnValue(target.promise);
  const open = hook.result.current.target(row().id);
  jest.mocked(notificationService.page).mockReturnValueOnce(late.promise);
  const callback = jest.mocked(watchNotifications).mock.calls[0]?.[1];
  await act(() => callback?.());
  jest
    .mocked(notificationService.page)
    .mockReturnValue(deferred<ReturnType<typeof page>>().promise);
  await hook.rerender({ workspaceId: '69000000-0000-4000-8000-000000000099' });
  expect(hook.result.current.rows).toEqual([]);
  expect(stop).toHaveBeenCalled();
  await act(async () => {
    late.reject(new Error('old scope'));
    target.resolve({
      available: true,
      type: 'booking',
      id: row().target_id,
      clientRecordId: scope.clientRecordId!,
      current: null,
    });
  });
  expect(await open).toBeNull();
  mockToken = clientReadToken(userId, '11000000-0000-4000-8000-000000000088');
  await hook.rerender({ workspaceId: scope.workspaceId });
  expect(stop.mock.calls.length).toBeGreaterThan(1);
  await hook.unmount();
});
test('focus/foreground and realtime reconnect all perform server reconciliation; unmount fences callbacks', async () => {
  let active: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  const app = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      active = listener;
      return { remove };
    });
  const hook = await renderHook(() => useNotifications(scope));
  await waitFor(() => expect(hook.result.current.unreadCount).toBe(1));
  const baseline = jest.mocked(notificationService.page).mock.calls.length;
  await act(() => active?.('active'));
  const reconnect = jest.mocked(watchNotifications).mock.calls[0]?.[1];
  await act(() => reconnect?.());
  await waitFor(() =>
    expect(
      jest.mocked(notificationService.page).mock.calls.length,
    ).toBeGreaterThan(baseline),
  );
  await hook.unmount();
  const calls = jest.mocked(notificationService.page).mock.calls.length;
  await act(() => {
    reconnect?.();
    active?.('active');
  });
  expect(notificationService.page).toHaveBeenCalledTimes(calls);
  expect(remove).toHaveBeenCalled();
  app.mockRestore();
});
