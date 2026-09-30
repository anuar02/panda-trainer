import { schedulingClients } from './clients';
import { workoutSessions } from '../workout/fixtures';
import type {
  RescheduleRequest,
  SchedulingAction,
  SchedulingContext,
  SchedulingResult,
  SchedulingSession,
  SchedulingState,
  SessionDraft,
  SessionTime,
} from './types';

export * from './types';
export { encodeSchedulingState, decodeSchedulingState } from './storage';
export const schedulingToday = '2026-09-14';
export const schedulingNow = '20:30';
export const schedulingPrograms = ['Низ А', 'Верх Б', 'Full Body', 'Сила 5×5'];
export const schedulingStorageKey = 'trainer-demo-scheduling-v1';

export function createSessionDraft(
  patch: Partial<SessionDraft> = {},
): SessionDraft {
  return {
    clientIds: [],
    date: schedulingToday,
    start: '19:00',
    duration: 60,
    program: null,
    programLater: false,
    collisionAck: false,
    ...patch,
  };
}

export function patchSessionDraft(
  draft: SessionDraft,
  patch: Partial<SessionDraft>,
): SessionDraft {
  return {
    ...draft,
    ...patch,
    ...(patch.program ? { programLater: false } : {}),
    ...(patch.programLater ? { program: null } : {}),
    ...(['date', 'start', 'duration', 'clientIds'].some((key) => key in patch)
      ? { collisionAck: false }
      : {}),
  };
}

export function createSchedulingState(): SchedulingState {
  const sessions: SchedulingSession[] = workoutSessions.map((session) => ({
    ...session,
    revision: 0,
    status: 'confirmed',
    participants: session.participants.map((participant) => ({
      ...participant,
    })),
  }));
  const requests: Record<string, RescheduleRequest> = {};
  for (const [id, sid, date, start, end] of [
    ['r1', 's8', '2026-09-18', '19:00', '20:00'],
    ['r2', 's9', '2026-09-16', '11:30', '12:30'],
  ] as const) {
    const session = sessions.find((value) => value.id === sid);
    if (session?.clientId)
      requests[id] = {
        id,
        revision: 0,
        sessionRevision: 0,
        sessionId: sid,
        clientId: session.clientId,
        from: timeOf(session),
        to: { date, start, end },
        counter: null,
        state: 'pending',
        author: 'client',
        awaiting: 'trainer',
      };
  }
  return { sessions, requests };
}

const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
  new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
const timeOf = ({ date, start, end }: SessionTime): SessionTime => ({
  date,
  start,
  end,
});
const sameTime = (a: SessionTime, b: SessionTime) =>
  a.date === b.date && a.start === b.start && a.end === b.end;
export const isLiveRequest = (request: RescheduleRequest) =>
  request.state === 'pending' || request.state === 'counter';
const future = (
  target: Pick<SessionTime, 'date' | 'start'>,
  context: SchedulingContext,
) =>
  validDate(target.date) &&
  validTime(target.start) &&
  (target.date > context.today ||
    (target.date === context.today && target.start > context.nowTime));

export function currentSchedulingRequest(
  state: SchedulingState,
  sessionId: string,
) {
  return Object.values(state.requests).find(
    (request) => request.sessionId === sessionId && isLiveRequest(request),
  );
}

export function schedulingCollisions(
  state: SchedulingState,
  draft: SessionDraft,
) {
  const start = minutes(draft.start);
  return state.sessions.filter(
    (session) =>
      session.status !== 'cancelled' &&
      session.date === draft.date &&
      start < minutes(session.end) &&
      minutes(session.start) < start + draft.duration,
  );
}

function rescheduleTarget(
  session: SchedulingSession,
  target: Pick<SessionTime, 'date' | 'start'>,
  context: SchedulingContext,
): SessionTime | null {
  const duration = minutes(session.end) - minutes(session.start);
  const end = minutes(target.start) + duration;
  return future(target, context) &&
    duration > 0 &&
    end <= 1440 &&
    !(target.date === session.date && target.start === session.start)
    ? { ...target, end: clock(end) }
    : null;
}

