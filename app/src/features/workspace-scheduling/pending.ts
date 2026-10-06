import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CreateWorkspaceBookingInput,
  WorkspaceBookingPlanSelection,
} from './create-operation';

export type PendingWorkspaceBooking = Omit<
  CreateWorkspaceBookingInput,
  'expectedUserId'
>;

export class PendingWorkspaceBookingError extends Error {
  constructor(readonly code: 'invalid' | 'unresolved' | 'storage') {
    super('Pending booking creation could not be accessed');
    this.name = 'PendingWorkspaceBookingError';
  }
}

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const validWorkspaceBookingPlanSelection = (
  value: unknown,
): value is WorkspaceBookingPlanSelection => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const plan = value as Record<string, unknown>;
  return (
    Object.keys(plan).sort().join(',') ===
      'expectedTemplateRevision,templateId' &&
    validUuid(plan.templateId) &&
    typeof plan.expectedTemplateRevision === 'number' &&
    Number.isInteger(plan.expectedTemplateRevision) &&
    plan.expectedTemplateRevision >= 1 &&
    plan.expectedTemplateRevision <= 2147483647
  );
};
const keyFor = (userId: string, workspaceId: string) => {
  if (!validUuid(userId) || !validUuid(workspaceId))
    throw new PendingWorkspaceBookingError('invalid');
  return `panda-trainer-pending-booking-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}`;
};
const canonicalUtc = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const isPendingBooking = (value: unknown): value is PendingWorkspaceBooking => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record)
      .filter((key) => key !== 'plan')
      .sort()
      .join(',') ===
      'clientRecordIds,collisionAcknowledged,endsAtUtc,requestId,startsAtUtc' &&
    (record.plan == null || validWorkspaceBookingPlanSelection(record.plan)) &&
    Array.isArray(record.clientRecordIds) &&
    record.clientRecordIds.length > 0 &&
    record.clientRecordIds.every(validUuid) &&
    new Set(record.clientRecordIds.map((id) => id.toLowerCase())).size ===
      record.clientRecordIds.length &&
    validUuid(record.requestId) &&
    typeof record.collisionAcknowledged === 'boolean' &&
    canonicalUtc(record.startsAtUtc) &&
    canonicalUtc(record.endsAtUtc) &&
    Date.parse(record.endsAtUtc) > Date.parse(record.startsAtUtc)
  );
};
const snapshot = (value: PendingWorkspaceBooking): PendingWorkspaceBooking => ({
  clientRecordIds: [...value.clientRecordIds]
    .map((id) => id.toLowerCase())
    .sort(),
  startsAtUtc: value.startsAtUtc,
  endsAtUtc: value.endsAtUtc,
  collisionAcknowledged: value.collisionAcknowledged,
  requestId: value.requestId.toLowerCase(),
  ...(value.plan
    ? {
        plan: {
          templateId: value.plan.templateId.toLowerCase(),
          expectedTemplateRevision: value.plan.expectedTemplateRevision,
        },
      }
    : {}),
});
const decode = (raw: string): PendingWorkspaceBooking => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PendingWorkspaceBookingError('invalid');
  }
  if (!isPendingBooking(value))
    throw new PendingWorkspaceBookingError('invalid');
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
    if (error instanceof PendingWorkspaceBookingError) throw error;
    throw new PendingWorkspaceBookingError('storage');
  } finally {
    release();
  }
};

export const loadPendingWorkspaceBooking = (
  userId: string,
  workspaceId: string,
): Promise<PendingWorkspaceBooking | null> => {
  const key = keyFor(userId, workspaceId);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : decode(raw);
  });
};

export const savePendingWorkspaceBooking = (
  userId: string,
  workspaceId: string,
  value: PendingWorkspaceBooking,
): Promise<void> => {
  const key = keyFor(userId, workspaceId);
  if (!isPendingBooking(value))
    throw new PendingWorkspaceBookingError('invalid');
  const saved = snapshot(value);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      if (JSON.stringify(decode(raw)) === JSON.stringify(saved)) return;
      throw new PendingWorkspaceBookingError('unresolved');
    }
    await AsyncStorage.setItem(key, JSON.stringify(saved));
  });
};

export const clearPendingWorkspaceBooking = (
  userId: string,
  workspaceId: string,
  expectedRequestId: string,
  guard: () => void = () => {},
): Promise<boolean> => {
  const key = keyFor(userId, workspaceId);
  if (!validUuid(expectedRequestId))
    throw new PendingWorkspaceBookingError('invalid');
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (
      raw === null ||
      decode(raw).requestId !== expectedRequestId.toLowerCase()
    )
      return false;
    guard();
    try {
      await AsyncStorage.removeItem(key);
      guard();
    } catch (error) {
      await AsyncStorage.setItem(key, raw);
      throw error;
    }
    return true;
  });
};
