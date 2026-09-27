const test = require('node:test');
const assert = require('node:assert/strict');
const {validateSet, createWorkout, createTransfer} = require('./study-model.js');
const names = ['Алия', 'Мади', 'Дана'];
function fill(model, person, index) {
  model.setInput(person, index, 'kg', '8,5');
  model.setInput(person, index, 'reps', '12');
  return model.saveSet(person, index);
}
test('empty placeholders never count as records', () => {
  const m = createWorkout(names);
  assert.equal(m.count, 0);
  assert.deepEqual(m.saveSet(0, 0), {ok: false, field: 'kg'});
  assert.equal(m.finish().ok, false);
});
test('comma and dot decimals are accepted', () => {
  for (const kg of ['8,5', '8.5', ' 8 ', '0.5']) assert.equal(validateSet({kg, reps: '12'}).ok, true);
});
test('weight rejects empty, negative, nonfinite and malformed values', () => {
  for (const kg of ['', '0', '-8', 'Infinity', '8kg', '1e3', '1,2,3', '2.123', '9'.repeat(400)]) assert.deepEqual(validateSet({kg, reps: '12'}), {ok: false, field: 'kg'});
});
test('repetitions must be a positive safe integer', () => {
  for (const reps of ['', '0', '-1', '1.5', 'Infinity', '1e2', '9007199254740992']) assert.deepEqual(validateSet({kg: '8', reps}), {ok: false, field: 'reps'});
});
test('participant drafts and saved sets are independent', () => {
  const m = createWorkout(names);
  fill(m, 0, 0); m.setInput(0, 1, 'kg', '8'); fill(m, 1, 0);
  assert.equal(m.records[0][0].kg, '8,5');
  assert.equal(m.records[0][1].kg, '8');
  assert.equal(m.records[2][0].kg, '');
  assert.equal(m.count, 2);
});
test('finishing checks people other than the active one', () => {
  const m = createWorkout(names); fill(m, 0, 0); fill(m, 0, 1);
  assert.deepEqual(m.missing().map(x => x.name), ['Мади', 'Дана']);
  assert.equal(m.finish().ok, false); assert.equal(m.finished, false);
});
test('editing recorded data invalidates its saved status', () => {
  const m = createWorkout(names); fill(m, 0, 0); m.setInput(0, 0, 'kg', '9');
  assert.equal(m.count, 0); assert.equal(m.records[0][0].saved, false);
});
test('repeated save is idempotent', () => {
  const m = createWorkout(names); fill(m, 0, 0); m.saveSet(0, 0);
  assert.equal(m.count, 1);
});
test('completion preserves records and prevents later edits', () => {
  const m = createWorkout(names);
  names.forEach((_, p) => {fill(m, p, 0); fill(m, p, 1);});
  const before = m.records;
  assert.equal(m.finish().ok, true); assert.equal(m.finished, true);
  assert.equal(m.setInput(0, 0, 'kg', '99'), false);
  assert.deepEqual(m.records, before); assert.equal(m.count, 6);
});
test('returned snapshots cannot silently mutate the model', () => {
  const m = createWorkout(names); m.records[0][0].saved = true;
  assert.equal(m.count, 0);
});
test('reset clears all participants and completion', () => {
  const m = createWorkout(names); fill(m, 0, 0); m.reset();
  assert.equal(m.count, 0); assert.equal(m.finished, false); assert.equal(m.records[0][0].kg, '');
});
test('pending and declined transfer retain original appointment', () => {
  const t = createTransfer(); assert.equal(t.activeAppointment.date, '2026-09-17');
  assert.equal(t.decide('trainer', 'declined'), true);
  assert.deepEqual(t.activeAppointment, {date: '2026-09-17', start: '18:00', end: '19:00'});
});
test('only trainer can accept, and accepted time is explicit', () => {
  const t = createTransfer(); assert.equal(t.decide('client', 'accepted'), false);
  assert.equal(t.status, 'pending'); assert.equal(t.decide('trainer', 'accepted'), true);
  assert.deepEqual(t.activeAppointment, {date: '2026-09-18', start: '19:00', end: '20:00'});
});
test('a resolved request cannot be overwritten by a stale decision', () => {
  const t = createTransfer(); t.decide('trainer', 'accepted');
  assert.equal(t.decide('trainer', 'declined'), false); assert.equal(t.status, 'accepted');
  t.reset(); assert.equal(t.status, 'pending');
});
test('invalid participant, field and transfer state are rejected', () => {
  const m = createWorkout(names); assert.throws(() => m.setInput(9, 0, 'kg', '8'), RangeError);
  assert.throws(() => m.setInput(0, 0, 'html', '8'), TypeError);
  assert.equal(createTransfer().decide('trainer', 'cancelled'), false);
});
