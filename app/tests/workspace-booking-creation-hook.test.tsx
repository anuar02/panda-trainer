import { getSupabaseClient } from '../src/features/auth/client';
import { bookingAuthFixture } from './booking-creation-auth-fixture';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWorkspaceBookingCreation } from '../src/features/workspace-scheduling/use-creation';
import { submitWorkspaceBooking } from '../src/features/workspace-scheduling/creation';
import {
  loadPendingWorkspaceBooking,
  PendingWorkspaceBookingError,
  type PendingWorkspaceBooking,
} from '../src/features/workspace-scheduling/pending';
import { WorkspaceSchedulingError } from '../src/features/workspace-scheduling/service';
import type { CreateWorkspaceBookingResult } from '../src/features/workspace-scheduling/create-operation';
jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/creation', () => ({
  submitWorkspaceBooking: jest.fn(),
}));
jest.mock('../src/features/workspace-scheduling/pending', () => ({
  ...jest.requireActual<
    typeof import('../src/features/workspace-scheduling/pending')
  >('../src/features/workspace-scheduling/pending'),
  loadPendingWorkspaceBooking: jest.fn(),
}));
const load = jest.mocked(loadPendingWorkspaceBooking);
const submit = jest.mocked(submitWorkspaceBooking);
const command: PendingWorkspaceBooking = {
  clientRecordIds: ['client-a'],
  startsAtUtc: '2026-10-02T05:00:00.000Z',
  endsAtUtc: '2026-10-02T06:00:00.000Z',
  collisionAcknowledged: false,
  requestId: 'request-a',
};
const created: CreateWorkspaceBookingResult = {
  created: true,
  requiresOverlapAcknowledgement: false,
  groupSessionId: null,
  bookingIds: ['booking-a'],
  overlaps: [],
  replayed: false,
};
const props = { userId: 'user-a', workspaceId: 'workspace-a' };
const callback = jest.fn();
const mount = () =>
  renderHook(
    (scope: typeof props) =>
      useWorkspaceBookingCreation({ ...scope, onCreated: callback }),
    { initialProps: props },
  );
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let auth: ReturnType<typeof bookingAuthFixture>;
beforeEach(() => {
  auth = bookingAuthFixture(props.userId);
  jest.mocked(getSupabaseClient).mockReturnValue(auth.client);
  load.mockReset().mockResolvedValue(null);
  submit.mockReset().mockResolvedValue(created);
  callback.mockReset();
});

test('hydrates before enabling submission and blocks duplicate in-flight calls', async () => {
  const hydration = deferred<PendingWorkspaceBooking | null>();
  load.mockReturnValueOnce(hydration.promise);
  const hook = await mount();
  await act(async () => {
    expect(await hook.result.current.submit(command)).toBeNull();
  });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => hydration.resolve(null));
  const request = deferred<CreateWorkspaceBookingResult>();
  submit.mockReturnValueOnce(request.promise);
  let result!: Promise<CreateWorkspaceBookingResult | null>;
  await act(async () => {
    result = hook.result.current.submit(command);
    expect(await hook.result.current.submit(command)).toBeNull();
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(hook.result.current.busy).toBe(true);
  await act(async () => request.resolve(created));
  expect(await result).toEqual(created);
  expect(callback).toHaveBeenCalledWith(created);
});

test('preserves a lost response command and permits only exact pending resume', async () => {
  load.mockResolvedValue(command);
  submit.mockRejectedValueOnce(new WorkspaceSchedulingError('request'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    expect(
      await hook.result.current.submit({ ...command, requestId: 'other' }),
    ).toBeNull();
  });
  expect(submit).not.toHaveBeenCalled();
  await act(async () => {
    expect(await hook.result.current.resume()).toBeNull();
  });
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('request');
  load.mockResolvedValue(null);
  await act(async () => {
    await hook.result.current.resume();
  });
  expect(submit.mock.calls[1]?.[2]).toEqual(command);
  expect(hook.result.current.pending).toBeNull();
  expect(callback).toHaveBeenCalledTimes(1);
});

test.each(['conflict', 'invalidState'] as const)(
  'terminal %s keeps unresolved command for deliberate retry',
  async (code) => {
    load.mockResolvedValue(command);
    submit.mockRejectedValueOnce(new WorkspaceSchedulingError(code));
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => {
      await hook.result.current.resume();
    });
    expect(hook.result.current.pending).toEqual(command);
    expect(hook.result.current.error).toBe(code);
    expect(callback).not.toHaveBeenCalled();
  },
);

