import type { JournalOperation } from './types';

type ExercisePayload = {
  workout_instance_id: string;
  exercise_id: string;
  position: number;
  planned_sets: number;
};
export type OperationPayloads = {
  create_workout: { booking_id: string };
  add_exercise: ExercisePayload;
  replace_exercise: ExercisePayload & { replaced_from_id: string };
  upsert_set: {
    workout_instance_id: string;
    workout_exercise_id: string;
    position: number;
    reps: number | null;
    seconds: number | null;
    weight_g: number | null;
  };
  delete_set: { workout_instance_id: string; workout_exercise_id: string };
  set_note: { workout_instance_id: string; text: string; shared: boolean };
  finish_workout: Record<string, never>;
  resolve_conflict: {
    conflict_id: string;
    selected_version: 'current' | 'incoming';
    expected_revision: number;
  };
};
export type TypedJournalOperation = {
  [K in keyof OperationPayloads]: Omit<JournalOperation, 'kind' | 'payload'> & {
    kind: K;
    payload: OperationPayloads[K];
  };
}[keyof OperationPayloads];
export function createJournalOperation(
  operation: TypedJournalOperation,
): JournalOperation {
  return { ...operation, payload: { ...operation.payload } };
}
