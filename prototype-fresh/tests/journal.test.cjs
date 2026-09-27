// Domain + HTML-render regression tests. No browser or real localStorage is used.
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
const start = "Store.logging.open('s1');";
const write = "Store.logging.edit('c5','e1',0); Store.logging.input({kg:'8,5',reps:'12'}); Store.logging.saveSet();";

test('minimize and resume preserve the live journal, participant, draft and fact without attendance', () => {
  const { run } = app(); run("Store.logging.open('s6'); Store.logging.switchTo('c5'); Store.logging.edit('c5','e1',1); Store.logging.input({kg:'8,',reps:'10'}); Store.ui.closeSheet()");
  assert.equal(run('Store.logging.minimize()'), true);
  assert.equal(run('Store.get().screen'), 't-today');
  assert.match(run('UI.WorkoutDock()'), /Черновики: 1 участн/);
  run("Store.nav.tab('t-profile')");
  assert.equal(run('Store.logging.resume()'), true);
  assert.equal(run('Store.get().logging.active'), 'c5');
  assert.equal(run('Store.get().logging.drafts.c5.e1[1].kg'), '8,');
  assert.equal(run('Store.get().screen'), 't-session');
  assert.equal(run('UI.WorkoutDock()'), '');
  assert.equal(run('Object.keys(Store.get().attendance).length'), 0);
  run("Store.logging.switchTo('c4'); Store.logging.minimize()");
  assert.match(run('UI.WorkoutDock()'), /Участник не участвует/);
  assert.doesNotMatch(run('UI.WorkoutDock()'), /0 из 13/);
});

test('resume bookmark survives reload without starting another journal or showing in client mode', () => {
  const a = app(); a.run(start + write + 'Store.logging.minimize()');
  const original = a.storage.getItem('trainer-prototype:journal:v1:s1');
  const b = app(a.storage);
  assert.equal(b.run('Store.get().logging.sessionId'), null);
  assert.equal(b.run('Store.logging.resumable().done'), 1);
  assert.match(b.run('UI.WorkoutDock()'), /Вернуться к тренировке/);
  assert.equal(a.storage.getItem('trainer-prototype:journal:v1:s1'), original);
  b.run("Store.nav.role('client')");
  assert.equal(b.run('UI.WorkoutDock()'), '');
  assert.equal(b.run('Store.logging.resume()'), false);
  b.run("Store.nav.role('trainer'); Store.logging.resume()");
  assert.equal(b.run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
});

test('dock follows the latest unfinished workout; viewing completed results does not replace it', () => {
  const { run } = app(); run(start + 'Store.logging.finish(); Store.logging.confirmPartial();');
  assert.equal(run('Store.logging.resumable()'), null);
  run("Store.logging.open('s6'); Store.logging.minimize(); Store.logging.open('s1'); Store.nav.tab('t-today')");
  assert.equal(run('Store.logging.resumable().sessionId'), 's6');
  run('Store.logging.resume()');
  assert.equal(run('Store.get().logging.sessionId'), 's6');
  run("Store.logging.open('s8')");
  assert.equal(run('Store.logging.resumable().sessionId'), 's8');
  assert.equal(run("Store.logging.status('s6')"), 'draft');
  run("Store.sessions.cancel('s8')");
  assert.equal(run('Store.logging.resumable().sessionId'), 's6');
  assert.equal(run('Store.logging.resume()'), true);
});

test('memory-only journal can minimize and resume while keeping its error and local values', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const { run } = app(storage); run(start + write);
  assert.equal(run('Store.logging.minimize()'), true);
  assert.match(run('UI.WorkoutDock()'), /Ошибка сохранения/);
  assert.equal(run('Store.logging.resume()'), true);
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  assert.equal(run('Store.get().logging.storageError'), true);
});

test('missing, cancelled, unreadable and completed bookmarked journals never create a resume action', () => {
  for (const record of ['missing', '{broken', 'completed']) {
    const a = app();
    if (record === 'completed') a.run(start + 'Store.logging.finish(); Store.logging.confirmPartial()');
    else if (record === '{broken') a.storage.setItem('trainer-prototype:journal:v1:s1', record);
    a.storage.setItem('trainer-prototype:resume-journal:v1', 's1');
    const b = app(a.storage);
    assert.equal(b.run('Store.logging.resumable()'), null);
    assert.equal(b.run('UI.WorkoutDock()'), '');
  }
});

