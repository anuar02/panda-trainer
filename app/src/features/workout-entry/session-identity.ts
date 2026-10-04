import type { SyncSession } from '@/domain/workout-sync/types';

const sessionIdentities = new WeakMap<
  SyncSession,
  { snapshot: SyncSession; identity: number }
>();
let nextSessionIdentity = 0;
let latestIdentity: { snapshot: SyncSession; identity: number } | undefined;
function sameSession(first: SyncSession | undefined, second: SyncSession) {
  return (
    first?.accountId === second.accountId &&
    first.workspaceId === second.workspaceId &&
    first.sessionId === second.sessionId &&
    first.accessToken === second.accessToken
  );
}
export function entrySessionIdentity(session: SyncSession | null) {
  if (!session) {
    latestIdentity = undefined;
    return null;
  }
  const existing = sessionIdentities.get(session);
  if (sameSession(existing?.snapshot, session)) {
    latestIdentity = existing;
    return existing!.identity;
  }
  const identity = sameSession(latestIdentity?.snapshot, session)
    ? latestIdentity!.identity
    : ++nextSessionIdentity;
  const value = { snapshot: { ...session }, identity };
  sessionIdentities.set(session, value);
  latestIdentity = value;
  return identity;
}
