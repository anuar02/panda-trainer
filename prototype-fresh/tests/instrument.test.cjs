const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function app(){
 const data=new Map();
 const ctx=vm.createContext({console,URLSearchParams,setTimeout:()=>0,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}});
 for(const f of ['data','template-repository','session-repository','store'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),ctx);
 return code=>{const value=vm.runInContext(`JSON.stringify(${code})`,ctx);return value===undefined?undefined:JSON.parse(value);};
}
test('timeline progress counts saved sets and excludes skipped unrecorded sets',()=>{
 const run=app();
 assert.equal(run("Store.logging.sessionProgress('s1')"),null);
 run("Store.logging.open('s1')");
 const initial=run("Store.logging.sessionProgress('s1')");
 assert.equal(initial.done,0);
 run("Store.logging.record('c5','e1',0,{kg:50,reps:10})");
 assert.deepEqual(run("Store.logging.sessionProgress('s1')"),{done:1,total:initial.total});
 run("Store.logging.skipExercise('c5','e1',true)");
 assert.deepEqual(run("Store.logging.sessionProgress('s1')"),{done:1,total:initial.total-2});
});
test('enabled Continue explains missing clients without advancing the wizard',()=>{
 const run=app();
 assert.equal(run('Store.newSession.next()'),false);
 assert.equal(run('Store.get().newSession.step'),0);
 assert.match(run('Store.get().toast.text'),/Выберите/);
 run("Store.newSession.toggleClient('c1')");
 assert.equal(run('Store.newSession.next()'),true);
 assert.equal(run('Store.get().newSession.step'),1);
});
test('sparklines use daily maxima from the last eight weeks and exclude future entries',()=>{
 const run=app();
 const result=run(`(()=>{
  const day=n=>{const d=new Date(DB.TODAY+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  Store.logging.clientHistory=()=>[[-57,90],[-56,30],[-2,40],[-2,45],[1,100]].map(([offset,kg])=>({date:day(offset),exercises:[{name:'Присед',unit:'повт',values:[{kg,reps:10}]}]}));
  return {series:Store.logging.clientProgress('c1')[0].series, dates:[day(-56),day(-2)]};
 })()`);
 assert.deepEqual(result.series,[{date:result.dates[0],value:30},{date:result.dates[1],value:45}]);
});
