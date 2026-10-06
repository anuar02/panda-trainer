const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
  const data = new Map();
  const context = vm.createContext({ console, URLSearchParams, setTimeout: () => 0,
    localStorage: { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) } });
  for (const name of ['icons', 'data', 'template-repository', 'session-repository', 'store', 'ui', 'library', 'mascot', 'workout', 'sheets', 'screens/trainer', 'screens/client']) {
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
  const ongoing = live.filter(s => s.start <= '20:30' && s.end > '20:30');
  const ahead = live.filter(s => s.start > '20:30');
  const html = run('Trainer.today()');
  if (ongoing.length) assert.match(html, new RegExp(`class="today-focus is-now" data-session="${ongoing[0].id}"`));
  for (const s of ahead) assert.match(html, new RegExp(`class="today-row" data-session="${s.id}"`));
  run("DB.NOW_TIME = '23:59'");
  const late = run('Trainer.today()');
  assert.doesNotMatch(late, /class="today-focus/);
  assert.match(late, /Все занятия на сегодня позади/);
});

test('completed current and future journals move to past at 20:30', () => {
  const run = app();
  run("DB.NOW_TIME = '20:30'; for (const id of ['s6', 's7']) { Store.logging.open(id); Store.logging.finish(); Store.logging.confirmPartial(); }");
  assert.equal(run("Store.logging.status('s6')"), 'finished');
  assert.equal(run("Store.logging.status('s7')"), 'finished');
  const html = run('Trainer.today()');
  assert.doesNotMatch(html, /class="today-focus|<span>Дальше<\/span>|до 22:00|Дальше свободно/);
  assert.match(html, /Все занятия на сегодня позади/);
  assert.match(html, /Прошло 7 занятий/);
  const past = html.slice(html.indexOf('id="today-past-list"'));
  for (const id of ['s6', 's7']) assert.match(past, new RegExp(`data-session="${id}"`));
});

test('completing the current journal promotes the upcoming unfinished session', () => {
  const run = app();
  run("DB.NOW_TIME = '20:30'; Store.logging.open('s6'); Store.logging.finish(); Store.logging.confirmPartial();");
  const html = run('Trainer.today()');
  assert.match(html, /class="today-focus" data-session="s7"/);
  assert.match(html, /Следующее ·/);
  assert.doesNotMatch(html, /today-focus is-now|<span>Дальше<\/span>|Все занятия на сегодня позади/);
  assert.match(html, /Прошло 6 занятий/);
});

test('completed overlap journal leaves its unfinished neighbour in focus', () => {
  const run = app();
  run("DB.NOW_TIME = '18:40'; Store.logging.open('s4'); Store.logging.finish(); Store.logging.confirmPartial();");
  const html = run('Trainer.today()');
  assert.match(html, /class="today-focus is-now" data-session="s5"/);
  assert.match(html, /Прошло 4 занятия/);
  const beforePast = html.slice(0, html.indexOf('class="today-past'));
  assert.doesNotMatch(beforePast, /data-session="s4"/);
  assert.match(html.slice(html.indexOf('id="today-past-list"')), /data-session="s4"/);
});

test('timeline until follows the last displayed noncancelled row, excluding completed journals', () => {
  const run = app();
  run("DB.NOW_TIME = '18:40'; Store.logging.open('s7'); Store.logging.finish(); Store.logging.confirmPartial();");
  const html = run('Trainer.today()');
  assert.match(html, /<span>Дальше<\/span><span class="num">до 21:00<\/span>/);
  assert.doesNotMatch(html, /до 22:00/);
  const timeline = html.slice(html.indexOf('<section class="today-section">'), html.indexOf('class="today-past'));
  assert.match(timeline, /data-session="s6"/);
  assert.doesNotMatch(timeline, /data-session="s7"/);
});

test('timeline until ignores cancelled rows and a focus that ends later', () => {
  const run = app();
  run(`DB.NOW_TIME = '20:30';
    const sessions = DB.byDate(DB.TODAY).map(s => ({ ...s }));
    sessions.find(s => s.id === 's6').end = '23:00';
    sessions.find(s => s.id === 's7').status = 'cancelled';
    DB.byDate = () => sessions;
    DB.overlapGroups = () => [];
    Store.logging.open('s1');`);
  const html = run('Trainer.today()');
  assert.match(html, /class="today-focus is-now" data-session="s6"/);
  assert.match(html, /<span>Дальше<\/span><span class="num">до 10:00<\/span>/);
  assert.doesNotMatch(html, /до 23:00|до 22:00/);
});


test('completed overlap member does not leave a phantom conflict in the timeline', () => {
  const run = app();
  run("DB.NOW_TIME = '08:30'; Store.logging.open('s4'); Store.logging.finish(); Store.logging.confirmPartial();");
  const html = run('Trainer.today()');
  assert.match(html, /class="today-focus" data-session="s1"/);
  assert.match(html, /class="today-row" data-session="s5"/);
  assert.doesNotMatch(html, /class="today-conflict"|Пересечение ·/);
  assert.match(html.slice(html.indexOf('id="today-past-list"')), /data-session="s4"/);
});
