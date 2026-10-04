import { getSupabaseClient } from '@/features/auth/client';
import { scheduleSessionId, type ScheduleReadSession } from './read-session';
import { WorkspaceSchedulingError } from './service';

export function createBookingSessionFence(
  userId: string,
  isCurrent: () => boolean = () => true,
) {
  const client = getSupabaseClient();
  if (!client) throw new WorkspaceSchedulingError('configuration');
  let valid = true;
  let identity: string | null = null;
  let accessToken = '';
  const guard = () => {
    if (!valid || !isCurrent())
      throw new WorkspaceSchedulingError('unavailable');
  };
  const accepts = (session: ScheduleReadSession | null) =>
    session?.user.id.toLowerCase() === userId.toLowerCase() &&
    scheduleSessionId(session) !== null &&
    (identity === null || scheduleSessionId(session) === identity);
  const subscription = client.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'TOKEN_REFRESHED' && identity && accepts(session)) return;
    valid = false;
  }).data.subscription;
  const assertCurrent = async () => {
    guard();
    const response = await client.auth.getSession().catch(() => {
      valid = false;
      throw new WorkspaceSchedulingError('unavailable');
    });
    guard();
    const session = response.data.session;
    if (response.error || !session || !accepts(session)) {
      valid = false;
      throw new WorkspaceSchedulingError('unavailable');
    }
    identity = scheduleSessionId(session);
    accessToken = session.access_token;
  };
  return {
    client,
    guard,
    assertCurrent,
    get sessionId() {
      return identity;
    },
    get accessToken() {
      guard();
      return accessToken;
    },
    dispose() {
      valid = false;
      subscription.unsubscribe();
    },
  };
}
export type BookingSessionFence = ReturnType<typeof createBookingSessionFence>;
