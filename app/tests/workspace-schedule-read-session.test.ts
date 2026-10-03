import type { AuthChangeEvent } from '@supabase/supabase-js';
import {
  createWorkspaceScheduleReadFence,
  scheduleSessionId,
  type ScheduleReadSession,
} from '../src/features/workspace-scheduling/read-session';
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session = (
  id = sessionId,
  suffix = 'signature',
): ScheduleReadSession => ({
  user: { id: userId },
  access_token: `header.${Buffer.from(JSON.stringify({ sub: userId, session_id: id })).toString('base64url')}.${suffix}`,
});
function fixture() {
  let current: ScheduleReadSession | null = session();
  let listener!: (
    event: AuthChangeEvent,
    value: ScheduleReadSession | null,
  ) => void;
  const unsubscribe = jest.fn();
  const auth = {
    getSession: jest.fn(async () => ({
      data: { session: current },
      error: null,
    })),
    onAuthStateChange: (next: typeof listener) => {
      listener = next;
      return { data: { subscription: { unsubscribe } } };
    },
  };
  return {
    auth,
    unsubscribe,
    change(value: ScheduleReadSession | null, event?: AuthChangeEvent) {
      current = value;
      if (event) listener(event, value);
    },
  };
}
test('pins token while accepting verified refresh of the same login', async () => {
  const f = fixture();
  const fence = await createWorkspaceScheduleReadFence(f.auth, {
    userId,
    workspaceId: 'workspace',
  });
  const token = fence.accessToken;
  f.change(session(sessionId, 'refreshed'), 'TOKEN_REFRESHED');
  await expect(fence.assertCurrent()).resolves.toBeUndefined();
  expect(fence.accessToken).toBe(token);
  fence.dispose();
  expect(f.unsubscribe).toHaveBeenCalledTimes(1);
});
test.each(['SIGNED_IN', 'SIGNED_OUT'] as const)(
  'invalidates on %s even when actor and token are unchanged',
  async (event) => {
    const f = fixture();
    const fence = await createWorkspaceScheduleReadFence(f.auth);
    f.change(session(), event);
    await expect(fence.assertCurrent()).rejects.toThrow(
      'Schedule session changed',
    );
    fence.dispose();
  },
);
test('detects a new same account login without an event', async () => {
  const f = fixture();
  const fence = await createWorkspaceScheduleReadFence(f.auth);
  f.change(session('cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
  await expect(fence.assertCurrent()).rejects.toThrow();
  fence.dispose();
});
test('fails closed for unknown identity and mismatched expected actor', async () => {
  const f = fixture();
  f.change({ user: { id: userId }, access_token: 'opaque' });
  await expect(createWorkspaceScheduleReadFence(f.auth)).rejects.toThrow();
  expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  f.change(session());
  await expect(
    createWorkspaceScheduleReadFence(f.auth, {
      userId: 'other',
      workspaceId: 'workspace',
    }),
  ).rejects.toThrow();
  expect(
    scheduleSessionId({
      user: { id: 'other' },
      access_token: session().access_token,
    }),
  ).toBeNull();
});
test('detects cancellation while auth validation is in flight', async () => {
  const f = fixture();
  let active = true;
  const fence = await createWorkspaceScheduleReadFence(
    f.auth,
    undefined,
    () => active,
  );
  let resolve!: (value: Awaited<ReturnType<typeof f.auth.getSession>>) => void;
  f.auth.getSession.mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  const checking = fence.assertCurrent();
  active = false;
  resolve({ data: { session: session() }, error: null });
  await expect(checking).rejects.toThrow();
  fence.dispose();
});
