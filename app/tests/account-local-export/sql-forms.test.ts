import {
  parseLocalExport,
  serializeLocalExport,
} from '../../src/domain/account-local-export';
import type {
  Conflict,
  CurrentVersion,
  LocalExportEnvelope,
  Scope,
} from '../../src/domain/account-local-export';
import type { ExportRow } from '../../src/domain/account-export';
import type { TypedJournalOperation } from '../../src/domain/workout-sync/operations';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-03T12:00:00.123456Z';
const scope: Scope = {
  accountId: id(1),
  workspaceId: id(2),
  sessionId: 'sql-fixtures',
};
function exercise(n = 8): ExportRow<'workout_exercises'> {
  return {
    id: id(n),
    workspace_id: id(2),
    workout_instance_id: id(7),
    exercise_id: id(20),
    exercise_name_snapshot: 'Тяга 🐼',
    measure_snapshot: 'seconds',
    bodyweight_snapshot: false,
    muscle_group_snapshot: '',
    equipment_snapshot: '',
    instructions_snapshot: ['保持', 'Ёж'],
    source_key_snapshot: null,
    position: 0,
    planned_sets: 0,
    planned_reps: null,
    planned_seconds: '63',
    planned_weight_g: 12345,
    rest_seconds: 0,
    note: null,
    replaced_from_id: null,
    skipped: true,
    revision: 9,
    created_at: time,
    updated_at: time,
    created_by: null,
    source_device_id: id(6),
  };
}
function set(n = 5, parent = 8): ExportRow<'set_results'> {
  return {
    id: id(n),
    workspace_id: id(2),
    workout_instance_id: id(7),
    workout_exercise_id: id(parent),
    position: 0,
    requested_position: null,
    reps: null,
    seconds: 63,
    weight_g: 0,
    author_user_id: id(1),
    device_id: id(6),
    revision: 4,
    deleted_at: time,
    created_at: time,
    updated_at: time,
    created_by: null,
  };
}
function operation(): TypedJournalOperation {
  return {
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
      reps: null,
      seconds: 0,
      weight_g: 12345,
    },
  };
}
function conflict(form: string): Conflict {
  const op = operation();
  const ex = exercise();
  const sr = set();
  const rep = { ...exercise(9), replaced_from_id: id(8), skipped: false };
  const current: CurrentVersion = {
    projection: { table: 'set_results', row: sr },
    exercise: { table: 'workout_exercises', row: ex },
    exercise_revision: 9,
    sets: [sr, set(21)],
    replacements: [{ row: rep, sets: [set(22, 9)] }],
    shared: null,
  };
  const c: Conflict = {
    id: id(11),
    entityId: op.entity_id,
    workoutId: id(7),
    expectedRevision: 4,
    incoming: op,
    current,
  };
  if (form === 'fallback') {
    current.projection = { table: 'workout_exercises', row: ex };
    current.sets = [set(21)];
    c.expectedRevision = 9;
  } else if (form === 'replacement') {
    c.incoming = {
      ...op,
      kind: 'replace_exercise',
      payload: {
        workout_instance_id: id(7),
        exercise_id: id(20),
        replaced_from_id: id(8),
        position: 0,
        planned_sets: 0,
      },
    };
    c.current = {
      projection: {
        table: 'workout_exercises',
        row: { ...ex, skipped: false },
      },
      exercise: null,
      exercise_revision: null,
      sets: [sr, set(21)],
      replacements: [],
      shared: null,
    };
    c.expectedRevision = 9;
  } else if (form === 'note' || form === 'private-note') {
    c.incoming = {
      ...op,
      kind: 'set_note',
      payload: {
        workout_instance_id: id(7),
        text: 'Incoming 私\n🐼\u0000',
        shared: false,
      },
    };
    const note = {
      id: id(5),
      workspace_id: id(2),
      workout_instance_id: id(7),
      text: 'Current Ёж 🐼',
      author_user_id: id(1),
      device_id: id(6),
      revision: 4,
      created_at: time,
      updated_at: time,
      created_by: null,
    };
    c.current = {
      projection:
        form === 'note'
          ? { table: 'session_notes', row: note }
          : {
              table: 'private_notes',
              row: { ...note, client_record_id: null },
            },
      exercise: null,
      exercise_revision: null,
      sets: [],
      replacements: [],
      shared: form === 'note',
    };
    c.expectedRevision = 5;
  } else if (form === 'finished') {
    c.entityId = id(7);
    c.incoming = {
      ...op,
      entity_id: id(7),
      kind: 'finish_workout',
      payload: {},
    };
    c.current = {
      projection: {
        table: 'workout_instances',
        row: {
          id: id(7),
          workspace_id: id(2),
          booking_id: id(30),
          client_record_id: id(31),
          source_program_id: null,
          source_program_revision: null,
          started_at: time,
          finished_at: time,
          revision: 4,
          created_at: time,
          updated_at: time,
          created_by: null,
        },
      },
      exercise: null,
      exercise_revision: null,
      sets: [],
      replacements: [],
      shared: null,
    };
  }
  return c;
}
function fixture(form = 'existing'): LocalExportEnvelope {
  const c = conflict(form);
  if (!c.incoming) throw new Error('fixture');
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
            sequence: 1,
            operation: c.incoming,
            result: {
              status: 'conflict',
              operation_id: id(4),
              entity_id: c.entityId,
              revision: c.expectedRevision,
              conflict_id: c.id,
            },
          },
        ],
      },
      projections: { state: 'complete', records: [] },
      conflicts: { state: 'complete', records: [c] },
      corrections: { state: 'complete', records: [] },
      otherLocalData: { state: 'unknown' },
    },
  };
}
function getConflict(f: LocalExportEnvelope): Conflict {
  if (f.sources.conflicts.state === 'unknown') throw new Error('fixture');
  return f.sources.conflicts.records[0]!;
}
function getCurrent(f: LocalExportEnvelope): CurrentVersion {
  const c = getConflict(f).current;
  if (!c) throw new Error('fixture');
  return c;
}
function sqlCurrent(c: CurrentVersion): unknown {
  const {
    projection,
    exercise: ex,
    exercise_revision,
    sets,
    replacements,
    shared,
  } = c;
  if (projection.table === 'set_results' || ex !== null)
    return {
      ...projection.row,
      exercise: ex?.row ?? null,
      exercise_revision,
      sets,
      replacements: replacements.map((r) => ({ ...r.row, sets: r.sets })),
    };
  if (projection.table === 'workout_exercises')
    return { ...projection.row, sets };
  if (
    projection.table === 'session_notes' ||
    projection.table === 'private_notes'
  )
    return { ...projection.row, shared };
  return projection.row;
}

