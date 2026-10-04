import type {
  UpdateCommand,
  UpdateContext,
  UpdateReceipt,
} from '@/domain/program-update';
import type { PreloadParticipant } from '@/domain/workout-preload/types';
export const updateId = (n: number) =>
  `52000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const updateSession = {
  accountId: updateId(1),
  workspaceId: updateId(2),
  sessionId: updateId(3),
  accessToken: 'synthetic',
};
export const updateContext: UpdateContext = {
  account_id: updateId(1),
  workspace_id: updateId(2),
  client_record_id: updateId(4),
  workout_id: updateId(5),
  program_id: updateId(6),
  program_revision: 1,
  workout_revision: 3,
  program_name: 'Synthetic plan',
  options: [
    {
      key: `values:${updateId(7)}`,
      kind: 'values',
      exercise_id: updateId(7),
      name: 'Synthetic exercise',
      checked: false,
      plan: { sets: 3, reps: '8', seconds: null, weight_g: 10000 },
      fact: { sets: 1, reps: 10, seconds: null, weight_g: 12000 },
    },
  ],
};
export const updateCommand: UpdateCommand = {
  programId: updateId(6),
  requestId: updateId(8),
  expectedProgramRevision: 1,
  expectedWorkoutRevision: 3,
  selectedKeys: [`values:${updateId(7)}`],
};
export const updateReceipt: UpdateReceipt = {
  account_id: updateId(1),
  workspace_id: updateId(2),
  client_record_id: updateId(4),
  workout_id: updateId(5),
  program_id: updateId(9),
  request_id: updateId(8),
  revision: 1,
  status: 'applied',
};
export const updateParticipant: PreloadParticipant = {
  bookingId: updateId(10),
  clientRecordId: updateId(4),
  workoutId: updateId(5),
  programId: updateId(6),
  programRevision: 1,
  workoutRevision: 3,
  workoutStatus: 'finished',
  programName: 'Synthetic plan',
  programDescription: '',
  baseTemplateId: updateId(11),
  clientName: 'Synthetic client',
  exercises: [],
  assignedExercises: [],
};
