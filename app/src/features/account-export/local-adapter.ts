import { validateWorkoutPreloadContext } from '@/domain/workout-preload/validation';
import type { AccountExport } from '@/domain/account-export';
import { exportRowSchemas, isExportUuid } from '@/domain/account-export';
import {
  serializeLocalExport,
  type Scope,
} from '@/domain/account-local-export';
import type { ScopedOutboxSnapshot } from '../workout-sync/snapshot-types';
import { snapshotUtf8Bytes } from '../workout-sync/snapshot-validation';
import type { CollectedSource } from './collector-types';
const allowed = new Set([
  ...Object.values(exportRowSchemas).flatMap((schema) => Object.keys(schema)),
  'operation_id',
  'kind',
  'entity_id',
  'base_revision',
  'device_id',
  'payload',
  'booking_id',
  'workout_instance_id',
  'workout_exercise_id',
  'position',
  'planned_sets',
  'replaced_from_id',
  'reps',
  'seconds',
  'weight_g',
  'text',
  'shared',
  'conflict_id',
  'selected_version',
  'expected_revision',
  'exercise_revision',
  'sets',
  'replacements',
  'last_correction_request_id',
  'exercise',
  'revision',
  'status',
  'draft_id',
  'code',
  'error_code',
  'envelope',
]);
export function assertSafeExportData(
  value: unknown,
  scope: Scope,
  depth = 0,
  budget = { nodes: 0, bytes: 0 },
): void {
  if (++budget.nodes > 200000 || depth > 20) throw new Error('limit');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('malformed');
    return;
  }
  if (typeof value === 'string') {
    if (
      /Bearer\s+[A-Za-z0-9._~-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\/invite\/[A-Za-z0-9_-]{32,}|(?:[?&#]|\b)(?:token|access_token|refresh_token|invitation_token)=/i.test(
        value,
      )
    )
      throw new Error('secret');
    budget.bytes += snapshotUtf8Bytes(value);
    if (budget.bytes > 8 * 1024 * 1024 || value.length > 65536)
      throw new Error('limit');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10000) throw new Error('limit');
    for (const item of value)
      assertSafeExportData(item, scope, depth + 1, budget);
    return;
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error('malformed');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key))
      throw new Error('unsupportedShape');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('malformed');
    const child: unknown = descriptor.value;
    if (
      key === 'last_correction_request_id' &&
      child !== null &&
      !isExportUuid(child)
    )
      throw new Error('malformed');
    if (key === 'workspace_id' && child !== scope.workspaceId)
      throw new Error('scopeMismatch');
    if (key === 'author_user_id' && child !== scope.accountId)
      throw new Error('scopeMismatch');
    assertSafeExportData(child, scope, depth + 1, budget);
  }
}
export function validateJournalPart(
  scope: Scope,
  records: unknown[],
  projections: unknown[] = [],
): void {
  serializeLocalExport(
    {
      format: 'panda-trainer-local',
      version: 1,
      scope,
      snapshot: {
        id: '11111111-1111-4111-8111-111111111111',
        capturedAt: '2026-10-04T00:00:00.000Z',
        atomic: 'unknown',
      },
      sources: {
        operations: { state: 'incomplete', records },
        projections: { state: 'incomplete', records: projections },
        conflicts: { state: 'unknown' },
        corrections: { state: 'unknown' },
        otherLocalData: { state: 'unknown' },
      },
    },
    scope,
  );
}
export function adaptLocalSnapshot(
  snapshot: ScopedOutboxSnapshot,
  scope: Scope,
  server?: AccountExport,
): CollectedSource[] {
  if (
    snapshot.metadata.scope.accountId !== scope.accountId ||
    snapshot.metadata.scope.workspaceId !== scope.workspaceId
  )
    throw new Error('scopeMismatch');
  if (
    snapshot.metadata.outboxCount !== snapshot.operations.length ||
    snapshot.metadata.entryCount !== snapshot.entries.length
  )
    throw new Error('malformed');
  const operations: unknown[] = [];
  const unresolved: unknown[] = [];
  const entries: unknown[] = [];
  const operationGaps: string[] = [];
  const entryGaps: string[] = [];
  const workouts = new Map(
    server?.collections.workout_instances.map((row) => [
      row.id,
      row.booking_id,
    ]) ?? [],
  );
  const bookings = new Set(
    server?.collections.bookings.map((row) => row.id) ?? [],
  );
  const exercises = new Map(
    server?.collections.workout_exercises.map((row) => [
      row.id,
      row.workout_instance_id,
    ]) ?? [],
  );
  const validated = snapshot.operations.filter((stored) => {
    try {
      if (
        stored.operationId !== stored.operation.operation_id ||
        stored.entityId !== stored.operation.entity_id ||
        JSON.stringify(JSON.parse(stored.operationJson)) !==
          JSON.stringify(stored.operation)
      )
        return false;
      if (
        (stored.resultJson === null
          ? stored.result !== null
          : JSON.stringify(JSON.parse(stored.resultJson)) !==
            JSON.stringify(stored.result)) ||
        ![0, 1].includes(stored.confirmed) ||
        (stored.confirmed === 1 && !stored.result)
      )
        return false;
      validateJournalPart(scope, [
        {
          operation: stored.operation,
          sequence: stored.sequence,
          result: stored.result,
        },
      ]);
      assertSafeExportData(stored.result, scope);
      assertSafeExportData(stored.operation, scope);
      return true;
    } catch {
      return false;
    }
  });
  for (const stored of validated) {
    if (
      stored.operation.kind === 'create_workout' &&
      typeof stored.operation.payload.booking_id === 'string' &&
      bookings.has(stored.operation.payload.booking_id) &&
      (!workouts.has(stored.operation.entity_id) ||
        workouts.get(stored.operation.entity_id) ===
          stored.operation.payload.booking_id)
    )
      workouts.set(
        stored.operation.entity_id,
        stored.operation.payload.booking_id,
      );
  }
  for (const stored of validated) {
    const payload = stored.operation.payload;
    if (
      ['add_exercise', 'replace_exercise'].includes(stored.operation.kind) &&
      typeof payload.workout_instance_id === 'string' &&
      workouts.has(payload.workout_instance_id) &&
      (!exercises.has(stored.operation.entity_id) ||
        exercises.get(stored.operation.entity_id) ===
          payload.workout_instance_id) &&
      server?.collections.exercises.some(
        (row) => row.id === payload.exercise_id,
      ) &&
      (stored.operation.kind !== 'replace_exercise' ||
        (typeof payload.replaced_from_id === 'string' &&
          exercises.get(payload.replaced_from_id) ===
            payload.workout_instance_id))
    )
      exercises.set(stored.operation.entity_id, payload.workout_instance_id);
  }
  for (const operation of snapshot.operations) {
    try {
      if (
        JSON.stringify(JSON.parse(operation.operationJson)) !==
          JSON.stringify(operation.operation) ||
        (operation.resultJson === null
          ? operation.result !== null
          : JSON.stringify(JSON.parse(operation.resultJson)) !==
            JSON.stringify(operation.result))
      )
        throw new Error('rawMismatch');
      if (
        operation.operationId !== operation.operation.operation_id ||
        operation.entityId !== operation.operation.entity_id ||
        ![0, 1].includes(operation.confirmed) ||
        (operation.confirmed === 1 && !operation.result)
      )
        throw new Error('malformed');
      validateJournalPart(scope, [
        {
          operation: operation.operation,
          sequence: operation.sequence,
          result: operation.result,
        },
      ]);
      if (server) {
        const op = operation.operation;
        const payload = op.payload;
        if (
          op.kind === 'create_workout' &&
          workouts.has(op.entity_id) &&
          workouts.get(op.entity_id) !== payload.booking_id
        )
          throw new Error('foreignWorkout');
        if (
          ['add_exercise', 'replace_exercise'].includes(op.kind) &&
          exercises.has(op.entity_id) &&
          exercises.get(op.entity_id) !== payload.workout_instance_id
        )
          throw new Error('foreignExercise');
        if (
          typeof payload.workout_exercise_id === 'string' &&
          exercises.has(payload.workout_exercise_id) &&
          exercises.get(payload.workout_exercise_id) !==
            payload.workout_instance_id
        )
          throw new Error('foreignExercise');
        if (
          typeof payload.replaced_from_id === 'string' &&
          exercises.has(payload.replaced_from_id) &&
          exercises.get(payload.replaced_from_id) !==
            payload.workout_instance_id
        )
          throw new Error('foreignExercise');
        if (
          op.kind === 'create_workout' &&
          (typeof payload.booking_id !== 'string' ||
            !bookings.has(payload.booking_id))
        )
          throw new Error('unprovenBooking');
        if (
          'workout_instance_id' in payload &&
          (typeof payload.workout_instance_id !== 'string' ||
            !workouts.has(payload.workout_instance_id))
        )
          throw new Error('unprovenWorkout');
        if (
          ['add_exercise', 'replace_exercise'].includes(op.kind) &&
          exercises.get(op.entity_id) !== payload.workout_instance_id
        )
          throw new Error('unprovenExercise');
        if (op.kind === 'finish_workout' && !workouts.has(op.entity_id))
          throw new Error('unprovenWorkout');
        if (
          'workout_exercise_id' in payload &&
          (typeof payload.workout_exercise_id !== 'string' ||
            exercises.get(payload.workout_exercise_id) !==
              payload.workout_instance_id)
        )
          throw new Error('unprovenExercise');
      }
      assertSafeExportData(operation.operation, scope);
      assertSafeExportData(operation.result, scope);
      operations.push({
        sequence: operation.sequence,
        operationId: operation.operationId,
        entityId: operation.entityId,
        confirmed: operation.confirmed,
        operationJson: operation.operationJson,
        resultJson: operation.resultJson,
      });
    } catch (error: unknown) {
      if (
        validated.includes(operation) &&
        error instanceof Error &&
        error.message.startsWith('unproven')
      ) {
        unresolved.push({
          sequence: operation.sequence,
          operationId: operation.operationId,
          entityId: operation.entityId,
          confirmed: operation.confirmed,
          operationJson: operation.operationJson,
          resultJson: operation.resultJson,
        });
        operationGaps.push('unproven-ownership-operation-retained-separately');
      } else operationGaps.push('unsupported-or-unsafe-operation');
    }
  }
  for (const entry of snapshot.entries) {
    try {
      if (
        JSON.stringify(JSON.parse(entry.valueJson)) !==
        JSON.stringify(entry.value)
      )
        throw new Error('rawMismatch');
      if (
        !entry.value ||
        typeof entry.value !== 'object' ||
        Array.isArray(entry.value)
      )
        throw new Error('unsupportedShape');
      const value = entry.value;
      if ('participant' in value) {
        const entryKeys = [
          'participant',
          'tombstones',
          'tombstoneRevisions',
          'finishOperation',
          'finishResolution',
          'finishRelease',
          'finishHistory',
        ];
        if (
          !Object.hasOwn(value, 'tombstones') ||
          Object.keys(value).some((key) => !entryKeys.includes(key))
        )
          throw new Error('unsupportedShape');
        const context = validateWorkoutPreloadContext(
          {
            version: 1,
            scope: {
              accountId: scope.accountId,
              workspaceId: scope.workspaceId,
            },
            sessionKey: 'export',
            startsAt: '2026-10-04T00:00:00.000Z',
            loadedAt: '2026-10-04T00:00:00.000Z',
            participants: [value.participant],
          },
          scope,
        );
        const participant = context.participants[0];
        const record = (
          candidate: unknown,
          required: string[],
          optional: string[] = [],
        ): Record<string, unknown> => {
          if (
            !candidate ||
            typeof candidate !== 'object' ||
            Array.isArray(candidate)
          )
            throw new Error('malformedFinish');
          const item = candidate as Record<string, unknown>;
          if (
            required.some((key) => !Object.hasOwn(item, key)) ||
            Object.keys(item).some(
              (key) => ![...required, ...optional].includes(key),
            )
          )
            throw new Error('malformedFinish');
          return item;
        };
        const validateFinish = (
          finish: unknown,
          resolution?: unknown,
          release?: unknown,
        ): void => {
          if (!participant) throw new Error('malformedFinish');
          validateJournalPart(scope, [
            { operation: finish, sequence: 1, result: null },
          ]);
          assertSafeExportData(finish, scope);
          const operation = record(finish, [
            'operation_id',
            'entity_id',
            'kind',
            'base_revision',
            'device_id',
            'payload',
            'created_at',
          ]);
          if (
            operation.kind !== 'finish_workout' ||
            operation.entity_id !== participant.workoutId ||
            typeof operation.base_revision !== 'number' ||
            operation.base_revision < 1
          )
            throw new Error('malformedFinish');
          const stored = validated.find(
            (row) => row.operationId === operation.operation_id,
          );
          if (
            !stored ||
            JSON.stringify(stored.operation) !== JSON.stringify(finish)
          )
            throw new Error('unprovenFinishOperation');
          if (resolution === undefined) {
            if (release !== undefined) throw new Error('malformedFinish');
            return;
          }
          const selected = record(
            resolution,
            ['operationId', 'conflictId', 'selection'],
            ['operation'],
          );
          if (
            !isExportUuid(selected.operationId) ||
            !isExportUuid(selected.conflictId) ||
            !['current', 'incoming'].includes(String(selected.selection))
          )
            throw new Error('malformedFinish');
          const resolved = validated.find(
            (row) => row.operationId === selected.operationId,
          );
          if (
            !resolved ||
            resolved.operation.kind !== 'resolve_conflict' ||
            resolved.operation.entity_id !== participant.workoutId ||
            resolved.operation.payload.conflict_id !== selected.conflictId ||
            resolved.operation.payload.selected_version !== selected.selection
          )
            throw new Error('unprovenFinishResolution');
          if (selected.operation !== undefined) {
            validateJournalPart(scope, [
              { operation: selected.operation, sequence: 1, result: null },
            ]);
            assertSafeExportData(selected.operation, scope);
            if (
              JSON.stringify(selected.operation) !==
              JSON.stringify(resolved.operation)
            )
              throw new Error('malformedFinish');
          }
          if (release !== undefined) {
            const released = record(release, [
              'operationId',
              'resolutionOperationId',
              'revision',
            ]);
            if (
              released.operationId !== operation.operation_id ||
              released.resolutionOperationId !== selected.operationId ||
              selected.selection !== 'current' ||
              typeof released.revision !== 'number' ||
              !Number.isSafeInteger(released.revision) ||
              released.revision <= operation.base_revision ||
              participant.workoutRevision < released.revision ||
              resolved.result?.status !== 'applied' ||
              resolved.result.revision !== released.revision ||
              resolved.confirmed !== 1 ||
              stored.confirmed !== 1 ||
              stored.result?.status !== 'conflict' ||
              stored.result.conflict_id !== selected.conflictId ||
              stored.result.revision !== resolved.operation.base_revision ||
              resolved.operation.payload.expected_revision !==
                resolved.operation.base_revision ||
              resolved.operation.device_id !== operation.device_id ||
              resolved.sequence <= stored.sequence
            )
              throw new Error('malformedFinish');
          }
        };
        if (value.finishOperation !== undefined)
          validateFinish(
            value.finishOperation,
            value.finishResolution,
            value.finishRelease,
          );
        else if (
          value.finishResolution !== undefined ||
          value.finishRelease !== undefined
        )
          throw new Error('malformedFinish');
        if (value.finishHistory !== undefined) {
          if (
            !Array.isArray(value.finishHistory) ||
            value.finishHistory.length > 10000
          )
            throw new Error('malformedFinish');
          for (const candidate of value.finishHistory) {
            const history = record(candidate, [
              'operation',
              'resolution',
              'release',
            ]);
            validateFinish(
              history.operation,
              history.resolution,
              history.release,
            );
          }
        }
        if (
          !participant ||
          !server ||
          !server.collections.bookings.some(
            (row) =>
              row.id === participant.bookingId &&
              row.client_record_id === participant.clientRecordId,
          )
        )
          throw new Error('unprovenOwnership');
        if (
          !server.collections.booking_programs.some(
            (row) =>
              row.id === participant.programId &&
              row.booking_id === participant.bookingId &&
              row.base_template_id === participant.baseTemplateId,
          )
        )
          throw new Error('unprovenProgram');
        const knownWorkout = server.collections.workout_instances.some(
          (row) =>
            row.id === participant.workoutId &&
            row.booking_id === participant.bookingId,
        );
        const localCreate =
          workouts.get(participant.workoutId) === participant.bookingId;
        if (!knownWorkout && !localCreate) throw new Error('unprovenWorkout');
        for (const exercise of [
          ...participant.exercises,
          ...participant.assignedExercises,
        ]) {
          if (
            !server.collections.booking_program_exercises.some(
              (row) =>
                row.booking_program_id === participant.programId &&
                row.exercise_id === exercise.exerciseId &&
                row.measure_snapshot === exercise.measure,
            ) &&
            !server.collections.exercises.some(
              (row) =>
                row.id === exercise.exerciseId &&
                row.measure === exercise.measure,
            )
          )
            throw new Error('unprovenExerciseSource');
          if (
            exercises.has(exercise.id) &&
            exercises.get(exercise.id) !== participant.workoutId
          )
            throw new Error('foreignExercise');
          for (const set of exercise.sets) {
            const knownSet = server.collections.set_results.find(
              (row) => row.id === set.id,
            );
            if (
              knownSet &&
              (knownSet.workout_instance_id !== participant.workoutId ||
                knownSet.workout_exercise_id !== exercise.id)
            )
              throw new Error('foreignSet');
          }
        }
        const related = new Set([
          participant.workoutId,
          ...participant.exercises.flatMap((exercise) => [
            exercise.id,
            ...exercise.sets.map((set) => set.id),
          ]),
        ]);
        if (
          !related.has(entry.entityId) ||
          !Array.isArray(value.tombstones) ||
          !value.tombstones.every(isExportUuid)
        )
          throw new Error('malformed');
        if (
          value.tombstoneRevisions !== undefined &&
          (!value.tombstoneRevisions ||
            typeof value.tombstoneRevisions !== 'object' ||
            Array.isArray(value.tombstoneRevisions) ||
            !Object.entries(value.tombstoneRevisions).every(
              ([id, revision]) =>
                value.tombstones &&
                Array.isArray(value.tombstones) &&
                value.tombstones.includes(id) &&
                typeof revision === 'number' &&
                Number.isSafeInteger(revision) &&
                revision >= 0,
            ))
        )
          throw new Error('malformed');
        const raw = entry.valueJson;
        if (
          /Bearer\s+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\/invite\/[A-Za-z0-9_-]{32,}|(?:token|access_token|refresh_token)=/i.test(
            raw,
          )
        )
          throw new Error('secret');
      } else {
        const table = (
          [
            'workout_instances',
            'workout_exercises',
            'set_results',
            'session_notes',
            'private_notes',
          ] as const
        ).find(
          (candidate) =>
            Object.keys(exportRowSchemas[candidate]).sort().join(',') ===
            Object.keys(value).sort().join(','),
        );
        if (!table || value.id !== entry.entityId)
          throw new Error('unsupportedShape');
        const workoutId =
          table === 'workout_instances' ? value.id : value.workout_instance_id;
        if (
          !server ||
          !server.collections.workout_instances.some(
            (row) => row.id === workoutId,
          )
        )
          throw new Error('unprovenParent');
        if (
          table === 'set_results' &&
          !server.collections.workout_exercises.some(
            (row) =>
              row.id === value.workout_exercise_id &&
              row.workout_instance_id === workoutId,
          )
        )
          throw new Error('unprovenParent');
        validateJournalPart(scope, [], [{ table, row: value }]);
        assertSafeExportData(entry.value, scope);
      }
      entries.push({ entityId: entry.entityId, valueJson: entry.valueJson });
    } catch {
      entryGaps.push('unsupported-or-unsafe-local-entry');
    }
  }
  return [
    {
      id: 'sqlite-unresolved-outbox',
      state: unresolved.length ? 'incomplete' : 'complete',
      records: unresolved,
      gaps: unresolved.length ? ['unproven-operation-parent-ownership'] : [],
    },
    {
      id: 'sqlite-outbox',
      state: operationGaps.length ? 'incomplete' : 'complete',
      records: operations,
      gaps: operationGaps,
    },
    {
      id: 'sqlite-local-entries',
      state: entryGaps.length ? 'incomplete' : 'complete',
      records: entries,
      gaps: entryGaps,
    },
    {
      id: 'sqlite-snapshot',
      state: 'complete',
      records: [snapshot.metadata],
      gaps: [],
    },
  ];
}

export function validateJournalConflict(scope: Scope, conflict: unknown): void {
  serializeLocalExport(
    {
      format: 'panda-trainer-local',
      version: 1,
      scope,
      snapshot: {
        id: '11111111-1111-4111-8111-111111111111',
        capturedAt: '2026-10-04T00:00:00.000Z',
        atomic: 'unknown',
      },
      sources: {
        operations: { state: 'unknown' },
        projections: { state: 'unknown' },
        conflicts: { state: 'incomplete', records: [conflict] },
        corrections: { state: 'unknown' },
        otherLocalData: { state: 'unknown' },
      },
    },
    scope,
  );
}
