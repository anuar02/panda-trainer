import { openPush } from '@/features/push/open-service';
import { withOnboardingSession } from '@/features/onboarding/session';
jest.mock('@/features/onboarding/session', () => ({
  withOnboardingSession: jest.fn(),
}));
const payload = {
  notificationId: '59000000-0000-4000-8000-000000000001',
  workspaceId: '69000000-0000-4000-8000-000000000001',
};
const scope = { userId: 'owner', token: 'captured-bearer' };
const target = {
  role: 'client',
  kind: 'booking_confirmed',
  target: {
    available: true,
    target_type: 'booking',
    target_id: '79000000-0000-4000-8000-000000000001',
    client_record_id: '89000000-0000-4000-8000-000000000001',
    current: { date: '2026-10-04', status: 'confirmed' },
  },
};
const fixture = (data: unknown, error: { code: string } | null = null) => {
  const guard = jest.fn(async () => undefined);
  const abortSignal = jest.fn(async () => ({ data, error }));
  const setHeader = jest.fn(() => ({ abortSignal }));
  const rpc = jest.fn(() => ({ setHeader }));
  jest.mocked(withOnboardingSession).mockImplementation(async (_scope, run) =>
    run({
      client: { rpc } as unknown as Parameters<
        Parameters<typeof withOnboardingSession>[1]
      >[0]['client'],
      userId: scope.userId,
      token: scope.token,
      signal: new AbortController().signal,
      guard,
    }),
  );
  return { rpc, setHeader, guard };
};
afterEach(() => jest.resetAllMocks());
test('authorized native open repeats server fence and accepts only safe current target', async () => {
  const network = fixture(target);
  const result = await openPush(scope, payload);
  expect(result).toEqual({
    role: 'client',
    kind: 'booking_confirmed',
    clientRecordId: target.target.client_record_id,
    bookingId: target.target.target_id,
    date: '2026-10-04',
    cancelled: false,
  });
  expect(network.rpc).toHaveBeenCalledWith('open_push_notification', {
    p_workspace_id: payload.workspaceId,
    p_notification_id: payload.notificationId,
  });
  expect(network.setHeader).toHaveBeenCalledWith(
    'Authorization',
    'Bearer captured-bearer',
  );
  expect(network.guard).toHaveBeenCalled();
});
test.each(['P0002', '42501'])(
  'unknown, deleted or foreign object gives unavailable %s',
  async (code) => {
    fixture(null, { code });
    expect(await openPush(scope, payload)).toBeNull();
  },
);
test('unavailable and cancelled own objects are honest; daily plan remains schedule route', async () => {
  fixture({ ...target, target: { ...target.target, available: false } });
  expect(await openPush(scope, payload)).toBeNull();
  fixture({
    ...target,
    target: {
      ...target.target,
      current: { date: '2026-10-04', status: 'cancelled_by_trainer' },
    },
  });
  expect((await openPush(scope, payload))?.cancelled).toBe(true);
  fixture({
    ...target,
    kind: 'daily_plan',
    role: 'trainer',
    target: {
      ...target.target,
      current: { date: '2026-10-04', status: 'cancelled_by_trainer' },
    },
  });
  expect((await openPush(scope, payload))?.cancelled).toBe(false);
});
test.each([
  null,
  { ...target, role: 'foreign' },
  { ...target, target: { ...target.target, target_id: 'bad' } },
  { ...target, target: { ...target.target, target_type: 'workout' } },
])('malformed server response fails without routing', async (data) => {
  fixture(data);
  await expect(openPush(scope, payload)).rejects.toThrow('Push unavailable');
});
