import { validPlan } from '../templates';
import { workoutClients, workoutSessions } from './fixtures';
import type { WorkoutSession, WorkoutState } from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const programs = [
  null,
  '',
  'Низ А',
  'Верх Б',
  'Full Body',
  'Сила 5×5',
  'Разные программы',
];
const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function validWorkoutCatalog(value: unknown): value is WorkoutSession[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const session of value) {
    if (
      !object(session) ||
      typeof session.id !== 'string' ||
      !session.id.trim() ||
      ids.has(session.id) ||
      typeof session.title !== 'string' ||
      typeof session.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(session.date) ||
      typeof session.start !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(session.start) ||
      typeof session.end !== 'string' ||
      !(
        /^([01]\d|2[0-3]):[0-5]\d$/.test(session.end) || session.end === '24:00'
      ) ||
      minutes(session.end) <= minutes(session.start) ||
      !(
        programs.includes(session.program as string | null) ||
        (typeof session.program === 'string' &&
          !!session.program.trim() &&
          validPlan(session.planSnapshot))
      ) ||
      (session.planSnapshot !== undefined &&
        (!session.program || !validPlan(session.planSnapshot))) ||
      !Array.isArray(session.participants) ||
      !session.participants.length ||
      (session.status !== undefined &&
        !['proposed', 'confirmed', 'cancelled'].includes(
          String(session.status),
        ))
    )
      return false;
    const date = Date.parse(`${session.date}T12:00:00Z`);
    if (
      !Number.isFinite(date) ||
      new Date(date).toISOString().slice(0, 10) !== session.date
    )
      return false;
    ids.add(session.id);
    const clients = new Set<string>();
    for (const participant of session.participants) {
      if (
        !object(participant) ||
        typeof participant.clientId !== 'string' ||
        !Object.hasOwn(workoutClients, participant.clientId) ||
        clients.has(participant.clientId) ||
        !['confirmed', 'pending', 'cancelled'].includes(
          String(participant.reply),
        ) ||
        (participant.program !== undefined &&
          !(
            programs.includes(participant.program as string | null) ||
            (participant.program === session.program &&
              validPlan(session.planSnapshot))
          ))
      )
        return false;
      clients.add(participant.clientId);
    }
    if (
      session.kind === 'personal'
        ? typeof session.clientId !== 'string' ||
          clients.size !== 1 ||
          !clients.has(session.clientId)
        : session.kind !== 'group' ||
          session.clientId !== null ||
          clients.size < 2
    )
      return false;
  }
  return true;
}

export function syncWorkoutCatalog(
  state: WorkoutState,
  catalog: readonly WorkoutSession[],
): WorkoutState {
  const previous = state.catalog ?? workoutSessions;
  const nextCatalog = catalog.map((session) =>
    state.sessions[session.id]?.finished
      ? (previous.find((value) => value.id === session.id) ?? session)
      : session,
  );
  for (const session of previous)
    if (
      state.sessions[session.id]?.finished &&
      !nextCatalog.some((value) => value.id === session.id)
    )
      nextCatalog.push(session);
  const sessions = { ...state.sessions };
  for (const [id, journal] of Object.entries(sessions)) {
    if (journal.finished) continue;
    const session = nextCatalog.find((value) => value.id === id);
    const plans = Object.fromEntries(
      Object.entries(journal.plans).map(([clientId, plan]) => {
        const participant = session?.participants.find(
          (value) => value.clientId === clientId,
        );
        return [
          clientId,
          {
            ...plan,
            reply:
              session?.status === 'cancelled' || !participant
                ? ('cancelled' as const)
                : participant.reply,
          },
        ];
      }),
    );
    sessions[id] = {
      ...journal,
      plans,
      ...(journal.undo && plans[journal.undo.clientId]?.reply === 'cancelled'
        ? { undo: null }
        : {}),
    };
  }
  return {
    ...state,
    catalog: nextCatalog.map((session) => ({
      ...session,
      participants: session.participants.map((participant) => ({
        ...participant,
      })),
    })),
    sessions,
  };
}