test('quick confirmation persists the displayed previous result without attendance or a draft', () => {
  const a = app(); a.run(start);
  assert.equal(a.run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), true);
  assert.equal(a.run("Store.logging.progress('c5').done"), 1);
  assert.equal(a.run("Store.logging.progress('c5').drafts"), 0);
  assert.equal(a.run('Store.get().sheet'), null);
  assert.equal(a.run('Object.keys(Store.get().attendance).length'), 0);
  assert.equal(a.run('Object.keys(Store.get().recorded).length'), 0);
  const b = app(a.storage); b.run(start);
  assert.equal(b.run('Store.get().logging.values.c5.e1[0].kg'), 50);
  assert.equal(b.run('Store.get().logging.quickUndo'), null);
});

test('quick confirmation rejects stale proposals, duplicate clicks, invalid indexes and existing drafts', () => {
  const { run } = app(); run(start);
  assert.equal(run("Store.logging.quickRepeat('c5','e1',0,{kg:80,reps:10})"), false);
  for (const index of [-1, 3, 0.5]) assert.equal(run(`Store.logging.quickRepeat('c5','e1',${index},{kg:50,reps:10})`), false);
  assert.equal(run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), true);
  assert.equal(run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), false);
  run("Store.logging.edit('c5','e1',1); Store.logging.input({kg:'8,',reps:'10'}); Store.ui.closeSheet()");
  assert.equal(run("Store.logging.quickRepeat('c5','e1',1,{kg:50,reps:10})"), false);
  assert.equal(run('Store.get().logging.drafts.c5.e1[1].kg'), '8,');
  run('Store.get().logging.plans.c5.exercises[0].prev.reps = 0');
  assert.equal(run("Store.logging.repeatSuggestion('c5','e1',2)"), null);
});

test('undo removes only the latest quick entry, survives reload as an empty set, and cannot erase an edit', () => {
  const a = app(); const run = a.run; run(start);
  run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10}); Store.logging.quickRepeat('c5','e1',1,{kg:50,reps:10})");
  assert.equal(run("Store.logging.undoQuick('c5','e1',0)"), false);
  assert.equal(run("Store.logging.undoQuick('c5','e1',1)"), true);
  assert.equal(run("Store.logging.undoQuick('c5','e1',1)"), false);
  const b = app(a.storage); b.run(start);
  assert.equal(b.run("Store.logging.progress('c5').done"), 1);
  assert.equal(b.run('Store.get().logging.values.c5.e1[1]'), null);
  run("Store.logging.quickRepeat('c5','e1',1,{kg:50,reps:10}); Store.logging.edit('c5','e1',1); Store.logging.input({kg:'52,5',reps:'8'}); Store.logging.saveSet()");
  assert.equal(run("Store.logging.undoQuick('c5','e1',1)"), false);
  assert.equal(run('Store.get().logging.values.c5.e1[1].kg'), 52.5);
});

test('quick entry respects participant, cancellation and completion boundaries, including unweighted sets', () => {
  const { run } = app(); run("Store.logging.open('s6')");
  assert.equal(run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), false);
  assert.equal(run("Store.logging.quickRepeat('c3','e1',0,{kg:80,reps:8})"), true);
  run("Store.logging.switchTo('c4')");
  assert.equal(run("Store.logging.repeatSuggestion('c4','e1',0)"), null);
  assert.equal(run("Store.logging.undoQuick('c3','e1',0)"), false);
  run(start);
  const exId = run("Store.logging.exercises('c5').find(e=>e.prev.kg===0).id");
  assert.equal(run(`Store.logging.quickRepeat('c5','${exId}',0,Store.logging.repeatSuggestion('c5','${exId}',0))`), true);
  assert.equal(run(`Store.get().logging.values.c5['${exId}'][0].kg`), 0);
  run('Store.logging.finish(); Store.logging.confirmPartial()');
  assert.equal(run(`Store.logging.undoQuick('c5','${exId}',0)`), false);
  assert.equal(run("Store.logging.repeatSuggestion('c5','e1',0)"), null);
});

