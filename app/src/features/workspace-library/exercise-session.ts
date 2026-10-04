import {
  librarySessionId,
  WorkspaceLibrarySessionError,
  type LibraryReadAuth,
} from './read-session';

export async function createWorkspaceExerciseFence(
  auth: LibraryReadAuth,
  expected?: { userId: string; workspaceId: string; sessionId?: string },
  isCurrent: () => boolean = () => true,
) {
  let valid = true;
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
        verifiedToken = session.access_token;
      }
      identity = { userId: session.user.id, sessionId };
    } catch {
      dispose();
      throw new WorkspaceLibrarySessionError();
    }
  };
  try {
    await assertCurrent();
    return {
      assertCurrent,
      dispose,
      userId: identity!.userId,
      get accessToken() {
        return verifiedToken;
      },
    };
  } catch {
    dispose();
    throw new WorkspaceLibrarySessionError();
  }
}
