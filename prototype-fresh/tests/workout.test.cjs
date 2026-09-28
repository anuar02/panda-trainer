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
  for (const name of ['icons', 'data', 'template-repository', 'session-repository', 'store', 'ui', 'library', 'mascot', 'workout', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context, { filename: name });
  }
  const run = code => vm.runInContext(code, context);
  run("Store.logging.open('s1')");
  return { storage, run, json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const current = "Workout.current('c5', Store.logging.exercises('c5'), Store.get().logging.values.c5 || {})";
const recordAfter = (cid, ex, si, value) => `(() => { const before = Store.get(); const ok = Store.logging.record('${cid}','${ex}',${si},${JSON.stringify(value)}); Workout.afterAction('workout.save', before, Store.get()); return ok; })()`;

test('the focused exercise is the first with open sets and prefill follows today before last time', () => {
  const { run, json } = app();
  assert.equal(run(`${current}.id`), 'e1');
  const ex = "Store.logging.exercises('c5')[0]";
  assert.deepEqual(json(`Workout.prefill('c5', ${ex}, 0, Store.get().logging)`), { kg: '50', reps: '10', source: 'как в прошлый раз' });
  assert.equal(run(recordAfter('c5', 'e1', 0, { kg: 42.5, reps: 8 })), true);
  assert.deepEqual(json(`Workout.prefill('c5', ${ex}, 1, Store.get().logging)`), { kg: '42,5', reps: '8', source: 'как подход 1' });
  run(recordAfter('c5', 'e1', 1, { kg: 40, reps: 10 }) + ';' + recordAfter('c5', 'e1', 2, { kg: 40, reps: 10 }));
  assert.equal(run(`${current}.id`), 'e2');
});

test('inline record is undoable, clears the draft and refuses an open sheet or another participant', () => {
  const { run } = app();
  run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'30',reps:'5'})");
  assert.equal(run("Store.logging.record('c5','e1',0,{kg:40,reps:10})"), false);
  run('Store.ui.closeSheet()');
  assert.equal(run("Store.logging.record('c5','e1',0,{kg:40,reps:10})"), true);
  assert.equal(run('Store.get().logging.drafts.c5.e1[0]'), null);
  assert.equal(run('Store.get().logging.feedback'), 'Подход 1 записан · Дана');
  assert.equal(run("Store.logging.undoQuick('c5','e1',0)"), true);
  assert.equal(run('Store.get().logging.values.c5.e1[0]'), null);
  assert.equal(run("Store.logging.record('c3','e1',0,{kg:40,reps:10})"), false);
  assert.equal(run("Store.logging.record('c5','e1',0,{kg:40,reps:0})"), false);
});

test('composer input is parsed strictly; bodyweight exercises ignore the weight', () => {
  const { json } = app();
  const ex = i => `Store.logging.exercises('c5')[${i}]`;
  assert.deepEqual(json(`Workout.parse(${ex(0)}, '42,5', '8')`), { kg: 42.5, reps: 8 });
  for (const [kg, reps] of [['', '8'], ['-1', '8'], ['40', '2.5'], ['40', '0'], ['4e1', '8']]) assert.equal(json(`Workout.parse(${ex(0)}, '${kg}', '${reps}')`), null, `${kg}/${reps}`);
  assert.deepEqual(json(`Workout.parse(${ex(1)}, '', '12')`), { kg: 0, reps: 12 });
});

test('explicit focus sticks until its sets are done, and rest starts only while work remains', () => {
  const { run, json } = app();
  run("Workout.setFocus('c5','e3')");
  assert.equal(run(`${current}.id`), 'e3');
  run(recordAfter('c5', 'e3', 0, { kg: 30, reps: 12 }));
  assert.equal(run(`${current}.id`), 'e3');
  const rest = json("Workout.restOf('c5')");
  assert.equal(rest.exId, 'e3');
  assert.equal(rest.total, 90);
  run("Workout.addRest('c5', 15)");
  assert.equal(json("Workout.restOf('c5')").total, 105);
  run(recordAfter('c5', 'e3', 1, { kg: 30, reps: 12 }) + ';' + recordAfter('c5', 'e3', 2, { kg: 30, reps: 12 }));
  assert.equal(run(`${current}.id`), 'e1');
  run("Workout.skipRest('c5')");
  assert.equal(run("Workout.restOf('c5')"), null);
});

test('journal markup: one composer for the focused set, a compact list, and a finish prompt when everything is written', () => {
  const { run } = app();
  const html = run('Trainer.session()');
  assert.equal((html.match(/data-composer=/g) || []).length, 1);
  assert.match(html, /data-composer="e1:0"/);
  assert.match(html, /Записать подход 1/);
  assert.match(html, /Сейчас · 1 из 4/);
  assert.match(html, /Дальше: Отжимания/);
  assert.equal((html.match(/class="wrow /g) || []).length, 4);
  assert.doesNotMatch(html, /data-act="setlog.quick"/);
  assert.match(html, /data-wfield="kg" value="50"/);
  assert.match(html, /data-wfield="reps" value="10"/);
  for (const e of JSON.parse(run("JSON.stringify(Store.logging.exercises('c5'))"))) {
    for (let si = 0; si < e.sets; si++) run(`Store.logging.record('c5','${e.id}',${si},{kg:${e.prev.kg},reps:${e.prev.reps}})`);
  }
  const done = run('Trainer.session()');
  assert.match(done, /Все упражнения выполнены/);
  assert.doesNotMatch(done, /data-composer=/);
  run('Store.logging.finish()');
  const results = run('Trainer.session()');
  assert.doesNotMatch(results, /data-composer=|class="wrow /);
  assert.match(results, /class="setrow is-done"/);
});

test('planks use seconds in the composer and a group shows the active participant only', () => {
  const { run } = app();
  run("Workout.setFocus('c5','e4')");
  const html = run('Trainer.session()');
  assert.match(html, /data-composer="e4:0"/);
  assert.match(html, /Секунды/);
  assert.doesNotMatch(html, /data-wfield="kg"/);
  run("Store.logging.open('s6')");
  const group = run('Trainer.session()');
  assert.match(group, /Записываем: <b>Алия/);
  assert.equal((group.match(/data-composer=/g) || []).length, 1);
});

test('the minimised workout bar shows progress, the current exercise and a running rest', () => {
  const { run } = app();
  run("Store.nav.role('trainer'); Store.logging.open('s1'); Store.logging.minimize()");
  const idle = run('UI.WorkoutDock()');
  assert.match(idle, /Дана Ержанова<\/strong><b class="num">0\/12<\/b>/);
  assert.match(idle, /workout-dock__ex">Приседания со штангой/);
  assert.match(idle, /aria-label="Вернуться к тренировке: Дана Ержанова, 09:00\. 0 из 12 подходов\. Сейчас: Приседания со штангой"/);
  run("Store.logging.resume('s1')");
  run(recordAfter('c5', 'e1', 0, { kg: 50, reps: 10 }));
  run('Store.logging.minimize()');
  const resting = run('UI.WorkoutDock()');
  assert.match(resting, /workout-dock is-resting/);
  assert.match(resting, /Отдых <span class="num" data-rest-left="c5">1:30<\/span>/);
  assert.match(resting, /дальше Приседания со штангой/);
});
