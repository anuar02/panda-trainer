import type { PlanExercise } from '../templates';
export type SchedulingRole = 'trainer' | 'client';
export type SchedulingActor =
  { role: 'trainer' } | { role: 'client'; clientId: string };
export type SessionTime = { date: string; start: string; end: string };
export type SessionDraft = {
  clientIds: string[];
  date: string;
  start: string;
  duration: number;
  program: string | null;
  programLater: boolean;
  collisionAck: boolean;
};
export type SchedulingParticipant = {
  clientId: string;
  reply: 'pending' | 'confirmed' | 'cancelled';
  program?: string | null;
};
export type SchedulingSession = SessionTime & {
  id: string;
  revision: number;
  planSnapshot?: PlanExercise[];
  kind: 'personal' | 'group';
  title: string;
  program: string | null;
  clientId: string | null;
  status: 'proposed' | 'confirmed' | 'cancelled';
  participants: SchedulingParticipant[];
};
export type RescheduleRequest = {
  id: string;
  revision: number;
  sessionRevision: number;
  sessionId: string;
  clientId: string;
  from: SessionTime;
  to: SessionTime;
  counter: SessionTime | null;
  state: 'pending' | 'counter' | 'accepted' | 'declined' | 'withdrawn';
  author: SchedulingRole;
  awaiting: SchedulingRole | null;
};
export type SchedulingState = {
  sessions: SchedulingSession[];
  requests: Record<string, RescheduleRequest>;
};
export type SchedulingContext = {
  actor: SchedulingActor;
  today: string;
  nowTime: string;
  finishedSessionIds?: readonly string[];
  templates?: readonly { name: string; exercises: PlanExercise[] }[];
};
export type SchedulingError =
  | 'forbidden'
  | 'clients'
  | 'future'
  | 'duration'
  | 'program'
  | 'overlap'
  | 'duplicate'
  | 'unavailable'
  | 'group'
  | 'stale'
  | 'target';
export type SchedulingResult =
  | { ok: true; state: SchedulingState; sessionId: string; requestId?: string }
  | { ok: false; error: SchedulingError };
export type SchedulingAction =
  | { type: 'create'; id: string; draft: SessionDraft }
  | {
      type: 'confirm';
      sessionId: string;
      expectedSessionRevision: number;
    }
  | { type: 'cancel'; sessionId: string; expectedSessionRevision: number }
  | {
      type: 'propose';
      id: string;
      sessionId: string;
      to: Pick<SessionTime, 'date' | 'start'>;
      expectedSessionRevision: number;
    }
  | {
      type: 'accept' | 'decline' | 'withdraw';
      requestId: string;
      expectedRevision: number;
    }
  | {
      type: 'counter';
      requestId: string;
      expectedRevision: number;
      to: Pick<SessionTime, 'date' | 'start'>;
    };
