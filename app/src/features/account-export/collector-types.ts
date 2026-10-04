import type { AccountExport } from '@/domain/account-export';
import type { Scope } from '@/domain/account-local-export';
import type {
  ScopedOutboxSnapshot,
  ScopedOutboxSnapshotRequest,
} from '../workout-sync/snapshot-types';
export type CollectedSource = {
  id: string;
  state: 'complete' | 'incomplete' | 'unknown';
  records: unknown[];
  gaps: string[];
};
export type SnapshotReader = {
  scopedSnapshot(
    request: ScopedOutboxSnapshotRequest,
  ): Promise<ScopedOutboxSnapshot>;
};
export type PendingReaders = () => Promise<CollectedSource[]>;
export type ServerContextReader = (
  scope: Scope,
  signal?: AbortSignal,
) => Promise<CollectedSource[]>;
export type CompleteExportEnvelope = {
  format: 'panda-trainer-account';
  version: 2;
  scope: Scope;
  snapshot: { id: string; capturedAt: string };
  server: AccountExport;
  globalAtomicity: 'unknown';
  status: 'incomplete';
  sources: CollectedSource[];
  gaps: string[];
};
export type CollectedAccountExport = {
  status: 'incomplete';
  envelope: CompleteExportEnvelope;
  json: string;
  utf8Bytes: number;
  validate(): Promise<void>;
};
