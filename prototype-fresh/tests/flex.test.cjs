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
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'mascot', 'workout', 'sheets', 'screens/trainer', 'screens/client', 'voice']) {
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
  assert.equal(b.run("Store.logging.library().some(e => e.name === 'Фермерская прогулка')"), true);
});

test('finished journal rejects structural changes', () => {
  const { run, cid } = personal();
  run(`Store.logging.setValue('${cid}', 'e1', 0, { kg: 40, reps: 10 }); Store.logging.finish(); Store.logging.confirmPartial()`);
  assert.equal(run('Store.get().logging.finished'), true);
  assert.equal(run(`Store.logging.addSet('${cid}', 'e1')`), false);
  assert.equal(run(`Store.logging.addExercise('${cid}', { name: 'Планка' })`), null);
});


test('custom exercise storage validates records and normalizes duplicate names', () => {
  const storage = memory();
  const a = app(storage);
  a.run("Store.logging.open('s7'); Store.logging.addExercise('c1', {name:'Мой жим', bodyweight:true, unit:'сек'}); Store.logging.addExercise('c1', {name:'мой-жим'}); Store.logging.addExercise('c1', {name:'жим  лежа'})");
  const b = app(storage);
  assert.equal(b.run('Store.get().customExercises.length'), 1);
  assert.equal(b.run('Store.get().customExercises[0].unit'), 'сек');
  b.run("Store.logging.removeCustom('Мой жим'); Store.logging.open('s7')");
  assert.equal(b.run('Store.get().customExercises.length'), 0);
  assert.equal(b.run("Store.logging.exercises('c1').some(e=>e.name==='Мой жим')"), true);
  storage.setItem('trainer-prototype:exercises:v1', JSON.stringify({version:1,items:[null, {name:123}, {name:'bad',group:'g',bodyweight:'yes'}, {name:'good',group:'g',bodyweight:false}]}));
  assert.equal(app(storage).run('Store.get().customExercises.length'),1);
  storage.setItem('trainer-prototype:exercises:v1', '{');
  assert.equal(app(storage).run('Store.get().customExercises.length'),0);
});

test('expanded library recognizes slang in voice input',()=>{
  const a = app();
  assert.equal(a.run('DB.exerciseLibrary.length'),80);
  a.run("Store.logging.open('s7')");
  for (const [phrase,name] of [['бицуха 12 на 12','Сгибания на бицепс с гантелями'],['присед 80 на 8','Приседания со штангой']]) {
    const items = JSON.parse(a.run(`JSON.stringify(VoiceParse.parse('${phrase}',{active:'c1',participants:[],exercises:()=>[],values:()=>[],library:Store.logging.library()}))`));
    assert.equal(items[0].name,name);
    assert.equal(items[1].type,'set');
  }
});

test('client programme updates are selective, isolated, persistent and idempotent',()=>{
  const a = personal();
  const {run,cid,sid,storage} = a;
  const template = run(`JSON.stringify(DB.programFor(Store.get().logging.plans['${cid}'].name))`);
  run(`Store.logging.replaceExercise('${cid}','e1',{name:'Жим гантелей лёжа'}); Store.logging.addExercise('${cid}',{name:'Фермерская прогулка'}); Store.logging.skipExercise('${cid}','e2'); Store.logging.finish(); Store.logging.confirmPartial()`);
  const opts = JSON.parse(run(`JSON.stringify(Store.programs.options('${cid}'))`));
  const replacement = opts.find(o=>o.kind==='replace');
  assert.equal(opts.find(o=>o.kind==='skip').checked,false);
  assert.equal(run(`Store.programs.save('${cid}',${JSON.stringify([replacement.key])})`),true);
  assert.equal(run(`JSON.stringify(DB.programFor(Store.get().logging.plans['${cid}'].name))`),template);
  const name = JSON.parse(run(`JSON.stringify(Store.get().logging.plans['${cid}'].name)`));
  const copy = `DB.programForClient('${cid}',${JSON.stringify(name)})`;
  assert.equal(run(`${copy}.some(e=>e.name==='Жим гантелей лёжа')`),true);
  assert.equal(run(`${copy}.some(e=>e.name==='Фермерская прогулка')`),false);
  const before = run(`JSON.stringify(${copy})`);
  run(`Store.programs.save('${cid}',${JSON.stringify([replacement.key])})`);
  assert.equal(run(`JSON.stringify(${copy})`),before);
  const b=app(storage);
  assert.equal(b.run(`JSON.stringify(${copy})`),before);
  assert.equal(b.run("DB.programForClient('c7',null).length"),0);
  assert.match(run('Trainer.session()'), /Обновить программу клиента/);
});

