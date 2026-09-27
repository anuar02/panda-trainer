const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
  const data = new Map();
  const context = vm.createContext({ console, URLSearchParams, setTimeout: () => 0,
    localStorage: { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) } });
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'mascot', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
  }
  return code => vm.runInContext(code, context);
}

test('localized weight display preserves stored numbers and unfinished decimal input', () => {
  const run = app();
  assert.equal(run('DB.fmtNumber(22.125)'), '22,125');
  assert.equal(run('DB.fmtNumber(0)'), '0');
  for (const value of ['null', 'undefined', 'NaN', 'Infinity']) assert.equal(run(`DB.fmtNumber(${value})`), '—');
  run("Store.logging.open('s1'); Store.logging.edit('c5','e1',0); Store.logging.input({kg:'8,',reps:'12'})");
  assert.equal(run('Store.get().logging.editor.kg'), '8,');
  run("Store.logging.input({kg:'8.5',reps:'12'}); Store.logging.saveSet()");
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  assert.match(run('Trainer.session()'), /8,5 кг/);
  assert.equal(run('DB.fmtNumber(82.5)'), '82,5');
});

test('progress positions measurements by elapsed days, with zero baseline and an exact table', () => {
  const run = app();
  const html = run(`progressBlocks({}, [
    {exercise:'Тяга',date:'2026-09-01',top:0,sets:3},
    {exercise:'Тяга',date:'2026-09-02',top:12.5,sets:3},
    {exercise:'Тяга',date:'2026-09-11',top:25,sets:3}
  ])`);
  const points = [...html.matchAll(/<circle[^>]+cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.equal(points.length, 3);
  assert.ok(Math.abs((points[1][0] - points[0][0]) / (points[2][0] - points[0][0]) - 0.1) < 1e-9);
  assert.ok(points[0][1] > points[1][1] && points[1][1] > points[2][1]);
  assert.match(html, /<td class="num">12,5<\/td>/);
  assert.match(html, /Шкала от нуля/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  const fractional = run(`progressBlocks({}, [
    {exercise:'Тяга',date:'2026-09-01',top:0.1,sets:3},
    {exercise:'Тяга',date:'2026-09-02',top:0.3,sets:3}
  ])`);
  assert.match(fractional, /\+0,2 кг/);
});

test('same-day zero measurements and a single record do not invent a trend', () => {
  const run = app();
  const row = "{exercise:'Тяга',date:'2026-09-01',top:0,sets:3}";
  const sameDay = run(`progressBlocks({}, [${row},${row}])`);
  assert.doesNotMatch(sameDay, /NaN|Infinity/);
  const xs = [...sameDay.matchAll(/<circle[^>]+cx="([\d.]+)"/g)].map(m => m[1]);
  assert.equal(xs[0], xs[1]);
  const single = run(`progressBlocks({}, [${row}])`);
  assert.match(single, /Пока одна запись/);
  assert.doesNotMatch(single, /<svg class="progress-chart__plot"/);
  assert.equal(run('progressBlocks({}, [])'), '');
});

test('today distinguishes ongoing, upcoming and elapsed slots at the same demo time', () => {
  const run = app();
  run("DB.NOW_TIME = '20:30'");
  const live = JSON.parse(run('JSON.stringify(DB.byDate(DB.TODAY).filter(s => s.status !== "cancelled"))'));
  const ahead = live.filter(s => s.start > '20:30').length;
  const ongoing = live.filter(s => s.start <= '20:30' && s.end > '20:30').length;
  assert.match(run('Trainer.today()'), new RegExp(`${ahead}</b> впереди`));
  if (ongoing) assert.match(run('Trainer.today()'), new RegExp(`${ongoing}</b> сейчас`));
  run("DB.NOW_TIME = '23:59'");
  assert.match(run('Trainer.today()'), /0<\/b> впереди/);
  assert.match(run('Trainer.today()'), /Все занятия позади/);
});
