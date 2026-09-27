const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function app(storage = new Map(), search = '') {
  let bursts = 0;
  const context = vm.createContext({ console, URLSearchParams, location:{search}, setTimeout:()=>0,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    window:{matchMedia:()=>({matches:false})},
    document:{addEventListener(){},getElementById(){return {querySelector(){},appendChild(){bursts++;}};},createElement(){return {setAttribute(){}};}} });
  for (const file of ['data','session-repository','store','fx']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);
  return {run:s=>vm.runInContext(s,context),bursts:()=>bursts};
}
test('calm preferences persist separately by role and tolerate invalid storage',()=>{
  const storage=new Map([['trainer-prototype:calm:v1','broken']]);
  const a=app(storage);
  a.run('Store.preferences.toggleCalm()');
  assert.equal(app(storage).run('Store.preferences.calm()'),true);
  assert.equal(app(storage).run("Store.preferences.calm('client')"),false);
  assert.equal(app(new Map(), '?calm=1').run('Store.preferences.calm()'),true);
});
test('ordinary confirmations do not celebrate; calm suppresses all celebrations',()=>{
  const a=app();
  a.run("Fx.afterAction('session.confirm',{toast:null},{toast:{at:1}})");
  assert.equal(a.bursts(),0);
  a.run("Fx.afterAction('log.finish',{logging:{finished:false}},{logging:{finished:true}})");
  assert.equal(a.bursts(),1);
  a.run("Store.preferences.toggleCalm(); Fx.afterAction('log.finish',{logging:{finished:false}},{logging:{finished:true}}); Fx.celebrate()");
  assert.equal(a.bursts(),1);
});
test('first connection celebrates once and partial completion celebrates',()=>{
  const a=app();
  a.run("Fx.afterAction('first.accept',{inviteState:'invite'},{inviteState:'accepted'}); Fx.afterAction('first.accept',{inviteState:'accepted'},{inviteState:'accepted'}); Fx.afterAction('log.confirmPartial',{logging:{finished:false}},{logging:{finished:true}})");
  assert.equal(a.bursts(),2);
});
