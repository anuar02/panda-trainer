import type {
  JsonValue,
  JournalOperation,
  OperationResult,
  SyncScope,
} from '../../domain/workout-sync/types';
import {
  ScopedOutboxSnapshotError,
  scopedOutboxSnapshotDefaults,
} from './snapshot-types';
import type {
  ScopedOutboxSnapshotEntry,
  ScopedOutboxSnapshotOperation,
} from './snapshot-types';
function malformed(): never {
  throw new ScopedOutboxSnapshotError('malformed');
}
function limit(): never {
  throw new ScopedOutboxSnapshotError('limit');
}
function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function nonempty(value: unknown): value is string {
  if (typeof value !== 'string' || !value.length) return false;
  snapshotUtf8Bytes(value);
  return true;
}
function integer(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= minimum
  );
}
export function snapshotUtf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) malformed();
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) malformed();
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return bytes;
}
function decimal(value: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!parts) return malformed();
  let digits = `${parts[2]}${parts[3] ?? ''}`.replace(/^0+/, '');
  let exponent = Number(parts[4] ?? 0) - (parts[3]?.length ?? 0);
  if (!digits) return '0';
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  return `${parts[1]}${digits}e${exponent}`;
}
function parse(input: unknown): JsonValue {
  if (typeof input !== 'string') return malformed();
  const source = input;
  if (snapshotUtf8Bytes(source) > scopedOutboxSnapshotDefaults.maxBytes)
    limit();
  let position = 0;
  let nodes = 0;
  function whitespace(): void {
    while (/^[\t\n\r ]$/.test(source[position] ?? '')) position += 1;
  }
  function string(): string {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === '\\') position += 1;
      else if (character === '"') {
        let result: unknown;
        try {
          result = JSON.parse(source.slice(start, position));
        } catch {
          return malformed();
        }
        if (typeof result !== 'string') return malformed();
        snapshotUtf8Bytes(result);
        return result;
      }
    }
    return malformed();
  }
  function read(depth: number): JsonValue {
    if (depth > 64 || ++nodes > 200000) return limit();
    whitespace();
    const character = source[position];
    if (character === '"') return string();
    if (character === '{' || character === '[') {
      const array = character === '[';
      position += 1;
      const result: { [key: string]: JsonValue } = {};
      const items: JsonValue[] = [];
      const keys = new Set<string>();
      whitespace();
      if (source[position] === (array ? ']' : '}')) {
        position += 1;
        return array ? items : result;
      }
      while (true) {
        whitespace();
        if (array) items.push(read(depth + 1));
        else {
          if (source[position] !== '"') return malformed();
          const key = string();
          if (keys.has(key)) return malformed();
          keys.add(key);
          whitespace();
          if (source[position++] !== ':') return malformed();
          Object.defineProperty(result, key, {
            value: read(depth + 1),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        whitespace();
        const separator = source[position++];
        if (separator === (array ? ']' : '}')) return array ? items : result;
        if (separator !== ',') return malformed();
      }
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return literal === 'null' ? null : literal === 'true';
      }
    }
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(position),
    )?.[0];
    if (!token) return malformed();
    position += token.length;
    const number = Number(token);
    if (
      !Number.isFinite(number) ||
      Object.is(number, -0) ||
      (Number.isInteger(number) && !Number.isSafeInteger(number)) ||
      decimal(token) !== decimal(JSON.stringify(number))
    )
      return malformed();
    return number;
  }
  const result = read(0);
  whitespace();
  if (position !== source.length) return malformed();
  return result;
}
function dataRow(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  try {
    if (!object(value) || Reflect.ownKeys(value).length !== keys.length)
      return malformed();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      )
        return malformed();
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    return malformed();
  }
}
function row(
  value: unknown,
  scope: SyncScope,
  keys: readonly string[],
): Record<string, unknown> {
  const stored = dataRow(value, keys);
  if (
    !nonempty(scope.accountId) ||
    !nonempty(scope.workspaceId) ||
    !nonempty(stored.account_id) ||
    !nonempty(stored.workspace_id)
  )
    return malformed();
  if (
    stored.account_id !== scope.accountId ||
    stored.workspace_id !== scope.workspaceId
  )
    throw new ScopedOutboxSnapshotError('scopeMismatch');
  return stored;
}
export function validateSnapshotCount(value: unknown): number {
  const stored = dataRow(value, ['count']);
  if (!integer(stored.count, 0)) return malformed();
  return stored.count;
}
export function validateSnapshotOperation(
  value: unknown,
  scope: SyncScope,
): ScopedOutboxSnapshotOperation {
  const stored = row(value, scope, [
    'account_id',
    'workspace_id',
    'operation_id',
    'entity_id',
    'sequence',
    'operation_json',
    'result_json',
    'confirmed',
  ]);
  if (
    !integer(stored.sequence, 1) ||
    !nonempty(stored.operation_id) ||
    !nonempty(stored.entity_id) ||
    typeof stored.operation_json !== 'string' ||
    (stored.result_json !== null && typeof stored.result_json !== 'string') ||
    (stored.confirmed !== 0 && stored.confirmed !== 1)
  )
    return malformed();
  const operation = parse(stored.operation_json);
  if (
    !object(operation) ||
    typeof operation.kind !== 'string' ||
    ![
      'create_workout',
      'add_exercise',
      'replace_exercise',
      'upsert_set',
      'delete_set',
      'set_note',
      'finish_workout',
      'resolve_conflict',
    ].includes(operation.kind) ||
    !nonempty(operation.device_id) ||
    operation.operation_id !== stored.operation_id ||
    operation.entity_id !== stored.entity_id ||
    !integer(operation.base_revision, 0) ||
    typeof operation.created_at !== 'string' ||
    !Number.isFinite(Date.parse(operation.created_at)) ||
    !object(operation.payload)
  )
    return malformed();
  const result = stored.result_json === null ? null : parse(stored.result_json);
  if (result !== null) {
    if (
      !object(result) ||
      typeof result.status !== 'string' ||
      result.operation_id !== stored.operation_id ||
      result.entity_id !== stored.entity_id ||
      !['applied', 'conflict', 'correction_draft', 'error'].includes(
        result.status,
      ) ||
      (result.revision !== null && !integer(result.revision, 0)) ||
      (result.status === 'applied' && !integer(result.revision, 1)) ||
      (result.status === 'conflict' && !nonempty(result.conflict_id)) ||
      (result.status === 'correction_draft' && !nonempty(result.draft_id)) ||
      !['conflict_id', 'draft_id', 'error_code'].every(
        (key) =>
          !Object.prototype.hasOwnProperty.call(result, key) ||
          typeof result[key] === 'string',
      )
    )
      return malformed();
  } else if (stored.result_json !== null || stored.confirmed === 1)
    return malformed();
  return {
    sequence: stored.sequence,
    operationId: stored.operation_id,
    entityId: stored.entity_id,
    operationJson: stored.operation_json,
    resultJson: stored.result_json,
    operation: operation as JournalOperation,
    result: result as OperationResult | null,
    confirmed: stored.confirmed,
  };
}
export function validateSnapshotEntry(
  value: unknown,
  scope: SyncScope,
): ScopedOutboxSnapshotEntry {
  const stored = row(value, scope, [
    'account_id',
    'workspace_id',
    'entity_id',
    'value_json',
  ]);
  if (!nonempty(stored.entity_id) || typeof stored.value_json !== 'string')
    return malformed();
  return {
    entityId: stored.entity_id,
    valueJson: stored.value_json,
    value: parse(stored.value_json),
  };
}
