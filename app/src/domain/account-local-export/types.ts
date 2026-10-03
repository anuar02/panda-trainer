import type { ExportRow } from '../account-export';
import type { TypedJournalOperation } from '../workout-sync/operations';
import type { OperationResult } from '../workout-sync/types';

export type Scope = {
  accountId: string;
  workspaceId: string;
  sessionId: string;
};
export type JournalTable =
  | 'workout_instances'
  | 'workout_exercises'
  | 'set_results'
  | 'session_notes'
  | 'private_notes';
export type Projection = {
  [K in JournalTable]: { table: K; row: ExportRow<K> };
}[JournalTable];
export type Source<T> =
  { state: 'unknown' } | { state: 'complete' | 'incomplete'; records: T[] };
export type StoredOperation = {
  operation: TypedJournalOperation;
  sequence: number;
  result: OperationResult | null;
};
export type CurrentVersion = {
  projection: Projection;
  exercise: {
    table: 'workout_exercises';
    row: ExportRow<'workout_exercises'>;
  } | null;
  exercise_revision: number | null;
  sets: ExportRow<'set_results'>[];
  replacements: {
    row: ExportRow<'workout_exercises'>;
    sets: ExportRow<'set_results'>[];
  }[];
  shared: boolean | null;
};
export type Conflict = {
  id: string;
  entityId: string;
  workoutId: string;
  expectedRevision: number;
  current: CurrentVersion | null;
  incoming: TypedJournalOperation | null;
};
export type Correction = {
  id: string;
  workoutId: string;
  createdAt: string;
  operation: TypedJournalOperation | null;
};
export type LocalExportEnvelope = {
  format: 'panda-trainer-local';
  version: 1;
  scope: Scope;
  snapshot: { id: string; capturedAt: string; atomic: 'confirmed' | 'unknown' };
  sources: {
    operations: Source<StoredOperation>;
    projections: Source<Projection>;
    conflicts: Source<Conflict>;
    corrections: Source<Correction>;
    otherLocalData: { state: 'unknown' | 'incomplete' };
  };
};
export type LocalExportResult = {
  status: 'incomplete';
  journalStatus: 'complete' | 'incomplete';
  envelope: LocalExportEnvelope;
  json: string;
  utf8Bytes: number;
};
