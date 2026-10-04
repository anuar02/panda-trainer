import {
  serializeLocalExport,
  parseLocalExport,
  type LocalExportEnvelope,
  type StoredOperation,
} from '@/domain/account-local-export';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { accountId: id(1), workspaceId: id(2), sessionId: 'synthetic' };
const time = '2026-10-04T12:34:56.123456Z';
function fixture(): LocalExportEnvelope {
  const records: StoredOperation[] = Array.from({ length: 151 }, (_, i) => ({
    sequence: i + 1,
    operation: {
      operation_id: id(1000 + i),
      entity_id: id(2000 + i),
      device_id: id(3),
      base_revision: i,
      created_at: time,
      kind: 'upsert_set',
      payload: {
        workout_instance_id: id(4),
        workout_exercise_id: id(5),
        position: i,
        reps: null,
        seconds: 0,
        weight_g: 12345,
      },
    },
    result: {
      operation_id: id(1000 + i),
      entity_id: id(2000 + i),
      status: 'applied',
      revision: i + 1,
    },
  }));
  return {
    format: 'panda-trainer-local',
    version: 1,
    scope,
    snapshot: { id: id(6), capturedAt: time, atomic: 'confirmed' },
    sources: {
      operations: { state: 'complete', records },
      projections: { state: 'complete', records: [] },
      conflicts: { state: 'complete', records: [] },
      corrections: { state: 'complete', records: [] },
      otherLocalData: { state: 'unknown' },
    },
  };
}
test('151 confirmed operations retain receipts exact units and microseconds without complete backup claim', () => {
  const result = parseLocalExport(
    serializeLocalExport(fixture(), scope).json,
    scope,
  );
  expect(result.status).toBe('incomplete');
  expect(result.journalStatus).toBe('complete');
  const source = result.envelope.sources.operations;
  if (source.state === 'unknown') throw new Error('records lost');
  expect(source.records).toHaveLength(151);
  expect(source.records.map((r) => r.sequence)).toEqual(
    Array.from({ length: 151 }, (_, i) => i + 1),
  );
  expect(source.records.at(-1)?.result).toEqual({
    operation_id: id(1150),
    entity_id: id(2150),
    status: 'applied',
    revision: 151,
  });
  expect(source.records[0]?.operation.created_at).toBe(time);
  expect(source.records[0]?.operation.payload).toEqual({
    workout_instance_id: id(4),
    workout_exercise_id: id(5),
    position: 0,
    reps: null,
    seconds: 0,
    weight_g: 12345,
  });
  expect(result.utf8Bytes).toBe(Buffer.byteLength(result.json, 'utf8'));
});
test.each(['operations', 'projections', 'conflicts', 'corrections'] as const)(
  'unknown %s remains explicit gap',
  (name) => {
    const input = fixture();
    input.sources[name] = { state: 'unknown' };
    const result = serializeLocalExport(input, scope);
    expect(result.envelope.sources[name]).toEqual({ state: 'unknown' });
    expect(result.journalStatus).toBe('incomplete');
    expect(result.status).toBe('incomplete');
  },
);
test.each(['operation_id', 'entity_id'] as const)(
  'receipt %s cannot refer to foreign record',
  (field) => {
    const input = fixture();
    const source = input.sources.operations;
    if (source.state === 'unknown') throw new Error('fixture');
    const receipt = source.records[0]?.result;
    if (!receipt) throw new Error('fixture');
    receipt[field] = id(99);
    expect(() => serializeLocalExport(input, scope)).toThrow('malformed');
  },
);