export function applySchedulingAction(
  state: SchedulingState,
  action: SchedulingAction,
  context: SchedulingContext,
): SchedulingResult {
  const actor = context.actor;
  if (action.type === 'create') {
    const draft = action.draft;
    if (actor.role !== 'trainer') return { ok: false, error: 'forbidden' };
    if (
      !action.id.trim() ||
      state.sessions.some((session) => session.id === action.id)
    )
      return { ok: false, error: 'duplicate' };
    if (
      !draft.clientIds.length ||
      new Set(draft.clientIds).size !== draft.clientIds.length ||
      draft.clientIds.some((id) => !Object.hasOwn(schedulingClients, id))
    )
      return { ok: false, error: 'clients' };
    if (!future(draft, context)) return { ok: false, error: 'future' };
    const end = minutes(draft.start) + draft.duration;
    if (!Number.isInteger(draft.duration) || draft.duration <= 0 || end > 1440)
      return { ok: false, error: 'duration' };
    if (
      !draft.programLater &&
      !schedulingPrograms.includes(draft.program ?? '')
    )
      return { ok: false, error: 'program' };
    if (schedulingCollisions(state, draft).length && !draft.collisionAck)
      return { ok: false, error: 'overlap' };
    const program = draft.programLater ? null : draft.program;
    const session: SchedulingSession = {
      id: action.id,
      revision: 0,
      date: draft.date,
      start: draft.start,
      end: clock(end),
      kind: draft.clientIds.length > 1 ? 'group' : 'personal',
      clientId: draft.clientIds.length === 1 ? draft.clientIds[0]! : null,
      title:
        draft.clientIds.length > 1
          ? 'Общее занятие'
          : schedulingClients[draft.clientIds[0]!]!.name,
      program,
      status: 'proposed',
      participants: draft.clientIds.map((clientId) => ({
        clientId,
        reply: 'pending',
        program,
      })),
    };
    return {
      ok: true,
      state: { ...state, sessions: [...state.sessions, session] },
      sessionId: session.id,
    };
  }
  const request =
    'requestId' in action ? state.requests[action.requestId] : undefined;
  const session = state.sessions.find(
    (value) =>
      value.id ===
      ('sessionId' in action ? action.sessionId : request?.sessionId),
  );
  if (
    !session ||
    session.status === 'cancelled' ||
    context.finishedSessionIds?.includes(session.id)
  )
    return { ok: false, error: 'unavailable' };
  const update = (
    nextSession: SchedulingSession,
    nextRequest?: RescheduleRequest,
  ): SchedulingResult => ({
    ok: true,
    sessionId: session.id,
    ...(nextRequest ? { requestId: nextRequest.id } : {}),
    state: {
      sessions: state.sessions.map((value) =>
        value.id === session.id ? nextSession : value,
      ),
      requests: nextRequest
        ? { ...state.requests, [nextRequest.id]: nextRequest }
        : state.requests,
    },
  });
  if (action.type === 'cancel') {
    if (session.revision !== action.expectedSessionRevision)
      return { ok: false, error: 'stale' };
    if (
      actor.role === 'client' &&
      !session.participants.some(
        (participant) =>
          participant.clientId === actor.clientId &&
          participant.reply !== 'cancelled',
      )
    )
      return { ok: false, error: 'forbidden' };
    const pendingRequest = currentSchedulingRequest(state, session.id);
    return update(
      {
        ...session,
        revision: session.revision + 1,
        status:
          actor.role === 'client' && session.kind === 'group'
            ? session.status
            : 'cancelled',
        participants: session.participants.map((participant) =>
          actor.role === 'client' &&
          session.kind === 'group' &&
          participant.clientId === actor.clientId
            ? { ...participant, reply: 'cancelled' }
            : participant,
        ),
      },
      pendingRequest
        ? {
            ...pendingRequest,
            revision: pendingRequest.revision + 1,
            state: 'withdrawn',
            awaiting: null,
          }
        : undefined,
    );
  }
  if (action.type === 'confirm') {
    if (
      actor.role !== 'client' ||
      !session.participants.some(
        (participant) =>
          participant.clientId === actor.clientId &&
          participant.reply === 'pending',
      )
    )
      return { ok: false, error: 'forbidden' };
    if (session.revision !== action.expectedSessionRevision)
      return { ok: false, error: 'stale' };
    const participants = session.participants.map((participant) =>
      participant.clientId === actor.clientId
        ? { ...participant, reply: 'confirmed' as const }
        : participant,
    );
    const pendingRequest = currentSchedulingRequest(state, session.id);
    return update(
      {
        ...session,
        revision: session.revision + 1,
        participants,
        status: participants.every(
          (participant) => participant.reply !== 'pending',
        )
          ? 'confirmed'
          : 'proposed',
      },
      pendingRequest
        ? {
            ...pendingRequest,
            revision: pendingRequest.revision + 1,
            sessionRevision: session.revision + 1,
          }
        : undefined,
    );
  }
  if (session.kind !== 'personal') return { ok: false, error: 'group' };
  if (
    actor.role === 'client' &&
    (session.clientId !== actor.clientId ||
      !session.participants.some(
        (participant) =>
          participant.clientId === actor.clientId &&
          participant.reply !== 'cancelled',
      ))
  )
    return { ok: false, error: 'forbidden' };
  if (action.type === 'propose') {
    if (session.revision !== action.expectedSessionRevision)
      return { ok: false, error: 'stale' };
    if (
      !action.id.trim() ||
      Object.hasOwn(state.requests, action.id) ||
      currentSchedulingRequest(state, session.id)
    )
      return { ok: false, error: 'duplicate' };
    const to = rescheduleTarget(session, action.to, context);
    if (!to) return { ok: false, error: 'target' };
    return update(session, {
      id: action.id,
      revision: 0,
      sessionRevision: session.revision,
      sessionId: session.id,
      clientId: session.clientId!,
      from: timeOf(session),
      to,
      counter: null,
      state: 'pending',
      author: actor.role,
      awaiting: actor.role === 'trainer' ? 'client' : 'trainer',
    });
  }
  if (
    !request ||
    !isLiveRequest(request) ||
    request.revision !== action.expectedRevision ||
    request.sessionRevision !== session.revision ||
    !sameTime(request.from, session) ||
    request.clientId !== session.clientId
  )
    return { ok: false, error: 'stale' };
  if (
    (action.type === 'withdraw' ? request.author : request.awaiting) !==
    actor.role
  )
    return { ok: false, error: 'forbidden' };
  if (action.type === 'counter') {
    const counter = rescheduleTarget(session, action.to, context);
    if (!counter) return { ok: false, error: 'target' };
    return update(session, {
      ...request,
      revision: request.revision + 1,
      state: 'counter',
      counter,
      author: actor.role,
      awaiting: actor.role === 'trainer' ? 'client' : 'trainer',
    });
  }
  const nextRequest: RescheduleRequest = {
    ...request,
    revision: request.revision + 1,
    state:
      action.type === 'accept'
        ? 'accepted'
        : action.type === 'decline'
          ? 'declined'
          : 'withdrawn',
    awaiting: null,
  };
  if (action.type !== 'accept') return update(session, nextRequest);
  const target = rescheduleTarget(
    session,
    request.counter ?? request.to,
    context,
  );
  if (!target) return { ok: false, error: 'target' };
  return update(
    { ...session, ...target, revision: session.revision + 1 },
    nextRequest,
  );
}
