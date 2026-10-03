import type { SyncScope } from '@/domain/workout-sync/types';
const writers = new Map<string, Set<() => Promise<void>>>();
const key = (scope: SyncScope) => `${scope.accountId}:${scope.workspaceId}`;
export function registerEntryWriter(
  scope: SyncScope,
  flush: () => Promise<void>,
) {
  const scopeKey = key(scope);
  const registered = writers.get(scopeKey) ?? new Set<() => Promise<void>>();
  registered.add(flush);
  writers.set(scopeKey, registered);
  return () => {
    registered.delete(flush);
    if (!registered.size) writers.delete(scopeKey);
  };
}
export async function flushEntryWriters(scope: SyncScope | null) {
  if (scope)
    await Promise.all(
      [...(writers.get(key(scope)) ?? [])].map((flush) => flush()),
    );
}
