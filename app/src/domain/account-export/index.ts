import { exportLimitations } from './limitations';
import { exportRowSchemas } from './schema';

export { exportLimitations, exportRowSchemas };
export type ExportJson =
  | null
  | boolean
  | number
  | string
  | ExportJson[]
  | { [key: string]: ExportJson };
type EnumValue<S extends string> = S extends `${infer A}|${infer B}`
  ? A | EnumValue<B>
  : S;
type FieldValue<S extends string> = S extends `${infer K}?`
  ? FieldValue<K> | null
  : S extends `enum:${infer E}`
    ? EnumValue<E>
    : S extends 'object'
      ? { [key: string]: ExportJson }
      : S extends 'integer'
        ? number
        : S extends 'boolean'
          ? boolean
          : S extends 'texts'
            ? string[]
            : S extends 'integers'
              ? number[]
              : S extends 'json'
                ? ExportJson
                : string;
export type ExportCollection = keyof typeof exportRowSchemas;
export type ExportRow<K extends ExportCollection> = {
  [P in keyof (typeof exportRowSchemas)[K]]: FieldValue<
    (typeof exportRowSchemas)[K][P] & string
  >;
};
export type AccountExport = {
  format: 'panda-trainer-workspace';
  version: 1;
  workspace_id: string;
  owner_user_id: string;
  exported_at: string;
  limitations: typeof exportLimitations;
  collections: { [K in ExportCollection]: ExportRow<K>[] };
};
export class AccountExportValidationError extends Error {
  constructor(
    readonly code: 'unsupportedVersion' | 'malformedPayload' | 'tenantMismatch',
  ) {
    super(code);
    this.name = 'AccountExportValidationError';
  }
}
const fail = (): never => {
  throw new AccountExportValidationError('malformedPayload');
};
export const isExportUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const integer = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= -2147483648 &&
  value <= 2147483647;
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
    value,
  ) &&
  date(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value));
const bigint = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?:0|-?[1-9]\d*)$/.test(value) &&
  value.length <= 20 &&
  BigInt(value) >= -9223372036854775808n &&
  BigInt(value) <= 9223372036854775807n;
const secretKeys = new Set([
  'token_hash',
  'token',
  'access_token',
  'refresh_token',
  'encrypted_password',
  'password',
  'secret',
  '__proto__',
  'constructor',
  'prototype',
]);
const json = (value: unknown, workspaceId: string, depth = 0): boolean => {
  if (depth > 40) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value))
    return value.every((item) => json(item, workspaceId, depth + 1));
  if (!object(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (secretKeys.has(key)) return false;
    if (key === 'workspace_id' && item !== workspaceId)
      throw new AccountExportValidationError('tenantMismatch');
    return json(item, workspaceId, depth + 1);
  });
};
const field = (
  value: unknown,
  schema: string,
  workspaceId: string,
): boolean => {
  if (schema.endsWith('?'))
    return value === null || field(value, schema.slice(0, -1), workspaceId);
  if (schema.startsWith('enum:'))
    return (
      typeof value === 'string' && schema.slice(5).split('|').includes(value)
    );
  switch (schema) {
    case 'uuid':
      return isExportUuid(value);
    case 'text':
      return typeof value === 'string';
    case 'integer':
      return integer(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'bigint':
      return bigint(value);
    case 'date':
      return date(value);
    case 'timestamp':
      return timestamp(value);
    case 'time':
      return (
        typeof value === 'string' &&
        /^(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?|24:00:00)$/.test(
          value,
        )
      );
    case 'texts':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      );
    case 'integers':
      return Array.isArray(value) && value.every(integer);
    case 'object':
      return object(value) && json(value, workspaceId);
    case 'json':
      return json(value, workspaceId);
    default:
      return false;
  }
};
const references: Record<string, ExportCollection> = {
  client_record_id: 'client_records',
  template_id: 'workout_templates',
  base_template_id: 'workout_templates',
  exercise_id: 'exercises',
  group_session_id: 'group_sessions',
  booking_id: 'bookings',
  client_program_id: 'client_programs',
  source_program_id: 'client_programs',
  booking_program_id: 'booking_programs',
  workout_instance_id: 'workout_instances',
  workout_exercise_id: 'workout_exercises',
  replaced_from_id: 'workout_exercises',
  attendance_id: 'attendance_records',
  purchase_id: 'client_purchases',
};
export function parseAccountExport(
  value: unknown,
  expected: { workspaceId: string; ownerUserId: string },
): AccountExport {
  if (
    !object(value) ||
    !exactKeys(value, [
      'format',
      'version',
      'workspace_id',
      'owner_user_id',
      'exported_at',
      'limitations',
      'collections',
    ]) ||
    value.format !== 'panda-trainer-workspace'
  )
    return fail();
  if (value.version !== 1) {
    if (Number.isInteger(value.version))
      throw new AccountExportValidationError('unsupportedVersion');
    return fail();
  }
  if (!isExportUuid(value.workspace_id) || !isExportUuid(value.owner_user_id))
    return fail();
  if (
    value.workspace_id !== expected.workspaceId ||
    value.owner_user_id !== expected.ownerUserId
  )
    throw new AccountExportValidationError('tenantMismatch');
  if (
    !timestamp(value.exported_at) ||
    JSON.stringify(value.limitations) !== JSON.stringify(exportLimitations) ||
    !object(value.collections) ||
    !exactKeys(value.collections, Object.keys(exportRowSchemas))
  )
    return fail();
  const collections = value.collections;
  const ids = new Map<string, Set<string>>();
  for (const [name, schema] of Object.entries(exportRowSchemas)) {
    const rows: unknown = collections[name];
    if (!Array.isArray(rows)) return fail();
    const tableIds = new Set<string>();
    let previous = '';
    for (const row of rows) {
      if (!object(row) || !exactKeys(row, Object.keys(schema))) return fail();
      for (const [key, kind] of Object.entries(schema)) {
        if (!field(row[key], kind, expected.workspaceId)) return fail();
        if (
          (key === 'revision' || key.endsWith('_revision')) &&
          typeof row[key] === 'number' &&
          row[key] < 1
        )
          return fail();
      }
      if (
        Object.hasOwn(row, 'workspace_id') &&
        row.workspace_id !== expected.workspaceId
      )
        throw new AccountExportValidationError('tenantMismatch');
      const id = name === 'profiles' ? row.user_id : row.id;
      if (!isExportUuid(id) || id <= previous) return fail();
      previous = id;
      tableIds.add(id);
      if (name === 'profiles' && id !== expected.ownerUserId)
        throw new AccountExportValidationError('tenantMismatch');
      if (
        name === 'trainer_workspaces' &&
        (id !== expected.workspaceId ||
          row.owner_user_id !== expected.ownerUserId)
      )
        throw new AccountExportValidationError('tenantMismatch');
    }
    ids.set(name, tableIds);
  }
  if (
    (collections.trainer_workspaces as unknown[]).length !== 1 ||
    (collections.profiles as unknown[]).length > 1
  )
    return fail();
  for (const [name, rows] of Object.entries(collections)) {
    for (const row of rows as Record<string, unknown>[]) {
      for (const [key, target] of Object.entries(references)) {
        if (
          row[key] !== undefined &&
          row[key] !== null &&
          !ids.get(target)?.has(row[key] as string)
        )
          return fail();
      }
      if (
        row.reverses_entry_id !== undefined &&
        row.reverses_entry_id !== null &&
        !ids.get(name)?.has(row.reverses_entry_id as string)
      )
        return fail();
    }
  }
  return value as AccountExport;
}
