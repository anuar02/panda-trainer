import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWorkspaceSchedule } from '../src/features/workspace-scheduling/use-schedule';
import {
  loadWorkspaceSchedule,
  type WorkspaceSchedule,
} from '../src/features/workspace-scheduling/service';

let mockAuthLoading = false;
let mockAuthFailed = false;
let mockUserId = 'user-a';
let mockSessionId = '11111111-1111-4111-8111-111111111111';
let mockAuthListener: ((event: string, session: null) => void) | undefined;
jest.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({
    configured: true,
    loading: mockAuthLoading,
    failed: mockAuthFailed,
    session: {
      user: { id: mockUserId },
      access_token: `x.${Buffer.from(JSON.stringify({ sub: mockUserId, session_id: mockSessionId })).toString('base64url')}.x`,
    },
  }),
}));
jest.mock('../src/features/auth/service', () => ({
  authService: {
    onAuthStateChange: (listener: typeof mockAuthListener) => {
      mockAuthListener = listener;
      return { unsubscribe: jest.fn() };
    },
  },
}));
let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
jest.mock('../src/features/workspace-scheduling/service', () => ({
  loadWorkspaceSchedule: jest.fn(),
}));
const load = jest.mocked(loadWorkspaceSchedule);
const schedule: WorkspaceSchedule = {
  availability: {
    id: 'workspace-a',
    timezone: 'Asia/Almaty',
    working_days: [0, 1, 2, 3, 4],
    day_start: '09:00:00',
    day_end: '20:00:00',
    usual_session_minutes: 60,
  },
  bookings: [],
  pendingProposals: [],
};
const props = {
  userId: 'user-a',
  workspaceId: 'workspace-a',
  date: '2026-10-02',
};
const mount = () =>
  renderHook(
    ({ userId, workspaceId, date }: typeof props) =>
      useWorkspaceSchedule(userId, workspaceId, date),
    { initialProps: props },
  );
const deferred = () => {
  let resolve!: (value: WorkspaceSchedule) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<WorkspaceSchedule>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockFocused = true;
  mockAuthLoading = false;
  mockAuthFailed = false;
  mockUserId = 'user-a';
  mockSessionId = '11111111-1111-4111-8111-111111111111';
  load.mockReset().mockResolvedValue(schedule);
});

test('loads the padded week and reuses it when the selected day stays in that week', async () => {
  const hook = await mount();
  expect(load).toHaveBeenCalledWith(
    'workspace-a',
    '2026-09-27T00:00:00.000Z',
    '2026-10-06T00:00:00.000Z',
    expect.objectContaining({
      expectedUserId: 'user-a',
      expectedSessionId: mockSessionId,
      assertCurrent: expect.any(Function),
    }),
  );
  await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
  await hook.rerender({ ...props, date: '2026-10-04' });
  expect(load).toHaveBeenCalledTimes(1);
  expect(hook.result.current.loading).toBe(false);
});

for (const change of [
  { userId: 'user-b' },
  { workspaceId: 'workspace-b' },
  { date: '2026-10-05' },
]) {
  test(`scope change ${JSON.stringify(change)} hides old data and rejects stale responses`, async () => {
    const old = deferred();
    const next = deferred();
    load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const hook = await mount();
    if ('userId' in change && change.userId) mockUserId = change.userId;
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
  mockUserId = 'user-b';
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

test('same account login immediately clears data and rejects pending old snapshots', async () => {
  const old = deferred();
  load.mockReturnValueOnce(old.promise);
  const hook = await mount();
  await act(() => mockAuthListener?.('SIGNED_IN', null));
  await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
  await act(async () => old.resolve({ ...schedule, bookings: [] }));
  expect(hook.result.current.schedule).toBe(schedule);
});

for (const state of ['loading', 'failed'] as const) {
  test(`hides saved data when auth is ${state}`, async () => {
    const hook = await mount();
    await waitFor(() => expect(hook.result.current.schedule).toBe(schedule));
    if (state === 'loading') mockAuthLoading = true;
    else mockAuthFailed = true;
    await hook.rerender(props);
    expect(hook.result.current.schedule).toBeNull();
    await waitFor(() => expect(hook.result.current.failed).toBe(true));
    expect(load).toHaveBeenCalledTimes(1);
  });
}
