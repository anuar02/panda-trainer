const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app() {
  const memory = new Map();
  const context = vm.createContext({ console, URLSearchParams, setTimeout: () => 0,
    localStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) } });
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
  }
  return code => vm.runInContext(code, context);
}

test('pending proposal does not change the booked time', () => {
  const run = app();
  run("Store.nav.role('client'); Store.reschedule.propose({sessionId:'s7',to:{date:'2026-09-18',start:'10:00'}})");
  assert.equal(run("DB.sessions.find(s=>s.id==='s7').start"), '21:15');
  assert.equal(run("Store.reschedule.current('s7').to.end"), '10:45');
  assert.equal(run("Store.reschedule.current('s7').awaiting"), 'trainer');
});

test('client cannot accept own request or another client request', () => {
  const run = app(); run("Store.nav.role('client')");
  assert.equal(run("Store.reschedule.accept('r1')"), false);
  assert.equal(run("Store.reschedule.accept('r2')"), false);
  assert.equal(run("Store.reschedule.withdraw('r2')"), false);
  assert.equal(run("Store.get().requests.r1.state"), 'pending');
});

test('trainer accepts a client proposal exactly once', () => {
  const run = app();
  assert.equal(run("Store.reschedule.accept('r1')"), true);
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-18');
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').start"), '19:00');
  const history = run('Store.get().requests.r1.history.length');
  assert.equal(run("Store.reschedule.accept('r1')"), false);
  assert.equal(run('Store.get().requests.r1.history.length'), history);
});

test('counter-offer moves to counter time, not the original proposal', () => {
  const run = app();
  run("Store.reschedule.counter('r1',{date:'2026-09-19',start:'11:00'})");
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').start"), '18:00');
  assert.equal(run("Store.reschedule.accept('r1')"), false);
  run("Store.nav.role('client')");
  assert.equal(run("Store.reschedule.accept('r1')"), true);
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-19');
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').start"), '11:00');
});

test('client can counter a trainer proposal, preserving the session duration', () => {
  const run = app();
  const id = run("Store.reschedule.propose({sessionId:'s7',to:{date:'2026-09-18',start:'10:00'}})");
  run("Store.nav.role('client')");
  assert.equal(run(`Store.reschedule.counter('${id}',{date:'2026-09-19',start:'09:15'})`), true);
  run("Store.nav.role('trainer')");
  assert.equal(run(`Store.reschedule.accept('${id}')`), true);
  assert.equal(run("DB.sessions.find(s=>s.id==='s7').end"), '10:00');
});

test('only author withdraws; receiver can decline without moving the booking', () => {
  const run = app();
  assert.equal(run("Store.reschedule.withdraw('r1')"), false);
  assert.equal(run("Store.reschedule.decline('r1')"), true);
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-17');
  const second = app(); second("Store.nav.role('client')");
  assert.equal(second("Store.reschedule.withdraw('r1')"), true);
  assert.equal(second("Store.reschedule.withdraw('r1')"), false);
});

test('opening a stale notification does not mutate a live request', () => {
  const run = app(); run("Store.reschedule.openStale('r1')");
  assert.equal(run('Store.get().requests.r1.state'), 'pending');
  assert.equal(run("Store.reschedule.accept('r1')"), true);
});

test('cancellation closes pending requests and blocks acceptance', () => {
  const run = app(); run("Store.nav.role('client'); Store.sessions.cancel('s8'); Store.nav.role('trainer');");
  assert.equal(run('Store.get().requests.r1.state'), 'withdrawn');
  assert.equal(run("Store.reschedule.accept('r1')"), false);
  assert.equal(run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-17');
});

test('form uses selected session, not hardcoded s8', () => {
  const run = app(); run("Store.nav.role('client'); Store.reschedule.openForm('s7')");
  assert.equal(run('Store.get().sheet.data.sid'), 's7');
  const html = run('Sheets.render(Store.get())');
  assert.match(html, /21:15–22:00/); assert.match(html, /45 мин/);
  assert.match(html, /type="date"/); assert.match(html, /type="time"/);
  assert.doesNotMatch(html, /2026-09-17/);
});

test('invalid, past, unchanged and overnight targets cannot be submitted', () => {
  for (const to of [{date:'2026-02-30',start:'12:00'}, {date:'2026-09-13',start:'12:00'}, {date:'2026-09-14',start:'12:00'}, {date:'2026-09-14',start:'21:15'}, {date:'2026-09-18',start:'23:30'}, {date:'2026-09-18',start:'24:00'}]) {
    const run = app();
    assert.equal(run(`Store.reschedule.propose({sessionId:'s7',to:${JSON.stringify(to)}})`), false);
    assert.equal(run("Store.reschedule.current('s7')"), undefined);
  }
});

test('existing live request cannot be duplicated', () => {
  const run = app(); run("Store.nav.role('client')");
  assert.equal(run("Store.reschedule.propose({sessionId:'s8',to:{date:'2026-09-19',start:'10:00'}})"), false);
  assert.equal(run('Object.keys(Store.get().requests).length'), 2);
});

test('client hero stays chronological, later transfer is a separate card', () => {
  const run = app(); run("Store.nav.role('client')");
  const html = run('Client.home()');
  const text = html.replace(/<[^>]*>/g, '');
  assert.ok(text.indexOf('21:15–22:00') >= 0);
  assert.ok(text.indexOf('18:00–19:00') >= 0);
  assert.ok(text.indexOf('21:15–22:00') < text.indexOf('18:00–19:00'));
  assert.match(html, /Переносы других занятий/);
  assert.match(html, /data-act="cres.open" data-sid="s7"/);
  run("Store.sessions.cancel('s7'); Store.sessions.cancel('s8')");
  assert.match(run('Client.home()'), /Записей нет/);
  assert.doesNotMatch(run('Client.home()'), /data-act="cres.open"/);
});

test('client cancellation in a group affects only that participant', () => {
  const run = app();
  run("DB.sessions.find(s=>s.id==='s6').participants.push({clientId:'c1',reply:'confirmed'}); Store.nav.role('client'); Store.sessions.cancel('s6');");
  assert.equal(run("DB.sessions.find(s=>s.id==='s6').status"), 'confirmed');
  assert.equal(run("DB.sessions.find(s=>s.id==='s6').participants.find(p=>p.clientId==='c1').reply"), 'cancelled');
  assert.equal(run("DB.sessions.find(s=>s.id==='s6').participants.find(p=>p.clientId==='c3').reply"), 'confirmed');
  assert.equal(run('Object.keys(Store.get().recorded).length'), 0);
});

test('trainer counter count includes a new reply from the client', () => {
  const run = app();
  run("Store.reschedule.counter('r1',{date:'2026-09-19',start:'11:00'}); Store.nav.role('client'); Store.reschedule.counter('r1',{date:'2026-09-20',start:'10:00'}); Store.nav.role('trainer')");
  assert.equal(run("Store.reschedule.awaiting('trainer').length"), 2);
  assert.match(run('Trainer.today()'), /Входящие: 2 запроса/);
});
