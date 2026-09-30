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
  bodyweight?: boolean;
  origin?: 'added' | 'replaced';
  skipped?: boolean;
  replaces?: string;
  replacedBy?: string;
};
export type WorkoutExerciseSpec = {
  name: string;
  bodyweight?: boolean;
  unit?: 'сек' | 'повт';
};
export type WorkoutNote = { text: string; at: string; shared: boolean };
export type WorkoutUndo = SetAddress & {
  value: WorkoutSet;
  previous: WorkoutSet | null;
};
export type WorkoutClientHistory = {
  sessionId: string;
  date: string;
  notes: { text: string; at: string }[];
  changes: string;
  exercises: { name: string; unit: 'сек' | 'повт'; values: WorkoutSet[] }[];
};
export type WorkoutClientProgress = {
  name: string;
  unit: 'сек' | 'повт';
  best: WorkoutSet & { date: string };
  delta: number | null;
  deltaUnit: 'кг' | 'сек' | 'повт';
  baselineDate: string | null;
  series: { date: string; value: number }[];
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
  notes?: Record<string, WorkoutNote[]>;
  undo?: WorkoutUndo | null;
};
export type WorkoutState = {
  version: 1;
  catalog?: WorkoutSession[];
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
  status?: 'proposed' | 'confirmed' | 'cancelled';
  participants: {
    clientId: string;
    reply: WorkoutReply;
    program?: string | null;
  }[];
};
type SetAddress = { clientId: string; exerciseId: string; setIndex: number };
export type WorkoutAction =
  | { type: 'open'; sessionId: string; participantId?: string }
  | { type: 'switch'; clientId: string }
  | { type: 'undo'; clientId: string }
  | { type: 'addExercise'; clientId: string; spec: WorkoutExerciseSpec }
  | {
      type: 'replaceExercise';
      clientId: string;
      exerciseId: string;
      spec: WorkoutExerciseSpec;
    }
  | {
      type: 'skipExercise';
      clientId: string;
      exerciseId: string;
      skip?: boolean;
    }
  | { type: 'addNote'; clientId: string; text: string; at: string }
  | { type: 'removeNote' | 'shareNote'; clientId: string; index: number }
  | ({ type: 'draft'; draft: WorkoutDraft } & SetAddress)
  | ({ type: 'save'; value: WorkoutSet } & SetAddress)
  | { type: 'addSet' | 'removeSet'; clientId: string; exerciseId: string }
  | { type: 'finish' | 'confirmPartial' | 'continueInput' };