test('quick entry and undo preserve another tab’s saved facts on a storage conflict', () => {
  const a = app(); a.run(start);
  const b = app(a.storage); b.run(start);
  a.run(write);
  const saved = a.storage.getItem('trainer-prototype:journal:v1:s1');
  assert.equal(b.run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), true);
  assert.equal(b.run('Store.get().logging.storageConflict'), true);
  assert.equal(b.run("Store.logging.repeatSuggestion('c5','e1',1)"), null);
  assert.equal(b.run("Store.logging.undoQuick('c5','e1',0)"), true);
  assert.equal(a.storage.getItem('trainer-prototype:journal:v1:s1'), saved);
  assert.match(b.run('Trainer.session()'), /ошибка сохранения/);
});

test('failed quick write is visibly memory-only, can be undone, and cannot be finalized', () => {
  const a = app(); a.run(start);
  a.storage.setItem = () => { throw Error('quota'); };
  assert.equal(a.run("Store.logging.quickRepeat('c5','e1',0,{kg:50,reps:10})"), true);
  assert.equal(a.run('Store.get().logging.storageError'), true);
  assert.match(a.run('Trainer.session()'), /Изменения только в этой вкладке/);
  assert.equal(a.run("Store.logging.repeatSuggestion('c5','e1',1)"), null);
  assert.equal(a.run("Store.logging.undoQuick('c5','e1',0)"), true);
  a.run('Store.logging.finish()');
  assert.equal(a.run('Store.get().logging.finished'), false);
});

test('new appointment persists, waits for client agreement, and confirmation survives reload', () => {
  const a = app();
  a.run("Store.newSession.patch({clientIds:['c1'],date:'2026-09-16',start:'09:00',duration:60,programLater:true})");
  const id = a.run('Store.newSession.save()');
  assert.equal(typeof id, 'string');
  const b = app(a.storage);
  assert.equal(b.run(`DB.sessions.find(s=>s.id==='${id}').status`), 'proposed');
  b.run("Store.nav.role('client')");
  assert.equal(b.run(`Store.sessions.confirm('${id}')`), true);
  assert.equal(app(a.storage).run(`DB.sessions.find(s=>s.id==='${id}').status`), 'confirmed');
  assert.equal(b.run(`Store.sessions.confirm('${id}')`), false);
});

test('creation validates date, selection and overlap; selection options are exclusive', () => {
  const { run } = app();
  assert.equal(run('Store.newSession.save()'), false);
  run("Store.newSession.patch({clientIds:['c1'],date:'2026-09-17',start:'18:00',programLater:true})");
  assert.equal(run('Store.newSession.save()'), false);
  run("Store.newSession.patch({collisionAck:true}); Store.newSession.patch({start:'18:30'})");
  assert.equal(run('Store.get().newSession.collisionAck'), false);
  run('Store.newSession.patch({program:DB.templates[0].program})');
  assert.equal(run('Store.get().newSession.programLater'), false);
  run('Store.newSession.patch({programLater:true})');
  assert.equal(run('Store.get().newSession.program'), null);
  run("Store.newSession.patch({date:'2026-09-16',start:'23:30',duration:90})");
  assert.equal(run('Store.newSession.save()'), false);
});

