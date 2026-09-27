/* Small, dependency-free model for the isolated study, shared by UI and Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function validateSet(row) {
    const kg = String(row.kg).trim().replace(',', '.');
    const reps = String(row.reps).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(kg) || !Number.isFinite(Number(kg)) || Number(kg) <= 0) return {ok: false, field: 'kg'};
    if (!/^\d+$/.test(reps) || !Number.isSafeInteger(Number(reps)) || Number(reps) <= 0) return {ok: false, field: 'reps'};
    return {ok: true};
  }
  function createWorkout(personNames) {
    const names = [...personNames];
    let records, finished;
    const reset = () => {records = names.map(() => Array.from({length: 2}, () => ({kg: '', reps: '', saved: false}))); finished = false;};
    reset();
    function rowAt(person, index) {
      if (!Number.isInteger(person) || !Number.isInteger(index) || !records[person]?.[index]) throw new RangeError('Unknown participant or set');
      return records[person][index];
    }
    const missing = () => records.map((rows, i) => ({person: i, name: names[i], count: rows.filter(row => !row.saved).length})).filter(item => item.count);
    return {
      get records() {return records.map(rows => rows.map(row => ({...row})));},
      get finished() {return finished;},
      get count() {return records.flat().filter(row => row.saved).length;},
      setInput(person, index, field, value) {
        if (finished) return false;
        if (!['kg', 'reps'].includes(field)) throw new TypeError('Unknown set field');
        const row = rowAt(person, index);
        const next = String(value);
        row[field] = next;
        row.saved = false;
        return true;
      },
      saveSet(person, index) {
        if (finished) return {ok: false, reason: 'finished'};
        const row = rowAt(person, index);
        const result = validateSet(row);
        if (result.ok) row.saved = true;
        return result;
      },
      missing,
      finish() {
        if (missing().length) return {ok: false, missing: missing()};
        finished = true;
        return {ok: true};
      },
      reset,
    };
  }
  function createTransfer() {
    let status = 'pending';
    const original = Object.freeze({date: '2026-09-17', start: '18:00', end: '19:00'});
    const proposed = Object.freeze({date: '2026-09-18', start: '19:00', end: '20:00'});
    return {
      get status() {return status;},
      get activeAppointment() {return status === 'accepted' ? proposed : original;},
      decide(actor, next) {
        if (actor !== 'trainer' || status !== 'pending' || !['accepted', 'declined'].includes(next)) return false;
        status = next;
        return true;
      },
      reset() {status = 'pending';},
    };
  }
  return {validateSet, createWorkout, createTransfer};
});
