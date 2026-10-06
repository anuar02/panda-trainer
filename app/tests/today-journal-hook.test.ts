import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { SyncSession } from '@/domain/workout-sync/types';
import { useTodayFinishedBookingIds } from '@/features/workspace-scheduling/today-journal-hook';

const mockLoad = jest.fn();
const initialSession: SyncSession = {
  accountId: 'account-a',
  workspaceId: 'workspace-a',
  sessionId: 'session-a',
  accessToken: 'token-a',
};
let mockSession: SyncSession | null = initialSession;
jest.mock('@/features/workout-preload/provider', () => ({
  useOptionalWorkoutPreload: () => ({
    session: mockSession,
    getSession: () => mockSession,
    state: { context: null },
    syncState: null,
  }),
}));
jest.mock('@/features/workspace-scheduling/today-journal-service', () => ({
  loadTodayFinishedBookingIds: (...args: unknown[]) => mockLoad(...args),
}));
beforeEach(() => {
  mockSession = initialSession;
  mockLoad.mockReset();
});

test('clears visible completions immediately when account/workspace scope changes', async () => {
  mockLoad.mockResolvedValue(new Set(['booking-a']));
  const { result, rerender } = await renderHook(() =>
    useTodayFinishedBookingIds(['booking-a']),
  );
  await waitFor(() =>
    expect(result.current.finishedIds.has('booking-a')).toBe(true),
  );
  mockSession = {
    ...initialSession,
    accountId: 'account-b',
    workspaceId: 'workspace-b',
    sessionId: 'session-b',
  };
  mockLoad.mockImplementation(() => new Promise(() => {}));
  await rerender({});
  expect(result.current.finishedIds.size).toBe(0);
  expect(result.current.loading).toBe(true);
});

test('discards late journal response after logout', async () => {
  let resolve: ((ids: ReadonlySet<string>) => void) | undefined;
  mockLoad.mockImplementation(
    () =>
      new Promise<ReadonlySet<string>>((done) => {
        resolve = done;
      }),
  );
  const { result, rerender } = await renderHook(() =>
    useTodayFinishedBookingIds(['booking-a']),
  );
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
  mockSession = null;
  await rerender({});
  await act(async () => {
    resolve?.(new Set(['booking-a']));
  });
  expect(result.current.finishedIds.size).toBe(0);
  expect(result.current.scoped).toBe(false);
});

test('preserves last scoped completions on failed retry and exposes retry state', async () => {
  mockLoad.mockResolvedValueOnce(new Set(['booking-a']));
  const { result } = await renderHook(() =>
    useTodayFinishedBookingIds(['booking-a']),
  );
  await waitFor(() =>
    expect(result.current.finishedIds.has('booking-a')).toBe(true),
  );
  mockLoad.mockRejectedValueOnce(new Error('offline'));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.finishedIds.has('booking-a')).toBe(true);
  mockLoad.mockResolvedValueOnce(new Set(['booking-a', 'booking-b']));
  await act(async () => result.current.retry());
  await waitFor(() =>
    expect(result.current.finishedIds.has('booking-b')).toBe(true),
  );
  expect(result.current.failed).toBe(false);
});
