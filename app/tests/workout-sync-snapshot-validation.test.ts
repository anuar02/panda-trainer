import {
  validateSnapshotCount,
  validateSnapshotEntry,
  validateSnapshotOperation,
  snapshotUtf8Bytes,
} from '../src/features/workout-sync/snapshot-validation';
import { ScopedOutboxSnapshotError } from '../src/features/workout-sync/snapshot-types';
const scope = { accountId: 'account', workspaceId: 'workspace' };
function entry(value_json: string) {
  return {
    account_id: scope.accountId,
    workspace_id: scope.workspaceId,
    entity_id: 'entity',
    value_json,
  };
}
function rejection(value: string, code = 'malformed') {
  try {
    validateSnapshotEntry(entry(value), scope);
    throw new Error('Expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ScopedOutboxSnapshotError);
    expect((error as ScopedOutboxSnapshotError).code).toBe(code);
  }
}
it('preserves Unicode, null, zero, units, decimals and original JSON', () => {
  const raw =
    '{ "emoji":"🐼", "unit":"кг", "zero":0, "nil":null, "decimal":1.250e-1, "__proto__":{"ok":true} }';
  const result = validateSnapshotEntry(entry(raw), scope);
  expect(result.valueJson).toBe(raw);
  expect(result.value).toEqual(JSON.parse(raw));
  expect(snapshotUtf8Bytes('Aя🐼')).toBe(7);
});
it.each([
  '{"x":1,"\\u0078":2}',
  '9007199254740993',
  '0.10000000000000001',
  '-0',
  '1e-999',
  '"\\ud800"',
  '{"x":1,}',
  '[1,]',
  '01',
  '1 true',
])('rejects lossy or malformed JSON %s', (raw) => rejection(raw));
it('bounds recursive and wide input', () => {
  rejection('['.repeat(66) + '0' + ']'.repeat(66), 'limit');
  rejection('"' + 'a'.repeat(4 * 1024 * 1024) + '"', 'limit');
});
it('retains confirmed error receipts and unknown contents', () => {
  const operation = {
    operation_id: 'op',
    entity_id: 'entity',
    device_id: 'phone',
    kind: 'set_note',
    base_revision: 0,
    created_at: '2026-10-04T00:00:00Z',
    payload: { note: null },
    extra: { unit: 'кг' },
  };
  const result = {
    operation_id: 'op',
    entity_id: 'entity',
    status: 'error',
    revision: null,
    error_code: 'failed',
    extra: [0, null],
  };
  const row = {
    account_id: scope.accountId,
    workspace_id: scope.workspaceId,
    operation_id: 'op',
    entity_id: 'entity',
    sequence: 1,
    operation_json: JSON.stringify(operation),
    result_json: JSON.stringify(result),
    confirmed: 1,
  };
  expect(validateSnapshotOperation(row, scope)).toMatchObject({
    operation,
    result,
    confirmed: 1,
  });
  expect(() =>
    validateSnapshotOperation({ ...row, result_json: null }, scope),
  ).toThrow(ScopedOutboxSnapshotError);
});
it('rejects scope mismatch and malformed identifier Unicode', () => {
  expect(() =>
    validateSnapshotEntry({ ...entry('null'), account_id: 'other' }, scope),
  ).toThrow('scopeMismatch');
  expect(() =>
    validateSnapshotEntry({ ...entry('null'), entity_id: '\ud800' }, scope),
  ).toThrow('malformed');
});
it('rejects coercible kind and receipt status', () => {
  const operation = {
    operation_id: 'op',
    entity_id: 'entity',
    device_id: 'phone',
    kind: 'set_note',
    base_revision: 0,
    created_at: '2026-10-04T00:00:00Z',
    payload: {},
  };
  const row = {
    account_id: scope.accountId,
    workspace_id: scope.workspaceId,
    operation_id: 'op',
    entity_id: 'entity',
    sequence: 1,
    operation_json: JSON.stringify(operation),
    result_json: null,
    confirmed: 0,
  };
  expect(() =>
    validateSnapshotOperation(
      {
        ...row,
        operation_json: JSON.stringify({ ...operation, kind: ['set_note'] }),
      },
      scope,
    ),
  ).toThrow('malformed');
  expect(() =>
    validateSnapshotOperation(
      {
        ...row,
        result_json: JSON.stringify({
          operation_id: 'op',
          entity_id: 'entity',
          status: ['applied'],
          revision: 1,
        }),
      },
      scope,
    ),
  ).toThrow('malformed');
});
it('rejects accessors and hidden extra driver columns without reading getters', () => {
  const getter = jest.fn(() => {
    throw new Error('sensitive raw data');
  });
  const accessor = Object.defineProperty(entry('null'), 'value_json', {
    get: getter,
    enumerable: true,
  });
  expect(() => validateSnapshotEntry(accessor, scope)).toThrow('malformed');
  expect(getter).not.toHaveBeenCalled();
  expect(() =>
    validateSnapshotEntry(
      Object.defineProperty(entry('null'), 'extra', { value: 'private' }),
      scope,
    ),
  ).toThrow('malformed');
  expect(() =>
    validateSnapshotEntry(
      { ...entry('null'), [Symbol('extra')]: 'private' },
      scope,
    ),
  ).toThrow('malformed');
  const proxy = new Proxy(entry('null'), {
    ownKeys() {
      throw new Error('sensitive raw data');
    },
  });
  expect(() => validateSnapshotEntry(proxy, scope)).toThrow('malformed');
});
const validOperation = {
  operation_id: 'op',
  entity_id: 'entity',
  device_id: 'phone',
  kind: 'set_note',
  base_revision: 0,
  created_at: '2026-10-04T00:00:00Z',
  payload: {},
};
function operationRow(
  operation: unknown = validOperation,
  result: unknown = null,
) {
  return {
    account_id: scope.accountId,
    workspace_id: scope.workspaceId,
    operation_id: 'op',
    entity_id: 'entity',
    sequence: 1,
    operation_json: JSON.stringify(operation),
    result_json: result === null ? null : JSON.stringify(result),
    confirmed: 0,
  };
}
it.each([
  null,
  '1',
  { count: null },
  { count: '1' },
  { count: -1 },
  { count: 0.5 },
  { count: Number.MAX_SAFE_INTEGER + 1 },
  { count: -0 },
  { count: 1, extra: true },
])('rejects malformed count %p', (value) => {
  expect(() => validateSnapshotCount(value)).toThrow('malformed');
});
it.each([
  { kind: undefined },
  { kind: 'unknown' },
  { base_revision: -1 },
  { base_revision: Number.MAX_SAFE_INTEGER + 1 },
  { device_id: '' },
  { payload: [] },
  { payload: null },
  { created_at: 'invalid' },
  { operation_id: 'different' },
  { entity_id: 'different' },
])('rejects malformed operation fields %p', (patch) => {
  expect(() =>
    validateSnapshotOperation(
      operationRow({ ...validOperation, ...patch }),
      scope,
    ),
  ).toThrow('malformed');
});
it.each([Number.MAX_SAFE_INTEGER + 1, -0, 0, 0.5])(
  'rejects invalid sequence %p',
  (sequence) => {
    expect(() =>
      validateSnapshotOperation({ ...operationRow(), sequence }, scope),
    ).toThrow('malformed');
  },
);
it.each([
  { status: 'unknown' },
  { revision: undefined },
  { revision: Number.MAX_SAFE_INTEGER + 1 },
  { status: 'applied', revision: 0 },
  { status: 'conflict' },
  { status: 'conflict', conflict_id: '' },
  { status: 'correction_draft' },
  { status: 'correction_draft', draft_id: '' },
  { conflict_id: 1 },
  { draft_id: null },
  { error_code: false },
  { operation_id: 'other' },
  { entity_id: 'other' },
])('rejects malformed receipt fields %p', (patch) => {
  const result = {
    operation_id: 'op',
    entity_id: 'entity',
    status: 'error',
    revision: null,
    ...patch,
  };
  expect(() =>
    validateSnapshotOperation(operationRow(validOperation, result), scope),
  ).toThrow('malformed');
});
it('rejects JSON null receipt for a confirmed row', () => {
  expect(() =>
    validateSnapshotOperation(
      { ...operationRow(), result_json: 'null', confirmed: 1 },
      scope,
    ),
  ).toThrow('malformed');
});
it('accepts exact safe integer boundaries, escapes and equivalent exponents', () => {
  expect(validateSnapshotCount({ count: Number.MAX_SAFE_INTEGER })).toBe(
    Number.MAX_SAFE_INTEGER,
  );
  expect(validateSnapshotCount({ count: 0 })).toBe(0);
  const raw =
    '{"\\u0078":"line\\n\\uD83D\\uDC3C","max":9007199254740991,"min":-9007199254740991,"n":125e-3,"zero":0e9}';
  expect(validateSnapshotEntry(entry(raw), scope).value).toEqual({
    x: 'line\n🐼',
    max: Number.MAX_SAFE_INTEGER,
    min: -Number.MAX_SAFE_INTEGER,
    n: 0.125,
    zero: 0,
  });
  expect(
    validateSnapshotOperation(
      {
        ...operationRow({
          ...validOperation,
          base_revision: Number.MAX_SAFE_INTEGER,
        }),
        sequence: Number.MAX_SAFE_INTEGER,
      },
      scope,
    ).sequence,
  ).toBe(Number.MAX_SAFE_INTEGER);
});
it.each(['1.0000000000000001', '12500000000000001e-17', '9007199254740992e0'])(
  'rejects exponent or fractional precision loss %s',
  (raw) => rejection(raw),
);
it('bounds total JSON nodes', () => {
  rejection('[' + 'null,'.repeat(200000) + 'null]', 'limit');
});
