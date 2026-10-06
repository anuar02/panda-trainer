import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkspaceProposalCommand } from './proposal-operation';
export class PendingWorkspaceProposalError extends Error {
  constructor(readonly code: 'invalid' | 'unresolved' | 'storage') {
    super('Pending reschedule could not be accessed');
    this.name = 'PendingWorkspaceProposalError';
  }
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const revision = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value < 2147483647;
const utc = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
export function validWorkspaceProposalCommand(
  value: unknown,
): value is WorkspaceProposalCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const command = value as Record<string, unknown>;
  if (
    !uuid(command.bookingId) ||
    !uuid(command.requestId) ||
    !revision(command.expectedBookingRevision)
  )
    return false;
  const base = ['action', 'bookingId', 'expectedBookingRevision', 'requestId'];
  if (command.action === 'propose') base.push('proposedStartsAtUtc');
  else if (command.action === 'counter')
    base.push('proposalId', 'expectedProposalRevision', 'proposedStartsAtUtc');
  else if (['accept', 'decline', 'withdraw'].includes(String(command.action)))
    base.push('proposalId', 'expectedProposalRevision');
  else return false;
  return (
    Object.keys(command).sort().join(',') === base.sort().join(',') &&
    (command.action === 'propose' ||
      (uuid(command.proposalId) &&
        revision(command.expectedProposalRevision))) &&
    (!(command.action === 'propose' || command.action === 'counter') ||
      utc(command.proposedStartsAtUtc))
  );
}
export function snapshotWorkspaceProposalCommand(
  command: WorkspaceProposalCommand,
): WorkspaceProposalCommand {
  const base = {
    action: command.action,
    bookingId: command.bookingId.toLowerCase(),
    expectedBookingRevision: command.expectedBookingRevision,
    requestId: command.requestId.toLowerCase(),
  };
  if (command.action === 'propose')
    return {
      ...base,
      action: 'propose',
      proposedStartsAtUtc: command.proposedStartsAtUtc,
    };
  const response = {
    ...base,
    proposalId: command.proposalId.toLowerCase(),
    expectedProposalRevision: command.expectedProposalRevision,
  };
  return command.action === 'counter'
    ? {
        ...response,
        action: 'counter',
        proposedStartsAtUtc: command.proposedStartsAtUtc,
      }
    : { ...response, action: command.action };
}
const keyFor = (userId: string, workspaceId: string) => {
  if (!uuid(userId) || !uuid(workspaceId))
    throw new PendingWorkspaceProposalError('invalid');
  return `panda-trainer-pending-reschedule-v1:${userId.toLowerCase()}:${workspaceId.toLowerCase()}`;
};
const decode = (raw: string): WorkspaceProposalCommand => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PendingWorkspaceProposalError('invalid');
  }
  if (!validWorkspaceProposalCommand(value))
    throw new PendingWorkspaceProposalError('invalid');
  return snapshotWorkspaceProposalCommand(value);
};
const recovery = new Map<string, string>();
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
    if (error instanceof PendingWorkspaceProposalError) throw error;
    throw new PendingWorkspaceProposalError('storage');
  } finally {
    release();
  }
}
export function loadPendingWorkspaceProposal(
  userId: string,
  workspaceId: string,
  guard: () => void = () => {},
): Promise<WorkspaceProposalCommand | null> {
  const key = keyFor(userId, workspaceId);
  return serialize(async () => {
    guard();
    const stored = await AsyncStorage.getItem(key);
    guard();
    if (stored !== null && recovery.has(key) && stored !== recovery.get(key))
      recovery.delete(key);
    const raw = stored ?? recovery.get(key) ?? null;
    return raw === null ? null : decode(raw);
  });
}
export function savePendingWorkspaceProposal(
  userId: string,
  workspaceId: string,
  value: WorkspaceProposalCommand,
  guard: () => void = () => {},
): Promise<void> {
  const key = keyFor(userId, workspaceId);
  if (!validWorkspaceProposalCommand(value))
    throw new PendingWorkspaceProposalError('invalid');
  const saved = snapshotWorkspaceProposalCommand(value);
  return serialize(async () => {
    guard();
    const stored = await AsyncStorage.getItem(key);
    guard();
    const raw = stored ?? recovery.get(key) ?? null;
    if (raw !== null) {
      if (JSON.stringify(decode(raw)) === JSON.stringify(saved)) {
        if (stored !== null) return;
      } else throw new PendingWorkspaceProposalError('unresolved');
    }
    guard();
    await AsyncStorage.setItem(key, JSON.stringify(saved));
    recovery.delete(key);
    guard();
  });
}
export function clearPendingWorkspaceProposal(
  userId: string,
  workspaceId: string,
  requestId: string,
  guard: () => void = () => {},
  expectedCommand?: WorkspaceProposalCommand,
): Promise<boolean> {
  const key = keyFor(userId, workspaceId);
  if (!uuid(requestId)) throw new PendingWorkspaceProposalError('invalid');
  return serialize(async () => {
    guard();
    const stored = await AsyncStorage.getItem(key);
    const raw = stored ?? recovery.get(key) ?? null;
    guard();
    if (raw === null || decode(raw).requestId !== requestId.toLowerCase())
      return false;
    guard();
    if (
      expectedCommand &&
      JSON.stringify(snapshotWorkspaceProposalCommand(decode(raw))) !==
        JSON.stringify(snapshotWorkspaceProposalCommand(expectedCommand))
    )
      return false;
    await AsyncStorage.removeItem(key);
    recovery.delete(key);
    return true;
  });
}

export function retainPendingWorkspaceProposal(
  userId: string,
  workspaceId: string,
  command: WorkspaceProposalCommand,
): Promise<void> {
  const key = keyFor(userId, workspaceId);
  if (!validWorkspaceProposalCommand(command))
    throw new PendingWorkspaceProposalError('invalid');
  const raw = JSON.stringify(snapshotWorkspaceProposalCommand(command));
  recovery.set(key, raw);
  return serialize(async () => {
    const stored = await AsyncStorage.getItem(key);
    if (stored === null) {
      await AsyncStorage.setItem(key, raw);
    } else if (stored !== raw) {
      recovery.delete(key);
      return;
    }
    recovery.delete(key);
  });
}
