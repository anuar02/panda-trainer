import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/features/auth/provider';
import { openWorkoutPreloadStore } from '@/features/workout-preload/storage';
import { createWorkoutPreloadReader } from '@/features/workout-preload/service';
import {
  WorkoutPreloadProvider,
  useOptionalWorkoutPreload,
} from '@/features/workout-preload/provider';
import type {
  WorkoutPreloadStore,
  WorkoutRecovery,
} from '@/domain/workout-preload/types';

jest.mock('../src/features/auth/provider', () => ({ useAuth: jest.fn() }));
jest.mock('../src/features/workout-preload/storage', () => ({
  openWorkoutPreloadStore: jest.fn(),
}));
jest.mock('../src/features/workout-preload/service', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workout-preload/service')
  >('../src/features/workout-preload/service'),
  createWorkoutPreloadReader: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'provider-session' }));
jest.mock('../src/features/workout-sync', () => ({
  openOutboxStore: jest.fn(async () => ({
    close: jest.fn(async () => {}),
    pending: jest.fn(async () => []),
  })),
  createOutboxRunner: jest.fn(() => ({
    run: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    sync: jest.fn(async () => {}),
  })),
  createWorkoutSyncTransport: jest.fn(),
}));

const mockOpen = openWorkoutPreloadStore as unknown as jest.Mock<
  Promise<WorkoutPreloadStore>,
  [unknown]
>;

function auth(accountId: string | null = 'account') {
  const session: Session | null = accountId
    ? {
        access_token: `token-${accountId}`,
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: accountId,
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: '2026-10-03',
        },
      }
    : null;
  jest.mocked(useAuth).mockReturnValue({
    session,
    loading: false,
    failed: false,
    configured: true,
    retry: jest.fn(),
  });
}
function store(): WorkoutPreloadStore {
  return {
    scope: { accountId: 'account', workspaceId: 'workspace' },
    read: jest.fn(async () => null),
    save: jest.fn(async () => {}),
    readRecovery: jest.fn(async () => null),
    saveRecovery: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
  };
}
function wrapper({ children }: PropsWithChildren) {
  return (
    <WorkoutPreloadProvider workspaceId="workspace">
      {children}
    </WorkoutPreloadProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  auth();
  jest.mocked(createWorkoutPreloadReader).mockReturnValue({ load: jest.fn() });
});

it('closes the authenticated store on logout and keeps stale actions from reading it', async () => {
  const local = store();
  mockOpen.mockResolvedValue(local);
  const hook = await renderHook(useOptionalWorkoutPreload, { wrapper });
  await waitFor(() => expect(hook.result.current?.state.status).toBe('ready'));
  auth(null);
  await hook.rerender({});
  await waitFor(() => expect(local.close).toHaveBeenCalledTimes(1));
  await act(async () => hook.result.current?.open('stale-booking'));
  expect(local.read).not.toHaveBeenCalled();
  expect(openWorkoutPreloadStore).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it('closes a late-opening old account store without hydrating it', async () => {
  const old = store();
  const next = store();
  let resolve!: (value: WorkoutPreloadStore) => void;
  const pending = new Promise<WorkoutPreloadStore>((done) => {
    resolve = done;
  });
  mockOpen.mockReturnValueOnce(pending).mockResolvedValueOnce(next);
  const hook = await renderHook(useOptionalWorkoutPreload, { wrapper });
  auth('other');
  await hook.rerender({});
  await waitFor(() => expect(hook.result.current?.state.status).toBe('ready'));
  await act(async () => resolve(old));
  expect(old.close).toHaveBeenCalledTimes(1);
  expect(old.readRecovery).not.toHaveBeenCalled();
  expect(openWorkoutPreloadStore).toHaveBeenLastCalledWith(
    expect.objectContaining({ accountId: 'other', accessToken: 'token-other' }),
  );
  await hook.unmount();
  expect(next.close).toHaveBeenCalledTimes(1);
});

it('blocks data actions after hydration failure and retries with a fresh store', async () => {
  const failed = store();
  const recovery = store();
  jest.mocked(failed.readRecovery).mockRejectedValue(new Error('storage'));
  mockOpen.mockResolvedValueOnce(failed).mockResolvedValueOnce(recovery);
  const hook = await renderHook(useOptionalWorkoutPreload, { wrapper });
  await waitFor(() => expect(hook.result.current?.state.error).toBe('storage'));
  await act(async () => {
    await hook.result.current?.open('booking');
    await hook.result.current?.select('client');
    await hook.result.current?.collapse(true);
  });
  expect(failed.read).not.toHaveBeenCalled();
  expect(failed.saveRecovery).not.toHaveBeenCalled();
  await act(async () => hook.result.current?.retry());
  await waitFor(() => expect(hook.result.current?.state.status).toBe('ready'));
  expect(failed.close).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it('ignores restoration completed after logout', async () => {
  const local = store();
  let resolve!: (value: WorkoutRecovery | null) => void;
  jest.mocked(local.readRecovery).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  mockOpen.mockResolvedValue(local);
  const hook = await renderHook(useOptionalWorkoutPreload, { wrapper });
  await waitFor(() => expect(local.readRecovery).toHaveBeenCalled());
  auth(null);
  await hook.rerender({});
  await act(async () =>
    resolve({
      version: 1,
      sessionKey: 'old',
      bookingId: 'booking',
      clientRecordId: 'client',
      collapsed: true,
    }),
  );
  expect(local.read).not.toHaveBeenCalled();
  expect(hook.result.current?.state.context).toBeNull();
  await waitFor(() => expect(local.close).toHaveBeenCalledTimes(1));
  await hook.unmount();
});
it('keeps callbacks captured by an old account from opening the next account store', async () => {
  const previous = store();
  const next = store();
  mockOpen.mockResolvedValueOnce(previous).mockResolvedValueOnce(next);
  const hook = await renderHook(useOptionalWorkoutPreload, { wrapper });
  await waitFor(() => expect(hook.result.current?.state.status).toBe('ready'));
  const oldActions = hook.result.current;
  auth('other');
  await hook.rerender({});
  await waitFor(() => expect(next.readRecovery).toHaveBeenCalled());
  await act(async () => {
    await oldActions?.open('old-booking');
    await oldActions?.select('old-client');
    await oldActions?.collapse(true);
  });
  expect(next.read).not.toHaveBeenCalled();
  expect(next.saveRecovery).not.toHaveBeenCalled();
  await hook.unmount();
});
