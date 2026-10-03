export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type SyncScope = { accountId: string; workspaceId: string };
export type OperationKind =
  | 'create_workout'
  | 'add_exercise'
  | 'replace_exercise'
  | 'upsert_set'
  | 'delete_set'
  | 'set_note'
  | 'finish_workout'
  | 'resolve_conflict';
export type JournalOperation = {
  operation_id: string;
  kind: OperationKind;
  entity_id: string;
  base_revision: number;
  device_id: string;
  payload: { [key: string]: JsonValue };
  created_at: string;
};
export type OperationResult = {
  operation_id: string;
  entity_id: string;
  status: 'applied' | 'conflict' | 'correction_draft' | 'error';
  revision: number | null;
  conflict_id?: string;
  draft_id?: string;
  error_code?: string;
};
export type ApplyResponse = {
  account_id: string;
  workspace_id: string;
  results: OperationResult[];
};
export type LocalEntry = { entityId: string; value: JsonValue };
export type PendingOperation = {
  operation: JournalOperation;
  sequence: number;
  result: OperationResult | null;
};
export interface OutboxStore {
  readonly scope: SyncScope;
  save(entry: LocalEntry, operation: JournalOperation): Promise<void>;
  pending(limit?: number): Promise<PendingOperation[]>;
  acknowledge(results: OperationResult[]): Promise<void>;
  confirmedIssues?(): Promise<OperationResult[]>;
  read(entityId: string): Promise<JsonValue | null>;
  close(): Promise<void>;
}
export type SyncState =
  | { status: 'saving' }
  | { status: 'saved_on_phone'; pending: number }
  | { status: 'synced' }
  | { status: 'error'; message: string }
  | { status: 'conflict'; results: OperationResult[] };
export type SyncSession = SyncScope & {
  accessToken: string;
  sessionId: string;
};
export interface OutboxTransport {
  apply(
    session: SyncSession,
    operations: JournalOperation[],
    signal: AbortSignal,
  ): Promise<ApplyResponse>;
}
export type ConflictResolutionPayload = {
  conflict_id: string;
  selected_version: 'current' | 'incoming';
  expected_revision: number;
};