test('schedule cancellation and reschedule history persist without a premature time move', () => {
  const a = app();
  a.run("Store.reschedule.counter('r1',{date:'2026-09-19',start:'10:00'})");
  const b = app(a.storage);
  assert.equal(b.run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-17');
  assert.equal(b.run("Store.get().requests.r1.counter.start"), '10:00');
  b.run("Store.nav.role('client'); Store.reschedule.accept('r1')");
  const c = app(a.storage);
  assert.equal(c.run("DB.sessions.find(s=>s.id==='s8').date"), '2026-09-19');
  c.run("Store.sessions.cancel('s8')");
  assert.equal(app(a.storage).run("DB.sessions.find(s=>s.id==='s8').status"), 'cancelled');
});

test('failed or stale appointment writes never alter the in-memory booking', () => {
  const a = app(); const b = app(a.storage);
  a.run("Store.sessions.cancel('s8')");
  assert.equal(b.run("Store.sessions.cancel('s9')"), false);
  assert.equal(b.run("DB.sessions.find(s=>s.id==='s9').status"), 'confirmed');
  const storage = memory(); storage.setItem = () => { throw Error('quota'); };
  const c = app(storage);
  assert.equal(c.run("Store.sessions.cancel('s8')"), false);
  assert.equal(c.run("DB.sessions.find(s=>s.id==='s8').status"), 'confirmed');
});

test('corrupt local schedule is preserved and never overwritten', () => {
  const storage = memory(); storage.setItem('trainer-prototype:appointments:v1', '{broken');
  const { run } = app(storage);
  assert.equal(run("Store.sessions.cancel('s8')"), false);
  assert.equal(storage.getItem('trainer-prototype:appointments:v1'), '{broken');
});

test('group creation retains independent participants and explicitly absent programs', () => {
  const { run, storage } = app();
  run("Store.newSession.patch({clientIds:['c1','c5'],date:'2026-09-16',start:'09:00',programLater:true})");
  const id = run('Store.newSession.save()');
  assert.match(run('Trainer.schedule()'), /Ждём согласия/);
  const b = app(storage);
  b.run(`Store.logging.open('${id}')`);
  assert.equal(b.run("Store.get().logging.plans.c1.exercises.length"), 0);
  assert.equal(b.run("Store.get().logging.plans.c5.exercises.length"), 0);
  assert.doesNotThrow(() => b.run('Trainer.session()'));
  assert.equal(run('Store.newSession.save()'), false);
});

test('start opens dedicated screen, empty results, no automatic attendance or charge', () => {
  const { run } = app();
  run(start);
  assert.equal(run('Store.get().screen'), 't-session');
  assert.equal(run('Store.get().sheet'), null);
  assert.equal(run('Object.keys(Store.get().logging.values).length'), 0);
  assert.equal(run('Object.keys(Store.get().attendance).length'), 0);
  assert.equal(run('Object.keys(Store.get().recorded).length'), 0);
  assert.match(run('Trainer.session()'), /Дана/);
});

test('opening sheet and copying previous values do not confirm a fact', () => {
  const { run } = app(); run(start);
  run("Store.logging.edit('c5','e1',0)");
  assert.equal(run('Store.get().logging.editor.kg'), '');
  run("Store.logging.input({kg:'50',reps:'10'})");
  assert.equal(run("Store.logging.progress('c5').done"), 0);
  assert.equal(run("Store.logging.progress('c5').drafts"), 1);
  assert.match(run('Sheets.render(Store.get())'), /подтвердите|Подтвердите/);
});

test('explicit save accepts comma decimals and clears only that draft', () => {
  const { run } = app(); run(start + write);
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  assert.equal(run("Store.logging.progress('c5').done"), 1);
  assert.equal(run("Store.logging.progress('c5').drafts"), 0);
  assert.equal(run('Store.get().sheet'), null);
});

test('save feedback stays inline, clears on participant switch and is not persisted', () => {
  const a = app(); a.run(start + write);
  assert.equal(a.run('Store.get().toast'), null);
  assert.equal(a.run('Store.get().logging.feedback'), 'Подход 1 записан · Дана');
  assert.match(a.run('Trainer.session()'), /log-action-status.*role="status"/);
  const b = app(a.storage); b.run(start);
  assert.equal(b.run('Store.get().logging.feedback'), null);
  a.run("Store.logging.open('s6'); Store.logging.edit('c3','e1',0); Store.logging.input({kg:'80',reps:'8'}); Store.logging.saveSet(); Store.logging.switchTo('c5');");
  assert.equal(a.run('Store.get().logging.feedback'), null);
});

test('draft action names match the visible label, including uncounted completed drafts', () => {
  const { run } = app(); run(start);
  run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'20',reps:'8'}); Store.ui.closeSheet();");
  assert.match(run('Trainer.session()'), /aria-label="Продолжить подход 1: Приседания со штангой"/);
  run('Store.logging.finish(); Store.logging.confirmPartial();');
  assert.match(run('Trainer.session()'), /Черновик не учтён/);
  assert.equal(run('Store.get().toast'), null);
});

