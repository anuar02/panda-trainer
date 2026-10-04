import { adaptLocalSnapshot } from '@/features/account-export/local-adapter';
import { parseAccountExport } from '@/domain/account-export';
import type { EntryWorkout } from '@/domain/workout-entry';
import type { JsonValue } from '@/domain/workout-sync/types';
import type { ScopedOutboxSnapshot } from '@/features/workout-sync/snapshot-types';
import snapshot from './snapshot.json';
const scope = {
  accountId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  sessionId: 'synthetic-finish',
};
const server = parseAccountExport(snapshot, {
  ownerUserId: scope.accountId,
  workspaceId: scope.workspaceId,
});
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function workout(): EntryWorkout {
  const exercise = {
    id: server.collections.workout_exercises[0]!.id,
    exerciseId: server.collections.exercises[0]!.id,
    name: 'Synthetic',
    measure: 'reps' as const,
    bodyweight: false,
    muscleGroup: '',
    equipment: '',
    instructions: [],
    sourceKey: null,
    skipped: false,
    replacedFromId: null,
    position: 0,
    plannedSets: 0,
    plannedReps: null,
    plannedSeconds: null,
    plannedWeightGrams: 12345,
    restSeconds: null,
    revision: 0,
    sets: [],
    previousSets: [],
  };
  const finishOperation = {
    operation_id: id(10),
    entity_id: server.collections.workout_instances[0]!.id,
    device_id: id(11),
    base_revision: 1,
    created_at: snapshot.exported_at,
    kind: 'finish_workout' as const,
    payload: {},
  };
  const finishResolution = {
    operationId: id(12),
    conflictId: id(13),
    selection: 'current' as const,
    operation: {
      operation_id: id(12),
      entity_id: finishOperation.entity_id,
      device_id: id(11),
      base_revision: 2,
      created_at: snapshot.exported_at,
      kind: 'resolve_conflict' as const,
      payload: {
        conflict_id: id(13),
        selected_version: 'current',
        expected_revision: 2,
      },
    },
  };
  const finishRelease = {
    operationId: finishOperation.operation_id,
    resolutionOperationId: finishResolution.operationId,
    revision: 3,
  };
  return {
    participant: {
      bookingId: server.collections.bookings[0]!.id,
      clientRecordId: server.collections.bookings[0]!.client_record_id,
      clientName: 'Synthetic client',
      programId: server.collections.booking_programs[0]!.id,
      programName: 'Synthetic program',
      programDescription: '',
      baseTemplateId: server.collections.booking_programs[0]!.base_template_id,
      programRevision: 1,
      workoutId: finishOperation.entity_id,
      workoutRevision: 3,
      workoutStatus: 'in_progress',
      exercises: [exercise],
      assignedExercises: [exercise],
    },
    tombstones: [],
    tombstoneRevisions: {},
    finishOperation,
    finishResolution,
    finishRelease,
    finishHistory: [
      {
        operation: finishOperation,
        resolution: finishResolution,
        release: finishRelease,
      },
    ],
  };
}
function adapt(value: EntryWorkout | Record<string, unknown>) {
  const typed = value as EntryWorkout;
  const original = workout();
  const operations = [
    original.finishOperation!,
    original.finishResolution!.operation!,
  ].map((operation, i) => {
    const result =
      i === 0
        ? {
            operation_id: operation.operation_id,
            entity_id: operation.entity_id,
            status: 'conflict' as const,
            revision: 2,
            conflict_id: id(13),
          }
        : {
            operation_id: operation.operation_id,
            entity_id: operation.entity_id,
            status: 'applied' as const,
            revision: 3,
          };
    return {
      sequence: i + 1,
      operationId: operation.operation_id,
      entityId: operation.entity_id,
      operation,
      operationJson: JSON.stringify(operation),
      result,
      resultJson: JSON.stringify(result),
      confirmed: 1 as const,
    };
  });
  const data: ScopedOutboxSnapshot = {
    metadata: {
      id: id(14),
      capturedAt: snapshot.exported_at,
      scope,
      consistency: 'sqlite-exclusive-transaction',
      globalAtomicity: 'unknown',
      outboxCount: operations.length,
      entryCount: 1,
    },
    operations,
    entries: [
      {
        entityId: typed.participant.workoutId,
        value: value as unknown as JsonValue,
        valueJson: JSON.stringify(value),
      },
    ],
  };
  return adaptLocalSnapshot(data, scope, server).find(
    (source) => source.id === 'sqlite-local-entries',
  );
}
test('released finish operation resolution release and original history remain exact raw export', () => {
  const value = workout();
  expect(adapt(value)).toMatchObject({
    state: 'complete',
    records: [
      {
        entityId: value.participant.workoutId,
        valueJson: JSON.stringify(value),
      },
    ],
  });
  const released = { ...value };
  delete released.finishOperation;
  delete released.finishResolution;
  delete released.finishRelease;
  expect(adapt(released)).toMatchObject({
    state: 'complete',
    records: [
      {
        entityId: value.participant.workoutId,
        valueJson: JSON.stringify(released),
      },
    ],
  });
});
test.each([
  'kind',
  'workout',
  'release',
  'resolution',
  'history',
  'unknown',
  'secret',
] as const)('unsafe finish %s becomes truthful omitted gap', (variant) => {
  const value = workout();
  if (variant === 'kind')
    value.finishOperation!.kind =
      'finish_workout' === 'finish_workout'
        ? 'create_workout'
        : 'finish_workout';
  if (variant === 'workout') value.finishOperation!.entity_id = id(99);
  if (variant === 'release') value.finishRelease!.operationId = id(99);
  if (variant === 'resolution')
    value.finishResolution!.operation!.payload = {
      conflict_id: id(99),
      selected_version: 'current',
      expected_revision: 2,
    };
  if (variant === 'history')
    value.finishHistory![0]!.release.resolutionOperationId = id(99);
  const input =
    variant === 'unknown'
      ? {
          ...value,
          finishOperation: {
            ...value.finishOperation,
            harmlessUnknownField: 1,
          },
        }
      : variant === 'secret'
        ? {
            ...value,
            finishRelease: {
              ...value.finishRelease,
              access_token: 'synthetic-secret',
            },
          }
        : value;
  const source = adapt(input);
  expect(source).toMatchObject({ state: 'incomplete', records: [] });
  expect(JSON.stringify(source)).not.toContain('synthetic-secret');
});
