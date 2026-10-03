import {
  reconcileWorkout,
  validateDraft,
  validateSetValues,
  type EntryDraft,
  type EntryDraftStore,
  type EntryWorkout,
  type SetValues,
} from '../../domain/workout-entry';
import type {
  PreloadExercise,
  PreloadParticipant,
} from '../../domain/workout-preload/types';
import type {
  JsonValue,
  OutboxStore,
  SyncSession,
} from '../../domain/workout-sync/types';
import {
  createJournalOperation,
  type TypedJournalOperation,
} from '../../domain/workout-sync/operations';
import { saveJournalEntry } from '../workout-sync/save';

export type EntryServiceOptions = {
  session: SyncSession;
  getSession: () => SyncSession | null;
  outbox: OutboxStore;
  drafts: EntryDraftStore;
  deviceId: string;
  newId: () => string;
  now: () => string;
};
export type EntryRead = {
  workout: EntryWorkout;
  draft: EntryDraft;
  issues: Awaited<ReturnType<NonNullable<OutboxStore['confirmedIssues']>>>;
};
export class WorkoutEntryService {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly options: EntryServiceOptions) {
    for (const store of [options.outbox, options.drafts])
      if (
        store.scope.accountId !== options.session.accountId ||
        store.scope.workspaceId !== options.session.workspaceId
      )
        throw new Error('entry_scope_mismatch');
  }
  async pendingCount(): Promise<number> {
    this.assertSession();
    const pending = await this.options.outbox.pending(Number.MAX_SAFE_INTEGER);
    this.assertSession();
    return pending.length;
  }
  flush(): Promise<void> {
    return this.queue;
  }
  private assertSession(): void {
    const current = this.options.getSession();
    const captured = this.options.session;
    if (
      !current ||
      current.accountId !== captured.accountId ||
      current.workspaceId !== captured.workspaceId ||
      current.sessionId !== captured.sessionId ||
      current.accessToken !== captured.accessToken
    )
      throw new Error('entry_session_changed');
  }
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      this.assertSession();
      return task();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async read(participant: PreloadParticipant): Promise<EntryRead> {
    this.assertSession();
    const draft = (await this.options.drafts.read(participant.workoutId)) ?? {
      workoutId: participant.workoutId,
      bookingId: participant.bookingId,
      focusExerciseId: null,
      values: {},
    };
    if (draft.bookingId !== participant.bookingId)
      throw new Error('entry_booking_mismatch');
    let local: EntryWorkout | null = null;
    for (const id of draft.localEntityIds ?? []) {
      const value = await this.options.outbox.read(id);
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.participant &&
        value.tombstones
      ) {
        const candidate = value as unknown as EntryWorkout;
        if (
          candidate.participant.workoutId !== participant.workoutId ||
          candidate.participant.bookingId !== participant.bookingId
        )
          throw new Error('entry_projection_mismatch');
        local = candidate;
      }
    }
    const pending = await this.options.outbox.pending(Number.MAX_SAFE_INTEGER);
    const allIssues = (await this.options.outbox.confirmedIssues?.()) ?? [];
    const ids = new Set([
      participant.workoutId,
      ...(local?.tombstones ?? []),
      ...[participant, ...(local ? [local.participant] : [])].flatMap((item) =>
        item.exercises.flatMap((exercise) => [
          exercise.id,
          ...exercise.sets.map((set) => set.id),
        ]),
      ),
    ]);
    const issues = [
      ...allIssues,
      ...pending.flatMap((item) =>
        item.result?.status === 'error' ? [item.result] : [],
      ),
    ].filter((issue) => ids.has(issue.entity_id));
    this.assertSession();
    return {
      workout: reconcileWorkout(participant, local, pending, issues),
      draft,
      issues,
    };
  }
  saveDraft(participant: PreloadParticipant, draft: EntryDraft): Promise<void> {
    return this.serialize(async () => {
      validateDraft(draft);
      if (
        draft.workoutId !== participant.workoutId ||
        draft.bookingId !== participant.bookingId ||
        (draft.focusExerciseId !== null &&
          !participant.exercises.some(
            (exercise) => exercise.id === draft.focusExerciseId,
          )) ||
        Object.keys(draft.values).some(
          (id) => !participant.exercises.some((exercise) => exercise.id === id),
        )
      )
        throw new Error('entry_draft_mismatch');
      const existing = await this.options.drafts.read(participant.workoutId);
      this.assertSession();
      await this.options.drafts.save({
        ...draft,
        localEntityIds: existing?.localEntityIds ?? [],
      });
      this.assertSession();
    });
  }
  private async persist(
    participant: PreloadParticipant,
    workout: EntryWorkout,
    operation: TypedJournalOperation,
  ): Promise<EntryRead> {
    const draft = (await this.options.drafts.read(participant.workoutId)) ?? {
      workoutId: participant.workoutId,
      bookingId: participant.bookingId,
      focusExerciseId: null,
      values: {},
    };
    this.assertSession();
    await this.options.drafts.save({
      ...draft,
      localEntityIds: [
        ...(draft.localEntityIds ?? []).filter(
          (id) => id !== operation.entity_id,
        ),
        operation.entity_id,
      ],
    });
    this.assertSession();
    await saveJournalEntry(
      this.options.outbox,
      { entityId: operation.entity_id, value: workout as unknown as JsonValue },
      createJournalOperation(operation),
    );
    this.assertSession();
    return this.read(workout.participant);
  }
  private envelope(entityId: string, revision: number) {
    return {
      entity_id: entityId,
      base_revision: revision,
      operation_id: this.options.newId(),
      device_id: this.options.deviceId,
      created_at: this.options.now(),
    };
  }
  confirm(
    participant: PreloadParticipant,
    exerciseId: string,
    values: SetValues,
  ): Promise<EntryRead> {
    return this.serialize(async () => {
      validateSetValues(values);
      const state = await this.read(participant);
      if (state.workout.participant.workoutStatus !== 'in_progress')
        throw new Error('entry_workout_not_ready');
      const exercise = state.workout.participant.exercises.find(
        (item) => item.id === exerciseId,
      );
      if (
        !exercise ||
        (exercise.measure === 'reps'
          ? values.reps === null || values.seconds !== null
          : values.seconds === null || values.reps !== null)
      )
        throw new Error('entry_measure_mismatch');
      const id = this.options.newId();
      const position =
        Math.max(-1, ...exercise.sets.map((set) => set.position)) + 1;
      const next = {
        ...state.workout,
        participant: {
          ...state.workout.participant,
          exercises: state.workout.participant.exercises.map((item) =>
            item.id === exerciseId
              ? {
                  ...item,
                  sets: [
                    ...item.sets,
                    { id, revision: 1, position, ...values },
                  ],
                }
              : item,
          ),
        },
      };
      return this.persist(participant, next, {
        ...this.envelope(id, 0),
        kind: 'upsert_set',
        payload: {
          workout_instance_id: participant.workoutId,
          workout_exercise_id: exerciseId,
          position,
          reps: values.reps,
          seconds: values.seconds,
          weight_g: values.weightGrams,
        },
      });
    });
  }
  undo(participant: PreloadParticipant, setId: string): Promise<EntryRead> {
    return this.serialize(async () => {
      const state = await this.read(participant);
      const exercise = state.workout.participant.exercises.find((item) =>
        item.sets.some((set) => set.id === setId),
      );
      const set = exercise?.sets.find((item) => item.id === setId);
      if (
        !exercise ||
        !set ||
        state.workout.participant.workoutStatus !== 'in_progress'
      )
        throw new Error('entry_set_unavailable');
      const next = {
        ...state.workout,
        tombstones: [...state.workout.tombstones, setId],
        tombstoneRevisions: {
          ...state.workout.tombstoneRevisions,
          [setId]: set.revision + 1,
        },
        participant: {
          ...state.workout.participant,
          exercises: state.workout.participant.exercises.map((item) =>
            item.id === exercise.id
              ? { ...item, sets: item.sets.filter((row) => row.id !== setId) }
              : item,
          ),
        },
      };
      return this.persist(participant, next, {
        ...this.envelope(setId, set.revision),
        kind: 'delete_set',
        payload: {
          workout_instance_id: participant.workoutId,
          workout_exercise_id: exercise.id,
        },
      });
    });
  }
  add(
    participant: PreloadParticipant,
    exercise: PreloadExercise,
    replacedFromId?: string,
  ): Promise<EntryRead> {
    return this.serialize(async () => {
      const state = await this.read(participant);
      if (state.workout.participant.workoutStatus !== 'in_progress')
        throw new Error('entry_workout_not_ready');
      const original = replacedFromId
        ? state.workout.participant.exercises.find(
            (item) => item.id === replacedFromId,
          )
        : null;
      if (replacedFromId && !original)
        throw new Error('entry_exercise_unavailable');
      const id = this.options.newId();
      const position =
        Math.max(
          -1,
          ...state.workout.participant.exercises.map((item) => item.position),
        ) + 1;
      const added = {
        ...exercise,
        id,
        position,
        revision: 1,
        sets: [],
        previousSets: [],
        replacedFromId: replacedFromId ?? null,
      };
      const next = {
        ...state.workout,
        participant: {
          ...state.workout.participant,
          exercises: [
            ...state.workout.participant.exercises.map((item) =>
              item.id === replacedFromId ? { ...item, skipped: true } : item,
            ),
            added,
          ],
        },
      };
      const payload = {
        workout_instance_id: participant.workoutId,
        exercise_id: exercise.exerciseId,
        position,
        planned_sets: exercise.plannedSets,
      };
      return this.persist(
        participant,
        next,
        original
          ? {
              ...this.envelope(id, 0),
              kind: 'replace_exercise',
              payload: { ...payload, replaced_from_id: original.id },
            }
          : { ...this.envelope(id, 0), kind: 'add_exercise', payload },
      );
    });
  }
  resolve(
    participant: PreloadParticipant,
    entityId: string,
    conflictId: string,
    selection: 'current' | 'incoming',
    revision: number,
  ): Promise<EntryRead> {
    return this.serialize(async () => {
      const state = await this.read(participant);
      const belongs =
        entityId === participant.workoutId ||
        state.workout.participant.exercises.some(
          (exercise) =>
            exercise.id === entityId ||
            exercise.sets.some((set) => set.id === entityId),
        ) ||
        state.workout.tombstones.includes(entityId);
      if (!belongs) throw new Error('entry_conflict_scope_mismatch');
      return this.persist(participant, state.workout, {
        ...this.envelope(entityId, revision),
        kind: 'resolve_conflict',
        payload: {
          conflict_id: conflictId,
          selected_version: selection,
          expected_revision: revision,
        },
      });
    });
  }
}