test('invalid input never creates a fact', () => {
  for (const [kg, reps] of [['', ''], ['-1', '5'], ['Infinity', '5'], ['1e3', '5'], ['20', '0'], ['20', '2.5'], ['20', '9007199254740992']]) {
    const { run } = app(); run(start + "Store.logging.edit('c5','e1',0)");
    run(`Store.logging.input(${JSON.stringify({ kg, reps })})`);
    assert.equal(run('Store.logging.saveSet()'), false, `${kg}/${reps}`);
    assert.equal(run("Store.logging.progress('c5').done"), 0);
  }
});

test('bodyweight and duration need positive reps/seconds but not a weight', () => {
  const { run } = app(); run(start);
  run("Store.logging.edit('c5','e4',0); Store.logging.input({reps:'40'});");
  assert.equal(run('Store.logging.saveSet()'), true);
  assert.equal(run('Store.get().logging.values.c5.e4[0].kg'), 0);
  assert.match(run('Trainer.session()'), /40 сек/);
});

test('draft and confirmed values survive a fresh store (reload)', () => {
  const first = app(); first.run(start + write);
  first.run("Store.logging.edit('c5','e1',1); Store.logging.input({kg:'9,5',reps:'11'}); Store.ui.closeSheet();");
  const second = app(first.storage); second.run(start);
  assert.equal(second.run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  second.run("Store.logging.edit('c5','e1',1)");
  assert.equal(second.run('Store.get().logging.editor.kg'), '9,5');
  assert.equal(second.run("Store.logging.progress('c5').done"), 1);
});

test('sessions and participants remain isolated across switches and reopens', () => {
  const { run } = app(); run(start + write);
  run("Store.logging.open('s6'); Store.logging.setValue('c3','e1',0,{kg:30,reps:10}); Store.logging.switchTo('c5');");
  assert.equal(run("Store.logging.progress('c5').done"), 0);
  run("Store.logging.open('s1')");
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  run("Store.logging.open('s6')");
  assert.equal(run('Store.get().logging.values.c3.e1[0].kg'), 30);
});

test('group completion checks everyone eligible, not just active participant', () => {
  const { run } = app();
  run("Store.logging.open('s6'); for(const e of Store.logging.exercises('c3')) for(let i=0;i<e.sets;i++) Store.logging.setValue('c3',e.id,i,{kg:20,reps:10}); Store.logging.finish();");
  assert.equal(run('Store.get().sheet.id'), 'finishConfirm');
  const html = run('Sheets.render(Store.get())');
  assert.match(html, /Алия/); assert.match(html, /Дана/); assert.match(html, /Мади/);
  assert.match(html, /Не участвует/);
  assert.equal(run('Store.get().logging.finished'), false);
});

test('cancelled participant cannot create facts and does not block a complete group', () => {
  const { run } = app(); run("Store.logging.open('s6')");
  assert.equal(run("Store.logging.setValue('c4','e1',0,{kg:20,reps:10})"), false);
  run("for(const cid of ['c3','c5']) for(const e of Store.logging.exercises(cid)) for(let i=0;i<e.sets;i++) Store.logging.setValue(cid,e.id,i,{kg:20,reps:10}); Store.logging.finish();");
  assert.equal(run('Store.get().logging.finished'), true);
});

test('partial completion retains facts, keeps gaps empty, reloads read-only', () => {
  const first = app(); first.run(start + write + 'Store.logging.finish(); Store.logging.confirmPartial();');
  assert.equal(first.run('Store.get().logging.finished'), true);
  const second = app(first.storage); second.run(start);
  assert.equal(second.run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  assert.equal(second.run('Store.get().logging.values.c5.e1[1]'), undefined);
  assert.equal(second.run("Store.logging.label('s1')"), 'Посмотреть результаты');
  assert.equal(second.run("Store.logging.setValue('c5','e1',0,{kg:90,reps:1})"), false);
  second.run('Store.logging.continueInput(); Store.logging.finish();');
  assert.equal(second.run('Store.get().logging.finished'), true);
  assert.doesNotMatch(second.run('Trainer.session()'), /data-id="setlog"/);
});

test('editing a fact produces a separate draft until reconfirmed', () => {
  const { run } = app(); run(start + write);
  run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'25'}); Store.ui.closeSheet();");
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  assert.equal(run("Store.logging.progress('c5').drafts"), 1);
  assert.match(run('Trainer.session()'), /setrow__draft num">25 кг × 12/);
  assert.match(run('Trainer.session()'), /записано 8,5 кг × 12/);
  assert.doesNotMatch(run('Trainer.session()'), /class="setrow__done"/);
});

test('program is a session snapshot, personal null program does not fall back to client', () => {
  const { run } = app(); run(start);
  run("DB.programs['Full Body'][0].sets = 99; DB.client('c5').program='Низ А';");
  assert.equal(run("Store.logging.exercises('c5')[0].sets"), 3);
  run("Store.logging.open('s7')");
  assert.equal(run("Store.logging.exercises('c1').length"), 0);
  assert.match(run('Trainer.session()'), /Программы нет/);
});

test('unavailable storage allows memory-only input but blocks completion', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const { run } = app(storage); run(start + write);
  assert.equal(run('Store.get().logging.storageError'), true);
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  run('Store.logging.finish()');
  assert.equal(run('Store.get().logging.finished'), false);
  assert.match(run('Trainer.session()'), /Только в памяти/);
});

