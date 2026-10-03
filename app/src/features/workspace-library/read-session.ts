import type { AuthChangeEvent } from '@supabase/supabase-js';

export type LibraryReadSession = {
  user: { id: string };
  access_token: string;
};
export type LibraryReadAuth = {
  getSession(): Promise<{
    data: { session: LibraryReadSession | null };
    error: unknown;
  }>;
  onAuthStateChange(
    listener: (
      event: AuthChangeEvent,
      session: LibraryReadSession | null,
    ) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
};
export class WorkspaceLibrarySessionError extends Error {
  constructor() {
    super('Library session changed or could not be verified');
    this.name = 'WorkspaceLibrarySessionError';
  }
}
const decodePayload = (value: string) => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new WorkspaceLibrarySessionError();
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
  if (bits !== 0) throw new WorkspaceLibrarySessionError();
  return decodeURIComponent(encoded);
};
export function librarySessionId(
  session: LibraryReadSession | null,
): string | null {
  if (
    typeof session?.access_token !== 'string' ||
    typeof session?.user?.id !== 'string'
  )
    return null;
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
export async function createWorkspaceLibraryReadFence(
  auth: LibraryReadAuth,
  expected?: { userId: string; workspaceId: string; sessionId?: string },
  isCurrent: () => boolean = () => true,
) {
  let valid = true;
  let accessToken = '';
  let verifiedToken = '';
  let identity: { userId: string; sessionId: string } | null = null;
  let subscription: { unsubscribe(): void };
  try {
    subscription = auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (
        event === 'TOKEN_REFRESHED' &&
        identity &&
        session?.user?.id === identity.userId &&
        librarySessionId(session) === identity.sessionId
      ) {
        verifiedToken = session.access_token;
        return;
      }
      valid = false;
    }).data.subscription;
  } catch {
    throw new WorkspaceLibrarySessionError();
  }
  const dispose = () => {
    valid = false;
    try {
      subscription.unsubscribe();
    } catch {
      valid = false;
    }
  };
  const assertCurrent = async () => {
    try {
      if (!valid || !isCurrent()) throw new WorkspaceLibrarySessionError();
      const result = await auth.getSession();
      const session = result.data.session;
      const sessionId = librarySessionId(session);
      if (
        result.error ||
        !valid ||
        !isCurrent() ||
        !session ||
        !sessionId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          session.user.id,
        ) ||
        (expected && session.user.id !== expected.userId) ||
        (expected?.sessionId && sessionId !== expected.sessionId) ||
        (identity && session.access_token !== verifiedToken) ||
        (identity &&
          (session.user.id !== identity.userId ||
            sessionId !== identity.sessionId))
      )
        throw new WorkspaceLibrarySessionError();
      if (!identity) {
        accessToken = session.access_token;
        verifiedToken = session.access_token;
      }
      identity = { userId: session.user.id, sessionId };
    } catch {
      valid = false;
      throw new WorkspaceLibrarySessionError();
    }
  };
  try {
    await assertCurrent();
    return { assertCurrent, dispose, userId: identity!.userId, accessToken };
  } catch {
    dispose();
    throw new WorkspaceLibrarySessionError();
  }
}
