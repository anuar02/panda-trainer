import type { JsonValue, JournalOperation } from '@/domain/workout-sync/types';

export type CorrectionOperation = Omit<JournalOperation, 'kind'> & {
  kind: Exclude<JournalOperation['kind'], 'create_workout' | 'finish_workout'>;
};
export type CorrectionCommand = {
  draftId: string;
  requestId: string;
  expectedWorkoutRevision: number;
  expectedEntityRevision: number;
  expectedExerciseRevision: number | null;
};
export type CorrectionScope = {
  accountId: string;
  workspaceId: string;
  workoutId: string;
};
export type CorrectionReview = {
  account_id: string;
  workspace_id: string;
  workout_id: string;
  draft_id: string;
  operation: CorrectionOperation;
  finished_at: string;
  applied_at: string | null;
  applied_request_id: string | null;
  receipt: CorrectionReceipt | null;
  workout_revision: number;
  entity_revision: number;
  exercise_revision: number | null;
  current_version: JsonValue;
  conflict: JsonValue;
};
export type CorrectionReceipt = {
  account_id: string;
  workspace_id: string;
  workout_id: string;
  draft_id: string;
  request_id: string;
  status: 'applied';
  finished_at: string;
  revision: number;
  entity_revision: number;
};
export const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export const validRevision = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2147483647;
export function validateCommand(value: unknown): CorrectionCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('correction_invalid');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join(',') !==
      'draftId,expectedEntityRevision,expectedExerciseRevision,expectedWorkoutRevision,requestId' ||
    !validUuid(row.draftId) ||
    !validUuid(row.requestId) ||
    !validRevision(row.expectedWorkoutRevision) ||
    row.expectedWorkoutRevision < 1 ||
    !validRevision(row.expectedEntityRevision) ||
    !(
      row.expectedExerciseRevision === null ||
      (validRevision(row.expectedExerciseRevision) &&
        row.expectedExerciseRevision > 0)
    )
  )
    throw new Error('correction_invalid');
  return Object.freeze({
    draftId: row.draftId.toLowerCase(),
    requestId: row.requestId.toLowerCase(),
    expectedWorkoutRevision: row.expectedWorkoutRevision,
    expectedEntityRevision: row.expectedEntityRevision,
    expectedExerciseRevision: row.expectedExerciseRevision,
  });
}
