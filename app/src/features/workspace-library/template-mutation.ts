import { librarySessionId, type LibraryReadAuth } from './read-session';

export type TemplateMutationScope = {
  userId: string;
  sessionId?: string;
  isCurrent?: () => boolean;
};

export function templateMutation<T>(
  auth: LibraryReadAuth,
  scope: TemplateMutationScope | undefined,
  unavailable: () => Error,
  run: (accessToken: string) => Promise<T>,
  sanitize: (error: unknown) => Error,
) {
  let valid = true;
  let identity: { userId: string; sessionId: string } | null = null;
  let subscription: { unsubscribe(): void } | undefined;
  const dispose = () => {
    valid = false;
    try {
      subscription?.unsubscribe();
    } catch {
      valid = false;
    }
  };
  try {
    subscription = auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (
        event === 'TOKEN_REFRESHED' &&
        identity &&
        session?.user.id === identity.userId &&
        librarySessionId(session) === identity.sessionId
      )
        return;
      valid = false;
      dispose();
    }).data.subscription;
  } catch {
    throw unavailable();
  }
  const verify = async () => {
    try {
      if (!valid || scope?.isCurrent?.() === false) throw unavailable();
      const result = await auth.getSession();
      const session = result.data.session;
      const sessionId = librarySessionId(session);
      if (
        result.error ||
        !valid ||
        scope?.isCurrent?.() === false ||
        !session ||
        !sessionId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          session.user.id,
        ) ||
        (scope && session.user.id !== scope.userId) ||
        (scope?.sessionId && sessionId !== scope.sessionId) ||
        (identity &&
          (identity.userId !== session.user.id ||
            identity.sessionId !== sessionId))
      )
        throw unavailable();
      identity = { userId: session.user.id, sessionId };
      return session.access_token;
    } catch {
      valid = false;
      dispose();
      throw unavailable();
    }
  };
  const captured = verify().then(
    () => true,
    () => false,
  );
  let cached: T | undefined;
  let completed = false;
  let pending: Promise<T> | null = null;
  return {
    dispose,
    execute: async (): Promise<T> => {
      if (!(await captured)) throw unavailable();
      const token = await verify();
      if (!valid || scope?.isCurrent?.() === false) throw unavailable();
      if (completed) {
        await verify();
        return cached as T;
      }
      if (!pending) {
        pending = (async () => {
          try {
            const result = await run(token);
            await verify();
            cached = result;
            completed = true;
            return result;
          } catch (error) {
            await verify();
            throw sanitize(error);
          } finally {
            pending = null;
          }
        })();
      }
      const result = await pending;
      await verify();
      return result;
    },
  };
}
