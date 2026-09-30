import { schedulingClients } from './clients';
import type { SchedulingState } from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const revision = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const client = (value: unknown): value is string =>
  typeof value === 'string' && Object.hasOwn(schedulingClients, value);
const program = (value: unknown) => value === null || typeof value === 'string';
const role = (value: unknown) => value === 'trainer' || value === 'client';
const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function time(value: unknown): value is Record<string, unknown> & {
  date: string;
  start: string;
  end: string;
} {
  if (
    !object(value) ||
    typeof value.date !== 'string' ||
    typeof value.start !== 'string' ||
    typeof value.end !== 'string'
  )
    return false;
  const date = Date.parse(`${value.date}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    Number.isFinite(date) &&
    new Date(date).toISOString().slice(0, 10) === value.date &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) &&
    (/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end) || value.end === '24:00') &&
    minutes(value.end) > minutes(value.start)
  );
}

function validState(value: unknown): value is SchedulingState {
  if (
    !object(value) ||
    !Array.isArray(value.sessions) ||
    !object(value.requests)
  )
    return false;
  const ids = new Set<string>();
  for (const session of value.sessions) {
    if (
      !object(session) ||
      !time(session) ||
      typeof session.id !== 'string' ||
      !session.id.trim() ||
      ids.has(session.id) ||
      !revision(session.revision) ||
      typeof session.title !== 'string' ||
      !program(session.program) ||
      !['proposed', 'confirmed', 'cancelled'].includes(
        String(session.status),
      ) ||
      !Array.isArray(session.participants) ||
      !session.participants.length
    )
      return false;
    ids.add(session.id);
    const clients = new Set<string>();
    for (const participant of session.participants) {
      if (
        !object(participant) ||
        !client(participant.clientId) ||
        clients.has(participant.clientId) ||
        !['pending', 'confirmed', 'cancelled'].includes(
          String(participant.reply),
        ) ||
        ('program' in participant && !program(participant.program))
      )
        return false;
      clients.add(participant.clientId);
    }
    if (
      session.kind === 'personal'
        ? !client(session.clientId) ||
          clients.size !== 1 ||
          !clients.has(session.clientId)
        : session.kind !== 'group' ||
          session.clientId !== null ||
          clients.size < 2
    )
      return false;
  }
  const activeSessions = new Set<string>();
  for (const [id, request] of Object.entries(value.requests)) {
    if (
      !object(request) ||
      request.id !== id ||
      !id.trim() ||
      !revision(request.revision) ||
      !revision(request.sessionRevision) ||
      !client(request.clientId) ||
      typeof request.sessionId !== 'string' ||
      !time(request.from) ||
      !time(request.to) ||
      !(request.counter === null || time(request.counter)) ||
      !role(request.author) ||
      !['pending', 'counter', 'accepted', 'declined', 'withdrawn'].includes(
        String(request.state),
      )
    )
      return false;
    const session: unknown = value.sessions.find(
      (item: unknown) => object(item) && item.id === request.sessionId,
    );
    if (
      !object(session) ||
      session.kind !== 'personal' ||
      session.clientId !== request.clientId
    )
      return false;
    const duration = minutes(request.from.end) - minutes(request.from.start);
    if (
      minutes(request.to.end) - minutes(request.to.start) !== duration ||
      (request.counter !== null &&
        minutes(request.counter.end) - minutes(request.counter.start) !==
          duration)
    )
      return false;
    if (request.state === 'pending' || request.state === 'counter') {
      if (
        !role(request.awaiting) ||
        request.awaiting === request.author ||
        activeSessions.has(request.sessionId) ||
        session.revision !== request.sessionRevision ||
        session.date !== request.from.date ||
        session.start !== request.from.start ||
        session.end !== request.from.end ||
        session.status === 'cancelled' ||
        (request.state === 'pending'
          ? request.counter !== null
          : request.counter === null)
      )
        return false;
      activeSessions.add(request.sessionId);
    } else if (request.awaiting !== null) return false;
  }
  return true;
}

export function encodeSchedulingState(state: SchedulingState): string {
  return JSON.stringify({ version: 1, state });
}

export function decodeSchedulingState(raw: string): SchedulingState | null {
  try {
    const value: unknown = JSON.parse(raw);
    return object(value) && value.version === 1 && validState(value.state)
      ? value.state
      : null;
  } catch {
    return null;
  }
}