test('overlap warning refreshes cleared pending command without created callback', async () => {
  const warning = {
    ...created,
    created: false,
    requiresOverlapAcknowledgement: true,
    bookingIds: [],
  };
  submit.mockResolvedValue(warning);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => {
    expect(await hook.result.current.submit(command)).toEqual(warning);
  });
  expect(hook.result.current.pending).toBeNull();
  expect(callback).not.toHaveBeenCalled();
});

test.each(['storage', 'invalid'] as const)(
  'pending %s error blocks creation until successful reload',
  async (code) => {
    load.mockRejectedValueOnce(new PendingWorkspaceBookingError(code));
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.error).toBe(
      code === 'invalid' ? 'invalidPending' : 'storage',
    );
    await act(async () => {
      expect(await hook.result.current.submit(command)).toBeNull();
    });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => hook.result.current.reload());
    await waitFor(() => expect(hook.result.current.error).toBeNull());
  },
);

test('post-request unreadable storage preserves command and blocks new work', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  load.mockRejectedValueOnce(new PendingWorkspaceBookingError('storage'));
  await act(async () => {
    expect(await hook.result.current.submit(command)).toBeNull();
  });
  expect(hook.result.current.pending).toEqual(command);
  expect(hook.result.current.error).toBe('storage');
  expect(callback).not.toHaveBeenCalled();
});

test('scope change ignores old hydration and old mutation completion', async () => {
  const hydration = deferred<PendingWorkspaceBooking | null>();
  load.mockReturnValueOnce(hydration.promise);
  const hook = await mount();
  auth.change(auth.session('user-b'));
  await hook.rerender({ userId: 'user-b', workspaceId: 'workspace-b' });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => hydration.resolve(command));
  expect(hook.result.current.pending).toBeNull();
  const request = deferred<CreateWorkspaceBookingResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
  });
  auth.change(auth.session());
  await hook.rerender(props);
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => request.resolve(created));
  expect(callback).not.toHaveBeenCalled();
  expect(hook.result.current.pending).toBeNull();
});

test('unmount ignores successful creation callback', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const request = deferred<CreateWorkspaceBookingResult>();
  submit.mockReturnValueOnce(request.promise);
  await act(async () => {
    void hook.result.current.submit(command);
  });
  await hook.unmount();
  await act(async () => request.resolve(created));
  expect(callback).not.toHaveBeenCalled();
});

test('same-user relogin hides busy/pending/error and drops late success', async () => {
  load.mockResolvedValue(command);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const request = deferred<CreateWorkspaceBookingResult>();
  submit.mockReturnValueOnce(request.promise);
  let completion!: Promise<CreateWorkspaceBookingResult | null>;
  await act(async () => {
    completion = hook.result.current.resume();
  });
  expect(hook.result.current.busy).toBe(true);
  load.mockResolvedValue(null);
  await act(async () =>
    auth.change(
      auth.session(props.userId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      'SIGNED_IN',
    ),
  );
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.pending).toBeNull();
  await act(async () => request.resolve(created));
  expect(await completion).toBeNull();
  expect(callback).not.toHaveBeenCalled();
  expect(hook.result.current.error).toBeNull();
  await hook.unmount();
  expect(auth.listenerCount).toBe(0);
});

test('refresh keeps pending available and allows completion', async () => {
  load.mockResolvedValue(command);
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () =>
    auth.change(
      auth.session(props.userId, auth.sessionId, 'refresh'),
      'TOKEN_REFRESHED',
    ),
  );
  expect(hook.result.current.pending).toEqual(command);
  load.mockResolvedValue(null);
  await act(async () => {
    await hook.result.current.resume();
  });
  expect(callback).toHaveBeenCalledTimes(1);
});

test('late storage error after logout does not poison the new login', async () => {
  const hydration = deferred<PendingWorkspaceBooking | null>();
  load.mockReturnValueOnce(hydration.promise);
  const hook = await mount();
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => auth.change(auth.session(), 'SIGNED_IN'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () =>
    hydration.reject(new PendingWorkspaceBookingError('storage')),
  );
  expect(hook.result.current.pending).toBeNull();
  expect(hook.result.current.error).toBeNull();
});

test('late mutation error after unmount does not reload or notify', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let reject!: (error: Error) => void;
  submit.mockReturnValueOnce(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  let completion!: Promise<CreateWorkspaceBookingResult | null>;
  await act(async () => {
    completion = hook.result.current.submit(command);
  });
  const loads = load.mock.calls.length;
  await hook.unmount();
  await act(async () => reject(new WorkspaceSchedulingError('request')));
  expect(await completion).toBeNull();
  expect(load).toHaveBeenCalledTimes(loads);
  expect(callback).not.toHaveBeenCalled();
});
