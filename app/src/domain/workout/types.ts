export type WorkoutSet = { kg: number; reps: number };
export type WorkoutDraft = { kg: string; reps: string };
export type WorkoutExercise = {
  id: string;
  name: string;
  sets: number;
  plannedSets: number;
  reps: string;
  target: number;
  prev: WorkoutSet;
  pr: number;
  unit: 'сек' | 'повт';
};
export type WorkoutReply = 'confirmed' | 'pending' | 'cancelled';
export type WorkoutPlan = {
  name: string | null;
  reply: WorkoutReply;
  exercises: WorkoutExercise[];
};
export type WorkoutEntries<T> = Record<string, Record<string, (T | null)[]>>;
export type WorkoutJournal = {
  sessionId: string;
  active: string;
  plans: Record<string, WorkoutPlan>;
  values: WorkoutEntries<WorkoutSet>;
  drafts: WorkoutEntries<WorkoutDraft>;
  finished: boolean;
  finishPending: boolean;
};
export type WorkoutState = {
  version: 1;
  sessions: Record<string, WorkoutJournal>;
  activeSessionId: string | null;
};
export type WorkoutSession = {
  id: string;
  date: string;
  start: string;
  end: string;
  kind: 'personal' | 'group';
  title: string;
  program: string | null;
  clientId: string | null;
  participants: { clientId: string; reply: WorkoutReply }[];
};
type SetAddress = { clientId: string; exerciseId: string; setIndex: number };
export type WorkoutAction =
  | { type: 'open'; sessionId: string; participantId?: string }
  | { type: 'switch'; clientId: string }
  | ({ type: 'draft'; draft: WorkoutDraft } & SetAddress)
  | ({ type: 'save'; value: WorkoutSet } & SetAddress)
  | { type: 'addSet' | 'removeSet'; clientId: string; exerciseId: string }
  | { type: 'finish' | 'confirmPartial' | 'continueInput' };
