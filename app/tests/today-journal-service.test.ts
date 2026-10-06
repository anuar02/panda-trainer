import { loadTodayFinishedBookingIds } from '@/features/workspace-scheduling/today-journal-service';
import type { SyncSession } from '@/domain/workout-sync/types';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const accountId = '10000000-0000-4000-8000-000000000002';
const bookingId = '10000000-0000-4000-8000-000000000003';
const authSessionId = '10000000-0000-4000-8000-000000000004';
const accessToken = `header.${Buffer.from(JSON.stringify({ sub: accountId, session_id: authSessionId })).toString('base64url')}.signature`;
const session: SyncSession = {
  accountId,
  workspaceId,
  sessionId: 'preload-generation',
  accessToken,
};
const mockUnsubscribe = jest.fn();
const mockGetSession = jest.fn();
const mockRange = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockQuery = {
  select: mockSelect,
  eq: mockEq,
  in: mockIn,
  not: jest.fn(),
  order: jest.fn(),
  range: mockRange,
};
jest.mock('@/features/auth/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      }),
    },
    from: mockFrom,
  }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: accountId }, access_token: accessToken } },
    error: null,
  });
  mockFrom.mockReturnValue(mockQuery);
  for (const method of [
    mockSelect,
    mockEq,
    mockIn,
    mockQuery.not,
    mockQuery.order,
  ])
    method.mockReturnValue(mockQuery);
  mockRange.mockResolvedValue({
    data: [
      {
        booking_id: bookingId,
        workspace_id: workspaceId,
        finished_at: '2026-10-05T15:30:00Z',
      },
    ],
    error: null,
  });
});

test('reads finished journals by requested bookings within authenticated workspace', async () => {
  const ids = await loadTodayFinishedBookingIds(
    session,
    [bookingId, bookingId],
    () => true,
  );
  expect([...ids]).toEqual([bookingId]);
  expect(mockFrom).toHaveBeenCalledWith('workout_instances');
  expect(mockEq).toHaveBeenCalledWith('workspace_id', workspaceId);
  expect(mockIn).toHaveBeenCalledWith('booking_id', [bookingId]);
  expect(mockQuery.not).toHaveBeenCalledWith('finished_at', 'is', null);
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test.each([
  {
    booking_id: bookingId,
    workspace_id: accountId,
    finished_at: '2026-10-05T15:30:00Z',
  },
  {
    booking_id: accountId,
    workspace_id: workspaceId,
    finished_at: '2026-10-05T15:30:00Z',
  },
  { booking_id: bookingId, workspace_id: workspaceId, finished_at: null },
  { booking_id: bookingId, workspace_id: workspaceId, finished_at: 'invalid' },
])('rejects foreign or malformed completion rows %#', async (row) => {
  mockRange.mockResolvedValue({ data: [row], error: null });
  await expect(
    loadTodayFinishedBookingIds(session, [bookingId], () => true),
  ).rejects.toThrow('Invalid Today journal row');
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test('rejects completion read after caller changes while request is pending', async () => {
  let current = true;
  mockRange.mockImplementation(async () => {
    current = false;
    return { data: [], error: null };
  });
  await expect(
    loadTodayFinishedBookingIds(session, [bookingId], () => current),
  ).rejects.toThrow('Schedule session changed');
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test('rejects a different signed-in account before querying journals', async () => {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: bookingId }, access_token: accessToken } },
    error: null,
  });
  await expect(
    loadTodayFinishedBookingIds(session, [bookingId], () => true),
  ).rejects.toThrow('Schedule session changed');
  expect(mockFrom).not.toHaveBeenCalled();
});

test('does not treat failed journal reads as empty success', async () => {
  mockRange.mockResolvedValue({ data: null, error: { message: 'offline' } });
  await expect(
    loadTodayFinishedBookingIds(session, [bookingId], () => true),
  ).rejects.toThrow('Today journals could not be loaded');
});
