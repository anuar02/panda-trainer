import {
  getWorkoutSession,
  workoutClients,
  workoutExercises,
} from './fixtures';
import type {
  WorkoutAction,
  WorkoutDraft,
  WorkoutEntries,
  WorkoutExercise,
  WorkoutJournal,
  WorkoutSet,
  WorkoutState,
} from './types';

export * from './types';
export * from './fixtures';

export function createWorkoutState(): WorkoutState {
  return { version: 1, sessions: {}, activeSessionId: null };
}

function createJournal(sessionId: string): WorkoutJournal | null {
  const session = getWorkoutSession(sessionId);
  if (!session) return null;
  return {
    sessionId,
    active:
      session.participants.find((p) => p.reply !== 'cancelled')?.clientId ??
      session.participants[0]?.clientId ??
      '',
    plans: Object.fromEntries(
      session.participants.map((p) => {
        const name =
          session.kind === 'personal'
            ? session.program
            : (workoutClients[p.clientId]?.program ?? null);
        return [
          p.clientId,
          { name, reply: p.reply, exercises: workoutExercises(name) },
        ];
      }),
    ),
    values: {},
    drafts: {},
    finished: false,
    finishPending: false,
  };
}

export function workoutEligible(journal: WorkoutJournal, clientId: string) {
  return (
    Object.hasOwn(journal.plans, clientId) &&
    journal.plans[clientId]?.reply !== 'cancelled'
  );
}

