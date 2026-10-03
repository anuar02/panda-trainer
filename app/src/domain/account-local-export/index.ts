import { exportRowSchemas } from '../account-export/schema';
import type { LocalExportEnvelope, LocalExportResult, Scope } from './types';
export type * from './types';

export const localExportLimits = Object.freeze({
  bytes: 4 * 1024 * 1024,
  records: 10000,
  textBytes: 65536,
  nodes: 200000,
  depth: 16,
});
export class LocalExportError extends Error {
  constructor(readonly code: 'malformed' | 'scopeMismatch' | 'limit') {
    super(code);
    this.name = 'LocalExportError';
  }
}
const fail = (code: LocalExportError['code'] = 'malformed'): never => {
  throw new LocalExportError(code);
};
const uuid = (v: unknown): boolean =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown): boolean =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  !Object.is(v, -0);
function bytes(v: string): number {
  let n = 0;
  for (const c of v) {
    const p = c.codePointAt(0) ?? 0;
    if (p >= 0xd800 && p <= 0xdfff) fail();
    n += p < 128 ? 1 : p < 2048 ? 2 : p < 65536 ? 3 : 4;
  }
  return n;
}
function timestamp(v: unknown): boolean {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
      v,
    )
  )
    return false;
  return (
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v.slice(0, 10)
  );
}
type Data = Record<string, unknown>;
function object(v: unknown): Data {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    return fail();
  return v as Data;
}
function exact(v: unknown, keys: string[]): Data {
  const o = object(v);
  if (
    Object.keys(o).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(o, k))
  )
    fail();
  return o;
}
function check(ok: boolean): void {
  if (!ok) fail();
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v)) return fail();
  if (v.length > localExportLimits.records) fail('limit');
  return v;
}
function unique(items: unknown[], key: (v: unknown) => string): void {
  const ids = items.map(key).map((v) => v.toLowerCase());
  check(new Set(ids).size === ids.length);
}
function plainClone(
  v: unknown,
  depth = 0,
  budget = { nodes: 0, bytes: 0 },
): unknown {
  if (
    ++budget.nodes > localExportLimits.nodes ||
    depth > localExportLimits.depth
  )
    fail('limit');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    check(Number.isSafeInteger(v) && !Object.is(v, -0));
    return v;
  }
  if (typeof v === 'string') {
    const size = bytes(v);
    budget.bytes += size;
    if (
      size > localExportLimits.textBytes ||
      budget.bytes > localExportLimits.bytes
    )
      fail('limit');
    return v;
  }
  if (Array.isArray(v)) {
    array(v);
    check(Reflect.ownKeys(v).length === v.length + 1);
    return Array.from({ length: v.length }, (_, i) => {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (!d || !('value' in d)) return fail();
      return plainClone(d.value, depth + 1, budget);
    });
  }
  const o = object(v);
  const out: Data = {};
  for (const k of Reflect.ownKeys(o)) {
    check(typeof k === 'string');
    if (typeof k !== 'string') return fail();
    check(!['__proto__', 'constructor', 'prototype'].includes(k));
    const d = Object.getOwnPropertyDescriptor(o, k);
    if (!d || !('value' in d) || !d.enumerable) return fail();
    budget.bytes += bytes(k);
    if (budget.bytes > localExportLimits.bytes) fail('limit');
    out[k] = plainClone(d.value, depth + 1, budget);
  }
  return out;
}
const payloads: Record<string, Record<string, string>> = {
  create_workout: { booking_id: 'uuid' },
  add_exercise: {
    workout_instance_id: 'uuid',
    exercise_id: 'uuid',
    position: 'integer',
    planned_sets: 'integer',
  },
  replace_exercise: {
    workout_instance_id: 'uuid',
    exercise_id: 'uuid',
    position: 'integer',
    planned_sets: 'integer',
    replaced_from_id: 'uuid',
  },
  upsert_set: {
    workout_instance_id: 'uuid',
    workout_exercise_id: 'uuid',
    position: 'integer',
    reps: 'integer?',
    seconds: 'integer?',
    weight_g: 'integer?',
  },
  delete_set: { workout_instance_id: 'uuid', workout_exercise_id: 'uuid' },
  set_note: { workout_instance_id: 'uuid', text: 'text', shared: 'boolean' },
  finish_workout: {},
  resolve_conflict: {
    conflict_id: 'uuid',
    selected_version: 'enum:current|incoming',
    expected_revision: 'integer',
  },
};
function field(v: unknown, type: string): boolean {
  if (type.endsWith('?')) return v === null || field(v, type.slice(0, -1));
  if (type.startsWith('enum:'))
    return typeof v === 'string' && type.slice(5).split('|').includes(v);
  switch (type) {
    case 'uuid':
      return uuid(v);
    case 'integer':
      return integer(v);
    case 'text':
      return typeof v === 'string';
    case 'timestamp':
      return timestamp(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'texts':
      return array(v).every((x) => typeof x === 'string');
    default:
      return false;
  }
}
function fields(v: unknown, schema: Record<string, string>): Data {
  const o = exact(v, Object.keys(schema));
  for (const k of Object.keys(schema)) check(field(o[k], schema[k] ?? fail()));
  return o;
}
function operation(v: unknown): Data {
  const o = exact(v, [
    'operation_id',
    'kind',
    'entity_id',
    'base_revision',
    'device_id',
    'payload',
    'created_at',
  ]);
  check(
    uuid(o.operation_id) &&
      uuid(o.entity_id) &&
      uuid(o.device_id) &&
      integer(o.base_revision) &&
      timestamp(o.created_at),
  );
  check(typeof o.kind === 'string' && Object.hasOwn(payloads, o.kind));
  fields(o.payload, payloads[String(o.kind)] ?? fail());
  return o;
}
const tables = [
  'workout_instances',
  'workout_exercises',
  'set_results',
  'session_notes',
  'private_notes',
] as const;
function row(v: unknown, table: (typeof tables)[number], scope: Scope): Data {
  const o = fields(v, exportRowSchemas[table]);
  if (o.workspace_id !== scope.workspaceId) fail('scopeMismatch');
  if (
    (table === 'private_notes' || table === 'session_notes') &&
    o.author_user_id !== scope.accountId
  )
    fail('scopeMismatch');
  return o;
}
function projection(v: unknown, scope: Scope): Data {
  const o = exact(v, ['table', 'row']);
  const table = tables.find((t) => t === o.table);
  if (!table) return fail();
  row(o.row, table, scope);
  return o;
}
function currentVersion(r: Data, scope: Scope): boolean {
  const c = exact(r.current, [
    'projection',
    'exercise',
    'exercise_revision',
    'sets',
    'replacements',
    'shared',
  ]);
  const p = projection(c.projection, scope);
  const pr = object(p.row);
  check((pr.workout_instance_id ?? pr.id) === r.workoutId);
  check(c.shared === null || typeof c.shared === 'boolean');
  check(c.exercise_revision === null || integer(c.exercise_revision));
  const ex = c.exercise === null ? null : projection(c.exercise, scope);
  const er = ex === null ? null : object(ex.row);
  if (ex !== null) {
    check(
      ex.table === 'workout_exercises' &&
        er?.workout_instance_id === r.workoutId,
    );
    if (c.exercise_revision !== null)
      check(c.exercise_revision === er?.revision);
  }
  const sets = array(c.sets);
  const replacements = array(c.replacements);
  const parent =
    p.table === 'workout_exercises' ? pr.id : pr.workout_exercise_id;
  for (const set of sets) {
    const sr = row(set, 'set_results', scope);
    check(
      sr.workout_instance_id === r.workoutId &&
        sr.workout_exercise_id === parent,
    );
  }
  unique(sets, (s) => String(object(s).id));
  const allSetIds = sets.map((s) => String(object(s).id));
  for (const replacement of replacements) {
    const rep = exact(replacement, ['row', 'sets']);
    const rr = row(rep.row, 'workout_exercises', scope);
    check(
      rr.workout_instance_id === r.workoutId &&
        rr.replaced_from_id === parent &&
        rr.id !== parent,
    );
    const children = array(rep.sets);
    for (const child of children) {
      const sr = row(child, 'set_results', scope);
      check(
        sr.workout_instance_id === r.workoutId &&
          sr.workout_exercise_id === rr.id,
      );
      allSetIds.push(String(sr.id));
    }
    unique(children, (s) => String(object(s).id));
  }
  unique(allSetIds, (s) => String(s));
  unique(replacements, (s) => String(object(object(s).row).id));
  if (p.table === 'set_results') {
    if (er !== null) check(er.id === pr.workout_exercise_id);
    const same = sets.find((s) => object(s).id === pr.id);
    if (same !== undefined) check(canonical(same) === canonical(pr));
  } else if (p.table === 'workout_exercises') {
    if (er !== null) check(canonical(er) === canonical(pr));
    if (c.exercise_revision !== null)
      check(c.exercise_revision === pr.revision);
  }
  let complete = true;
  if (r.incoming === null) complete = false;
  else {
    const op = object(r.incoming);
    const payload = object(op.payload);
    switch (op.kind) {
      case 'replace_exercise':
        check(
          p.table === 'workout_exercises' && pr.id === payload.replaced_from_id,
        );
        check(
          c.exercise === null &&
            c.exercise_revision === null &&
            replacements.length === 0 &&
            c.shared === null,
        );
        check(pr.revision === r.expectedRevision);
        break;
      case 'upsert_set':
      case 'delete_set':
        check(c.shared === null);
        if (p.table === 'set_results') {
          check(
            pr.id === r.entityId &&
              pr.workout_exercise_id === payload.workout_exercise_id,
          );
        } else {
          check(
            op.kind === 'upsert_set' &&
              op.base_revision === 0 &&
              p.table === 'workout_exercises' &&
              pr.id === payload.workout_exercise_id &&
              pr.skipped === true,
          );
          check(!sets.some((s) => object(s).id === r.entityId));
        }
        if (er !== null) check(er.id === payload.workout_exercise_id);
        check(pr.revision === r.expectedRevision);
        if (er === null || c.exercise_revision === null) complete = false;
        if (
          p.table === 'set_results' &&
          !sets.some((s) => object(s).id === pr.id)
        )
          complete = false;
        break;
      case 'set_note':
        check(
          (p.table === 'session_notes' || p.table === 'private_notes') &&
            pr.id === r.entityId,
        );
        check(
          c.exercise === null &&
            c.exercise_revision === null &&
            sets.length === 0 &&
            replacements.length === 0,
        );
        if (c.shared === null) complete = false;
        else check(c.shared === (p.table === 'session_notes'));
        break;
      case 'finish_workout':
        check(
          p.table === 'workout_instances' &&
            pr.id === r.entityId &&
            op.entity_id === r.workoutId,
        );
        check(pr.revision === r.expectedRevision);
        check(
          c.exercise === null &&
            c.exercise_revision === null &&
            sets.length === 0 &&
            replacements.length === 0 &&
            c.shared === null,
        );
        break;
      default:
        return fail();
    }
  }
  return complete;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = object(v);
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
export function serializeLocalExport(
  input: unknown,
  expected: Scope,
): LocalExportResult {
  try {
    const scope = exact(plainClone(expected), [
      'accountId',
      'workspaceId',
      'sessionId',
    ]);
    check(
      uuid(scope.accountId) &&
        uuid(scope.workspaceId) &&
        typeof scope.sessionId === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(scope.sessionId),
    );
    const e = exact(plainClone(input), [
      'format',
      'version',
      'scope',
      'snapshot',
      'sources',
    ]);
    check(e.format === 'panda-trainer-local' && e.version === 1);
    exact(e.scope, Object.keys(scope));
    if (canonical(e.scope) !== canonical(scope)) fail('scopeMismatch');
    const snapshot = exact(e.snapshot, ['id', 'capturedAt', 'atomic']);
    check(
      uuid(snapshot.id) &&
        timestamp(snapshot.capturedAt) &&
        ['confirmed', 'unknown'].includes(String(snapshot.atomic)),
    );
    const sources = exact(e.sources, [
      'operations',
      'projections',
      'conflicts',
      'corrections',
      'otherLocalData',
    ]);
    let complete = snapshot.atomic === 'confirmed';
    let count = 0;
    const operations = new Map<string, Data>();
    const conflicts = new Map<string, Data>();
    const corrections = new Map<string, Data>();
    for (const name of [
      'operations',
      'projections',
      'conflicts',
      'corrections',
    ] as const) {
      const source = object(sources[name]);
      if (source.state === 'unknown') {
        exact(source, ['state']);
        complete = false;
        continue;
      }
      exact(source, ['state', 'records']);
      check(source.state === 'complete' || source.state === 'incomplete');
      complete &&= source.state === 'complete';
      const records = array(source.records);
      count += records.length;
      if (count > localExportLimits.records) fail('limit');
      for (const record of records) {
        if (name === 'operations') {
          const r = exact(record, ['operation', 'sequence', 'result']);
          const op = operation(r.operation);
          check(integer(r.sequence) && r.sequence !== 0);
          if (r.result !== null) {
            const result = object(r.result);
            const extras =
              result.status === 'conflict'
                ? ['conflict_id']
                : result.status === 'correction_draft'
                  ? ['draft_id']
                  : result.status === 'error'
                    ? ['error_code']
                    : [];
            exact(result, [
              'operation_id',
              'entity_id',
              'status',
              'revision',
              ...extras,
            ]);
            check(
              result.operation_id === op.operation_id &&
                result.entity_id === op.entity_id &&
                ['applied', 'conflict', 'correction_draft', 'error'].includes(
                  String(result.status),
                ) &&
                (result.revision === null || integer(result.revision)),
            );
            if (result.status === 'applied')
              check(typeof result.revision === 'number' && result.revision > 0);
            if (extras[0])
              check(
                extras[0] === 'error_code'
                  ? typeof result.error_code === 'string' &&
                      /^[a-zA-Z0-9_]{1,128}$/.test(result.error_code)
                  : uuid(result[extras[0]]),
              );
          }
          operations.set(String(op.operation_id), r);
        } else if (name === 'projections') projection(record, expected);
        else if (name === 'conflicts') {
          const r = exact(record, [
            'id',
            'entityId',
            'workoutId',
            'expectedRevision',
            'current',
            'incoming',
          ]);
          check(
            uuid(r.id) &&
              uuid(r.entityId) &&
              uuid(r.workoutId) &&
              integer(r.expectedRevision),
          );
          if (r.incoming === null) complete = false;
          else {
            const op = operation(r.incoming);
            check(op.entity_id === r.entityId);
            const p = object(op.payload);
            if (Object.hasOwn(p, 'workout_instance_id'))
              check(p.workout_instance_id === r.workoutId);
          }
          if (r.current === null) complete = false;
          else {
            complete = currentVersion(r, expected) && complete;
          }
          conflicts.set(String(r.id), r);
        } else {
          const r = exact(record, [
            'id',
            'workoutId',
            'createdAt',
            'operation',
          ]);
          check(uuid(r.id) && uuid(r.workoutId) && timestamp(r.createdAt));
          if (r.operation === null) complete = false;
          else {
            const op = operation(r.operation);
            const p = object(op.payload);
            if (op.kind !== 'resolve_conflict')
              check((p.workout_instance_id ?? op.entity_id) === r.workoutId);
          }
          corrections.set(String(r.id), r);
        }
      }
      unique(records, (r) =>
        name === 'operations'
          ? String(object(object(r).operation).operation_id)
          : name === 'projections'
            ? `${object(r).table}:${object(object(r).row).id}`
            : String(object(r).id),
      );
      if (name === 'operations')
        unique(records, (r) => String(object(r).sequence));
      records.sort((a, b) =>
        name === 'operations'
          ? Number(object(a).sequence) - Number(object(b).sequence)
          : canonical(a) < canonical(b)
            ? -1
            : canonical(a) > canonical(b)
              ? 1
              : 0,
      );
    }
    for (const correction of corrections.values()) {
      if (correction.operation === null) continue;
      const op = object(correction.operation);
      if (op.kind !== 'resolve_conflict') continue;
      const payload = object(op.payload);
      check(op.base_revision === payload.expected_revision);
      const context = conflicts.get(String(payload.conflict_id));
      if (!context) complete = false;
      else {
        check(
          context.entityId === op.entity_id &&
            context.workoutId === correction.workoutId,
        );
        check(context.expectedRevision === payload.expected_revision);
        if (context.incoming === null || context.current === null)
          complete = false;
      }
    }
    const other = exact(sources.otherLocalData, ['state']);
    check(other.state === 'unknown' || other.state === 'incomplete');
    for (const r of operations.values()) {
      if (r.result === null) continue;
      const result = object(r.result);
      const linked =
        result.status === 'conflict'
          ? conflicts.get(String(result.conflict_id))
          : result.status === 'correction_draft'
            ? corrections.get(String(result.draft_id))
            : undefined;
      if (
        result.status === 'conflict' ||
        result.status === 'correction_draft'
      ) {
        if (!linked) complete = false;
        else {
          const op = Object.hasOwn(linked, 'incoming')
            ? linked.incoming
            : linked.operation;
          if (op !== null && canonical(op) !== canonical(r.operation)) fail();
        }
      }
    }
    const json = canonical(e);
    const utf8Bytes = bytes(json);
    if (utf8Bytes > localExportLimits.bytes) fail('limit');
    return {
      status: 'incomplete',
      journalStatus: complete ? 'complete' : 'incomplete',
      envelope: e as unknown as LocalExportEnvelope,
      json,
      utf8Bytes,
    };
  } catch (error) {
    if (error instanceof LocalExportError) throw error;
    return fail();
  }
}
export function parseLocalExport(
  json: unknown,
  expected: Scope,
): LocalExportResult {
  try {
    if (typeof json !== 'string') return fail();
    if (bytes(json) > localExportLimits.bytes) return fail('limit');
    const result = serializeLocalExport(JSON.parse(json) as unknown, expected);
    check(result.json === json);
    return result;
  } catch (error) {
    if (error instanceof LocalExportError) throw error;
    return fail();
  }
}
