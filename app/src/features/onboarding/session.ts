import { getSupabaseClient } from '@/features/auth/client';
import { clientCreationIdentity } from '@/features/workspace-clients/create-session';

export const onboardingIdentity = clientCreationIdentity;
export const onboardingFailure = () => new Error('Onboarding unavailable');
export type OnboardingScope = {
  userId: string;
  token: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};

export async function withOnboardingSession<T>(
  scope: OnboardingScope,
  run: (read: {
    client: NonNullable<ReturnType<typeof getSupabaseClient>>;
    userId: string;
    token: string;
    signal: AbortSignal;
    guard(): Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  if (!scope) throw onboardingFailure();
  const { token: capturedToken, signal: callerSignal, isCurrent } = scope;
  const identity = onboardingIdentity({
    user: { id: scope.userId },
    access_token: capturedToken,
  });
  if (!identity || callerSignal?.aborted) throw onboardingFailure();
  const client = getSupabaseClient();
  if (!client) throw onboardingFailure();
  let token = capturedToken;
  const verifiedTokens = new Set<string>([token]);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  callerSignal?.addEventListener('abort', cancel);
  if (callerSignal?.aborted) cancel();
  const matches = (session: unknown) => {
    const next = onboardingIdentity(session);
    return (
      next &&
      next.userId === identity.userId &&
      next.sessionId === identity.sessionId
    );
  };
  let subscription: { unsubscribe(): void };
  try {
    subscription = client.auth.onAuthStateChange((event, session) => {
      if (!matches(session) || event === 'SIGNED_IN' || event === 'SIGNED_OUT')
        cancel();
      else if (event === 'TOKEN_REFRESHED' && session) {
        token = session.access_token;
        verifiedTokens.add(token);
      } else if (event === 'INITIAL_SESSION') {
        if (token && (!session || !verifiedTokens.has(session.access_token)))
          cancel();
      } else if (session?.access_token !== token) cancel();
    }).data.subscription;
  } catch {
    cancel();
    callerSignal?.removeEventListener('abort', cancel);
    throw onboardingFailure();
  }
  const guard = async () => {
    if (abort.signal.aborted || isCurrent?.() === false)
      throw onboardingFailure();
    const result = await client.auth.getSession();
    const session = result.data.session;
    if (
      abort.signal.aborted ||
      isCurrent?.() === false ||
      result.error ||
      !matches(session) ||
      (token && (!session || !verifiedTokens.has(session.access_token)))
    ) {
      cancel();
      throw onboardingFailure();
    }
  };
  try {
    await guard();
    const result = await run({
      client,
      userId: identity.userId,
      token: capturedToken,
      signal: abort.signal,
      guard,
    });
    await guard();
    return result;
  } catch {
    await guard().catch(() => undefined);
    throw onboardingFailure();
  } finally {
    cancel();
    callerSignal?.removeEventListener('abort', cancel);
    try {
      subscription.unsubscribe();
    } catch {
      throw onboardingFailure();
    }
  }
}