test.each([
  'replacement',
  'existing',
  'fallback',
  'note',
  'private-note',
  'finished',
])(
  'SQL %s current_version round-trips every row, unit, tombstone and version',
  (form) => {
    const f = fixture(form);
    const raw = sqlCurrent(getCurrent(f));
    const result = serializeLocalExport(f, scope);
    expect(result.journalStatus).toBe('complete');
    const parsed = parseLocalExport(result.json, scope);
    expect(parsed.envelope).toEqual(f);
    expect(sqlCurrent(getCurrent(parsed.envelope))).toEqual(raw);
    expect(parsed.utf8Bytes).toBe(Buffer.byteLength(parsed.json));
  },
);

function resolveFixture(form = 'existing'): LocalExportEnvelope {
  const f = fixture(form);
  const c = getConflict(f);
  const resolve: TypedJournalOperation = {
    ...operation(),
    operation_id: id(40),
    base_revision: c.expectedRevision,
    entity_id: c.entityId,
    kind: 'resolve_conflict',
    payload: {
      conflict_id: c.id,
      selected_version: 'incoming',
      expected_revision: c.expectedRevision,
    },
  };
  f.sources.operations = {
    state: 'complete',
    records: [
      {
        sequence: 1,
        operation: resolve,
        result: {
          operation_id: id(40),
          entity_id: c.entityId,
          status: 'correction_draft',
          revision: 12,
          draft_id: id(41),
        },
      },
    ],
  };
  f.sources.corrections = {
    state: 'complete',
    records: [
      { id: id(41), workoutId: id(7), createdAt: time, operation: resolve },
    ],
  };
  return f;
}
test.each(['replacement', 'existing', 'fallback', 'finished'])(
  'finished resolve_conflict %s correction keeps original operation and scoped context',
  (form) => {
    const f = resolveFixture(form);
    const result = serializeLocalExport(f, scope);
    expect(result.journalStatus).toBe('complete');
    expect(parseLocalExport(result.json, scope).envelope).toEqual(f);
  },
);
test('missing resolve context preserves draft without invented workout proof', () => {
  const f = resolveFixture();
  f.sources.conflicts = { state: 'unknown' };
  const result = serializeLocalExport(f, scope);
  expect(result.journalStatus).toBe('incomplete');
  expect(parseLocalExport(result.json, scope).envelope).toEqual(f);
});
test.each(['entity', 'workout', 'revision', 'base-revision'])(
  'contradictory resolve context %s fails',
  (field) => {
    const f = resolveFixture();
    const c = getConflict(f);
    if (field === 'entity') c.entityId = id(90);
    if (field === 'workout') {
      if (f.sources.corrections.state === 'unknown') throw new Error('fixture');
      f.sources.corrections.records[0]!.workoutId = id(90);
    }
    if (field === 'base-revision') {
      if (f.sources.corrections.state === 'unknown') throw new Error('fixture');
      const op = f.sources.corrections.records[0]!.operation;
      if (!op) throw new Error('fixture');
      op.base_revision = 0;
    }
    if (field === 'revision') {
      if (f.sources.corrections.state === 'unknown') throw new Error('fixture');
      const op = f.sources.corrections.records[0]!.operation;
      if (op?.kind !== 'resolve_conflict') throw new Error('fixture');
      op.payload.expected_revision = 90;
    }
    expect(() => serializeLocalExport(f, scope)).toThrow('malformed');
  },
);

