import { authStorage } from '@/features/auth/storage';
import type { DeletionRequest } from './service';
export type ConfirmedDeletion = DeletionRequest & {
  accountId: string;
  fingerprint: string;
  exportSha256: string;
  exportBytes: number;
  snapshotId: string;
  confirmed: true;
};
const key = 'panda-trainer-account-deletion-recovery-v1';
export type DeletionSecretStorage = Pick<
  typeof authStorage,
  'getItem' | 'setItem' | 'removeItem'
>;
let queue = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
export function readConfirmedDeletion(
  storage: DeletionSecretStorage = authStorage,
): Promise<ConfirmedDeletion | null> {
  return serialize(async () => {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object')
      throw new Error('recovery_storage');
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !==
        'accountId,confirmed,exportBytes,exportSha256,fingerprint,recoveryToken,requestId,snapshotId' ||
      row.confirmed !== true ||
      !['accountId', 'requestId', 'snapshotId'].every(
        (field) =>
          typeof row[field] === 'string' && /^[0-9a-f-]{36}$/i.test(row[field]),
      ) ||
      !['fingerprint', 'exportSha256', 'recoveryToken'].every(
        (field) =>
          typeof row[field] === 'string' && /^[0-9a-f]{64}$/.test(row[field]),
      ) ||
      !Number.isSafeInteger(row.exportBytes) ||
      Number(row.exportBytes) <= 0
    )
      throw new Error('recovery_storage');
    return row as ConfirmedDeletion;
  });
}
export function saveConfirmedDeletion(
  value: ConfirmedDeletion,
  storage: DeletionSecretStorage = authStorage,
): Promise<void> {
  return serialize(async () => {
    const prior = await storage.getItem(key);
    const raw = JSON.stringify(value);
    if (prior !== null && prior !== raw)
      throw new Error('recovery_already_pending');
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw new Error('recovery_storage');
  });
}
export function clearConfirmedDeletion(
  value: ConfirmedDeletion,
  storage: DeletionSecretStorage = authStorage,
): Promise<void> {
  return serialize(async () => {
    if ((await storage.getItem(key)) !== JSON.stringify(value))
      throw new Error('recovery_changed');
    await storage.removeItem(key);
  });
}
