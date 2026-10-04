import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePushOpen } from '@/features/push/use-push-open';
import { openPush, type PushDestination } from '@/features/push/open-service';
import { clientReadToken } from '../client-read-auth-fixture';
import { deferred } from '../notifications/fixtures';
let mockSession: { user: { id: string }; access_token: string } | null;
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession, loading: false }),
}));
jest.mock('@/features/push/open-service', () => ({ openPush: jest.fn() }));
const destination: PushDestination = {
  role: 'client',
  kind: 'booking_confirmed',
  clientRecordId: '79000000-0000-4000-8000-000000000001',
  bookingId: '89000000-0000-4000-8000-000000000001',
  date: '2026-10-04',
  cancelled: false,
};
const ids = [
  '59000000-0000-4000-8000-000000000001',
  '69000000-0000-4000-8000-000000000001',
] as const;
beforeEach(() => {
  mockSession = { user: { id: ids[0] }, access_token: clientReadToken(ids[0]) };
});
afterEach(() => jest.resetAllMocks());
test('signed-out open waits for auth and then resolves authorized route', async () => {
  mockSession = null;
  jest.mocked(openPush).mockResolvedValue(destination);
  const hook = await renderHook(() => usePushOpen(...ids));
  expect(hook.result.current.signIn).toBe(true);
  expect(openPush).not.toHaveBeenCalled();
  mockSession = { user: { id: ids[0] }, access_token: clientReadToken(ids[0]) };
  await hook.rerender({});
  await waitFor(() =>
    expect(hook.result.current.destination).toEqual(destination),
  );
  await hook.unmount();
});
test('same-user relogin aborts and hides late prior target immediately', async () => {
  const old = deferred<PushDestination | null>();
  const fresh = deferred<PushDestination | null>();
  jest
    .mocked(openPush)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(fresh.promise);
  const hook = await renderHook(() => usePushOpen(...ids));
  const scope = jest.mocked(openPush).mock.calls[0]![0];
  mockSession = {
    user: { id: ids[0] },
    access_token: clientReadToken(
      ids[0],
      '11000000-0000-4000-8000-000000000088',
    ),
  };
  await hook.rerender({});
  expect(scope.signal?.aborted).toBe(true);
  expect(scope.isCurrent?.()).toBe(false);
  await act(async () => old.resolve(destination));
  expect(hook.result.current.destination).toBeNull();
  await act(async () => fresh.resolve(null));
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.failed).toBe(false);
  await hook.unmount();
});
test('foreign/removed response and network failure are distinct; unmount aborts', async () => {
  jest.mocked(openPush).mockRejectedValue(new Error('offline'));
  const hook = await renderHook(() => usePushOpen(...ids));
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  const scope = jest.mocked(openPush).mock.calls[0]![0];
  await hook.unmount();
  expect(scope.signal?.aborted).toBe(true);
});
test('invalid payload never invokes authenticated transport', async () => {
  const hook = await renderHook(() => usePushOpen('untrusted', 'url'));
  expect(openPush).not.toHaveBeenCalled();
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.destination).toBeNull();
  await hook.unmount();
});
