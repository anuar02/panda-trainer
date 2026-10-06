import {
  createProgramReadFence,
  programSessionId,
  type ProgramReadSession,
} from '../src/features/client-program/program-read-session';
import type { AuthChangeEvent } from '@supabase/supabase-js';
const user = '11000000-0000-4000-8000-000000000001';
const sid = '51000000-0000-4000-8000-000000000001';
const session = (revision = 1): ProgramReadSession => ({
  user: { id: user },
  access_token: `header.${Buffer.from(JSON.stringify({ sub: user, session_id: sid, revision })).toString('base64url')}.signature`,
});
function setup() {
  let current: ProgramReadSession | null = session();
  let listener!: (
    event: AuthChangeEvent,
    value: ProgramReadSession | null,
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
    set: (value: typeof current) => {
      current = value;
    },
    emit: (event: AuthChangeEvent) => listener(event, current),
  };
}
test.each([
  null,
  { user: { id: user }, access_token: 'opaque' },
  { user: { id: user }, access_token: 'h.e30.s' },
  { ...session(), user: { id: sid } },
])('unverifiable identity returns null %p', (value) => {
  expect(programSessionId(value)).toBeNull();
});
test('silent token replacement with same session id fails closed and disposal closes guard', async () => {
  const fixture = setup();
  const fence = await createProgramReadFence(fixture.auth, { userId: user });
  fixture.set(session(2));
  await expect(fence.assertCurrent()).rejects.toThrow('Program session');
  fence.dispose();
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
  expect(() => fence.checkCurrent()).toThrow();
});
test('verified refresh permits new token while requests keep original bearer', async () => {
  const fixture = setup();
  const fence = await createProgramReadFence(fixture.auth, {
    userId: user,
    sessionId: sid,
  });
  fixture.set(session(2));
  fixture.emit('TOKEN_REFRESHED');
  await expect(fence.assertCurrent()).resolves.toBeUndefined();
  expect(fence.accessToken).toBe(session().access_token);
  fence.dispose();
});
test('expected session mismatch disposes before read', async () => {
  const fixture = setup();
  await expect(
    createProgramReadFence(fixture.auth, { userId: user, sessionId: user }),
  ).rejects.toThrow();
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
});
test('session switch during final getSession is checked after await', async () => {
  const fixture = setup();
  const fence = await createProgramReadFence(fixture.auth, { userId: user });
  fixture.auth.getSession.mockImplementationOnce(async () => {
    fixture.emit('SIGNED_IN');
    return { data: { session: session() }, error: null };
  });
  await expect(fence.assertCurrent()).rejects.toThrow();
  fence.dispose();
});
