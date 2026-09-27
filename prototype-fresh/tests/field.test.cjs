const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function app(search='') {
  const saved=new Map();
  const ctx=vm.createContext({URLSearchParams,location:{search},setTimeout:()=>0,localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}});
  for (const file of ['data','session-repository','store']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),ctx);
  return {saved,run:code=>vm.runInContext(code,ctx)};
}
test('field recording is opt-in and stores voice timing, removals and errors',()=>{
  const off=app();
  off.run("Store.field.voiceStart(); Store.field.voiceEvent('heard',{text:'80 на 8'}); Store.field.voiceFinish(1,0)");
  assert.equal(off.saved.has('trainer-prototype:field:v1'),false);
  const on=app('?field=1');
  on.run("Store.field.voiceStart(); Store.field.voiceEvent('heard',{text:'80 на 8',items:[{type:'set'}]}); Store.field.voiceEvent('release'); Store.field.voiceEvent('remove',{key:0}); Store.field.voiceEvent('error',{error:'network'}); Store.field.voiceFinish(1,0)");
  const record=JSON.parse(on.saved.get('trainer-prototype:field:v1'));
  assert.equal(record.events.length,6);
  assert.equal(record.events[1].text,'80 на 8');
  assert.equal(on.run('Store.field.exportData().summary.uneditedPhraseShare'),0);
  on.run('Store.field.clear()');
  assert.equal(on.run('Store.field.exportData().events.length'),0);
});
test('summary uses elapsed time per saved set, excludes demos and separates quick repeat',()=>{
  const a=app();
  const events=[
    {kind:'voice-start',attempt:'v',at:100,mode:'speech'},
    {kind:'voice-heard',attempt:'v',at:200,items:[{type:'set'}]},
    {kind:'voice-save',attempt:'v',at:9100,sets:3,failed:0},
    {kind:'touch-start',attempt:'t',at:100,mode:'sheet'},
    {kind:'touch-save',attempt:'t',at:4100,sets:1},
    {kind:'touch-start',attempt:'q',at:100,mode:'quick'},
    {kind:'touch-save',attempt:'q',at:200,sets:1},
    {kind:'voice-start',attempt:'d',at:100,mode:'demo'},
    {kind:'voice-save',attempt:'d',at:100000,sets:1},
  ];
  const summary=JSON.parse(a.run(`JSON.stringify(Store.field.summary(${JSON.stringify(events)}))`));
  assert.equal(summary.voice.meanMsPerSet,3000);
  assert.equal(summary.touch.meanMsPerSet,4000);
  assert.equal(summary.quickRepeat.meanMsPerSet,100);
  assert.equal(summary.uneditedPhraseShare,1);
  assert.equal(a.run('Store.field.summary([]).voice.meanMsPerSet'),null);
});