test('write failure during finalization preserves draft and retry succeeds', () => {
  const storage = memory(), realWrite = storage.setItem;
  const { run } = app(storage); run(start + write + 'Store.logging.finish()');
  storage.setItem = () => { throw Error('quota'); };
  run('Store.logging.confirmPartial()');
  assert.equal(run('Store.get().logging.finished'), false);
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
  storage.setItem = realWrite;
  run('Store.logging.confirmPartial()');
  assert.equal(run('Store.get().logging.finished'), true);
});

test('corrupt persisted record is not overwritten', () => {
  const storage = memory(), key = 'trainer-prototype:journal:v1:s1';
  storage.setItem(key, '{broken');
  const { run } = app(storage); run(start);
  assert.equal(storage.getItem(key), '{broken');
  assert.equal(run('Store.get().logging.sessionId'), null);
  assert.match(run('Store.get().toast.text'), /не перезаписаны/);
});

test('direct journal navigation and all session sheets render without exceptions', () => {
  const { run } = app();
  assert.match(run('Trainer.session()'), /Выберите занятие/);
  const ids = run('DB.sessions.map(s=>s.id)');
  for (const id of ids) {
    run(`Store.logging.open('${id}')`);
    assert.doesNotMatch(run('Trainer.session()'), /undefined|NaN/);
    run('Store.logging.finish()');
    if (run('Boolean(Store.get().sheet)')) assert.doesNotMatch(run('Sheets.render(Store.get())'), /undefined|NaN/);
  }
});

test('a stale tab never overwrites a newer journal; local export preserves its draft', () => {
  const first = app(); first.run(start);
  const second = app(first.storage); second.run(start);
  first.run(write);
  const latest = first.storage.getItem('trainer-prototype:journal:v1:s1');
  second.run("Store.logging.edit('c5','e1',1); Store.logging.input({kg:'25',reps:'6'});");
  assert.equal(second.run('Store.get().logging.storageConflict'), true);
  assert.equal(first.storage.getItem('trainer-prototype:journal:v1:s1'), latest);
  assert.equal(second.run('Store.logging.exportData().drafts.c5.e1[1].kg'), '25');
  const sheet = second.run('Sheets.render(Store.get())');
  assert.match(sheet, /role="alert"[^>]*>Журнал изменён в другой вкладке/);
  assert.match(sheet, /data-act="log.export"/);
  assert.match(sheet, /Записать только в этой вкладке/);
  second.run('Store.logging.finish()');
  assert.equal(second.run('Store.get().logging.finished'), false);
});

test('completion appears in schedule without being mistaken for attendance', () => {
  const { run } = app(); run(start + write + 'Store.logging.finish(); Store.logging.confirmPartial();');
  assert.match(run('Trainer.schedule()'), /Журнал завершён/);
  assert.match(run('Trainer.today()'), /Журнал завершён/);
  assert.equal(run('Object.keys(Store.get().attendance).length'), 0);
});

