import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOnboardingContext } from '@/features/onboarding/use-onboarding-context';
import {
  actor,
  anotherLogin,
  deferred,
  session,
  setupOnboarding,
  workspaceId,
} from './onboarding-fixtures';
import { createTrainerOnboardingDraft } from '@/features/onboarding/welcome-model';

let mockSession = session();
let mockFocused = true;
jest.mock('@/features/auth/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('@/features/auth/provider', () => ({
  useAuth: () => ({ session: mockSession, loading: false, failed: false }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      if (mockFocused) return callback();
    }, [callback, mockFocused]);
  },
}));
beforeEach(() => {
  mockSession = session();
  mockFocused = true;
});
afterEach(() => jest.resetAllMocks());

test('same-user relogin resets loaded scope, preserves verified refresh and fails on silent credentials', async () => {
  const read = setupOnboarding();
  const hook = await renderHook(() => useOnboardingContext());
  await waitFor(() =>
    expect(hook.result.current.context?.workspace?.id).toBe(workspaceId),
  );
  const generation = hook.result.current.generation;
  mockSession = session(undefined, actor, 'refresh');
  await act(async () => read.emit('TOKEN_REFRESHED', mockSession));
  await hook.rerender({});
  expect(hook.result.current.context?.workspace?.id).toBe(workspaceId);
  expect(hook.result.current.generation).toBe(generation);
  const oldComplete = hook.result.current.complete;
  mockSession = session(anotherLogin);
  await act(async () => read.emit('SIGNED_IN', mockSession));
  await hook.rerender({});
  await waitFor(() =>
    expect(hook.result.current.context?.workspace?.id).toBe(workspaceId),
  );
  expect(hook.result.current.generation).not.toBe(generation);
  await expect(
    oldComplete(createTrainerOnboardingDraft('Trainer')),
  ).rejects.toThrow('Onboarding unavailable');
  mockSession = session(anotherLogin, actor, 'silent');
  read.setSession(mockSession);
  await hook.rerender({});
  expect(hook.result.current.context).toBeNull();
  expect(hook.result.current.failed).toBe(true);
  await hook.unmount();
  expect(read.subscriptions()).toBe(0);
});

test.each(['success', 'error'])(
  'retry and focus discard late %s without replacing new data',
  async (kind) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    let visits = 0;
    const read = setupOnboarding({
      io: async (io) => {
        if (io.label === 'getUser' && ++visits === 1) {
          ready.resolve();
          await release.promise;
          if (kind === 'error') throw new Error('late');
        }
      },
    });
    const hook = await renderHook(() => useOnboardingContext());
    await ready.promise;
    await act(async () => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.context?.workspace?.id).toBe(workspaceId),
    );
    const generation = hook.result.current.generation;
    await act(async () => release.resolve());
    expect(hook.result.current.generation).toBe(generation);
    expect(hook.result.current.failed).toBe(false);
    mockFocused = false;
    await hook.rerender({});
    expect(hook.result.current.isCurrent()).toBe(false);
    mockFocused = true;
    await hook.rerender({});
    await waitFor(() =>
      expect(hook.result.current.generation).not.toBe(generation),
    );
    await waitFor(() =>
      expect(hook.result.current.context?.workspace?.id).toBe(workspaceId),
    );
    await hook.unmount();
    expect(read.subscriptions()).toBe(0);
  },
);

test.each(['SIGNED_IN', 'SIGNED_OUT'] as const)(
  'pending read and completion are invalidated by %s and unmount',
  async (event) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    const read = setupOnboarding({
      first: true,
      io: async (io) => {
        if (io.label === 'complete_trainer_onboarding') {
          ready.resolve();
          await release.promise;
        }
      },
    });
    const hook = await renderHook(() => useOnboardingContext());
    await waitFor(() => expect(hook.result.current.context).not.toBeNull());
    const result = hook.result.current.complete(
      createTrainerOnboardingDraft('Trainer'),
    );
    const rejected = expect(result).rejects.toThrow('Onboarding unavailable');
    await ready.promise;
    await act(async () =>
      read.emit(event, event === 'SIGNED_OUT' ? null : session(anotherLogin)),
    );
    await hook.unmount();
    release.resolve();
    await rejected;
    expect(read.subscriptions()).toBe(0);
  },
);

test.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'hook completion relogin at I/O %i discards result and old callbacks',
  async (checkpoint) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    let armed = false;
    let seen = 0;
    const read = setupOnboarding({
      first: true,
      io: async () => {
        if (armed && ++seen === checkpoint) {
          ready.resolve();
          await release.promise;
        }
      },
    });
    const hook = await renderHook(() => useOnboardingContext());
    await waitFor(() => expect(hook.result.current.context).not.toBeNull());
    const old = hook.result.current;
    armed = true;
    const result = old.complete(createTrainerOnboardingDraft('Trainer'));
    const rejected = expect(result).rejects.toThrow('Onboarding unavailable');
    await ready.promise;
    armed = false;
    mockSession = session(anotherLogin);
    await act(async () => read.emit('SIGNED_IN', mockSession));
    await hook.rerender({});
    release.resolve();
    await rejected;
    expect(old.isCurrent()).toBe(false);
    await waitFor(() => expect(hook.result.current.context).not.toBeNull());
    expect(hook.result.current.generation).not.toBe(old.generation);
    await hook.unmount();
    expect(read.subscriptions()).toBe(0);
  },
);

test.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'hook preserves verified refresh and completion at I/O %i',
  async (checkpoint) => {
    const ready = deferred<void>();
    const release = deferred<void>();
    let armed = false;
    let seen = 0;
    const read = setupOnboarding({
      first: true,
      io: async () => {
        if (armed && ++seen === checkpoint) {
          ready.resolve();
          await release.promise;
        }
      },
    });
    const hook = await renderHook(() => useOnboardingContext());
    await waitFor(() => expect(hook.result.current.context).not.toBeNull());
    const generation = hook.result.current.generation;
    armed = true;
    const result = hook.result.current.complete(
      createTrainerOnboardingDraft('Trainer'),
    );
    await ready.promise;
    mockSession = session(undefined, actor, 'refresh');
    await act(async () => read.emit('TOKEN_REFRESHED', mockSession));
    await hook.rerender({});
    release.resolve();
    expect((await result).workspace?.id).toBe(workspaceId);
    expect(hook.result.current.generation).toBe(generation);
    await hook.unmount();
    expect(read.subscriptions()).toBe(0);
  },
);
