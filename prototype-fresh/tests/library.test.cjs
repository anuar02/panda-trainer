const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function app(memory = new Map(), fail = false) {
  const storage = { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw new Error('QuotaExceededError'); memory.set(k,v); }, removeItem: k => memory.delete(k) };
  const ctx = vm.createContext({ console, URLSearchParams, setTimeout: () => 0, localStorage: storage });
  for (const file of ['icons','data','template-repository','session-repository','store','ui','library','mascot','sheets','screens/trainer']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);
  }
  return { memory, run: code => vm.runInContext(code,ctx), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx)) };
}
const plan = { name:'Силовая А', description:'Техника и контроль', exercises:[
  {name:'Приседания со штангой',sets:'4',reps:'8–10',unit:'повт',target:'32,5',rest:'120'},
  {name:'Планка',sets:'3',reps:'45',unit:'сек',target:'',rest:'60'},
] };

test('saved template reloads with ranges, decimal weight, time and rest; it can be assigned',()=>{
  const a=app(), result=a.json(`TemplateRepository.save(${JSON.stringify(plan)})`);
  assert.ok(result.id);
  const b=app(a.memory), items=b.json("DB.programFor('Силовая А')");
  assert.equal(items[0].sets,4); assert.equal(items[0].target,32.5); assert.equal(items[0].reps,'8–10'); assert.equal(items[0].rest,120);
  assert.equal(items[1].reps,'45 сек'); assert.equal(items[1].unit,'сек');
  assert.equal(b.run("Store.sessions.assignProgram('s7','Силовая А')"),true);
  b.run("Store.logging.open('s7')");
  assert.equal(b.run("Store.logging.exercises('c1')[0].sets"),4);
});

test('editing does not mutate an open journal; renaming preserves the previously assigned programme',()=>{
  const a=app();a.run("Store.logging.open('s7')");
  const before=a.run("JSON.stringify(Store.logging.exercises('c1'))");
  const oldProgram=a.run("DB.templates[0].program"), oldExercises=a.json(`DB.programFor(${JSON.stringify(oldProgram)})`);
  const id=a.run('DB.templates[0].id');
  const result=a.json(`TemplateRepository.save(${JSON.stringify({...plan,id,name:'Новый низ'})})`);
  assert.ok(result.id);assert.equal(a.run("JSON.stringify(Store.logging.exercises('c1'))"),before);
  assert.equal(a.run(`DB.programFor(${JSON.stringify(oldProgram)})[0].name`),oldExercises[0].name);
  const b=app(a.memory);assert.equal(b.run(`DB.programFor(${JSON.stringify(oldProgram)})[0].name`),oldExercises[0].name);
  assert.equal(b.run(`DB.templates.find(t=>t.id===${JSON.stringify(id)}).name`),'Новый низ');
});

test('validation rejects empty, duplicate and invalid loads without publishing a template',()=>{
  const a=app();
  for (const draft of [{...plan,name:''},{...plan,name:'Низ А'},{...plan,exercises:[]},...['0','21','1.5'].map(sets=>({...plan,exercises:[{...plan.exercises[0],sets}]})),{...plan,exercises:[{...plan.exercises[0],reps:'12–8'}]},{...plan,exercises:[{...plan.exercises[0],rest:'-1'}]}]) {
    assert.ok(a.json(`TemplateRepository.save(${JSON.stringify(draft)})`).error);
  }
  assert.equal(a.run('DB.templates.length'),4);
});

test('quota failure preserves the unsaved draft and never reports a successful save',()=>{
  const a=app(new Map(),true);
  assert.ok(a.json(`TemplateRepository.save(${JSON.stringify(plan)})`).error);
  assert.equal(a.run('DB.templates.length'),4);assert.equal(a.run("DB.programFor('Силовая А').length"),0);
});

test('draft and favorites survive reload; corrupted template storage keeps the base library',()=>{
  const a=app();a.run(`TemplateRepository.writeDraft(${JSON.stringify(plan)})`);a.run("TemplateRepository.toggleFavorite('Жим лёжа')");
  const b=app(a.memory);assert.equal(b.run('TemplateRepository.readDraft().name'),plan.name);assert.equal(b.run("TemplateRepository.isFavorite('Жим лёжа')"),true);
  a.memory.set('trainer-prototype:templates:v1','{broken');assert.equal(app(a.memory).run('DB.templates.length'),4);
});

test('library combines query, group, equipment, demo and favorite filters',()=>{
  const a=app();a.run("TemplateRepository.toggleFavorite('Жим лёжа'); Store.set({libraryView:{query:'bench',group:'Грудь',equipment:'штанга',favorites:true,demos:true}})");
  assert.deepEqual(a.json('Library.filtered().map(e=>e.name)'),['Жим лёжа']);
  a.run("Store.set({libraryView:{query:'неттакого'}})");assert.equal(a.run('Library.filtered().length'),0);assert.match(a.run('Library.screen()'),/Ничего не нашлось/);
});

test('composer adds, reorders and removes exercises, saves a copy without changing the original',()=>{
  const a=app(), original=a.run("JSON.stringify(DB.programFor('Низ А'))");
  const length=a.run("DB.programFor('Низ А').length");
  const name=a.run("DB.exerciseLibrary.find(e=>!DB.programFor('Низ А').some(x=>x.name===e.name)).name");
  a.run(`Library.actions['builder.copy']({id:'t1'}); Library.actions['builder.select']({name:${JSON.stringify(name)}}); Library.actions['builder.move']({index:'${length}',delta:'-1'}); Library.actions['builder.remove']({index:'0'}); Library.actions['builder.save']()`);
  assert.equal(a.run('DB.templates.length'),5);assert.equal(a.run("JSON.stringify(DB.programFor('Низ А'))"),original);
  assert.equal(a.run("DB.programFor('Низ А — копия').length"),length);
  assert.equal(a.run(`DB.programFor('Низ А — копия')[${length-2}].name`),name);
  assert.equal(a.run('Store.get().screen'),'t-template');
});