test('editor has persistent context, separate scrolling fields, footer, and keyboard hints', () => {
  const { run } = app(); run(start + "Store.logging.edit('c5','e1',0)");
  const html = run('Sheets.render(Store.get())');
  for (const marker of ['log-editor-head', 'log-editor-fields', 'log-editor-footer', 'enterkeyhint="next"', 'enterkeyhint="done"', 'Дана']) assert.ok(html.includes(marker), marker);
});

test('opening then dismissing attendance confirmation does not mark or charge', () => {
  const { run } = app();
  run("Store.attendance.mark('s1','c5','present'); Store.ui.closeSheet()");
  assert.equal(run("Store.get().attendance['s1:c5']"), undefined);
  assert.equal(run('Object.keys(Store.get().recorded).length'), 0);
});

test('attendance-only records presence and displays no charge', () => {
  const { run } = app(); run("Store.attendance.markOnly('s1','c5'); Store.ui.openSheet('session',{sid:'s1'})");
  assert.equal(run("Store.get().attendance['s1:c5']"), 'present');
  assert.equal(run('Object.keys(Store.get().recorded).length'), 0);
  assert.match(run('Sheets.render(Store.get())'), /Без списания/);
  assert.doesNotMatch(run('Sheets.render(Store.get())'), /Посещение · списано/);
});

test('attendance plus charge is explicit and idempotent', () => {
  const { run } = app();
  const count = run('Store.get().billing.unitTx.length');
  run("Store.attendance.charge('s1','c5',{}); Store.attendance.charge('s1','c5',{})");
  assert.equal(run('Store.get().billing.unitTx.length'), count + 1);
  assert.equal(run("Store.get().attendance['s1:c5']"), 'present');
});

test('client cannot mark attendance or charge, cancelled group participant is protected', () => {
  const { run } = app();
  assert.equal(run("Store.attendance.markOnly('s6','c4')"), false);
  run("Store.nav.role('client')");
  assert.equal(run("Store.attendance.markOnly('s4','c1')"), false);
  assert.equal(run("Store.attendance.charge('s4','c1',{})"), false);
});

test('cancellation after opening journal blocks further input without deleting facts', () => {
  const { run } = app(); run(start + write + "Store.sessions.cancel('s1')");
  assert.equal(run("Store.logging.setValue('c5','e1',1,{kg:20,reps:10})"), false);
  assert.equal(run('Store.get().logging.values.c5.e1[0].kg'), 8.5);
});

test('client visit calendar is based on recorded attendance, not bookings', () => {
  const { run } = app();
  assert.equal((run('Client.progress()').match(/heat__cell is-on/g) || []).length, 0);
  run("Store.attendance.markOnly('s4','c1')");
  assert.equal((run('Client.progress()').match(/heat__cell is-on/g) || []).length, 1);
  run("Store.attendance.mark('s4','c1','noshow')");
  assert.equal((run('Client.progress()').match(/heat__cell is-on/g) || []).length, 0);
});

test('a completed journal alone is not a client attendance record', () => {
  const { run } = app();
  run("Store.logging.open('s4'); Store.logging.finish(); Store.logging.confirmPartial()");
  assert.match(run('Client.history()'), /Журнал завершён/);
  assert.equal((run('Client.progress()').match(/heat__cell is-on/g) || []).length, 0);
});

test('history includes group attendance and labels cancelled bookings honestly', () => {
  const { run } = app();
  run("DB.sessions.push({id:'old-cancel',clientId:'c1',date:'2026-09-13',start:'10:00',end:'11:00',status:'cancelled'}); DB.sessions.find(s=>s.id==='s6').participants.push({clientId:'c1',reply:'confirmed'}); Store.attendance.markOnly('s6','c1');");
  const html = run('Client.history()');
  assert.match(html, /Отменено/);
  assert.match(html, /Мини-группа/);
  assert.match(html, /Посещение/);
});

test('charge uses this client package and updates its available units once', () => {
  const { run } = app();
  const before = run("DB.client('c5').plan.remaining");
  run("Store.attendance.charge('s1','c5',{}); Store.attendance.charge('s1','c5',{})");
  assert.equal(run('Store.get().billing.unitTx[0].source'), 'p4');
  assert.equal(run('Store.get().billing.unitTx[0].sessionId'), 's1');
  assert.equal(run("DB.client('c5').plan.remaining"), before - 1);
});

