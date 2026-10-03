import type { AuthChangeEvent } from '@supabase/supabase-js';

export type ScheduleReadSession = {
  user: { id: string };
  access_token: string;
};
export type ScheduleReadAuth = {
  getSession(): Promise<{
    data: { session: ScheduleReadSession | null };
    error: unknown;
  }>;
  onAuthStateChange(
    listener: (
      event: AuthChangeEvent,
      session: ScheduleReadSession | null,
    ) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
};
export class WorkspaceScheduleSessionError extends Error {
  constructor() {
    super('Schedule session changed or could not be verified');
    this.name = 'WorkspaceScheduleSessionError';
  }
}
const decodePayload = (value: string) => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new WorkspaceScheduleSessionError();
  let bits = 0;
  let count = 0;
  let encoded = '';
  for (const character of value) {
    bits = (bits << 6) | alphabet.indexOf(character);
    count += 6;
    if (count >= 8) {
      count -= 8;
      encoded += `%${((bits >> count) & 255).toString(16).padStart(2, '0')}`;
      bits &= (1 << count) - 1;
    }
  }
  if (bits !== 0) throw new WorkspaceScheduleSessionError();
  return decodeURIComponent(encoded);
};
export function scheduleSessionId(
  session: ScheduleReadSession | null,
): string | null {
  if (!session?.access_token) return null;
  try {
    const parts = session.access_token.split('.');
    const payloadSegment = parts[1];
    if (parts.length !== 3 || !payloadSegment) return null;
    const payload: unknown = JSON.parse(decodePayload(payloadSegment));
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    )
      return null;
    const claims = payload as Record<string, unknown>;
    return typeof claims.session_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        claims.session_id,
      ) &&
      claims.sub === session.user.id
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}
export async function createWorkspaceScheduleReadFence(
  auth: ScheduleReadAuth,
  expected?: { userId: string; workspaceId: string; sessionId?: string },
  isCurrent: () => boolean = () => true,
) {
  let valid = true;
  let accessToken = '';
  let identity: { userId: string; sessionId: string } | null = null;
  const subscription = auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (
      event === 'TOKEN_REFRESHED' &&
      identity &&
      session?.user.id === identity.userId &&
      scheduleSessionId(session) === identity.sessionId
    )
      return;
    valid = false;
  }).data.subscription;
  const dispose = () => {
    valid = false;
    subscription.unsubscribe();
  };
  const assertCurrent = async () => {
    if (!valid || !isCurrent()) throw new WorkspaceScheduleSessionError();
    const result = await auth.getSession();
    const session = result.data.session;
    const sessionId = scheduleSessionId(session);
    if (
      result.error ||
      !valid ||
      !isCurrent() ||
      !session ||
      !sessionId ||
      (expected && session.user.id !== expected.userId) ||
      (expected?.sessionId && sessionId !== expected.sessionId) ||
      (identity &&
        (session.user.id !== identity.userId ||
          sessionId !== identity.sessionId))
    )
      throw new WorkspaceScheduleSessionError();
    if (!identity) accessToken = session.access_token;
    identity = { userId: session.user.id, sessionId };
  };
  try {
    await assertCurrent();
    return { assertCurrent, dispose, userId: identity!.userId, accessToken };
  } catch (error) {
    dispose();
    throw error;
  }
}
