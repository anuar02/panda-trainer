// Unit adapter for the real action dispatcher. This is NOT a browser/DOM test.
// Bootstrap rendering is disabled; events and viewport callbacks use small fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
  const memory = new Map(), handlers = {}, styles = {}, classes = {}, frames = [];
  const view = { height: 340, offsetTop: 12, scale: 1, addEventListener(name, fn) { handlers['viewport:' + name] = fn; } };
  const document = { addEventListener(name, fn) { handlers[name] = fn; },
    documentElement: { style: { setProperty(k, v) { styles[k] = v; } }, classList: { toggle(k, v) { classes[k] = v; } } } };
  const context = vm.createContext({ console, URLSearchParams, setTimeout: () => 0, document,
    window: { visualViewport: view, innerHeight: 800, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    localStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) } });
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'mascot', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
  }
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const bootstrap = 'Store.subscribe(render);\n  render();';
  assert.ok(source.includes(bootstrap), 'Update unit adapter if bootstrap changes');
  vm.runInContext(source.replace(bootstrap, 'globalThis.TestActions = Actions; globalThis.TestScreens = RENDER;'), context);
  return { run: code => vm.runInContext(code, context), handlers, styles, classes, frames, view,
    action: (name, data = {}) => context.TestActions[name](data) };
}

test('actual set actions keep inputs as draft until explicit save', () => {
  const a = app();
  a.action('logging.open', { id: 's1' });
  a.action('sheet.open', { id: 'setlog', cid: 'c5', ex: 'e1', si: '0' });
  for (const [field, value] of [['kg', '8,5'], ['reps', '12']]) {
    a.handlers.input({ target: { matches: selector => selector === '[data-log-field]', dataset: { logField: field }, value } });
  }
  assert.equal(a.run("Store.logging.progress('c5').done"), 0);
  a.action('setlog.save');
  assert.equal(a.run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
});

test('actual reschedule actions submit the selected session with its duration', () => {
  const a = app(); a.action('role', { role: 'client' });
  a.action('cres.open', { sid: 's7' });
  for (const [field, value] of [['date', '2026-09-18'], ['start', '10:15']]) {
    a.handlers.input({ target: { matches: selector => selector === '[data-reschedule-field]', dataset: { rescheduleField: field }, value } });
  }
  a.action('cres.send');
  assert.equal(a.run("Store.reschedule.current('s7').to.end"), '11:00');
  assert.equal(a.run("DB.sessions.find(s=>s.id==='s7').start"), '21:15');
});

test('old counter entry point routes to the unified date/time form', () => {
  const a = app();
  a.action('sheet.open', { id: 'counter', rid: 'r1' });
  assert.equal(a.run('Store.get().sheet.id'), 'rescheduleForm');
  assert.equal(a.run('Store.get().sheet.data.sid'), 's8');
  assert.equal(a.run('Store.get().sheet.data.rid'), 'r1');
});

test('viewport callback adjusts visible height, but does not resize for pinch zoom', () => {
  const a = app(); a.frames.pop()();
  assert.equal(a.styles['--app-viewport-height'], '340px');
  assert.equal(a.styles['--app-viewport-top'], '12px');
  assert.equal(a.classes['is-compact-viewport'], true);
  a.view.scale = 2; a.view.height = 170;
  a.handlers['viewport:resize'](); a.frames.pop()();
  assert.equal(a.styles['--app-viewport-height'], '340px');
  a.view.scale = 1; a.view.height = 700;
  a.handlers['viewport:resize'](); a.frames.pop()();
  assert.equal(a.styles['--app-viewport-height'], '700px');
  assert.equal(a.classes['is-compact-viewport'], false);
});

test('all registered screens generate HTML in the four demo scenarios', () => {
  const a = app();
  for (const scenario of ['normal', 'empty', 'loading', 'offline']) {
    for (const id of a.run('Object.keys(TestScreens)')) {
      a.run(`Store.set({scenario:'${scenario}',role:'${id.startsWith('t-') ? 'trainer' : 'client'}',screen:'${id}'})`);
      const html = a.run(`TestScreens['${id}']()`);
      assert.equal(typeof html, 'string', `${scenario}/${id}`);
      assert.ok(html.length > 30, `${scenario}/${id}`);
    }
  }
});

test('client program and exercise details use the selected plan, including time units', () => {
  const a = app();
  a.action('role', { role: 'client' });
  // At the default demo time the upcoming appointment has no assigned program.
  assert.match(a.run('Client.program()'), /Программа появится здесь/);
  a.run("DB.sessions.find(s => s.id === 's7').program = 'Full Body'");
  assert.match(a.run('Client.program()'), /Отжимания/);
  a.action('sheet.open', { id: 'exercise', ex: 'e4', program: 'Full Body' });
  const html = a.run('Sheets.render(Store.get())');
  assert.match(html, /Планка/);
  assert.match(html, /40 сек/);
  assert.doesNotMatch(html, /Выпады|40 повт|Техника:/);
});

test('profile reads package values instead of fixed dashboard totals', () => {
  const a = app();
  a.run("DB.client('c1').plan.remaining = 3; DB.client('c1').plan.due = 12345");
  const text = a.run('Client.profile()').replace(/<[^>]*>/g, '');
  assert.match(text, /3из 12/);
  assert.match(text, /12\s?345/);
  assert.doesNotMatch(text, /31|Раздел в разработке/);
});

test('progress uses real date bounds and does not invent a trend for one record', () => {
  const a = app();
  const html = a.run("progressBlocks(DB.client('c1'), DB.history.c1.slice().reverse())");
  assert.match(html, /19 авг — 9 сен/);
  assert.doesNotMatch(html, /окт – сен/);
  const one = a.run("progressBlocks(DB.client('c1'), DB.history.c1.slice(0, 1))");
  assert.match(one, /Пока одна запись/);
  assert.doesNotMatch(one, /progress-chart__plot|progress-summary__change/);
  assert.equal(a.run("progressBlocks(DB.client('c1'), [])"), '');
});

test('secondary client empty states do not show fixture records as populated data', () => {
  const a = app();
  a.run("Store.set({ scenario: 'empty' })");
  assert.match(a.run('Client.program()'), /Программа появится здесь/);
  assert.match(a.run('Client.history()'), /Списаний пока нет/);
  assert.doesNotMatch(a.run('Client.progress()'), /progress-chart__plot/);
  assert.match(a.run('Client.profile()'), /Пакета пока нет/);
});

test('client notifications contain only this clients current requests', () => {
  const a = app();
  a.action('role', { role: 'client' });
  a.action('sheet.open', { id: 'notifications' });
  const html = a.run('Sheets.render(Store.get())');
  assert.match(html, /Ваш запрос на перенос/);
  assert.doesNotMatch(html, /Арман|Мади|Алия|18 000/);
});

test('opening a trainer client card routes through the real dispatcher', () => {
  const a = app();
  a.action('client.open', { id: 'c2' });
  assert.equal(a.run('Store.get().screen'), 't-client');
  assert.equal(a.run('Store.get().activeClient'), 'c2');
});

test('library opens the selected template without pretending to edit or duplicate it', () => {
  const a = app();
  a.action('template.open', { id: 't2' });
  assert.equal(a.run('Store.get().screen'), 't-template');
  const html = a.run('Trainer.template()');
  assert.match(html, /Верх Б|Жим гантелей под углом/);
  assert.doesNotMatch(html, /Приседания со штангой|Шаблон дублирован|data-act="toast"/);
});