export function workoutProgress(
  journal: WorkoutJournal,
  clientId = journal.active,
) {
  const exercises = journal.plans[clientId]?.exercises ?? [];
  return {
    total: exercises.reduce((n, ex) => n + ex.sets, 0),
    done: exercises.reduce(
      (n, ex) =>
        n + (journal.values[clientId]?.[ex.id] ?? []).filter(validSet).length,
      0,
    ),
    drafts: exercises.reduce(
      (n, ex) =>
        n + (journal.drafts[clientId]?.[ex.id] ?? []).filter(Boolean).length,
      0,
    ),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validSet(value: unknown): value is WorkoutSet {
  return (
    record(value) &&
    typeof value.kg === 'number' &&
    Number.isFinite(value.kg) &&
    value.kg >= 0 &&
    typeof value.reps === 'number' &&
    Number.isSafeInteger(value.reps) &&
    value.reps > 0
  );
}

export function parseWorkoutSet(
  exercise: WorkoutExercise,
  draft: WorkoutDraft,
): WorkoutSet | null {
  const kgText = draft.kg.trim().replace(',', '.');
  const repsText = draft.reps.trim();
  const kg = exercise.prev.kg === 0 ? 0 : Number(kgText);
  const reps = Number(repsText);
  if (
    (exercise.prev.kg !== 0 && !/^\d+(\.\d+)?$/.test(kgText)) ||
    !/^\d+$/.test(repsText)
  )
    return null;
  return validSet({ kg, reps }) ? { kg, reps } : null;
}

function setEntry<T>(
  entries: WorkoutEntries<T>,
  clientId: string,
  exerciseId: string,
  setIndex: number,
  value: T | null,
): WorkoutEntries<T> {
  const previous = entries[clientId]?.[exerciseId] ?? [];
  const rows = Array.from(
    { length: Math.max(previous.length, setIndex + 1) },
    (_, i) => (i === setIndex ? value : (previous[i] ?? null)),
  );
  return {
    ...entries,
    [clientId]: { ...entries[clientId], [exerciseId]: rows },
  };
}

export function workoutReducer(
  state: WorkoutState,
  action: WorkoutAction,
): WorkoutState {
  if (action.type === 'open') {
    if (!getWorkoutSession(action.sessionId)) return state;
    const journal =
      state.sessions[action.sessionId] ?? createJournal(action.sessionId);
    if (!journal) return state;
    const active =
      action.participantId && Object.hasOwn(journal.plans, action.participantId)
        ? action.participantId
        : journal.active;
    return {
      ...state,
      activeSessionId: action.sessionId,
      sessions: {
        ...state.sessions,
        [action.sessionId]: { ...journal, active },
      },
    };
  }
  const journal = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;
  if (!journal) return state;
  const update = (next: WorkoutJournal): WorkoutState => ({
    ...state,
    sessions: { ...state.sessions, [journal.sessionId]: next },
  });
  if (action.type === 'switch') {
    return Object.hasOwn(journal.plans, action.clientId)
      ? update({ ...journal, active: action.clientId })
      : state;
  }
  if (journal.finished) return state;
  if (action.type === 'continueInput')
    return update({ ...journal, finishPending: false });
  if (action.type === 'confirmPartial')
    return journal.finishPending
      ? update({ ...journal, finished: true, finishPending: false })
      : state;
  if (action.type === 'finish') {
    const partial = Object.keys(journal.plans).some((id) => {
      const progress = workoutProgress(journal, id);
      return (
        workoutEligible(journal, id) &&
        (!progress.total ||
          progress.done < progress.total ||
          progress.drafts > 0)
      );
    });
    return update({ ...journal, finished: !partial, finishPending: partial });
  }
  if (
    !('clientId' in action) ||
    action.clientId !== journal.active ||
    !workoutEligible(journal, action.clientId)
  )
    return state;
  const plan = journal.plans[action.clientId];
  if (!plan) return state;
  const exercise = plan.exercises.find((ex) => ex.id === action.exerciseId);
  if (!exercise) return state;
  if (action.type === 'addSet' || action.type === 'removeSet') {
    const last = exercise.sets - 1;
    if (
      action.type === 'addSet'
        ? exercise.sets >= 30
        : exercise.sets <= exercise.plannedSets ||
          journal.values[action.clientId]?.[exercise.id]?.[last] ||
          journal.drafts[action.clientId]?.[exercise.id]?.[last]
    )
      return state;
    const changed = {
      ...exercise,
      sets: exercise.sets + (action.type === 'addSet' ? 1 : -1),
    };
    return update({
      ...journal,
      finishPending: false,
      values: {
        ...journal.values,
        [action.clientId]: {
          ...journal.values[action.clientId],
          [exercise.id]: (
            journal.values[action.clientId]?.[exercise.id] ?? []
          ).slice(0, changed.sets),
        },
      },
      drafts: {
        ...journal.drafts,
        [action.clientId]: {
          ...journal.drafts[action.clientId],
          [exercise.id]: (
            journal.drafts[action.clientId]?.[exercise.id] ?? []
          ).slice(0, changed.sets),
        },
      },
      plans: {
        ...journal.plans,
        [action.clientId]: {
          ...plan,
          exercises: plan.exercises.map((ex) =>
            ex.id === exercise.id ? changed : ex,
          ),
        },
      },
    });
  }
  if (
    !('setIndex' in action) ||
    !Number.isInteger(action.setIndex) ||
    action.setIndex < 0 ||
    action.setIndex >= exercise.sets
  )
    return state;
  if (action.type === 'draft') {
    return update({
      ...journal,
      finishPending: false,
      drafts: setEntry(
        journal.drafts,
        action.clientId,
        exercise.id,
        action.setIndex,
        { ...action.draft },
      ),
    });
  }
  if (!validSet(action.value)) return state;
  return update({
    ...journal,
    finishPending: false,
    values: setEntry(
      journal.values,
      action.clientId,
      exercise.id,
      action.setIndex,
      { ...action.value },
    ),
    drafts: setEntry(
      journal.drafts,
      action.clientId,
      exercise.id,
      action.setIndex,
      null,
    ),
  });
}

function decodeEntries<T>(
  input: unknown,
  journal: WorkoutJournal,
  valid: (value: unknown) => value is T,
): WorkoutEntries<T> | null {
  if (!record(input)) return null;
  const result: WorkoutEntries<T> = {};
  for (const [clientId, entries] of Object.entries(input)) {
    if (!Object.hasOwn(journal.plans, clientId) || !record(entries))
      return null;
    result[clientId] = {};
    for (const [exerciseId, rows] of Object.entries(entries)) {
      const exercise = journal.plans[clientId]?.exercises.find(
        (ex) => ex.id === exerciseId,
      );
      if (!exercise || !Array.isArray(rows) || rows.length > exercise.sets)
        return null;
      const values: (T | null)[] = [];
      for (const row of rows) {
        if (row !== null && !valid(row)) return null;
        values.push(row);
      }
      result[clientId][exerciseId] = values;
    }
  }
  return result;
}

export function decodeWorkoutState(raw: string | null): WorkoutState | null {
  if (raw === null) return createWorkoutState();
  try {
    const input: unknown = JSON.parse(raw);
    if (
      !record(input) ||
      input.version !== 1 ||
      !record(input.sessions) ||
      !(
        input.activeSessionId === null ||
        typeof input.activeSessionId === 'string'
      )
    )
      return null;
    const state = createWorkoutState();
    for (const [id, saved] of Object.entries(input.sessions)) {
      const journal = createJournal(id);
      if (
        !journal ||
        !record(saved) ||
        saved.sessionId !== id ||
        typeof saved.active !== 'string' ||
        !Object.hasOwn(journal.plans, saved.active) ||
        typeof saved.finished !== 'boolean' ||
        typeof saved.finishPending !== 'boolean' ||
        !record(saved.plans)
      )
        return null;
      if (Object.keys(saved.plans).length !== Object.keys(journal.plans).length)
        return null;
      for (const [clientId, plan] of Object.entries(journal.plans)) {
        const storedPlan = saved.plans[clientId];
        if (
          !record(storedPlan) ||
          storedPlan.name !== plan.name ||
          storedPlan.reply !== plan.reply ||
          !Array.isArray(storedPlan.exercises) ||
          storedPlan.exercises.length !== plan.exercises.length
        )
          return null;
        for (let i = 0; i < plan.exercises.length; i++) {
          const original = plan.exercises[i];
          if (!original) return null;
          const stored = storedPlan.exercises[i];
          if (
            !record(stored) ||
            typeof stored.sets !== 'number' ||
            !Number.isInteger(stored.sets) ||
            stored.sets < original.plannedSets ||
            stored.sets > 30
          )
            return null;
          const expected = { ...original, sets: stored.sets };
          if (
            Object.keys(expected).some(
              (key) =>
                JSON.stringify(stored[key]) !==
                JSON.stringify(expected[key as keyof WorkoutExercise]),
            )
          )
            return null;
          plan.exercises[i] = expected;
        }
      }
      const values = decodeEntries(saved.values, journal, validSet);
      const drafts = decodeEntries(
        saved.drafts,
        journal,
        (v): v is WorkoutDraft =>
          record(v) && typeof v.kg === 'string' && typeof v.reps === 'string',
      );
      if (!values || !drafts || (saved.finished && saved.finishPending))
        return null;
      state.sessions[id] = {
        ...journal,
        active: saved.active,
        finished: saved.finished,
        finishPending: false,
        values,
        drafts,
      };
    }
    if (
      input.activeSessionId !== null &&
      !Object.hasOwn(state.sessions, input.activeSessionId)
    )
      return null;
    state.activeSessionId = input.activeSessionId;
    return state;
  } catch {
    return null;
  }
}
