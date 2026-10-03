import type { SyncScope, SyncSession } from '../workout-sync/types';

export type PreloadSet = {
  id: string;
  revision: number;
  position: number;
  weightGrams: number | null;
  reps: number | null;
  seconds: number | null;
};
export type PreloadExercise = {
  id: string;
  exerciseId: string;
  name: string;
  measure: 'reps' | 'seconds';
  bodyweight: boolean;
  muscleGroup: string;
  equipment: string;
  instructions: string[];
  sourceKey: string | null;
  skipped: boolean;
  replacedFromId: string | null;
  position: number;
  plannedSets: number;
  plannedReps: string | null;
  plannedSeconds: string | null;
  plannedWeightGrams: number | null;
  restSeconds: number | null;
  revision: number;
  sets: PreloadSet[];
  previousSets: PreloadSet[];
};
export type PreloadParticipant = {
  bookingId: string;
  clientRecordId: string;
  clientName: string;
  programId: string;
  programName: string;
  programDescription: string;
  baseTemplateId: string;
  programRevision: number;
  workoutId: string;
  workoutRevision: number;
  workoutStatus: 'not_created' | 'in_progress' | 'finished';
  exercises: PreloadExercise[];
  assignedExercises: PreloadExercise[];
};
export type WorkoutPreloadContext = {
  version: 1;
  scope: SyncScope;
  sessionKey: string;
  startsAt: string;
  loadedAt: string;
  participants: PreloadParticipant[];
};
export type WorkoutRecovery = {
  version: 1;
  sessionKey: string;
  bookingId: string;
  clientRecordId: string;
  collapsed: boolean;
};
export interface WorkoutPreloadStore {
  readonly scope: SyncScope;
  read(sessionKey: string): Promise<WorkoutPreloadContext | null>;
  save(
    context: WorkoutPreloadContext,
    recovery?: WorkoutRecovery,
  ): Promise<void>;
  readRecovery(): Promise<WorkoutRecovery | null>;
  saveRecovery(recovery: WorkoutRecovery): Promise<void>;
  close(): Promise<void>;
}
export interface WorkoutPreloadReader {
  load(
    session: SyncSession,
    bookingId: string,
    signal: AbortSignal,
  ): Promise<WorkoutPreloadContext>;
}
