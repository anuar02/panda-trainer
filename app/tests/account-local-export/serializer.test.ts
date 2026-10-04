import {
  localExportLimits,
  parseLocalExport,
  serializeLocalExport,
} from '../../src/domain/account-local-export';
import type {
  LocalExportEnvelope,
  Scope,
} from '../../src/domain/account-local-export';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: Scope = {
  accountId: id(1),
  workspaceId: id(2),
  sessionId: 'synthetic-session',
};
const time = '2026-10-03T12:00:00.123456Z';
function fixture(): LocalExportEnvelope {
  return {
    format: 'panda-trainer-local',
    version: 1,
    scope,
    snapshot: { id: id(3), capturedAt: time, atomic: 'confirmed' },
    sources: {
      operations: {
        state: 'complete',
        records: [
          {
            sequence: 2,
            result: null,
            operation: {
              operation_id: id(4),
              entity_id: id(5),
              device_id: id(6),
              base_revision: 0,
              created_at: time,
              kind: 'upsert_set',
              payload: {
                workout_instance_id: id(7),
                workout_exercise_id: id(8),
                position: 0,
                reps: 0,
                seconds: null,
                weight_g: 12345,
              },
            },
          },
          {
            sequence: 1,
            result: {
              operation_id: id(9),
              entity_id: id(10),
              status: 'error',
              revision: null,
              error_code: 'invalid_payload',
            },
            operation: {
              operation_id: id(9),
              entity_id: id(10),
              device_id: id(6),
              base_revision: 17,
              created_at: time,
              kind: 'set_note',
              payload: {
                workout_instance_id: id(7),
                text: 'Ёж 🐼\n私のメモ\u0000',
                shared: false,
              },
            },
          },
        ],
      },
      projections: { state: 'complete', records: [] },
      conflicts: { state: 'complete', records: [] },
      corrections: { state: 'complete', records: [] },
      otherLocalData: { state: 'unknown' },
    },
  };
}
test('exact units, zero, null, unicode and rejected receipt round-trip independently of ordering', () => {
  const f = fixture();
  const result = serializeLocalExport(f, scope);
  expect(result.status).toBe('incomplete');
  expect(result.utf8Bytes).toBe(Buffer.byteLength(result.json, 'utf8'));
  expect(parseLocalExport(result.json, scope)).toEqual(result);
  if (f.sources.operations.state !== 'unknown')
    f.sources.operations.records.reverse();
  expect(serializeLocalExport(f, scope).json).toBe(result.json);
  expect(result.json).toContain('12345');
  expect(result.json).toContain('Ёж 🐼');
});
test('both conflict versions and correction operation survive', () => {
  const f = fixture();
  if (f.sources.operations.state === 'unknown') throw new Error('fixture');
  const stored = f.sources.operations.records[0]!;
  stored.result = {
    operation_id: id(4),
    entity_id: id(5),
    status: 'conflict',
    revision: 4,
    conflict_id: id(11),
  };
  const row = {
    id: id(5),
    workspace_id: id(2),
    workout_instance_id: id(7),
    workout_exercise_id: id(8),
    position: 0,
    reps: null,
    seconds: 63,
    weight_g: 0,
    author_user_id: id(1),
    device_id: id(6),
    revision: 4,
    deleted_at: null,
    created_at: time,
    updated_at: time,
    created_by: null,
    requested_position: null,
  };
  f.sources.projections = {
    state: 'complete',
    records: [{ table: 'set_results', row }],
  };
  f.sources.conflicts = {
    state: 'complete',
    records: [
      {
        id: id(11),
        entityId: id(5),
        workoutId: id(7),
        expectedRevision: 4,
        incoming: stored.operation,
        current: {
          projection: { table: 'set_results', row },
          exercise: null,
          exercise_revision: null,
          sets: [],
          replacements: [],
          shared: null,
        },
      },
    ],
  };
  const note = f.sources.operations.records[1]!;
  note.result = {
    operation_id: id(9),
    entity_id: id(10),
    status: 'correction_draft',
    revision: 18,
    draft_id: id(12),
  };
  f.sources.corrections = {
    state: 'complete',
    records: [
      {
        id: id(12),
        workoutId: id(7),
        createdAt: time,
        operation: note.operation,
      },
    ],
  };
  const result = serializeLocalExport(f, scope);
  expect(parseLocalExport(result.json, scope).envelope).toEqual(
    result.envelope,
  );
  expect(result.json).toContain('"seconds":63');
  expect(result.json).toContain('"weight_g":0');
  f.sources.conflicts.records[0]!.current = null;
  expect(serializeLocalExport(f, scope).status).toBe('incomplete');
  row.workspace_id = id(99);
  expect(() => serializeLocalExport(f, scope)).toThrow('scopeMismatch');
});
test.each([
  undefined,
  null,
  {},
  { ...fixture(), version: 2 },
  { ...fixture(), accessToken: 'synthetic-forbidden' },
])('malformed/unknown input fails closed %#', (input) => {
  expect(() => serializeLocalExport(input, scope)).toThrow();
});
test('missing/unknown sources never become empty known sources', () => {
  const f = fixture();
  f.sources.operations = { state: 'unknown' };
  f.snapshot.atomic = 'unknown';
  expect(serializeLocalExport(f, scope).envelope.sources.operations).toEqual({
    state: 'unknown',
  });
  expect(serializeLocalExport(f, scope).status).toBe('incomplete');
  expect(() => serializeLocalExport({ ...f, sources: {} }, scope)).toThrow();
});
test('duplicates, unsafe sequence, foreign session, credentials and arbitrary JSON fail', () => {
  const f = fixture();
  if (f.sources.operations.state === 'unknown') throw new Error('fixture');
  f.sources.operations.records.push(f.sources.operations.records[0]!);
  expect(() => serializeLocalExport(f, scope)).toThrow();
  f.sources.operations.records.pop();
  f.sources.operations.records[0]!.sequence = Number.MAX_SAFE_INTEGER + 1;
  expect(() => serializeLocalExport(f, scope)).toThrow();
  expect(() =>
    serializeLocalExport(fixture(), { ...scope, sessionId: 'foreign' }),
  ).toThrow('scopeMismatch');
  const op = fixture().sources.operations;
  if (op.state === 'unknown') throw new Error('fixture');
  const bad = {
    ...fixture(),
    sources: {
      ...fixture().sources,
      operations: {
        state: 'complete',
        records: [
          {
            ...op.records[0]!,
            operation: {
              ...op.records[0]!.operation,
              payload: { credentials: 'synthetic' },
            },
          },
        ],
      },
    },
  };
  expect(() => serializeLocalExport(bad, scope)).toThrow();
});
test('bounded text/count/bytes, accessors, symbols, sparse arrays and malformed UTF-8 fail', () => {
  const f = fixture();
  const source = f.sources.operations;
  if (source.state === 'unknown') throw new Error('fixture');
  const note = source.records[1]!.operation;
  if (note.kind !== 'set_note') throw new Error('fixture');
  note.payload.text = 'я'.repeat(localExportLimits.textBytes / 2 + 1);
  expect(() => serializeLocalExport(f, scope)).toThrow('limit');
  note.payload.text = '\ud800';
  expect(() => serializeLocalExport(f, scope)).toThrow('malformed');
  expect(() =>
    serializeLocalExport(
      { ...fixture(), [Symbol('secret')]: 'synthetic' },
      scope,
    ),
  ).toThrow();
  expect(() =>
    serializeLocalExport(
      Object.defineProperty(fixture(), 'version', { get: () => 1 }),
      scope,
    ),
  ).toThrow();
  const oversized = {
    ...fixture(),
    sources: {
      ...fixture().sources,
      projections: {
        state: 'complete',
        records: Array(localExportLimits.records + 1).fill(null),
      },
    },
  };
  expect(() => serializeLocalExport(oversized, scope)).toThrow('limit');
  expect(() =>
    parseLocalExport(' '.repeat(localExportLimits.bytes + 1), scope),
  ).toThrow('limit');
  expect(() => parseLocalExport('{"version":1,"version":2}', scope)).toThrow();
});

