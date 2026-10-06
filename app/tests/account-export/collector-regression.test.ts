import { collectAccountExport } from '@/features/account-export/collector';
import { adaptLocalSnapshot } from '@/features/account-export/local-adapter';
import type { ScopedOutboxSnapshot } from '@/features/workout-sync/snapshot-types';
import { parseAccountExport } from '@/domain/account-export';
import snapshot from './snapshot.json';
jest.mock('expo-crypto', () => {
  const crypto: typeof import('node:crypto') =
    jest.requireActual('node:crypto');
  return {
    randomUUID: () => crypto.randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async (_algorithm: string, input: string) =>
      crypto.createHash('sha256').update(input, 'utf8').digest('hex'),
  };
});
const scope = {
  accountId: snapshot.owner_user_id,
  workspaceId: snapshot.workspace_id,
  sessionId: 'synthetic-session',
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function local(): ScopedOutboxSnapshot {
  const operations = Array.from({ length: 151 }, (_, i) => {
    const operation = {
      operation_id: id(1000 + i),
      entity_id: id(2000 + i),
      device_id: id(3),
      base_revision: 0,
      created_at: '2026-10-04T00:00:00.123456Z',
      kind: 'upsert_set' as const,
      payload: {
        workout_instance_id: snapshot.collections.workout_instances[0]!.id,
        workout_exercise_id: snapshot.collections.workout_exercises[0]!.id,
        position: i,
        reps: null,
        seconds: 0,
        weight_g: 12345,
      },
    };
    const result = {
      operation_id: operation.operation_id,
      entity_id: operation.entity_id,
      status: 'applied' as const,
      revision: 1,
    };
    return {
      sequence: i + 1,
      operationId: operation.operation_id,
      entityId: operation.entity_id,
      operationJson: JSON.stringify(operation),
      resultJson: JSON.stringify(result),
      operation,
      result,
      confirmed: 1 as const,
    };
  });
  return {
    metadata: {
      id: id(6),
      capturedAt: '2026-10-04T00:00:00Z',
      scope,
      consistency: 'sqlite-exclusive-transaction',
      globalAtomicity: 'unknown',
      outboxCount: operations.length,
      entryCount: 0,
    },
    operations,
    entries: [],
  };
}
const base = () => ({
  server: parseAccountExport(snapshot, {
    ownerUserId: scope.accountId,
    workspaceId: scope.workspaceId,
  }),
  scope,
  guard: async () => undefined,
  isCurrent: () => true,
});
test('collector retains all 151 confirmed raw records with explicit server/local coverage gaps', async () => {
  const data = local();
  const result = await collectAccountExport({
    ...base(),
    local: { scopedSnapshot: async () => data },
  });
  expect(result.status).toBe('incomplete');
  expect(result.envelope.globalAtomicity).toBe('unknown');
  expect(
    result.envelope.sources.find((s) => s.id === 'sqlite-outbox')?.records,
  ).toHaveLength(151);
  expect(result.json).toContain('123456');
  expect(result.json).toContain('12345');
  expect(result.utf8Bytes).toBe(Buffer.byteLength(result.json, 'utf8'));
  await expect(result.validate()).resolves.toBeUndefined();
});
test('acknowledgement between collection and delivery invalidates the captured snapshot', async () => {
  let data = local();
  const result = await collectAccountExport({
    ...base(),
    local: { scopedSnapshot: async () => data },
  });
  const first = data.operations[0]!;
  data = {
    ...data,
    operations: [{ ...first, confirmed: 0 }, ...data.operations.slice(1)],
  };
  await expect(result.validate()).rejects.toMatchObject({ code: 'stale' });
});
test('pending writer change between collection and file invalidates snapshot', async () => {
  let records = [{ requestId: 'synthetic-request' }];
  const result = await collectAccountExport({
    ...base(),
    local: null,
    pending: async () => [
      { id: 'schedulingPending', state: 'complete', records, gaps: [] },
    ],
  });
  records = [{ requestId: 'replacement-request' }];
  await expect(result.validate()).rejects.toMatchObject({ code: 'stale' });
});
test('unknown secret-bearing operation payload becomes an explicit omitted gap', () => {
  const data = local();
  const first = data.operations[0]!;
  const operation = {
    ...first.operation,
    payload: { ...first.operation.payload, access_token: 'synthetic-secret' },
  };
  const sources = adaptLocalSnapshot(
    {
      ...data,
      operations: [
        { ...first, operation, operationJson: JSON.stringify(operation) },
        ...data.operations.slice(1),
      ],
    },
    scope,
  );
  const source = sources.find((s) => s.id === 'sqlite-outbox');
  expect(source?.state).toBe('incomplete');
  expect(source?.records).toHaveLength(150);
  expect(JSON.stringify(sources)).not.toContain('synthetic-secret');
});
test('foreign authored local note is omitted with truthful incomplete coverage', () => {
  const value = {
    id: id(7),
    workspace_id: scope.workspaceId,
    workout_instance_id: snapshot.collections.workout_instances[0]!.id,
    text: 'foreign-private',
    author_user_id: id(99),
    device_id: id(3),
    revision: 0,
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    created_by: null,
  };
  const data = local();
  const sources = adaptLocalSnapshot(
    {
      ...data,
      metadata: { ...data.metadata, entryCount: 1 },
      entries: [
        { entityId: value.id, value, valueJson: JSON.stringify(value) },
      ],
    },
    scope,
  );
  expect(sources.find((s) => s.id === 'sqlite-local-entries')).toMatchObject({
    state: 'incomplete',
    records: [],
  });
  expect(JSON.stringify(sources)).not.toContain('foreign-private');
});
test('real EntryWorkout participant schema preserves owned local aggregates and rejects unknown nested data', () => {
  const server = base().server;
  const booking = server.collections.bookings[0]!;
  const exercise = {
    id: server.collections.workout_exercises[0]!.id,
    exerciseId: server.collections.exercises[0]!.id,
    name: 'Synthetic exercise',
    measure: 'reps',
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
  const participant = {
    bookingId: booking.id,
    clientRecordId: booking.client_record_id,
    clientName: 'Synthetic local client',
    programId: server.collections.booking_programs[0]!.id,
    programName: 'Synthetic program',
    programDescription: '',
    baseTemplateId: server.collections.booking_programs[0]!.base_template_id,
    programRevision: 1,
    workoutId: server.collections.workout_instances[0]!.id,
    workoutRevision: 0,
    workoutStatus: 'not_created',
    exercises: [exercise],
    assignedExercises: [exercise],
  };
  const value = { participant, tombstones: [], tombstoneRevisions: {} };
  const data = local();
  const adapt = (entryValue: typeof value) =>
    adaptLocalSnapshot(
      {
        ...data,
        metadata: { ...data.metadata, entryCount: 1 },
        entries: [
          {
            entityId: participant.workoutId,
            value: entryValue,
            valueJson: JSON.stringify(entryValue),
          },
        ],
      },
      scope,
      server,
    ).find((source) => source.id === 'sqlite-local-entries');
  expect(adapt(value)).toMatchObject({
    state: 'complete',
    records: [
      { entityId: participant.workoutId, valueJson: JSON.stringify(value) },
    ],
  });
  expect(
    adapt({ ...value, participant: { ...participant, bookingId: id(99) } }),
  ).toMatchObject({ state: 'incomplete', records: [] });
  const unknown = {
    ...value,
    participant: { ...participant, access_token: 'synthetic-secret' },
  };
  expect(adapt(unknown)).toMatchObject({ state: 'incomplete', records: [] });
});
test('confirmed rejected receipt remains exported rather than silently discarded', () => {
  const data = local();
  const first = data.operations[0]!;
  const result = {
    operation_id: first.operationId,
    entity_id: first.entityId,
    status: 'error' as const,
    revision: null,
    error_code: 'invalid_payload',
  };
  const sources = adaptLocalSnapshot(
    {
      ...data,
      operations: [
        { ...first, result, resultJson: JSON.stringify(result) },
        ...data.operations.slice(1),
      ],
    },
    scope,
    base().server,
  );
  expect(sources.find((s) => s.id === 'sqlite-outbox')?.records).toHaveLength(
    151,
  );
  expect(JSON.stringify(sources)).toContain('invalid_payload');
});
test('changed withheld raw entry with same count invalidates snapshot without exposing secret', async () => {
  const value = { access_token: 'synthetic-secret-first' };
  const original = local();
  let data: ScopedOutboxSnapshot = {
    ...original,
    metadata: { ...original.metadata, entryCount: 1 },
    entries: [{ entityId: id(77), value, valueJson: JSON.stringify(value) }],
  };
  const result = await collectAccountExport({
    ...base(),
    local: { scopedSnapshot: async () => data },
  });
  expect(result.json).not.toContain('synthetic-secret-first');
  const changed = { access_token: 'synthetic-secret-second' };
  data = {
    ...data,
    entries: [
      { entityId: id(77), value: changed, valueJson: JSON.stringify(changed) },
    ],
  };
  await expect(result.validate()).rejects.toMatchObject({ code: 'stale' });
});
test('safe scoped orphan operation retains raw entity_unavailable receipt as explicitly unresolved', () => {
  const data = local();
  const first = data.operations[0]!;
  const operation = {
    ...first.operation,
    payload: {
      ...first.operation.payload,
      workout_instance_id: id(777),
      workout_exercise_id: id(778),
    },
  };
  const result = {
    operation_id: first.operationId,
    entity_id: first.entityId,
    status: 'error' as const,
    revision: null,
    error_code: 'entity_unavailable',
  };
  const sources = adaptLocalSnapshot(
    {
      ...data,
      operations: [
        {
          ...first,
          operation,
          operationJson: JSON.stringify(operation),
          result,
          resultJson: JSON.stringify(result),
        },
      ],
      metadata: { ...data.metadata, outboxCount: 1 },
    },
    scope,
    base().server,
  );
  const unresolved = sources.find(
    (source) => source.id === 'sqlite-unresolved-outbox',
  );
  expect(unresolved?.state).toBe('incomplete');
  expect(unresolved?.records).toHaveLength(1);
  expect(JSON.stringify(unresolved)).toContain('entity_unavailable');
  expect(JSON.stringify(unresolved)).toContain('777');
  expect(
    sources.find((source) => source.id === 'sqlite-local-entries')?.records,
  ).toEqual([]);
});
