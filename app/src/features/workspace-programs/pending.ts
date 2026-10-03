import AsyncStorage from '@react-native-async-storage/async-storage';

export type PendingClientProgramAssignment = {
  clientRecordId: string;
  templateId: string;
  expectedTemplateRevision: number;
  requestId: string;
};

export type PendingClientProgramAssignmentErrorCode =
  'invalid' | 'unresolved' | 'storage';

export class PendingClientProgramAssignmentError extends Error {
  constructor(readonly code: PendingClientProgramAssignmentErrorCode) {
    super(
      code === 'invalid'
        ? 'Saved program assignment data is invalid'
        : code === 'unresolved'
          ? 'Another program assignment is still awaiting a result'
          : 'Pending program assignment data could not be accessed',
    );
    this.name = 'PendingClientProgramAssignmentError';
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);

const keyFor = (
  userId: string,
  workspaceId: string,
  clientRecordId: string,
) => {
  if (
    !validUuid(userId) ||
    !validUuid(workspaceId) ||
    !validUuid(clientRecordId)
  )
    throw new PendingClientProgramAssignmentError('invalid');
  return `panda-trainer-pending-program-v1:${userId}:${workspaceId}:${clientRecordId}`;
};

const isPendingAssignment = (
  value: unknown,
  clientRecordId: string,
): value is PendingClientProgramAssignment => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 4 &&
    keys.join(',') ===
      'clientRecordId,expectedTemplateRevision,requestId,templateId' &&
    record.clientRecordId === clientRecordId &&
    validUuid(record.templateId) &&
    validUuid(record.requestId) &&
    typeof record.expectedTemplateRevision === 'number' &&
    Number.isSafeInteger(record.expectedTemplateRevision) &&
    record.expectedTemplateRevision > 0
  );
};

const sameAssignment = (
  first: PendingClientProgramAssignment,
  second: PendingClientProgramAssignment,
) =>
  first.clientRecordId === second.clientRecordId &&
  first.templateId === second.templateId &&
  first.expectedTemplateRevision === second.expectedTemplateRevision &&
  first.requestId === second.requestId;

const decodePendingAssignment = (
  raw: string,
  clientRecordId: string,
): PendingClientProgramAssignment => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PendingClientProgramAssignmentError('invalid');
  }
  if (!isPendingAssignment(value, clientRecordId))
    throw new PendingClientProgramAssignmentError('invalid');
  return {
    clientRecordId: value.clientRecordId,
    templateId: value.templateId,
    expectedTemplateRevision: value.expectedTemplateRevision,
    requestId: value.requestId,
  };
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

export const loadPendingClientProgramAssignment = (
  userId: string,
  workspaceId: string,
  clientRecordId: string,
  isCurrent: () => boolean = () => true,
): Promise<PendingClientProgramAssignment | null> => {
  const key = keyFor(userId, workspaceId, clientRecordId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return null;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent() || raw === null) return null;
      return decodePendingAssignment(raw, clientRecordId);
    } catch (error) {
      if (error instanceof PendingClientProgramAssignmentError) throw error;
      throw new PendingClientProgramAssignmentError('storage');
    }
  });
};

export const savePendingClientProgramAssignment = (
  userId: string,
  workspaceId: string,
  assignment: PendingClientProgramAssignment,
  isCurrent: () => boolean = () => true,
): Promise<void> => {
  if (!isPendingAssignment(assignment, assignment.clientRecordId))
    throw new PendingClientProgramAssignmentError('invalid');
  const snapshot: PendingClientProgramAssignment = {
    clientRecordId: assignment.clientRecordId,
    templateId: assignment.templateId,
    expectedTemplateRevision: assignment.expectedTemplateRevision,
    requestId: assignment.requestId,
  };
  const key = keyFor(userId, workspaceId, snapshot.clientRecordId);
  return serialize(async () => {
    try {
      if (!isCurrent()) return;
      const raw = await AsyncStorage.getItem(key);
      if (!isCurrent()) return;
      if (raw !== null) {
        const current = decodePendingAssignment(raw, snapshot.clientRecordId);
        if (sameAssignment(current, snapshot)) return;
        throw new PendingClientProgramAssignmentError('unresolved');
      }
      await AsyncStorage.setItem(key, JSON.stringify(snapshot));
    } catch (error) {
      if (error instanceof PendingClientProgramAssignmentError) throw error;
      throw new PendingClientProgramAssignmentError('storage');
    }
  });
};

export const clearPendingClientProgramAssignment = (
  userId: string,
  workspaceId: string,
  clientRecordId: string,
  expectedRequestId: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> => {
  const key = keyFor(userId, workspaceId, clientRecordId);
  if (!validUuid(expectedRequestId))
    throw new PendingClientProgramAssignmentError('invalid');
  return serialize(async () => {
    try {
      if (!isCurrent()) return false;
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return false;
      const current = decodePendingAssignment(raw, clientRecordId);
      if (current.requestId !== expectedRequestId || !isCurrent()) return false;
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
      if (error instanceof PendingClientProgramAssignmentError) throw error;
      throw new PendingClientProgramAssignmentError('storage');
    }
  });
};
