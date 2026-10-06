import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useClientSchedule } from '../src/features/client-scheduling/use-schedule';
import {
  loadClientSchedule,
  ClientSchedulingError,
  type ClientSchedule,
} from '../src/features/client-scheduling/service';

jest.mock('../src/features/auth/client', () => ({
  getSupabaseClient: jest.fn(),
}));

let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
jest.mock('../src/features/client-scheduling/service', () => ({
  loadClientSchedule: jest.fn(),
  ClientSchedulingError: jest.requireActual<
    typeof import('../src/features/client-scheduling/service')
  >('../src/features/client-scheduling/service').ClientSchedulingError,
}));
const load = jest.mocked(loadClientSchedule);
const schedule: ClientSchedule = {
  context: {
    clientRecordId: 'client-a',
    workspaceId: 'workspace-a',
    timezone: 'Asia/Almaty',
    trainerName: 'Trainer',
    clientName: 'Client',
  },
  bookings: [],
  pendingProposals: [],
};
const props = {
  userId: 'user-a',
  clientRecordId: 'client-a',
  startsAtUtc: '2026-10-01T00:00:00.000Z',
  endsAtUtc: '2026-10-08T00:00:00.000Z',
};
const mount = () =>
  renderHook((scope: typeof props) => useClientSchedule(scope), {
    initialProps: props,
  });
const deferred = () => {
  let resolve!: (value: ClientSchedule) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ClientSchedule>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockFocused = true;
  load.mockReset().mockResolvedValue(schedule);
});

test('passes exact UTC bounds and account scope without implicit local date conversion', async () => {
  const hook = await mount();
  expect(load).toHaveBeenCalledWith({
    workspaceId: undefined,
    isCurrent: expect.any(Function),
    clientRecordId: props.clientRecordId,
    expectedUserId: props.userId,
    startsAtUtc: props.startsAtUtc,
    endsAtUtc: props.endsAtUtc,
  });
  await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
  await hook.rerender({ ...props });
  expect(load).toHaveBeenCalledTimes(1);
});
for (const change of [
  { userId: 'user-b' },
  { clientRecordId: 'client-b' },
  { startsAtUtc: '2026-10-02T00:00:00.000Z' },
  { endsAtUtc: '2026-10-09T00:00:00.000Z' },
]) {
  test(`scope change ${JSON.stringify(change)} hides old data and rejects stale responses`, async () => {
    const old = deferred();
    const next = deferred();
    load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const hook = await mount();
    await hook.rerender({ ...props, ...change });
    await act(async () => old.resolve(schedule));
    expect(hook.result.current.schedule).toBeNull();
    expect(hook.result.current.loading).toBe(true);
    const updated = { ...schedule, bookings: [] };
    await act(async () => next.resolve(updated));
    expect(hook.result.current.schedule).toBe(updated);
    expect(hook.result.current.failed).toBe(false);
  });
}

test('resolved data disappears immediately when a new scope loads', async () => {
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
  load.mockReturnValueOnce(deferred().promise);
  await hook.rerender({ ...props, userId: 'user-b' });
  expect(hook.result.current.schedule).toBeNull();
  expect(hook.result.current.loading).toBe(true);
});

test('failed requests can retry and stale failure cannot replace retry success', async () => {
  load.mockRejectedValueOnce(new Error('offline'));
  const hook = await mount();
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  expect(hook.result.current.loading).toBe(false);
  const stale = deferred();
  load.mockReturnValueOnce(stale.promise);
  await act(() => hook.result.current.retry());
  expect(hook.result.current.failed).toBe(false);
  expect(hook.result.current.loading).toBe(true);
  await act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
  await act(async () => stale.reject(new Error('late failure')));
  expect(hook.result.current.schedule).toBe(schedule);
  expect(hook.result.current.failed).toBe(false);
});

test('returning to focus refreshes and ignores a response from before blur', async () => {
  const old = deferred();
  const next = deferred();
  load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const hook = await mount();
  mockFocused = false;
  await hook.rerender(props);
  await act(async () => old.resolve(schedule));
  expect(hook.result.current.schedule).toBeNull();
  mockFocused = true;
  await hook.rerender(props);
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => next.resolve(schedule));
  expect(hook.result.current.schedule).toBe(schedule);
});

test('unmount ignores a pending request result', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  const hook = await mount();
  await hook.unmount();
  await act(async () => pending.resolve(schedule));
  expect(load).toHaveBeenCalledTimes(1);
});

test.each(['unavailable', 'invalidInput', 'configuration'] as const)(
  'exposes typed %s failures without stale schedule',
  async (code) => {
    load.mockRejectedValueOnce(new ClientSchedulingError(code));
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.failed).toBe(true));
    expect(hook.result.current.error).toBe(code);
    expect(hook.result.current.schedule).toBeNull();
    expect(hook.result.current.loading).toBe(false);
  },
);

test('no-window scope loads all upcoming and switching modes rejects stale range result', async () => {
  const old = deferred();
  const upcoming = deferred();
  load.mockReturnValueOnce(old.promise).mockReturnValueOnce(upcoming.promise);
  const hook = await renderHook(
    (
      scope: import('../src/features/client-scheduling/use-schedule').ClientScheduleScope,
    ) => useClientSchedule(scope),
    { initialProps: props },
  );
  await hook.rerender({
    userId: props.userId,
    clientRecordId: props.clientRecordId,
  });
  expect(load).toHaveBeenLastCalledWith({
    workspaceId: undefined,
    isCurrent: expect.any(Function),
    expectedUserId: props.userId,
    clientRecordId: props.clientRecordId,
    startsAtUtc: undefined,
    endsAtUtc: undefined,
  });
  await act(async () => old.resolve(schedule));
  expect(hook.result.current.schedule).toBeNull();
  await act(async () => upcoming.resolve(schedule));
  expect(hook.result.current.schedule).toBe(schedule);
});
