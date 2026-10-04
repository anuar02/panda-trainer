import { getSupabaseClient } from '@/features/auth/client';
import { clientCreationIdentity } from '@/features/workspace-clients/create-session';

export const invitationIdentity = clientCreationIdentity;
export type InvitationScope = {
  userId: string;
  token: string;
  workspaceId?: string;
  clientRecordId?: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};
export class InvitationSessionError extends Error {
  constructor() {
    super('Invitation session unavailable');
    this.name = 'InvitationSessionError';
  }
}
export const invitationSessionFailure = () => new InvitationSessionError();

export function createInvitationFence(scope: InvitationScope) {
  scope = { ...scope };
  const identity = invitationIdentity({
    user: { id: scope?.userId },
    access_token: scope?.token,
  });
  const client = getSupabaseClient();
  if (!identity || !client || scope.signal?.aborted)
    throw invitationSessionFailure();
  const abort = new AbortController();
  const tokens = new Set([scope.token]);
  let bearer = scope.token;
  const cancel = () => abort.abort();
  scope.signal?.addEventListener('abort', cancel);
  const current = () => !abort.signal.aborted && scope.isCurrent?.() !== false;
  const matches = (session: unknown) => {
    const next = invitationIdentity(session);
    return (
      next?.userId === identity.userId && next.sessionId === identity.sessionId
    );
  };
  let subscription: { unsubscribe(): void };
  try {
    subscription = client.auth.onAuthStateChange((event, session) => {
      if (!matches(session) || event === 'SIGNED_IN' || event === 'SIGNED_OUT')
        cancel();
      else if (event === 'TOKEN_REFRESHED' && session) {
        bearer = session.access_token;
        tokens.add(bearer);
      } else if (!session || !tokens.has(session.access_token)) cancel();
    }).data.subscription;
  } catch {
    cancel();
    scope.signal?.removeEventListener('abort', cancel);
    throw invitationSessionFailure();
  }
  const guard = async () => {
    if (!current()) throw invitationSessionFailure();
    try {
      const result = await client.auth.getSession();
      if (
        !current() ||
        result.error ||
        !matches(result.data.session) ||
        !result.data.session ||
        !tokens.has(result.data.session.access_token)
      )
        throw invitationSessionFailure();
    } catch {
      cancel();
      throw invitationSessionFailure();
    }
  };
  const verify = async () => {
    await guard();
    let result: Awaited<ReturnType<typeof client.auth.getUser>>;
    try {
      result = await client.auth.getUser(bearer);
    } catch {
      await guard();
      throw new Error('Invitation authentication unavailable');
    }
    await guard();
    if (result.error) throw new Error('Invitation authentication unavailable');
    if (result.data.user?.id !== identity.userId)
      throw invitationSessionFailure();
  };
  const dispose = () => {
    cancel();
    scope.signal?.removeEventListener('abort', cancel);
    try {
      subscription.unsubscribe();
    } catch {
      cancel();
    }
  };
  return {
    client,
    guard,
    verify,
    current,
    dispose,
    signal: abort.signal,
    get bearer() {
      return bearer;
    },
  };
}
export type InvitationFence = ReturnType<typeof createInvitationFence>;
