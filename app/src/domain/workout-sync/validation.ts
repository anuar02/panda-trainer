import type {
  ApplyResponse,
  JournalOperation,
  OperationResult,
  SyncSession,
} from './types';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateResponse(
  value: unknown,
  session: SyncSession,
  operations: JournalOperation[],
): ApplyResponse {
  if (
    !isRecord(value) ||
    value.account_id !== session.accountId ||
    value.workspace_id !== session.workspaceId ||
    !Array.isArray(value.results) ||
    value.results.length !== operations.length ||
    Object.keys(value).sort().join(',') !== 'account_id,results,workspace_id'
  )
    throw new Error('invalid_response');
  const seen = new Set<string>();
  const results = value.results.map((item: unknown): OperationResult => {
    if (!isRecord(item)) throw new Error('invalid_response');
    const operation = operations.find(
      (op) => op.operation_id === item.operation_id,
    );
    if (
      !operation ||
      item.entity_id !== operation.entity_id ||
      seen.has(operation.operation_id) ||
      !['applied', 'conflict', 'correction_draft', 'error'].includes(
        String(item.status),
      ) ||
      (item.revision !== null &&
        (typeof item.revision !== 'number' ||
          !Number.isSafeInteger(item.revision) ||
          item.revision < 1)) ||
      Object.keys(item).some(
        (key) =>
          ![
            'operation_id',
            'entity_id',
            'status',
            'revision',
            'conflict_id',
            'draft_id',
            'error_code',
          ].includes(key),
      )
    )
      throw new Error('invalid_response');
    if (
      (item.status === 'conflict' && typeof item.conflict_id !== 'string') ||
      (item.status === 'correction_draft' &&
        typeof item.draft_id !== 'string') ||
      (item.status === 'error' && typeof item.error_code !== 'string') ||
      (item.status === 'applied' && item.revision === null)
    )
      throw new Error('invalid_response');
    seen.add(operation.operation_id);
    return item as OperationResult;
  });
  return {
    account_id: session.accountId,
    workspace_id: session.workspaceId,
    results,
  };
}
