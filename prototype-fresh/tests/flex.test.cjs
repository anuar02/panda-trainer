const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function memory() {
  const data = new Map();
  return { data, getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}
function app(storage = memory()) {
  const context = vm.createContext({ console, URLSearchParams, setTimeout: () => 0, localStorage: storage });
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'mascot', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context, { filename: name });
  }
  return { storage, run: code => vm.runInContext(code, context) };
}
const personal = () => {
  const a = app();
  const sid = a.run("DB.sessions.find(s => s.kind === 'personal' && s.program && s.status !== 'cancelled').id");
  const cid = a.run(`DB.sessions.find(s => s.id === '${sid}').clientId`);
  a.run(`Store.logging.open('${sid}')`);
  return { ...a, sid, cid };
};

test('extra sets can be added and only empty extra sets removed', () => {
  const { run, cid } = personal();
  const sets = run(`Store.logging.exercises('${cid}')[0].sets`);
  assert.equal(run(`Store.logging.addSet('${cid}', 'e1')`), true);
  assert.equal(run(`Store.logging.exercises('${cid}')[0].sets`), sets + 1);
  assert.equal(run(`Store.logging.exercises('${cid}')[0].plannedSets`), sets);
  assert.equal(run(`Store.logging.setValue('${cid}', 'e1', ${sets}, { kg: 50, reps: 5 })`), true);
  assert.equal(run(`Store.logging.removeSet('${cid}', 'e1')`), false);
  assert.match(run('Trainer.session()'), /сверх плана/);
  assert.equal(run(`Store.logging.changes('${cid}').extra`), 1);
});

test('replacement keeps written sets on the original and moves the rest', () => {
  const { run, cid } = personal();
  run(`Store.logging.setValue('${cid}', 'e1', 0, { kg: 40, reps: 10 })`);
  const sets = run(`Store.logging.exercises('${cid}')[0].sets`);
  const id = run(`Store.logging.replaceExercise('${cid}', 'e1', { name: 'Жим гантелей лёжа' })`);
  const list = JSON.parse(run(`JSON.stringify(Store.logging.exercises('${cid}'))`));
  assert.equal(list[0].skipped, true);
  assert.equal(list[0].replacedBy, id);
  assert.equal(list[1].name, 'Жим гантелей лёжа');
  assert.equal(list[1].origin, 'replaced');
  assert.equal(list[1].sets, sets - 1);
  assert.equal(run(`Store.get().logging.values['${cid}'].e1[0].kg`), 40);
  assert.match(run('Trainer.session()'), /вместо/);
  assert.equal(run(`Store.logging.progress('${cid}').total`), list.slice(2).reduce((n, e) => n + e.sets, 0) + 1 + (sets - 1));
});

test('skip excludes empty sets from progress and can be undone; empty added exercises are removed', () => {
  const { run, cid } = personal();
  const before = run(`Store.logging.progress('${cid}').total`);
  const sets = run(`Store.logging.exercises('${cid}')[1].sets`);
  const exId = run(`Store.logging.exercises('${cid}')[1].id`);
  assert.equal(run(`Store.logging.skipExercise('${cid}', '${exId}', true)`), true);
  assert.equal(run(`Store.logging.progress('${cid}').total`), before - sets);
  assert.equal(run(`Store.logging.setValue('${cid}', '${exId}', 0, { kg: 10, reps: 10 })`), false);
  assert.equal(run(`Store.logging.skipExercise('${cid}', '${exId}', false)`), true);
  assert.equal(run(`Store.logging.progress('${cid}').total`), before);
  const added = run(`Store.logging.addExercise('${cid}', { name: 'Подтягивания' })`);
  assert.equal(run(`Store.logging.exercises('${cid}').find(e => e.id === '${added}').prev.kg`), 0);
  run(`Store.logging.skipExercise('${cid}', '${added}', true)`);
  assert.equal(run(`Store.logging.exercises('${cid}').some(e => e.id === '${added}')`), false);
});

test('a session without programme can be logged and reloaded with its changes', () => {
  const storage = memory();
  const a = app(storage);
  a.run("Store.logging.open('s7')");
  assert.equal(a.run("Store.logging.exercises('c1').length"), 0);
  const id = a.run("Store.logging.addExercise('c1', { name: 'Фермерская прогулка' })");
  assert.equal(a.run(`Store.logging.setValue('c1', '${id}', 0, { kg: 24, reps: 40 })`), true);
  a.run("Store.logging.addNote('c1', 'хватка устаёт')");
  const b = app(storage);
  b.run("Store.logging.open('s7')");
  assert.equal(b.run("Store.logging.exercises('c1')[0].name"), 'Фермерская прогулка');
  assert.equal(b.run(`Store.get().logging.values.c1['${id}'][0].kg`), 24);
  assert.equal(b.run("Store.get().logging.notes.c1[0].text"), 'хватка устаёт');
  assert.equal(b.run("Store.logging.library().some(e => e.name === 'Фермерская прогулка')"), false);
});

test('finished journal rejects structural changes', () => {
  const { run, cid } = personal();
  run(`Store.logging.setValue('${cid}', 'e1', 0, { kg: 40, reps: 10 }); Store.logging.finish(); Store.logging.confirmPartial()`);
  assert.equal(run('Store.get().logging.finished'), true);
  assert.equal(run(`Store.logging.addSet('${cid}', 'e1')`), false);
  assert.equal(run(`Store.logging.addExercise('${cid}', { name: 'Планка' })`), null);
});