test.each([
  'exercise',
  'child',
  'replacement-parent',
  'replacement-child',
  'exercise-revision',
  'projection-version',
  'expected-version',
  'workout',
  'scope',
  'fallback-not-skipped',
  'replacement-old-id',
  'duplicate-child',
  'note-shared',
])('same-workout or foreign malformed aggregate %s fails closed', (bad) => {
  const f = fixture(
    bad === 'fallback-not-skipped'
      ? 'fallback'
      : bad === 'replacement-old-id'
        ? 'replacement'
        : bad === 'note-shared'
          ? 'note'
          : 'existing',
  );
  const c = getCurrent(f);
  if (bad === 'exercise' && c.exercise)
    c.exercise.row = { ...c.exercise.row, id: id(90) };
  if (bad === 'child')
    c.sets[0] = { ...c.sets[0]!, workout_exercise_id: id(90) };
  if (bad === 'replacement-parent')
    c.replacements[0]!.row = {
      ...c.replacements[0]!.row,
      replaced_from_id: id(90),
    };
  if (bad === 'replacement-child')
    c.replacements[0]!.sets[0] = {
      ...c.replacements[0]!.sets[0]!,
      workout_exercise_id: id(90),
    };
  if (bad === 'exercise-revision') c.exercise_revision = 10;
  if (bad === 'projection-version') c.sets[0] = { ...c.sets[0]!, seconds: 90 };
  if (bad === 'expected-version') getConflict(f).expectedRevision = 90;
  if (bad === 'workout')
    c.replacements[0]!.row = {
      ...c.replacements[0]!.row,
      workout_instance_id: id(90),
    };
  if (bad === 'scope')
    c.replacements[0]!.sets[0] = {
      ...c.replacements[0]!.sets[0]!,
      workspace_id: id(90),
    };
  if (
    bad === 'fallback-not-skipped' &&
    c.projection.table === 'workout_exercises'
  )
    c.projection.row = { ...c.projection.row, skipped: false };
  if (
    bad === 'replacement-old-id' &&
    c.projection.table === 'workout_exercises'
  )
    c.projection.row = { ...c.projection.row, id: getConflict(f).entityId };
  if (bad === 'duplicate-child')
    c.replacements[0]!.sets[0] = {
      ...c.replacements[0]!.sets[0]!,
      id: c.sets[0]!.id,
    };
  if (bad === 'note-shared') c.shared = false;
  expect(() => serializeLocalExport(f, scope)).toThrow(
    bad === 'scope' ? 'scopeMismatch' : 'malformed',
  );
});
test('known fallback is complete, absent versions and aggregate context stay incomplete', () => {
  const f = fixture('fallback');
  expect(serializeLocalExport(f, scope).journalStatus).toBe('complete');
  getCurrent(f).exercise = null;
  expect(serializeLocalExport(f, scope).journalStatus).toBe('incomplete');
  getConflict(f).current = null;
  expect(serializeLocalExport(f, scope).journalStatus).toBe('incomplete');
  getConflict(f).incoming = null;
  expect(
    parseLocalExport(serializeLocalExport(f, scope).json, scope).envelope,
  ).toEqual(f);
});
