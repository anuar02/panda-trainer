import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type TrainerBillingCommand,
  validTrainerBillingCommand,
  snapshotTrainerBillingCommand,
} from './commands';
import { uuid } from './validation';
export class PendingTrainerBillingCommandError extends Error {
  constructor(readonly code: 'invalid' | 'unresolved' | 'storage') {
    super('Pending billing command could not be accessed');
    this.name = 'PendingTrainerBillingCommandError';
  }
}
const keyFor = (userId: string, workspaceId: string) => {
  if (!uuid(userId) || !uuid(workspaceId))
    throw new PendingTrainerBillingCommandError('invalid');
  return `panda-trainer-pending-billing-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}`;
};
const decode = (raw: string): TrainerBillingCommand => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PendingTrainerBillingCommandError('invalid');
  }
  if (!validTrainerBillingCommand(value))
    throw new PendingTrainerBillingCommandError('invalid');
  return snapshotTrainerBillingCommand(value);
};
let operations = Promise.resolve();
async function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const previous = operations;
  let release = () => {};
  operations = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PendingTrainerBillingCommandError) throw error;
    throw new PendingTrainerBillingCommandError('storage');
  } finally {
    release();
  }
}
export function loadPendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
): Promise<TrainerBillingCommand | null> {
  const key = keyFor(userId, workspaceId);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : decode(raw);
  });
}
export function savePendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  value: TrainerBillingCommand,
): Promise<void> {
  const key = keyFor(userId, workspaceId);
  if (!validTrainerBillingCommand(value))
    throw new PendingTrainerBillingCommandError('invalid');
  const saved = snapshotTrainerBillingCommand(value);
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      if (JSON.stringify(decode(raw)) === JSON.stringify(saved)) return;
      throw new PendingTrainerBillingCommandError('unresolved');
    }
    await AsyncStorage.setItem(key, JSON.stringify(saved));
  });
}
export function clearPendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  requestId: string,
): Promise<boolean> {
  const key = keyFor(userId, workspaceId);
  if (!uuid(requestId)) throw new PendingTrainerBillingCommandError('invalid');
  return serialize(async () => {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null || decode(raw).requestId !== requestId.toLowerCase())
      return false;
    await AsyncStorage.removeItem(key);
    return true;
  });
}