test('all eight operation payloads accept exact current contract fields', () => {
  const variants = [
    { kind: 'create_workout', payload: { booking_id: id(20) } },
    {
      kind: 'add_exercise',
      payload: {
        workout_instance_id: id(7),
        exercise_id: id(21),
        position: 0,
        planned_sets: 3,
      },
    },
    {
      kind: 'replace_exercise',
      payload: {
        workout_instance_id: id(7),
        exercise_id: id(21),
        position: 0,
        planned_sets: 3,
        replaced_from_id: id(8),
      },
    },
    {
      kind: 'upsert_set',
      payload: {
        workout_instance_id: id(7),
        workout_exercise_id: id(8),
        position: 1,
        reps: null,
        seconds: 0,
        weight_g: null,
      },
    },
    {
      kind: 'delete_set',
      payload: { workout_instance_id: id(7), workout_exercise_id: id(8) },
    },
    {
      kind: 'set_note',
      payload: { workout_instance_id: id(7), text: '', shared: true },
    },
    { kind: 'finish_workout', payload: {} },
    {
      kind: 'resolve_conflict',
      payload: {
        conflict_id: id(22),
        selected_version: 'incoming',
        expected_revision: 3,
      },
    },
  ];
  for (const variant of variants) {
    const f = fixture();
    const sources = {
      ...f.sources,
      operations: {
        state: 'complete',
        records: [
          {
            sequence: 1,
            result: null,
            operation: {
              operation_id: id(4),
              entity_id: id(7),
              base_revision: 0,
              device_id: id(6),
              created_at: time,
              ...variant,
            },
          },
        ],
      },
    };
    const result = serializeLocalExport({ ...f, sources }, scope);
    expect(parseLocalExport(result.json, scope).json).toBe(result.json);
    expect(() =>
      serializeLocalExport(
        {
          ...f,
          sources: {
            ...sources,
            operations: {
              state: 'complete',
              records: [
                {
                  ...sources.operations.records[0],
                  operation: {
                    ...sources.operations.records[0]!.operation,
                    payload: {
                      ...variant.payload,
                      access_token: 'synthetic-forbidden',
                    },
                  },
                },
              ],
            },
          },
        },
        scope,
      ),
    ).toThrow();
  }
});

test('only account-owned scoped notes are accepted', () => {
  const f = fixture();
  const note = {
    id: id(10),
    workspace_id: id(2),
    workout_instance_id: id(7),
    text: 'Private 🐼',
    author_user_id: id(1),
    device_id: id(6),
    revision: 0,
    created_at: time,
    updated_at: time,
    created_by: null,
  };
  const input = {
    ...f,
    sources: {
      ...f.sources,
      projections: {
        state: 'complete',
        records: [{ table: 'session_notes', row: note }],
      },
    },
  };
  expect(serializeLocalExport(input, scope).json).toContain('Private 🐼');
  note.author_user_id = id(88);
  expect(() => serializeLocalExport(input, scope)).toThrow('scopeMismatch');
  note.author_user_id = id(1);
  expect(() =>
    serializeLocalExport(
      {
        ...input,
        sources: {
          ...input.sources,
          projections: {
            state: 'complete',
            records: [
              { table: 'session_notes', row: { ...note, credentials: {} } },
            ],
          },
        },
      },
      scope,
    ),
  ).toThrow();
});
