import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { usePush } from '@/features/push/use-push';
import { nativePushController } from '@/features/push/native';
import { detachPushBeforeLogout, setPushDetach } from '@/features/push/logout';
import { clientReadToken } from '../client-read-auth-fixture';
jest.mock('@/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
let mockSession: { user: { id: string }; access_token: string } | null;
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock('@/features/push/native', () => ({
  nativePushAdapter: { supported: () => true },
  nativePushController: {
    update: jest.fn(async () => undefined),
    detach: jest.fn(async () => undefined),
  },
}));
beforeEach(() => {
  mockSession = {
    user: { id: '59000000-0000-4000-8000-000000000002' },
    access_token: clientReadToken('59000000-0000-4000-8000-000000000002'),
  };
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  setPushDetach(null);
});
test('native hook captures session identity, foreground refresh and removes listeners on logout/unmount', async () => {
  let change!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, fn) => {
    change = fn;
    return { remove };
  });
  const hook = await renderHook(() => usePush());
  expect(nativePushController.update).toHaveBeenCalledWith({
    userId: mockSession!.user.id,
    token: mockSession!.access_token,
    sessionId: '11000000-0000-4000-8000-000000000099',
  });
  await act(async () => {
    change('active');
  });
  expect(nativePushController.update).toHaveBeenCalledTimes(2);
  await detachPushBeforeLogout();
  expect(nativePushController.detach).toHaveBeenCalledTimes(1);
  mockSession = null;
  await hook.rerender({});
  expect(nativePushController.update).toHaveBeenLastCalledWith(null);
  expect(remove).toHaveBeenCalled();
  await hook.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});
test('logout propagates detach failure before auth signout can proceed', async () => {
  setPushDetach(async () => {
    throw new Error('offline');
  });
  await expect(detachPushBeforeLogout()).rejects.toThrow('offline');
});
