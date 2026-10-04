import type { FinancialMutationFence } from './mutation-auth';
import { TrainerBillingError } from './types';
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
const retainIfEmpty = async (key: string, raw: string) => {
  if ((await AsyncStorage.getItem(key)) === null)
    await AsyncStorage.setItem(key, raw);
};
let operations = Promise.resolve();
async function serialize<T>(
  operation: () => Promise<T>,
  fence?: FinancialMutationFence,
): Promise<T> {
  const previous = operations;
  let release = () => {};
  operations = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } catch (error) {
    await fence?.guard();
    fence?.assertCurrent();
    if (
      error instanceof PendingTrainerBillingCommandError ||
      error instanceof TrainerBillingError
    )
      throw error;
    throw new PendingTrainerBillingCommandError('storage');
  } finally {
    release();
  }
}
export function loadPendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  fence?: FinancialMutationFence,
): Promise<TrainerBillingCommand | null> {
  const key = keyFor(userId, workspaceId);
  fence?.assertActor(userId);
  fence?.assertWorkspace(workspaceId);
  return serialize(async () => {
    await fence?.guard();
    fence?.assertCurrent();
    const raw = await AsyncStorage.getItem(key);
    await fence?.guard();
    fence?.assertCurrent();
    return raw === null ? null : decode(raw);
  }, fence);
}
export function savePendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  value: TrainerBillingCommand,
  fence?: FinancialMutationFence,
): Promise<void> {
  const key = keyFor(userId, workspaceId);
  fence?.assertActor(userId);
  fence?.assertWorkspace(workspaceId);
  if (!validTrainerBillingCommand(value))
    throw new PendingTrainerBillingCommandError('invalid');
  const saved = snapshotTrainerBillingCommand(value);
  return serialize(async () => {
    await fence?.guard();
    fence?.assertCurrent();
    const raw = await AsyncStorage.getItem(key);
    await fence?.guard();
    fence?.assertCurrent();
    if (raw !== null) {
      if (JSON.stringify(decode(raw)) === JSON.stringify(saved)) return;
      throw new PendingTrainerBillingCommandError('unresolved');
    }
    fence?.assertCurrent();
    await AsyncStorage.setItem(key, JSON.stringify(saved));
    await fence?.guard();
    fence?.assertCurrent();
  }, fence);
}
export function clearPendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  requestId: string,
  fence?: FinancialMutationFence,
): Promise<boolean> {
  const key = keyFor(userId, workspaceId);
  fence?.assertActor(userId);
  fence?.assertWorkspace(workspaceId);
  if (!uuid(requestId)) throw new PendingTrainerBillingCommandError('invalid');
  return serialize(async () => {
    await fence?.guard();
    fence?.assertCurrent();
    const raw = await AsyncStorage.getItem(key);
    await fence?.guard();
    fence?.assertCurrent();
    if (raw === null || decode(raw).requestId !== requestId.toLowerCase())
      return false;
    fence?.assertCurrent();
    try {
      await AsyncStorage.removeItem(key);
      await fence?.guard();
      fence?.assertCurrent();
    } catch (error: unknown) {
      await retainIfEmpty(key, raw);
      throw error;
    }
    return true;
  }, fence);
}

export function retainPendingTrainerBillingCommand(
  userId: string,
  workspaceId: string,
  command: TrainerBillingCommand,
): Promise<void> {
  const key = keyFor(userId, workspaceId);
  if (!validTrainerBillingCommand(command))
    throw new PendingTrainerBillingCommandError('invalid');
  const raw = JSON.stringify(snapshotTrainerBillingCommand(command));
  return serialize(() => retainIfEmpty(key, raw));
}
