import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePendingInvitation } from '../src/features/invitations/use-pending-invitation';
import { getSupabaseClient } from '../src/features/auth/client';
import { authStorage } from '../src/features/auth/storage';
import {
  actor,
  deferred,
  harness,
  invitationId,
  secret,
  session,
  workspace,
} from './invitation-harness';
let mockSession: ReturnType<typeof session> | null = session();
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession, loading: false, failed: false }),
}));
jest.mock('../src/features/auth/storage', () => ({
  authStorage: {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));
beforeEach(() => {
  mockSession = session();
  jest.mocked(authStorage.getItem).mockReset().mockResolvedValue(secret);
});

it.each(['success', 'failure'] as const)(
  'same-user relogin during pending storage %s cannot publish the old result',
  async (outcome) => {
    const h = harness();
    jest.mocked(getSupabaseClient).mockReturnValue(h.client);
    const read = deferred<string | null>();
    jest
      .mocked(authStorage.getItem)
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce(`${secret.slice(0, -1)}A`);
    const view = await renderHook(() =>
      usePendingInvitation(mockSession?.user.id),
    );
    await waitFor(() => expect(authStorage.getItem).toHaveBeenCalledTimes(1));
    mockSession = session(actor, workspace);
    await act(async () => h.event('SIGNED_IN', mockSession));
    await view.rerender({});
    await act(async () => {
      if (outcome === 'success') read.resolve(secret);
      else read.reject(new Error('storage'));
    });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.token).toBe(`${secret.slice(0, -1)}A`);
    expect(view.result.current.failed).toBe(false);
  },
);

it('a verified refresh during pending read keeps the caller identity and returns the intent', async () => {
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  const read = deferred<string | null>();
  jest.mocked(authStorage.getItem).mockReturnValueOnce(read.promise);
  const view = await renderHook(() =>
    usePendingInvitation(mockSession?.user.id),
  );
  await waitFor(() => expect(authStorage.getItem).toHaveBeenCalledTimes(1));
  mockSession = session(actor, invitationId, 'refresh');
  await act(async () => h.event('TOKEN_REFRESHED', mockSession));
  await view.rerender({});
  await act(async () => read.resolve(secret));
  await waitFor(() => expect(view.result.current.token).toBe(secret));
  expect(view.result.current.failed).toBe(false);
});

it('logout and unmount suppress a pending result and release auth listeners', async () => {
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  const read = deferred<string | null>();
  jest.mocked(authStorage.getItem).mockReturnValueOnce(read.promise);
  const view = await renderHook(() =>
    usePendingInvitation(mockSession?.user.id),
  );
  await waitFor(() => expect(authStorage.getItem).toHaveBeenCalledTimes(1));
  mockSession = null;
  await act(async () => h.event('SIGNED_OUT', null));
  await view.rerender({});
  expect(view.result.current.token).toBeNull();
  await view.unmount();
  await act(async () => read.resolve(secret));
  expect(h.listeners.size).toBe(0);
});

it('a silent same-session credential change hides a previously loaded token', async () => {
  const h = harness();
  jest.mocked(getSupabaseClient).mockReturnValue(h.client);
  const view = await renderHook(() =>
    usePendingInvitation(mockSession?.user.id),
  );
  await waitFor(() => expect(view.result.current.token).toBe(secret));
  mockSession = session(actor, invitationId, 'unverified');
  h.setSession(mockSession);
  await view.rerender({});
  expect(view.result.current.token).toBeNull();
  expect(view.result.current.loading).toBe(true);
});
