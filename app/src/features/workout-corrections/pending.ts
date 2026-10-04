import AsyncStorage from '@react-native-async-storage/async-storage';

import { validateCommand, type CorrectionCommand } from './types';

export type PendingCorrectionCommand = CorrectionCommand;

export type PendingCorrectionCommandErrorCode =
  'invalid' | 'unresolved' | 'storage';

export class PendingCorrectionCommandError extends Error {
  constructor(readonly code: PendingCorrectionCommandErrorCode) {
    super(
      code === 'invalid'
        ? 'Saved workout correction data is invalid'
        : code === 'unresolved'
          ? 'Another workout correction is still awaiting a result'
          : 'Pending workout correction data could not be accessed',
    );
    this.name = 'PendingCorrectionCommandError';
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);

const keyFor = (userId: string, workspaceId: string, workoutId: string) => {
  if (!validUuid(userId) || !validUuid(workspaceId) || !validUuid(workoutId))
    throw new PendingCorrectionCommandError('invalid');
  return `panda-trainer-pending-correction-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}:${workoutId.toLowerCase()}`;
};

const sameCommand = (first: CorrectionCommand, second: CorrectionCommand) =>
  JSON.stringify(first) === JSON.stringify(second);

const decodePendingCommand = (raw: string): CorrectionCommand => {
  try {
    return validateCommand(JSON.parse(raw));
  } catch {
    throw new PendingCorrectionCommandError('invalid');
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

export const loadPendingCorrectionCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  isCurrent: () => boolean = () => true,
): Promise<PendingCorrectionCommand | null> => {
  const key = keyFor(userId, workspaceId, workoutId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return null;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent() || raw === null) return null;
      return decodePendingCommand(raw);
    } catch (error) {
      if (error instanceof PendingCorrectionCommandError) throw error;
      throw new PendingCorrectionCommandError('storage');
    }
  });
};

export const savePendingCorrectionCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  command: PendingCorrectionCommand,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  const snapshot = validateCommand(command);
  const key = keyFor(userId, workspaceId, workoutId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent()) return;
      if (raw !== null) {
        const current = decodePendingCommand(raw);
        if (sameCommand(current, snapshot)) return;
        throw new PendingCorrectionCommandError('unresolved');
      }
      await AsyncStorage.setItem(key, JSON.stringify(snapshot));
    } catch (error) {
      if (error instanceof PendingCorrectionCommandError) throw error;
      throw new PendingCorrectionCommandError('storage');
    }
  });
};

export const clearPendingCorrectionCommand = (
  userId: string,
  workspaceId: string,
  workoutId: string,
  expectedRequestId: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> => {
  const key = keyFor(userId, workspaceId, workoutId);
  if (!validUuid(expectedRequestId))
    throw new PendingCorrectionCommandError('invalid');
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
      if (error instanceof PendingCorrectionCommandError) throw error;
      throw new PendingCorrectionCommandError('storage');
    }
  });
};
