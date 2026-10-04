import AsyncStorage from '@react-native-async-storage/async-storage';

import { validateCommand, type UpdateCommand } from '@/domain/program-update';

export type PendingUpdateCommand = UpdateCommand;

export type PendingUpdateCommandErrorCode =
  'invalid' | 'unresolved' | 'storage';

export class PendingUpdateCommandError extends Error {
  constructor(readonly code: PendingUpdateCommandErrorCode) {
    super(
      code === 'invalid'
        ? 'Saved workout program-update data is invalid'
        : code === 'unresolved'
          ? 'Another workout program-update is still awaiting a result'
          : 'Pending workout program-update data could not be accessed',
    );
    this.name = 'PendingUpdateCommandError';
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);

const keyFor = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  clientRecordId: string,
) => {
  if (
    !validUuid(userId) ||
    !validUuid(workspaceId) ||
    !validUuid(workoutId) ||
    !validUuid(clientRecordId)
  )
    throw new PendingUpdateCommandError('invalid');
  return `panda-trainer-pending-program-update-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}:${workoutId.toLowerCase()}:${clientRecordId.toLowerCase()}`;
};

const sameCommand = (first: UpdateCommand, second: UpdateCommand) =>
  JSON.stringify(first) === JSON.stringify(second);

const decodePendingCommand = (raw: string): UpdateCommand => {
  try {
    return validateCommand(JSON.parse(raw));
  } catch {
    throw new PendingUpdateCommandError('invalid');
  }
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
  } finally {
    release();
  }
};

export const loadPendingUpdateCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  clientRecordId: string,
  isCurrent: () => boolean = () => true,
): Promise<PendingUpdateCommand | null> => {
  const key = keyFor(userId, workspaceId, workoutId, clientRecordId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return null;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent() || raw === null) return null;
      return decodePendingCommand(raw);
    } catch (error) {
      if (error instanceof PendingUpdateCommandError) throw error;
      throw new PendingUpdateCommandError('storage');
    }
  });
};

export const savePendingUpdateCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  clientRecordId: string,
  command: PendingUpdateCommand,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  const snapshot = validateCommand(command);
  const key = keyFor(userId, workspaceId, workoutId, clientRecordId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent()) return;
      if (raw !== null) {
        const current = decodePendingCommand(raw);
        if (sameCommand(current, snapshot)) return;
        throw new PendingUpdateCommandError('unresolved');
      }
      await AsyncStorage.setItem(key, JSON.stringify(snapshot));
    } catch (error) {
      if (error instanceof PendingUpdateCommandError) throw error;
      throw new PendingUpdateCommandError('storage');
    }
  });
};

export const clearPendingUpdateCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  clientRecordId: string,
  expectedRequestId: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> => {
  const key = keyFor(userId, workspaceId, workoutId, clientRecordId);
  if (!validUuid(expectedRequestId))
    throw new PendingUpdateCommandError('invalid');
  return serialize(async () => {
    try {
      if (!isCurrent()) return false;
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return false;
      const current = decodePendingCommand(raw);
      if (current.requestId !== expectedRequestId.toLowerCase() || !isCurrent())
        return false;
      const restore = async () => {
        const latest = await AsyncStorage.getItem(key);
        if (latest === null) await AsyncStorage.setItem(key, raw);
      };
      try {
        await AsyncStorage.removeItem(key);
      } catch (error) {
        await restore();
        throw error;
      }
      if (!isCurrent()) {
        await restore();
        return false;
      }
      return true;
    } catch (error) {
      if (error instanceof PendingUpdateCommandError) throw error;
      throw new PendingUpdateCommandError('storage');
    }
  });
};