test('missing available package does not charge a different client package', () => {
  const { run } = app();
  assert.equal(run("Store.attendance.charge('s6','c3',{})"), false);
  assert.equal(run('Object.keys(Store.get().recorded).length'), 0);
  assert.equal(run("Store.attendance.markOnly('s6','c3')"), true);
});

test('completed journal retains session time even when demo schedule resets on reload', () => {
  const first = app();
  first.run("Store.reschedule.accept('r1'); Store.logging.open('s8'); Store.logging.finish(); Store.logging.confirmPartial()");
  const second = app(first.storage); second.run("Store.logging.open('s8')");
  assert.equal(second.run('Store.get().logging.context.date'), '2026-09-18');
  assert.equal(second.run('Store.get().logging.context.start'), '19:00');
  assert.match(second.run('Trainer.session()'), /19:00–20:00/);
});


test('draft rows show raw partial values and escape markup without pretending to be confirmed', () => {
  const { run } = app(); run(start);
  run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'8,',reps:''}); Store.ui.closeSheet()");
  assert.match(run('Trainer.session()'), /setrow__draft num">8, кг × —/);
  assert.doesNotMatch(run('Trainer.session()'), /class="setrow__today/);
  run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'<img>',reps:'2'}); Store.ui.closeSheet()");
  assert.match(run('Trainer.session()'), /&lt;img&gt; кг × 2/);
});

test('completed latest workout falls back to today only, without losing earlier drafts across reload', () => {
  const a = app(); a.run(start + "Store.logging.edit('c5','e1',0); Store.logging.input({kg:'2,5'}); Store.ui.closeSheet(); Store.logging.open('s6'); Store.logging.finish(); Store.logging.confirmPartial();");
  assert.equal(a.run('Store.logging.resumable().sessionId'), 's1');
  const b = app(a.storage);
  assert.equal(b.run('Store.logging.resumable().sessionId'), 's1');
  b.run("Store.logging.open('s8'); Store.logging.open('s1'); Store.logging.finish(); Store.logging.confirmPartial()");
  assert.equal(b.run('Store.logging.resumable()'), null); // Tomorrow is not a fallback.
  assert.equal(b.run("Store.logging.status('s8')"), 'draft');
});

test('stale resume opens completed results before editing and retains local recovery without writes', () => {
  const a = app(); a.run(start);
  const b = app(a.storage); b.run(start);
  a.run(write + 'Store.logging.finish(); Store.logging.confirmPartial()');
  const finished = a.storage.getItem('trainer-prototype:journal:v1:s1');
  b.run("Store.logging.edit('c5','e1',0); Store.logging.input({kg:'25',reps:'6'}); Store.ui.closeSheet(); Store.logging.minimize(); Store.logging.resume('s1')");
  assert.equal(b.run('Store.get().logging.finished'), true);
  assert.match(b.run('Trainer.session()'), /завершён в другой вкладке/);
  assert.doesNotMatch(b.run('Trainer.session()'), /data-id="setlog"|data-act="setlog.quick"/);
  assert.equal(b.run('Store.logging.exportData().localRecovery.drafts.c5.e1[0].kg'), '25');
  assert.equal(b.run('Store.logging.exportData().values.c5.e1[0].kg'), 8.5);
  b.run("Store.logging.switchTo('c5'); Store.logging.open('s1')");
  assert.equal(a.storage.getItem('trainer-prototype:journal:v1:s1'), finished);
});

test('group dock counts drafts across participants and marks each participant', () => {
  const { run } = app();
  run("Store.logging.open('s6'); Store.logging.edit('c3','e1',0); Store.logging.input({kg:'77,5'}); Store.ui.closeSheet(); Store.logging.switchTo('c5'); Store.logging.edit('c5','e1',0); Store.logging.input({kg:'8,'}); Store.ui.closeSheet();");
  assert.equal((run('Trainer.session()').match(/pcard__prog">Есть черновик/g) || []).length, 2);
  run('Store.logging.minimize()');
  assert.match(run('UI.WorkoutDock()'), /Черновики: 2 участн/);
  assert.match(run('UI.WorkoutDock()'), /20:00/);
});
