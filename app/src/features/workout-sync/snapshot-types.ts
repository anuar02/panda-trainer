import type {
  JsonValue,
  JournalOperation,
  OperationResult,
  SyncScope,
} from '../../domain/workout-sync/types';

export type ScopedOutboxSnapshotLimits = Readonly<{
  pageSize: number;
  maxRows: number;
  maxBytes: number;
}>;
export type ScopedOutboxSnapshotRequest = Readonly<{
  expectedScope: SyncScope;
  isCurrentSession: () => boolean;
  signal?: AbortSignal;
  limits?: Partial<ScopedOutboxSnapshotLimits>;
}>;
export type ScopedOutboxSnapshotOperation = Readonly<{
  sequence: number;
  operationId: string;
  entityId: string;
  operationJson: string;
  resultJson: string | null;
  operation: JournalOperation;
  result: OperationResult | null;
  confirmed: 0 | 1;
}>;
export type ScopedOutboxSnapshotEntry = Readonly<{
  entityId: string;
  valueJson: string;
  value: JsonValue;
}>;
export type ScopedOutboxSnapshot = Readonly<{
  metadata: Readonly<{
    id: string;
    capturedAt: string;
    scope: Readonly<SyncScope>;
    consistency: 'sqlite-exclusive-transaction';
    globalAtomicity: 'unknown';
    outboxCount: number;
    entryCount: number;
  }>;
  operations: readonly ScopedOutboxSnapshotOperation[];
  entries: readonly ScopedOutboxSnapshotEntry[];
}>;
export type ScopedOutboxSnapshotErrorCode =
  'malformed' | 'scopeMismatch' | 'limit' | 'cancelled' | 'closed';
export class ScopedOutboxSnapshotError extends Error {
  constructor(readonly code: ScopedOutboxSnapshotErrorCode) {
    super(`Scoped outbox snapshot: ${code}`);
    this.name = 'ScopedOutboxSnapshotError';
  }
}
export const scopedOutboxSnapshotDefaults: ScopedOutboxSnapshotLimits =
  Object.freeze({ pageSize: 100, maxRows: 10000, maxBytes: 4 * 1024 * 1024 });