test('new programme exercises use recorded previous values; corrupt copies are ignored',()=>{
  const {run,cid,storage}=personal();
  const id=run(`Store.logging.addExercise('${cid}',{name:'Тестовое упражнение'})`);
  run(`Store.logging.setValue('${cid}','${id}',0,{kg:12,reps:9}); Store.logging.finish(); Store.logging.confirmPartial(); Store.programs.save('${cid}',['add:${id}'])`);
  const name = JSON.stringify(JSON.parse(run(`JSON.stringify(Store.get().logging.plans['${cid}'].name)`)));
  assert.equal(run(`DB.programForClient('${cid}',${name}).find(e=>e.id==='${id}').prev.kg`),12);
  storage.setItem('trainer-prototype:client-programs:v1',JSON.stringify({version:1,byClient:{[cid]:{baseName:'test',updatedAt:'bad',exercises:[{}]}}}));
  assert.equal(app(storage).run(`DB.programForClient('${cid}','test').length`),0);
});

test('a client copy applies only to the programme it was made from',()=>{
  const {run,cid,storage}=personal();
  const name = JSON.parse(run(`JSON.stringify(Store.get().logging.plans['${cid}'].name)`));
  const other = JSON.parse(run(`JSON.stringify(Object.keys(DB.programs).find(n=>n!==${JSON.stringify(name)}))`));
  run(`Store.logging.addExercise('${cid}',{name:'Фермерская прогулка'}); Store.logging.finish(); Store.logging.confirmPartial()`);
  const key = JSON.parse(run(`JSON.stringify(Store.programs.options('${cid}').find(o=>o.kind==='add').key)`));
  assert.equal(run(`Store.programs.save('${cid}',['${key}'])`),true);
  assert.equal(run(`DB.programForClient('${cid}',${JSON.stringify(name)}).some(e=>e.name==='Фермерская прогулка')`),true);
  assert.equal(run(`JSON.stringify(DB.programForClient('${cid}',${JSON.stringify(other)}))`),run(`JSON.stringify(DB.programFor(${JSON.stringify(other)}))`));
  assert.equal(run(`DB.programForClient('${cid}',null).length`),0);
  const legacy = JSON.parse(storage.getItem('trainer-prototype:client-programs:v1')).byClient[cid][name];
  storage.setItem('trainer-prototype:client-programs:v1',JSON.stringify({version:1,byClient:{[cid]:legacy}}));
  const b=app(storage);
  assert.equal(b.run(`DB.programForClient('${cid}',${JSON.stringify(name)}).some(e=>e.name==='Фермерская прогулка')`),true);
  assert.equal(b.run(`DB.programForClient('${cid}',null).length`),0);
});

test('client history includes only explicitly shared notes and programme changes',()=>{
  const {run,cid,storage}=personal();
  run(`Store.logging.addNote('${cid}','private'); Store.logging.addNote('${cid}','public'); Store.logging.shareNote('${cid}',1); Store.logging.addExercise('${cid}',{name:'Моё'}); Store.logging.finish(); Store.logging.confirmPartial()`);
  const b=app(storage);
  const result=JSON.parse(b.run(`JSON.stringify(Store.logging.clientHistory('${cid}'))`));
  assert.equal(result[0].notes.length,1);
  assert.equal(result[0].notes[0].text,'public');
  assert.match(result[0].changes,/добавлено 1/);
  b.run("Store.set({role:'client'})");
  assert.equal(b.run(`Store.logging.shareNote('${cid}',0)`),false);
});

test('client progress derives same-set best values and four-week gains from saved logs',()=>{
  const {run,cid,sid,storage}=personal();
  run(`Store.logging.setValue('${cid}','e1',0,{kg:50,reps:8}); Store.logging.setValue('${cid}','e1',1,{kg:40,reps:12}); Store.logging.finish(); Store.logging.confirmPartial()`);
  const prior=JSON.parse(storage.getItem('trainer-prototype:journal:v1:'+sid));
  prior.sessionId='old-test'; prior.context.date='2026-08-01'; prior.values[cid].e1=[{kg:40,reps:10}];
  storage.setItem('trainer-prototype:journal:v1:old-test',JSON.stringify(prior));
  run(`DB.sessions.push({...DB.sessions.find(s=>s.id==='${sid}'),id:'old-test',date:'2026-08-01'})`);
  const result=JSON.parse(run(`JSON.stringify(Store.logging.clientProgress('${cid}'))`));
  assert.equal(result[0].best.kg,50);
  assert.equal(result[0].best.reps,8);
  assert.equal(result[0].delta,10);
  assert.equal(run("Store.logging.clientProgress('c7').length"),0);
  run("Store.set({role:'client',scenario:'empty'})");
  assert.match(run('Client.progress()'),/Первые результаты/);
  assert.equal(run("UI.ProgramPreview('c7',null)"),'Тренер подберёт упражнения на месте');
});
