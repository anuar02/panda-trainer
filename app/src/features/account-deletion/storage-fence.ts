import AsyncStorage from '@react-native-async-storage/async-storage';
import { boundedExportStep } from '@/features/account-export/service';
import { readConfirmedDeletion } from './pending';
const blocked = new Set<string>();
const running = new Map<string, Set<Promise<void>>>();
const ready = readConfirmedDeletion().then((intent) => {
  if (intent) blocked.add(intent.accountId);
});
void ready.catch(() => {});
function accounts(keys: readonly string[]): string[] {
  return [
    ...new Set(
      keys.flatMap((key) => {
        const accountId = key.split(':')[1];
        return key.startsWith('panda-trainer-') &&
          accountId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            accountId,
          )
          ? [accountId]
          : [];
      }),
    ),
  ];
}

async function write(keys: readonly string[], task: () => Promise<void>) {
  await ready;
  const owners = accounts(keys);
  if (owners.some((account) => blocked.has(account)))
    throw new Error('account_deletion_pending');
  const operation = task();
  for (const account of owners) {
    const set = running.get(account) ?? new Set<Promise<void>>();
    set.add(operation);
    running.set(account, set);
  }
  try {
    await operation;
  } finally {
    for (const account of owners) {
      const set = running.get(account);
      set?.delete(operation);
      if (!set?.size) running.delete(account);
    }
  }
}
const setItem = AsyncStorage.setItem.bind(AsyncStorage);
const removeItem = AsyncStorage.removeItem.bind(AsyncStorage);
const mergeItem = AsyncStorage.mergeItem.bind(AsyncStorage);
const multiSet = AsyncStorage.multiSet.bind(AsyncStorage);
const multiRemove = AsyncStorage.multiRemove.bind(AsyncStorage);
const multiMerge = AsyncStorage.multiMerge.bind(AsyncStorage);
AsyncStorage.setItem = (...args) => write([args[0]], () => setItem(...args));
AsyncStorage.removeItem = (...args) =>
  write([args[0]], () => removeItem(...args));
AsyncStorage.mergeItem = (...args) =>
  write([args[0]], () => mergeItem(...args));
AsyncStorage.multiSet = (...args) =>
  write(
    args[0].map(([key]) => key),
    () => multiSet(...args),
  );
AsyncStorage.multiRemove = (...args) =>
  write(args[0], () => multiRemove(...args));
AsyncStorage.multiMerge = (...args) =>
  write(
    args[0].map(([key]) => key),
    () => multiMerge(...args),
  );
export async function fenceDeletionPendingWrites(
  accountId: string,
): Promise<void> {
  await ready;
  blocked.add(accountId);
  await boundedExportStep(
    Promise.all([...(running.get(accountId) ?? [])]).then(() => {}),
  );
}

export async function removeDeletedAccountMarker(
  accountId: string,
  key: string,
  expectedRaw: string,
  guard: () => Promise<void>,
): Promise<void> {
  await ready;
  if (!blocked.has(accountId) || accounts([key]).join(',') !== accountId)
    throw new Error('cleanup_scope');
  await guard();
  if ((await AsyncStorage.getItem(key)) !== expectedRaw)
    throw new Error('local_changed');
  await guard();
  await removeItem(key);
  await guard();
}
