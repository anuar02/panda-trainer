import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkspaceBookingStatusInput } from './status-operation';

export type PendingWorkspaceBookingStatus = Omit<
  WorkspaceBookingStatusInput,
  'expectedUserId'
>;

export class PendingWorkspaceBookingStatusError extends Error {
  constructor(readonly code: 'invalid' | 'unresolved' | 'storage') {
    super('Pending booking status command could not be accessed');
    this.name = 'PendingWorkspaceBookingStatusError';
  }
}

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const keyFor = (userId: string, workspaceId: string) => {
  if (!validUuid(userId) || !validUuid(workspaceId))
    throw new PendingWorkspaceBookingStatusError('invalid');
  return `panda-trainer-pending-booking-status-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}`;
};
const isPendingStatus = (
  value: unknown,
): value is PendingWorkspaceBookingStatus => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(',') ===
      'action,bookingId,expectedRevision,requestId' &&
    (record.action === 'confirm' || record.action === 'cancel') &&
    validUuid(record.bookingId) &&
    validUuid(record.requestId) &&
    typeof record.expectedRevision === 'number' &&
    Number.isInteger(record.expectedRevision) &&
    record.expectedRevision >= 1 &&
    record.expectedRevision < 2147483647
  );
};
const snapshot = (
  value: PendingWorkspaceBookingStatus,
): PendingWorkspaceBookingStatus => ({
  action: value.action,
  bookingId: value.bookingId.toLowerCase(),
  expectedRevision: value.expectedRevision,
  requestId: value.requestId.toLowerCase(),
});
const decode = (raw: string): PendingWorkspaceBookingStatus => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PendingWorkspaceBookingStatusError('invalid');
  }
  if (!isPendingStatus(value))
    throw new PendingWorkspaceBookingStatusError('invalid');
  return snapshot(value);
};
let operations = Promise.resolve();
const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = operations;
  let release = () => {};
  operations = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PendingWorkspaceBookingStatusError) throw error;
    throw new PendingWorkspaceBookingStatusError('storage');
  } finally {
    release();
  }
};

export const loadPendingWorkspaceBookingStatus = (
  userId: string,
  workspaceId: string,
): Promise<PendingWorkspaceBookingStatus | null> => {
  const key = keyFor(userId, workspaceId);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : decode(raw);
  });
};

export const savePendingWorkspaceBookingStatus = (
  userId: string,
  workspaceId: string,
  value: PendingWorkspaceBookingStatus,
): Promise<void> => {
  const key = keyFor(userId, workspaceId);
  if (!isPendingStatus(value))
    throw new PendingWorkspaceBookingStatusError('invalid');
  const saved = snapshot(value);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      if (JSON.stringify(decode(raw)) === JSON.stringify(saved)) return;
      throw new PendingWorkspaceBookingStatusError('unresolved');
    }
    await AsyncStorage.setItem(key, JSON.stringify(saved));
  });
};

export const clearPendingWorkspaceBookingStatus = (
  userId: string,
  workspaceId: string,
  expectedRequestId: string,
): Promise<boolean> => {
  const key = keyFor(userId, workspaceId);
  if (!validUuid(expectedRequestId))
    throw new PendingWorkspaceBookingStatusError('invalid');
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (
      raw === null ||
      decode(raw).requestId !== expectedRequestId.toLowerCase()
    )
      return false;
    await AsyncStorage.removeItem(key);
    return true;
  });
};
