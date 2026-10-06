import {
  parseAccountExport,
  AccountExportValidationError,
} from '@/domain/account-export';
import snapshot from './snapshot.json';

const expected = {
  workspaceId: '41000000-0000-4000-8000-000000000001',
  ownerUserId: '41000000-0000-4000-8000-000000000002',
};
const fixture = () => JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
function rejected(value: unknown, code = 'malformedPayload') {
  try {
    parseAccountExport(value, expected);
    throw new Error('Unexpected success');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AccountExportValidationError);
    expect((error as AccountExportValidationError).code).toBe(code);
  }
}
test('retains archives, private notes, source revisions, microseconds, units and signed bigint strings', () => {
  const parsed = parseAccountExport(snapshot, expected);
  expect(parsed.collections.client_records[0]?.archived_at).toBe(
    snapshot.exported_at,
  );
  expect(parsed.collections.private_notes[0]?.text).toBe(
    'Synthetic private trainer note',
  );
  expect(parsed.collections.set_results[0]).toMatchObject({
    reps: 0,
    seconds: null,
    weight_g: 0,
    requested_position: 0,
    deleted_at: snapshot.exported_at,
  });
  expect(parsed.collections.client_programs[0]?.base_template_revision).toBe(1);
  expect(
    parsed.collections.workout_sync_conflicts[0]?.incoming_operation,
  ).toEqual(snapshot.collections.workout_sync_conflicts[0]?.incoming_operation);
  expect(parsed.collections.workout_correction_drafts).toHaveLength(1);
  expect(parsed.collections.trainer_workspaces[0]?.timezone).toBe(
    'Asia/Almaty',
  );
  expect(
    parsed.collections.payment_entries.map((row) => row.amount_minor),
  ).toEqual(['9223372036854775807', '-9223372036854775807']);
  expect(parsed.collections.client_purchases[0]?.price_minor).toBe(
    '9223372036854775807',
  );
  expect(JSON.stringify(parsed)).toBe(JSON.stringify(snapshot));
});
test('accepts an empty workspace without fabricating data', () => {
  const value = fixture();
  for (const key of Object.keys(
    value.collections,
  ) as (keyof typeof value.collections)[])
    if (key !== 'trainer_workspaces' && key !== 'profiles')
      value.collections[key] = [];
  expect(
    parseAccountExport(value, expected).collections.client_records,
  ).toEqual([]);
});
test.each([
  null,
  {},
  [],
  { ...snapshot, version: null },
  { ...snapshot, format: 'other' },
])('rejects malformed envelope %j', (value) => rejected(value));
test('rejects unknown versions separately', () =>
  rejected({ ...snapshot, version: 2 }, 'unsupportedVersion'));
test('rejects another workspace or owner', () => {
  rejected(
    { ...snapshot, workspace_id: '41000000-0000-4000-8000-000000000099' },
    'tenantMismatch',
  );
  rejected(
    { ...snapshot, owner_user_id: '41000000-0000-4000-8000-000000000099' },
    'tenantMismatch',
  );
  const value = fixture();
  value.collections.client_records[0]!.workspace_id =
    '41000000-0000-4000-8000-000000000099';
  rejected(value, 'tenantMismatch');
});
test.each([
  '9007199254740993',
  '9223372036854775807',
  '-9223372036854775808',
  '0',
])('keeps exact bigint %s', (amount) => {
  const value = fixture();
  value.collections.payment_entries[0]!.amount_minor = amount;
  expect(
    parseAccountExport(value, expected).collections.payment_entries[0]
      ?.amount_minor,
  ).toBe(amount);
});
test.each([
  9007199254740993,
  0,
  '9223372036854775808',
  '-9223372036854775809',
  '01',
  '-0',
  '1.1',
  '1e10',
  '+1',
])('rejects lossy/noncanonical bigint %j', (amount) => {
  const value = fixture();
  Object.assign(value.collections.payment_entries[0]!, {
    amount_minor: amount,
  });
  rejected(value);
});
test('rejects omitted collections, fields, null arrays and undocumented partial coverage', () => {
  const value = fixture();
  Reflect.deleteProperty(value.collections, 'private_notes');
  rejected(value);
  const missing = fixture();
  Reflect.deleteProperty(missing.collections.set_results[0]!, 'seconds');
  rejected(missing);
  rejected({ ...snapshot, limitations: [] });
  rejected({
    ...snapshot,
    collections: { ...snapshot.collections, invitations: null },
  });
});
test('rejects duplicates, unstable ordering and broken references', () => {
  const duplicate = fixture();
  duplicate.collections.client_records.push(
    duplicate.collections.client_records[0]!,
  );
  rejected(duplicate);
  const reversed = fixture();
  reversed.collections.payment_entries.reverse();
  rejected(reversed);
  const broken = fixture();
  broken.collections.client_programs[0]!.client_record_id =
    '41000000-0000-4000-8000-000000000099';
  rejected(broken);
});
test('rejects invitation secrets and foreign nested conflict snapshots', () => {
  const secret = fixture();
  Object.assign(secret.collections.invitations[0]!, {
    token_hash: 'synthetic-hash',
  });
  rejected(secret);
  const nested = fixture();
  nested.collections.workout_sync_conflicts[0]!.current_version.workspace_id =
    '41000000-0000-4000-8000-000000000099';
  rejected(nested, 'tenantMismatch');
  const credential = fixture();
  Object.assign(
    credential.collections.workout_sync_conflicts[0]!.incoming_operation,
    { access_token: 'synthetic-token' },
  );
  rejected(credential);
});
test.each([
  '2026-02-30T00:00:00Z',
  '2026-10-03T24:01:00Z',
  '2026-10-03T12:00:00+06:00',
])('rejects malformed/non-UTC timestamps %s', (timestamp) =>
  rejected({ ...snapshot, exported_at: timestamp }),
);
test('rejects invalid revisions, UUIDs, dates, nulls and unsafe nested numbers', () => {
  const revision = fixture();
  revision.collections.client_records[0]!.revision = 0;
  rejected(revision);
  const uuid = fixture();
  uuid.collections.client_records[0]!.id = 'bad-id';
  rejected(uuid);
  const invalidDate = fixture();
  invalidDate.collections.payment_entries[0]!.paid_on = '2026-02-30';
  rejected(invalidDate);
  const invalidNull = fixture();
  Object.assign(invalidNull.collections.set_results[0]!, { position: null });
  rejected(invalidNull);
  const unsafe = fixture();
  unsafe.collections.workout_sync_conflicts[0]!.current_version.reps = 9007199254740992;
  rejected(unsafe);
});

test('rejects unknown product states, unsupported measures and scalar conflict versions', () => {
  const state = fixture();
  state.collections.bookings[0]!.status = 'unknown';
  rejected(state);
  const measure = fixture();
  measure.collections.exercises[0]!.measure = 'unknown';
  rejected(measure);
  const conflict = fixture();
  Object.assign(conflict.collections.workout_sync_conflicts[0]!, {
    current_version: 'invalid',
  });
  rejected(conflict);
});
