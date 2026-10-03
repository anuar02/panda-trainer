import { getSupabaseClient } from '@/features/auth/client';

export type AssignmentSession = {
  valid(): boolean;
  token(expectedUserId?: string): Promise<string>;
  dispose(): void;
};

export function openAssignmentSession(
  expectedUserId: string,
  onInvalidated: (canResume?: boolean) => void = () => {},
): AssignmentSession {
  const client = getSupabaseClient();
  if (!client) throw new Error('Assignment session unavailable');
  const userId = expectedUserId.toLowerCase();
  let active = true;
  let disposed = false;
  let accessToken: string | null = null;
  const invalidate = (canResume = false) => {
    if (!active) return;
    active = false;
    accessToken = null;
    onInvalidated(canResume);
  };
  const subscription = client?.auth.onAuthStateChange((event, session) => {
    if (disposed) return;
    if (!active) {
      if (session?.access_token && session.user.id.toLowerCase() === userId)
        onInvalidated(true);
      return;
    }
    if (
      !session?.access_token ||
      session.user.id.toLowerCase() !== userId ||
      event === 'SIGNED_OUT' ||
      event === 'SIGNED_IN' ||
      (accessToken !== null &&
        session.access_token !== accessToken &&
        event !== 'TOKEN_REFRESHED')
    ) {
      invalidate(
        !!session?.access_token && session.user.id.toLowerCase() === userId,
      );
      return;
    }
    accessToken = session.access_token;
  }).data.subscription;
  return {
    valid: () => active && !disposed,
    token: async (actor = expectedUserId) => {
      if (!active || disposed || !client || actor.toLowerCase() !== userId)
        throw new Error('Assignment session unavailable');
      const current = await client.auth.getSession();
      const session = current.data.session;
      if (
        !active ||
        disposed ||
        current.error ||
        !session?.access_token ||
        session.user.id.toLowerCase() !== userId ||
        (accessToken !== null && accessToken !== session.access_token)
      ) {
        invalidate();
        throw new Error('Assignment session unavailable');
      }
      accessToken = session.access_token;
      return accessToken;
    },
    dispose: () => {
      disposed = true;
      active = false;
      accessToken = null;
      subscription?.unsubscribe();
    },
  };
}
