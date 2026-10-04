import { getSupabaseClient } from '@/features/auth/client';

type SessionIdentity = { userId: string; sessionId: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const clientCreationIdentity = (
  session: unknown,
): SessionIdentity | null => {
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

export type ClientCreateScope = {
  userId: string;
  workspaceId: string;
  token: string;
  signal?: AbortSignal;
};

export async function withClientCreation<T>(
  scope: ClientCreateScope | undefined,
  run: (
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    token: string,
    workspaceId: string,
    guard: () => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const client = getSupabaseClient();
  const failure = () => new Error('Client creation unavailable');
  if (!client) throw failure();
  let valid = !scope?.signal?.aborted;
  let identity = scope
    ? clientCreationIdentity({
        user: { id: scope.userId },
        access_token: scope.token,
      })
    : null;
  let token = scope?.token;
  if (scope && (!identity || !uuidPattern.test(scope.workspaceId)))
    throw failure();
  const cancel = () => {
    valid = false;
  };
  scope?.signal?.addEventListener('abort', cancel);
  const matches = (session: unknown) => {
    const next = clientCreationIdentity(session);
    return (
      next &&
      (!identity ||
        (next.userId === identity.userId &&
          next.sessionId === identity.sessionId))
    );
  };
  const subscription = client.auth.onAuthStateChange((event, session) => {
    if (!matches(session) || event === 'SIGNED_OUT' || event === 'SIGNED_IN')
      cancel();
    else if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (
        event === 'INITIAL_SESSION' &&
        token &&
        session?.access_token !== token
      )
        cancel();
      else {
        identity ??= clientCreationIdentity(session);
        token = session?.access_token;
      }
    } else if (session?.access_token !== token) cancel();
  }).data.subscription;
  const guard = async () => {
    if (!valid) throw failure();
    const result = await client.auth.getSession().catch(() => {
      cancel();
      throw failure();
    });
    if (
      !valid ||
      result.error ||
      !matches(result.data.session) ||
      (token && result.data.session?.access_token !== token)
    ) {
      cancel();
      throw failure();
    }
    identity ??= clientCreationIdentity(result.data.session);
    token ??= result.data.session?.access_token;
    if (!token) throw failure();
  };
  try {
    await guard();
    const owner = await client
      .from('trainer_workspaces')
      .select('id,owner_user_id')
      .eq('owner_user_id', identity!.userId)
      .setHeader('Authorization', `Bearer ${token}`)
      .maybeSingle();
    await guard();
    if (
      owner.error ||
      !owner.data ||
      owner.data.owner_user_id !== identity!.userId ||
      !uuidPattern.test(owner.data.id) ||
      (scope && owner.data.id !== scope.workspaceId)
    )
      throw failure();
    await guard();
    const result = await run(client, token!, owner.data.id, guard);
    await guard();
    return result;
  } catch {
    await guard();
    throw failure();
  } finally {
    cancel();
    subscription.unsubscribe();
    scope?.signal?.removeEventListener('abort', cancel);
  }
}
