import { syncWorkoutCatalog, validWorkoutCatalog } from './catalog';
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
  WorkoutNote,
  WorkoutSession,
} from './types';
import { workoutExerciseKey, workoutExerciseLibrary } from './library';

export * from './types';
export * from './fixtures';
export * from './selectors';
export * from './library';
export * from './catalog';

export function createWorkoutState(
  catalog?: readonly WorkoutSession[],
): WorkoutState {
  return {
    version: 1,
    sessions: {},
    activeSessionId: null,
    ...(catalog ? { catalog: [...catalog] } : {}),
  };
}

function createJournal(
  sessionId: string,
  catalog?: readonly WorkoutSession[],
): WorkoutJournal | null {
  const session = getWorkoutSession(sessionId, catalog);
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
          p.program !== undefined
            ? p.program
            : session.kind === 'personal'
              ? session.program
              : (workoutClients[p.clientId]?.program ?? null);
        return [
          p.clientId,
          {
            name,
            reply: session.status === 'cancelled' ? 'cancelled' : p.reply,
            exercises:
              session.planSnapshot && name === session.program
                ? session.planSnapshot.map((e, index) => ({
                    id: `e${index + 1}`,
                    name: e.name,
                    sets: e.sets,
                    plannedSets: e.sets,
                    reps: e.reps,
                    target: e.target,
                    unit: e.unit,
                    prev: { kg: 0, reps: 0 },
                    pr: 0,
                  }))
                : workoutExercises(name),
          },
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
    total: exercises.reduce(
      (n, ex) =>
        n +
        (ex.skipped
          ? (journal.values[clientId]?.[ex.id] ?? []).filter(validSet).length
          : ex.sets),
      0,
    ),
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
  const bodyweight = exercise.bodyweight ?? exercise.prev.kg === 0;
  const kg = bodyweight ? 0 : Number(kgText);
  const reps = Number(repsText);
  if ((!bodyweight && !/^\d+(\.\d+)?$/.test(kgText)) || !/^\d+$/.test(repsText))
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
    if (!getWorkoutSession(action.sessionId, state.catalog)) return state;
    const journal =
      state.sessions[action.sessionId] ??
      createJournal(action.sessionId, state.catalog);
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
        [action.sessionId]: {
          ...journal,
          active,
          ...(journal.undo ? { undo: null } : {}),
        },
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
      ? update({
          ...journal,
          active: action.clientId,
          ...(journal.undo ? { undo: null } : {}),
        })
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
  if (action.type === 'undo') {
    const undo = journal.undo;
    if (
      !undo ||
      undo.clientId !== action.clientId ||
      journal.drafts[undo.clientId]?.[undo.exerciseId]?.[undo.setIndex]
    )
      return state;
    const current =
      journal.values[undo.clientId]?.[undo.exerciseId]?.[undo.setIndex];
    if (
      !current ||
      current.kg !== undo.value.kg ||
      current.reps !== undo.value.reps
    )
      return state;
    return update({
      ...journal,
      undo: null,
      finishPending: false,
      values: setEntry(
        journal.values,
        undo.clientId,
        undo.exerciseId,
        undo.setIndex,
        undo.previous,
      ),
    });
  }
  if (
    action.type === 'addNote' ||
    action.type === 'removeNote' ||
    action.type === 'shareNote'
  ) {
    const notes = [...(journal.notes?.[action.clientId] ?? [])];
    if (action.type === 'addNote') {
      const text = action.text.trim().replace(/\s+/g, ' ').slice(0, 500);
      if (!text || !/^([01]\d|2[0-3]):[0-5]\d$/.test(action.at)) return state;
      notes.push({ text, at: action.at, shared: false });
    } else {
      const note = notes[action.index];
      if (!Number.isInteger(action.index) || !note) return state;
      if (action.type === 'removeNote') notes.splice(action.index, 1);
      else notes[action.index] = { ...note, shared: !note.shared };
    }
    return update({
      ...journal,
      notes: { ...journal.notes, [action.clientId]: notes },
    });
  }
  if (
    action.type === 'addExercise' ||
    action.type === 'replaceExercise' ||
    action.type === 'skipExercise'
  ) {
    const exercises = plan.exercises.map((ex) => ({ ...ex }));
    const old =
      'exerciseId' in action
        ? exercises.find((ex) => ex.id === action.exerciseId)
        : undefined;
    const drafts = {
      ...journal.drafts,
      [action.clientId]: { ...journal.drafts[action.clientId] },
    };
    const values = {
      ...journal.values,
      [action.clientId]: { ...journal.values[action.clientId] },
    };
    if (action.type === 'skipExercise') {
      const skip = action.skip ?? true;
      if (!old || old.replacedBy || Boolean(old.skipped) === skip) return state;
      if (skip) delete drafts[action.clientId]?.[old.id];
      if (
        skip &&
        old.origin === 'added' &&
        !(values[action.clientId]?.[old.id] ?? []).some(validSet)
      ) {
        exercises.splice(exercises.indexOf(old), 1);
        delete values[action.clientId]?.[old.id];
      } else old.skipped = skip;
    } else {
      if (action.type === 'replaceExercise' && (!old || old.skipped))
        return state;
      const name = action.spec.name.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!name) return state;
      const library = workoutExerciseLibrary.find((ex) =>
        [ex.name, ...(ex.aliases ?? [])].some(
          (alias) => workoutExerciseKey(alias) === workoutExerciseKey(name),
        ),
      );
      const seed = ['Низ А', 'Верх Б', 'Full Body', 'Сила 5×5']
        .flatMap(workoutExercises)
        .find((ex) => ex.name === library?.name);
      let ordinal = 1;
      while (exercises.some((ex) => ex.id === `x${ordinal}`)) ordinal++;
      const sets = old
        ? Math.max(
            1,
            old.sets -
              (values[action.clientId]?.[old.id] ?? []).filter(validSet).length,
          )
        : 3;
      const bodyweight = action.spec.bodyweight ?? library?.bodyweight ?? false;
      const added: WorkoutExercise = {
        id: `x${ordinal}`,
        name: library?.name ?? name,
        sets,
        plannedSets: old ? sets : 0,
        reps: '',
        target: 0,
        prev: seed
          ? { ...seed.prev, ...(bodyweight ? { kg: 0 } : {}) }
          : { kg: 0, reps: 0 },
        pr: 0,
        unit: action.spec.unit ?? library?.unit ?? 'повт',
        bodyweight,
        origin: old ? 'replaced' : 'added',
        ...(old ? { replaces: old.name } : {}),
      };
      if (old) {
        old.skipped = true;
        old.replacedBy = added.id;
        delete drafts[action.clientId]?.[old.id];
        exercises.splice(exercises.indexOf(old) + 1, 0, added);
      } else exercises.push(added);
    }
    return update({
      ...journal,
      undo: null,
      finishPending: false,
      drafts,
      values,
      plans: { ...journal.plans, [action.clientId]: { ...plan, exercises } },
    });
  }
  if (!('exerciseId' in action)) return state;
  const exercise = plan.exercises.find((ex) => ex.id === action.exerciseId);
  if (!exercise || exercise.skipped) return state;
  if (action.type === 'addSet' || action.type === 'removeSet') {
    const last = exercise.sets - 1;
    if (
      action.type === 'addSet'
        ? exercise.sets >= 30
        : exercise.sets <= Math.max(1, exercise.plannedSets) ||
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
      undo: null,
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
      undo: null,
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
    undo: {
      clientId: action.clientId,
      exerciseId: exercise.id,
      setIndex: action.setIndex,
      value: { ...action.value },
      previous:
        journal.values[action.clientId]?.[exercise.id]?.[action.setIndex] ??
        null,
    },
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

function decodeExercises(
  input: unknown[],
  originals: WorkoutExercise[],
): WorkoutExercise[] | null {
  const result: WorkoutExercise[] = [];
  for (const item of input) {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      result.some((ex) => ex.id === item.id) ||
      typeof item.sets !== 'number' ||
      !Number.isInteger(item.sets) ||
      item.sets < 1 ||
      item.sets > 30
    )
      return null;
    const original = originals.find((ex) => ex.id === item.id);
    if (original) {
      const expected = { ...original, sets: item.sets };
      if (
        item.sets < original.plannedSets ||
        Object.keys(expected).some(
          (key) =>
            JSON.stringify(item[key]) !==
            JSON.stringify(expected[key as keyof WorkoutExercise]),
        ) ||
        item.origin !== undefined ||
        item.replaces !== undefined ||
        item.bodyweight !== undefined
      )
        return null;
    } else {
      if (
        !/^x[1-9]\d*$/.test(item.id) ||
        (item.origin !== 'added' && item.origin !== 'replaced') ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.length > 80 ||
        typeof item.plannedSets !== 'number' ||
        !Number.isInteger(item.plannedSets) ||
        item.plannedSets < 0 ||
        item.plannedSets > item.sets ||
        (item.origin === 'added'
          ? item.plannedSets !== 0
          : item.plannedSets < 1) ||
        item.reps !== '' ||
        item.target !== 0 ||
        item.pr !== 0 ||
        typeof item.bodyweight !== 'boolean' ||
        (item.unit !== 'сек' && item.unit !== 'повт') ||
        !record(item.prev) ||
        typeof item.prev.kg !== 'number' ||
        !Number.isFinite(item.prev.kg) ||
        item.prev.kg < 0 ||
        typeof item.prev.reps !== 'number' ||
        !Number.isSafeInteger(item.prev.reps) ||
        item.prev.reps < 0 ||
        (item.origin === 'replaced'
          ? typeof item.replaces !== 'string' || !item.replaces
          : item.replaces !== undefined)
      )
        return null;
    }
    if (
      (item.skipped !== undefined && typeof item.skipped !== 'boolean') ||
      (item.replacedBy !== undefined &&
        (typeof item.replacedBy !== 'string' || item.skipped !== true))
    )
      return null;
    result.push(item as WorkoutExercise);
  }
  if (originals.some((ex) => !result.some((item) => item.id === ex.id)))
    return null;
  if (
    result
      .filter((ex) => originals.some((original) => original.id === ex.id))
      .some((ex, index) => originals[index]?.id !== ex.id)
  )
    return null;
  for (const ex of result) {
    if (ex.replacedBy) {
      const target = result.find((item) => item.id === ex.replacedBy);
      if (
        !target ||
        target.origin !== 'replaced' ||
        target.replaces !== ex.name ||
        result.indexOf(target) <= result.indexOf(ex)
      )
        return null;
    }
    if (
      ex.origin === 'replaced' &&
      result.filter((item) => item.replacedBy === ex.id).length !== 1
    )
      return null;
  }
  return result;
}

export function decodeWorkoutState(
  raw: string | null,
  catalog?: readonly WorkoutSession[],
): WorkoutState | null {
  if (raw === null) return createWorkoutState(catalog);
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
    if (input.catalog !== undefined && !validWorkoutCatalog(input.catalog))
      return null;
    const savedCatalog = input.catalog as WorkoutSession[] | undefined;
    const state = createWorkoutState(savedCatalog ?? catalog);
    for (const [id, saved] of Object.entries(input.sessions)) {
      const journal = createJournal(id, savedCatalog ?? catalog);
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
          !Array.isArray(storedPlan.exercises)
        )
          return null;
        const exercises = decodeExercises(storedPlan.exercises, plan.exercises);
        if (!exercises) return null;
        plan.exercises = exercises;
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
      const notes: Record<string, WorkoutNote[]> = {};
      if (saved.notes !== undefined) {
        if (!record(saved.notes)) return null;
        for (const [clientId, list] of Object.entries(saved.notes)) {
          if (!Object.hasOwn(journal.plans, clientId) || !Array.isArray(list))
            return null;
          notes[clientId] = [];
          for (const note of list) {
            if (
              !record(note) ||
              typeof note.text !== 'string' ||
              !note.text.trim() ||
              note.text.length > 500 ||
              typeof note.at !== 'string' ||
              !/^([01]\d|2[0-3]):[0-5]\d$/.test(note.at) ||
              typeof note.shared !== 'boolean'
            )
              return null;
            notes[clientId].push({
              text: note.text,
              at: note.at,
              shared: note.shared,
            });
          }
        }
      }
      if (saved.undo !== undefined && saved.undo !== null) {
        const undo = saved.undo;
        if (
          !record(undo) ||
          typeof undo.clientId !== 'string' ||
          undo.clientId !== saved.active ||
          !workoutEligible(journal, undo.clientId) ||
          typeof undo.exerciseId !== 'string' ||
          typeof undo.setIndex !== 'number' ||
          !Number.isInteger(undo.setIndex) ||
          undo.setIndex < 0 ||
          !validSet(undo.value) ||
          !(undo.previous === null || validSet(undo.previous))
        )
          return null;
        const current =
          values[undo.clientId]?.[undo.exerciseId]?.[undo.setIndex];
        if (
          !current ||
          current.kg !== undo.value.kg ||
          current.reps !== undo.value.reps ||
          drafts[undo.clientId]?.[undo.exerciseId]?.[undo.setIndex] ||
          journal.plans[undo.clientId]?.exercises.find(
            (ex) => ex.id === undo.exerciseId,
          )?.skipped
        )
          return null;
        journal.undo = {
          clientId: undo.clientId,
          exerciseId: undo.exerciseId,
          setIndex: undo.setIndex,
          value: { ...undo.value },
          previous: undo.previous === null ? null : { ...undo.previous },
        };
      } else if (saved.undo === null) journal.undo = null;
      state.sessions[id] = {
        ...journal,
        active: saved.active,
        finished: saved.finished,
        finishPending: false,
        values,
        drafts,
        ...(saved.notes !== undefined ? { notes } : {}),
      };
    }
    if (
      input.activeSessionId !== null &&
      !Object.hasOwn(state.sessions, input.activeSessionId)
    )
      return null;
    state.activeSessionId = input.activeSessionId;
    return catalog ? syncWorkoutCatalog(state, catalog) : state;
  } catch {
    return null;
  }
}
