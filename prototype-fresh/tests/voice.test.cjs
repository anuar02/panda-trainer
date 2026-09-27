const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/voice.js'), 'utf8'), context, { filename: 'voice' });
const { parse, normalize } = vm.runInContext('VoiceParse', context);

const plan = {
  c1: [
    { id: 'e1', name: 'Приседания со штангой', sets: 3, prev: { kg: 50, reps: 10 } },
    { id: 'e2', name: 'Отжимания', sets: 3, prev: { kg: 0, reps: 12 } },
    { id: 'e3', name: 'Тяга в наклоне', sets: 3, prev: { kg: 30, reps: 12 } },
    { id: 'e4', name: 'Планка', sets: 3, prev: { kg: 0, reps: 40 } },
  ],
  c2: [{ id: 'e1', name: 'Жим лёжа', sets: 2, prev: { kg: 40, reps: 10 } }],
};
const ctx = (values = {}, participants = [{ clientId: 'c1', short: 'Дана' }]) => ({
  active: 'c1', participants,
  exercises: cid => plan[cid] || [],
  values: (cid, exId) => values[cid]?.[exId] || [],
});
const sets = items => JSON.parse(JSON.stringify(items.filter(i => i.type === 'set').map(i => [i.clientId, i.exId, i.setId, i.kg, i.reps])));

test('number words and decimals normalise to digits', () => {
  assert.equal(normalize('восемьдесят два с половиной на восемь'), '82.5 на 8');
  assert.equal(normalize('Сто двадцать х 5'), '120 на 5');
  assert.equal(normalize('62,5 на 10'), '62.5 на 10');
});

test('named exercise with weight and reps fills the first empty set', () => {
  assert.deepEqual(sets(parse('Приседания 80 на 8', ctx({ c1: { e1: [{ kg: 50, reps: 10 }] } }))), [['c1', 'e1', 1, 80, 8]]);
});

test('unnamed set goes to the next exercise with an empty set', () => {
  assert.deepEqual(sets(parse('55 на 10', ctx({ c1: { e1: [{ kg: 50, reps: 10 }, { kg: 50, reps: 10 }, { kg: 50, reps: 10 }] } }))), [['c1', 'e2', 0, 0, 10]]);
});

test('repeat copies the previous set in the same dictation, never reading "один" as reps', () => {
  const items = parse('присед 80 на 8. ещё один такой же', ctx());
  assert.deepEqual(sets(items), [['c1', 'e1', 0, 80, 8], ['c1', 'e1', 1, 80, 8]]);
});

test('bodyweight exercises keep zero kilograms', () => {
  assert.deepEqual(sets(parse('отжимания 15 раз', ctx())), [['c1', 'e2', 0, 0, 15]]);
  assert.deepEqual(sets(parse('планка 50 секунд', ctx())), [['c1', 'e4', 0, 0, 50]]);
});

test('explicit set number is respected and flagged when it replaces a written set', () => {
  const items = parse('тяга второй подход 35 на 10', ctx({ c1: { e3: [null, { kg: 30, reps: 12 }] } }));
  assert.deepEqual(sets(items), [['c1', 'e3', 1, 35, 10]]);
  assert.equal(items[0].replaces, true);
});

const library = [
  { name: 'Сгибания на бицепс с гантелями' },
  { name: 'Жим гантелей лёжа' },
  { name: 'Подтягивания', bodyweight: true },
];
const libCtx = (values = {}) => ({ ...ctx(values), library, libraryPrev: () => null });
const plain = v => JSON.parse(JSON.stringify(v));

test('notes are kept verbatim', () => {
  const items = parse('Заметка: колено уходит внутрь', ctx());
  assert.equal(items[0].type, 'note');
  assert.equal(items[0].text, 'колено уходит внутрь');
});

test('an exercise outside the programme is proposed from the library, then its set follows', () => {
  const items = plain(parse('бицепс 20 на 10. ещё такой же', libCtx()));
  assert.equal(items[0].type, 'add');
  assert.equal(items[0].name, 'Сгибания на бицепс с гантелями');
  assert.equal(items[0].fromLibrary, true);
  assert.deepEqual(sets(items), [['c1', items[0].tempId, 0, 20, 10], ['c1', items[0].tempId, 1, 20, 10]]);
});

test('an unknown exercise becomes a custom one and bodyweight library entries keep zero kilograms', () => {
  const custom = plain(parse('фермерская прогулка 24 на 40', libCtx()));
  assert.equal(custom[0].type, 'add');
  assert.equal(custom[0].fromLibrary, false);
  assert.equal(custom[0].name, 'Фермерская прогулка');
  const pull = plain(parse('подтягивания 8 раз', libCtx()));
  assert.deepEqual(sets(pull), [['c1', pull[0].tempId, 0, 0, 8]]);
});

test('a full exercise gets an extra set instead of overwriting', () => {
  const full = { c1: { e1: [{ kg: 50, reps: 10 }, { kg: 50, reps: 10 }, { kg: 50, reps: 10 }] } };
  const items = plain(parse('приседания 60 на 8. ещё такой же', ctx(full)));
  assert.deepEqual(sets(items), [['c1', 'e1', 3, 60, 8], ['c1', 'e1', 4, 60, 8]]);
  assert.equal(items[0].extra, true);
  assert.equal(items[0].replaces, false);
});

test('replacement moves later sets to the new exercise', () => {
  const items = plain(parse('вместо тяги в наклоне делаем жим гантелей лёжа. жим гантелей 22 на 10', libCtx({ c1: { e3: [{ kg: 30, reps: 12 }] } })));
  assert.equal(items[0].type, 'replace');
  assert.equal(items[0].exId, 'e3');
  assert.equal(items[0].toName, 'Жим гантелей лёжа');
  assert.deepEqual(sets(items), [['c1', items[0].tempId, 0, 22, 10]]);
});

test('skip removes the exercise from the "next set" choice', () => {
  const full = { c1: { e1: [{ kg: 50, reps: 10 }, { kg: 50, reps: 10 }, { kg: 50, reps: 10 }] } };
  const items = plain(parse('пропускаем отжимания. 30 на 12', ctx(full)));
  assert.equal(items[0].type, 'skip');
  assert.equal(items[0].exId, 'e2');
  assert.deepEqual(sets(items), [['c1', 'e3', 0, 30, 12]]);
});

test('group dictation switches participant by name', () => {
  const group = ctx({}, [{ clientId: 'c1', short: 'Дана' }, { clientId: 'c2', short: 'Арман' }]);
  assert.deepEqual(sets(parse('Арман жим 45 на 8', group)), [['c2', 'e1', 0, 45, 8]]);
});
