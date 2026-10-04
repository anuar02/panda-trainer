import {
  reconcileWorkout,
  validateDraft,
  validateSetValues,
  workoutFinishState,
  workoutFinishLocked,
  type EntryDraft,
  type EntryDraftStore,
  type EntryWorkout,
  type SetValues,
  type EntryFinish,
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
import type {
  ScopedOutboxSnapshot,
  ScopedOutboxSnapshotRequest,
} from '../workout-sync/snapshot-types';
import {
  createJournalOperation,
  type TypedJournalOperation,
} from '../../domain/workout-sync/operations';

export type EntryServiceOptions = {
  session: SyncSession;
  getSession: () => SyncSession | null;
  outbox: OutboxStore;
  drafts: EntryDraftStore;
  deviceId: string;
  newId: () => string;
  now: () => string;
  isParticipantCurrent?: (participant: PreloadParticipant) => boolean;
};
export type EntryRead = {
  workout: EntryWorkout;
  draft: EntryDraft;
  issues: Awaited<ReturnType<NonNullable<OutboxStore['confirmedIssues']>>>;
  finish?: EntryFinish;
};
export class WorkoutEntryService {
  private queue: Promise<void> = Promise.resolve();
  private readonly session: SyncSession;
  private readonly mutationSaveFailures = new Set<string>();
  constructor(private readonly options: EntryServiceOptions) {
    this.session = Object.freeze({ ...options.session });
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
  private assertSession(participant?: PreloadParticipant): void {
    const current = this.options.getSession();
    const captured = this.session;
    if (
      !current ||
      current.accountId !== captured.accountId ||
      current.workspaceId !== captured.workspaceId ||
      current.sessionId !== captured.sessionId ||
      current.accessToken !== captured.accessToken
    )
      throw new Error('entry_session_changed');
    if (
      participant &&
      (!participant.workoutId ||
        !participant.bookingId ||
        !participant.clientRecordId ||
        this.options.isParticipantCurrent?.(participant) === false)
    )
      throw new Error('entry_participant_changed');
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
    this.assertSession(participant);
    const draft = (await this.options.drafts.read(participant.workoutId)) ?? {
      workoutId: participant.workoutId,
      bookingId: participant.bookingId,
      focusExerciseId: null,
      values: {},
    };
    this.assertSession(participant);
    if (draft.bookingId !== participant.bookingId)
      throw new Error('entry_booking_mismatch');
    let local: EntryWorkout | null = null;
    const localIds = draft.localEntityIds ?? [];
    for (const id of [
      ...localIds,
      ...(localIds.includes(participant.workoutId)
        ? []
        : [participant.workoutId]),
    ]) {
      const value = await this.options.outbox.read(id);
      this.assertSession(participant);
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
          candidate.participant.bookingId !== participant.bookingId ||
          candidate.participant.clientRecordId !== participant.clientRecordId
        )
          throw new Error('entry_projection_mismatch');
        if (
          candidate.finishOperation &&
          (candidate.finishOperation.kind !== 'finish_workout' ||
            candidate.finishOperation.entity_id !== participant.workoutId ||
            typeof candidate.finishOperation.operation_id !== 'string' ||
            !candidate.finishOperation.operation_id ||
            typeof candidate.finishOperation.device_id !== 'string' ||
            !candidate.finishOperation.device_id ||
            !Number.isSafeInteger(candidate.finishOperation.base_revision) ||
            candidate.finishOperation.base_revision < 1 ||
            typeof candidate.finishOperation.created_at !== 'string' ||
            !Number.isFinite(
              Date.parse(candidate.finishOperation.created_at),
            ) ||
            !candidate.finishOperation.payload ||
            Array.isArray(candidate.finishOperation.payload) ||
            typeof candidate.finishOperation.payload !== 'object' ||
            Object.keys(candidate.finishOperation.payload).length !== 0)
        )
          throw new Error('entry_finish_projection_mismatch');
        if (
          candidate.finishResolution &&
          (!candidate.finishOperation ||
            typeof candidate.finishResolution.operationId !== 'string' ||
            !candidate.finishResolution.operationId ||
            typeof candidate.finishResolution.conflictId !== 'string' ||
            !candidate.finishResolution.conflictId ||
            !['current', 'incoming'].includes(
              candidate.finishResolution.selection,
            ))
        )
          throw new Error('entry_finish_projection_mismatch');
        if (localIds.includes(id) || !local) local = candidate;
      }
    }
    const pending = await this.options.outbox.pending(Number.MAX_SAFE_INTEGER);
    this.assertSession(participant);
    const allIssues = (await this.options.outbox.confirmedIssues?.()) ?? [];
    this.assertSession(participant);
    const ids = new Set([
      participant.workoutId,
      ...localIds,
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
    this.assertSession(participant);
    if (local) {
      const { finishRelease: previousRelease, ...locked } = local;
      void previousRelease;
      local = locked;
      const release = await this.finishRelease(participant, local);
      this.assertSession(participant);
      if (release) local = { ...local, finishRelease: release };
    }
    const workout = reconcileWorkout(participant, local, pending, issues);
    return {
      workout,
      draft,
      issues,
      finish: workoutFinishState(workout, pending, issues),
    };
  }
  private async finishRelease(
    participant: PreloadParticipant,
    workout: EntryWorkout,
  ): Promise<EntryWorkout['finishRelease']> {
    const finish = workout.finishOperation;
    const resolution = workout.finishResolution;
    const store = this.options.outbox;
    if (
      !finish ||
      !resolution ||
      resolution.selection !== 'current' ||
      participant.workoutStatus !== 'in_progress' ||
      !('scopedSnapshot' in store) ||
      typeof store.scopedSnapshot !== 'function'
    )
      return undefined;
    this.assertSession(participant);
    let snapshot: ScopedOutboxSnapshot;
    try {
      snapshot = await (
        store as OutboxStore & {
          scopedSnapshot(
            request: ScopedOutboxSnapshotRequest,
          ): Promise<ScopedOutboxSnapshot>;
        }
      ).scopedSnapshot({
        expectedScope: {
          accountId: this.session.accountId,
          workspaceId: this.session.workspaceId,
        },
        isCurrentSession: () => {
          try {
            this.assertSession(participant);
            return true;
          } catch {
            return false;
          }
        },
      });
    } catch {
      this.assertSession(participant);
      return undefined;
    }
    this.assertSession(participant);
    if (
      snapshot.metadata.scope.accountId !== this.session.accountId ||
      snapshot.metadata.scope.workspaceId !== this.session.workspaceId
    )
      return undefined;
    const finishRows = snapshot.operations.filter(
      (row) => row.operationId === finish.operation_id,
    );
    const resolutionRows = snapshot.operations.filter(
      (row) => row.operationId === resolution.operationId,
    );
    if (finishRows.length !== 1 || resolutionRows.length !== 1)
      return undefined;
    const original = finishRows[0]!;
    const resolved = resolutionRows[0]!;
    const operation = resolved.operation;
    const receipt = resolved.result;
    if (
      original.confirmed !== 1 ||
      original.operation.kind !== 'finish_workout' ||
      original.entityId !== participant.workoutId ||
      original.operation.entity_id !== participant.workoutId ||
      original.operation.operation_id !== finish.operation_id ||
      original.operation.base_revision !== finish.base_revision ||
      original.operation.device_id !== finish.device_id ||
      original.operation.created_at !== finish.created_at ||
      Object.keys(original.operation.payload).length !== 0 ||
      original.result?.operation_id !== finish.operation_id ||
      original.result.entity_id !== participant.workoutId ||
      original.result.status !== 'conflict' ||
      original.result.conflict_id !== resolution.conflictId ||
      resolved.confirmed !== 1 ||
      resolved.sequence <= original.sequence ||
      resolved.entityId !== participant.workoutId ||
      operation.operation_id !== resolution.operationId ||
      operation.entity_id !== participant.workoutId ||
      operation.kind !== 'resolve_conflict' ||
      operation.device_id !== finish.device_id ||
      operation.payload.conflict_id !== resolution.conflictId ||
      operation.payload.selected_version !== 'current' ||
      Object.keys(operation.payload).length !== 3 ||
      operation.payload.expected_revision !== operation.base_revision ||
      !Number.isSafeInteger(operation.base_revision) ||
      original.result.revision !== operation.base_revision ||
      receipt?.operation_id !== resolution.operationId ||
      receipt.entity_id !== participant.workoutId ||
      receipt.status !== 'applied' ||
      receipt.revision === null ||
      !Number.isSafeInteger(receipt.revision) ||
      receipt.revision <= operation.base_revision ||
      receipt.revision <= finish.base_revision ||
      participant.workoutRevision < receipt.revision
    )
      return undefined;
    if (
      resolution.operation &&
      (resolution.operation.operation_id !== operation.operation_id ||
        resolution.operation.entity_id !== operation.entity_id ||
        resolution.operation.kind !== operation.kind ||
        resolution.operation.base_revision !== operation.base_revision ||
        resolution.operation.device_id !== operation.device_id ||
        resolution.operation.created_at !== operation.created_at ||
        resolution.operation.payload.conflict_id !==
          operation.payload.conflict_id ||
        resolution.operation.payload.selected_version !==
          operation.payload.selected_version ||
        resolution.operation.payload.expected_revision !==
          operation.payload.expected_revision ||
        Object.keys(resolution.operation.payload).length !== 3)
    )
      return undefined;
    return {
      operationId: finish.operation_id,
      resolutionOperationId: resolution.operationId,
      revision: receipt.revision,
    };
  }
  saveDraft(participant: PreloadParticipant, draft: EntryDraft): Promise<void> {
    return this.serialize(async () => {
      this.assertSession(participant);
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
      this.assertSession(participant);
      await this.options.drafts.save({
        ...draft,
        localEntityIds: existing?.localEntityIds ?? [],
      });
      this.assertSession(participant);
    });
  }
  private async persist(
    participant: PreloadParticipant,
    workout: EntryWorkout,
    operation: TypedJournalOperation,
  ): Promise<EntryRead> {
    this.assertSession(participant);
    const draft = (await this.options.drafts.read(participant.workoutId)) ?? {
      workoutId: participant.workoutId,
      bookingId: participant.bookingId,
      focusExerciseId: null,
      values: {},
    };
    this.assertSession(participant);
    if (draft.bookingId !== participant.bookingId)
      throw new Error('entry_booking_mismatch');
    try {
      await this.options.drafts.save({
        ...draft,
        localEntityIds: [
          ...(draft.localEntityIds ?? []).filter(
            (id) => id !== operation.entity_id,
          ),
          operation.entity_id,
        ],
      });
      this.assertSession(participant);
      await this.options.outbox.save(
        {
          entityId: operation.entity_id,
          value: workout as unknown as JsonValue,
        },
        createJournalOperation(operation),
      );
      this.assertSession(participant);
      if (operation.kind !== 'finish_workout')
        this.mutationSaveFailures.delete(participant.workoutId);
    } catch (error) {
      if (operation.kind !== 'finish_workout')
        this.mutationSaveFailures.add(participant.workoutId);
      throw error;
    }
    this.assertSession(participant);
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
  finish(participant: PreloadParticipant): Promise<EntryRead> {
    return this.serialize(async () => {
      this.assertSession(participant);
      const state = await this.read(participant);
      this.assertSession(participant);
      if (
        workoutFinishLocked(state.workout) ||
        state.finish?.status === 'applied'
      )
        return state;
      if (this.mutationSaveFailures.has(participant.workoutId))
        throw new Error('entry_local_save_failed');
      if (state.workout.participant.workoutStatus !== 'in_progress')
        throw new Error('entry_workout_not_ready');
      if (state.issues.length) throw new Error('entry_finish_unresolved');
      const operation = createJournalOperation({
        ...this.envelope(
          participant.workoutId,
          state.workout.participant.workoutRevision,
        ),
        kind: 'finish_workout',
        payload: {},
      });
      const {
        finishResolution: oldResolution,
        finishRelease: oldRelease,
        ...nextWorkout
      } = state.workout;
      void oldResolution;
      void oldRelease;
      return this.persist(
        participant,
        {
          ...nextWorkout,
          finishHistory: [
            ...(state.workout.finishHistory ?? []),
            ...(state.workout.finishOperation &&
            state.workout.finishResolution &&
            state.workout.finishRelease
              ? [
                  {
                    operation: state.workout.finishOperation,
                    resolution: state.workout.finishResolution,
                    release: state.workout.finishRelease,
                  },
                ]
              : []),
          ],
          finishOperation: operation,
        },
        { ...operation, kind: 'finish_workout', payload: {} },
      );
    });
  }
  confirm(
    participant: PreloadParticipant,
    exerciseId: string,
    values: SetValues,
  ): Promise<EntryRead> {
    return this.serialize(async () => {
      validateSetValues(values);
      const state = await this.read(participant);
      if (
        state.workout.participant.workoutStatus !== 'in_progress' ||
        workoutFinishLocked(state.workout)
      )
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
        state.workout.participant.workoutStatus !== 'in_progress' ||
        workoutFinishLocked(state.workout)
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
      if (
        state.workout.participant.workoutStatus !== 'in_progress' ||
        workoutFinishLocked(state.workout)
      )
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
      const operation: TypedJournalOperation = {
        ...this.envelope(entityId, revision),
        kind: 'resolve_conflict',
        payload: {
          conflict_id: conflictId,
          selected_version: selection,
          expected_revision: revision,
        },
      };
      const resolvesFinish =
        entityId === participant.workoutId &&
        state.workout.finishOperation &&
        state.issues.some(
          (issue) =>
            issue.operation_id ===
              state.workout.finishOperation?.operation_id &&
            issue.conflict_id === conflictId,
        );
      return this.persist(
        participant,
        resolvesFinish
          ? {
              ...state.workout,
              finishResolution: {
                operationId: operation.operation_id,
                conflictId,
                selection,
                operation: createJournalOperation(operation),
              },
            }
          : state.workout,
        operation,
      );
    });
  }
}
