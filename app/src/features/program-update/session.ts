import { getSupabaseClient } from '@/features/auth/client';

export type ProgramUpdateSession = {
  valid(): boolean;
  token(expectedUserId?: string): Promise<string>;
  dispose(): void;
};

type SessionIdentity = { userId: string; sessionId: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sessionIdentity = (session: unknown): SessionIdentity | null => {
  if (typeof session !== 'object' || session === null) return null;
  const value = session as Record<string, unknown>;
  if (typeof value.access_token !== 'string') return null;
  if (typeof value.user !== 'object' || value.user === null) return null;
  const user = value.user as Record<string, unknown>;
  if (typeof user.id !== 'string' || !uuidPattern.test(user.id)) return null;
  try {
    const parts = value.access_token.split('.');
    const segment = parts[1];
    if (
      parts.length !== 3 ||
      !parts[0] ||
      !parts[2] ||
      !segment ||
      !/^[A-Za-z0-9_-]+$/.test(segment) ||
      segment.length % 4 === 1
    )
      return null;
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let bits = 0;
    let count = 0;
    let encoded = '';
    for (const character of segment) {
      bits = (bits << 6) | alphabet.indexOf(character);
      count += 6;
      if (count >= 8) {
        count -= 8;
        encoded += `%${((bits >> count) & 255).toString(16).padStart(2, '0')}`;
        bits &= (1 << count) - 1;
      }
    }
    if (bits !== 0) return null;
    const payload: unknown = JSON.parse(decodeURIComponent(encoded));
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    )
      return null;
    const claims = payload as Record<string, unknown>;
    if (
      claims.sub !== user.id ||
      typeof claims.session_id !== 'string' ||
      !uuidPattern.test(claims.session_id)
    )
      return null;
    return {
      userId: user.id.toLowerCase(),
      sessionId: claims.session_id.toLowerCase(),
    };
  } catch {
    return null;
  }
};

export function openProgramUpdateSession(
  expectedUserId: string,
  expectedSessionId: string,
  onInvalidated: (canResume?: boolean) => void = () => {},
): ProgramUpdateSession {
  const client = getSupabaseClient();
  if (!client) throw new Error('ProgramUpdate session unavailable');
  const userId = expectedUserId.toLowerCase();
  let active = true;
  let disposed = false;
  let identity: SessionIdentity | null = null;
  let verifiedAccessToken: string | null = null;
  const invalidate = (canResume = false) => {
    if (!active || disposed) return;
    active = false;
    verifiedAccessToken = null;
    onInvalidated(canResume);
  };
  const matches = (next: SessionIdentity | null) =>
    next !== null &&
    next.userId === userId &&
    next.sessionId === expectedSessionId.toLowerCase() &&
    (!identity ||
      (next.userId === identity.userId &&
        next.sessionId === identity.sessionId));
  const capture = (next: SessionIdentity | null) => {
    if (!active || disposed || !matches(next)) {
      invalidate();
      throw new Error('ProgramUpdate session unavailable');
    }
    identity ??= next;
  };
  const initialRequest = client.auth.getSession();
  const initial = initialRequest.then(
    (current) => {
      if (current.error) {
        invalidate();
        return false;
      }
      try {
        capture(sessionIdentity(current.data.session));
        verifiedAccessToken ??= current.data.session?.access_token ?? null;
        return true;
      } catch {
        return false;
      }
    },
    () => {
      invalidate();
      return false;
    },
  );
  let subscription: { unsubscribe(): void };
  try {
    subscription = client.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      const next = sessionIdentity(session);
      const canResume = next !== null && next.userId === userId;
      if (!active) {
        if (canResume) onInvalidated(true);
        return;
      }
      if (
        !matches(next) ||
        event === 'SIGNED_OUT' ||
        event === 'SIGNED_IN' ||
        (verifiedAccessToken !== null &&
          session?.access_token !== verifiedAccessToken &&
          event !== 'TOKEN_REFRESHED')
      ) {
        invalidate(canResume);
        return;
      }
      identity ??= next;
      verifiedAccessToken = session?.access_token ?? null;
    }).data.subscription;
  } catch {
    disposed = true;
    active = false;
    throw new Error('ProgramUpdate session unavailable');
  }
  return {
    valid: () => active && !disposed,
    token: async (actor = expectedUserId) => {
      if (!active || disposed || actor.toLowerCase() !== userId)
        throw new Error('ProgramUpdate session unavailable');
      if (!(await initial) || !active || disposed)
        throw new Error('ProgramUpdate session unavailable');
      try {
        const current = await client.auth.getSession();
        if (current.error) throw new Error('ProgramUpdate session unavailable');
        capture(sessionIdentity(current.data.session));
        const accessToken = current.data.session?.access_token;
        if (!accessToken || accessToken !== verifiedAccessToken)
          throw new Error('ProgramUpdate session unavailable');
        return accessToken;
      } catch {
        invalidate();
        throw new Error('ProgramUpdate session unavailable');
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      active = false;
      identity = null;
      verifiedAccessToken = null;
      try {
        subscription.unsubscribe();
      } catch {
        active = false;
      }
    },
  };
}
