// Read-only prototype diagnostics. All mutations happen in isolated VM memory.
// Run from the repository root: node design-exploration/identity-research/checks.cjs
const fs = require('node:fs');
const vm = require('node:vm');
function fresh() {
  const memory = new Map();
  const localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  const ctx = vm.createContext({ console, URLSearchParams, setTimeout: () => 0, localStorage });
  for (const name of ['icons', 'data', 'session-repository', 'store', 'ui', 'sheets', 'screens/trainer', 'screens/client']) {
    vm.runInContext(fs.readFileSync(`prototype/js/${name}.js`, 'utf8'), ctx, { filename: name });
  }
  return code => vm.runInContext(code, ctx);
}
const results = {};
results.clientUpcomingCancellation = fresh()(`(() => {
  const s = DB.sessions.find(s => s.id === 's8');
  DB.sessions.splice(0, DB.sessions.length, s);
  Store.sessions.cancel('s8');
  const html = Client.home();
  return { fixture: 'Keep only s8, then cancel through Store.sessions.cancel', cancelledSessionStillFeatured: html.includes('18:00–19:00') };
})()`);
results.clientAttendance = fresh()(`(() => {
  const html = Client.progress();
  const highlightedDays = (html.match(/heat__cell is-on/g) || []).length;
  return { markedAttendanceRecords: Object.keys(Store.get().attendance).length, highlightedDays };
})()`);
results.historyStatus = fresh()(`(() => {
  DB.sessions.push({id: 'audit-cancelled', clientId: 'c1', date: '2026-09-13', start:'07:00', end:'08:00', status:'cancelled', program:'AUDIT_CANCELLED'});
  const html = Client.history();
  const row = html.slice(html.indexOf('AUDIT_CANCELLED'), html.indexOf('AUDIT_CANCELLED') + 350);
  return { fixture: 'One cancelled past booking', cancelledBookingLabelledAttendance: row.includes('Посещение') };
})()`);
results.groupGap = fresh()(`(() => {
  const s = DB.sessions.find(s => s.participants?.length > 1);
  Store.logging.open(s.id);
  const active = Store.get().logging.active;
  for (const e of DB.programFor(DB.client(active).program)) {
    for (let i=0;i<e.sets;i++) Store.logging.setValue(active,e.id,i,{kg:20,reps:10});
  }
  return { fixture: 'Fill only active group participant', activeParticipant:active, wholeGroupGapWarning:Store.hasUnwrittenSets(), otherParticipants:s.participants.filter(p=>p.clientId!==active).map(p=>({id:p.clientId,hasGap:Store.participantHasGap(p.clientId)})) };
})()`);
results.finalize = fresh()(`(() => {
  const s=DB.sessions.find(s=>s.participants?.length>1);
  Store.logging.open(s.id);
  const cid=Store.get().logging.active;
  const ex=DB.programFor(DB.client(cid).program)[0].id;
  Store.logging.setValue(cid,ex,0,{kg:23,reps:7});
  Store.logging.finish();
  Store.logging.confirmPartial();
  return { resultKeysAfterCompletion:Object.keys(Store.get().logging.values), message:Store.get().toast.text };
})()`);
results.createSession = fresh()(`(() => {
  const count=DB.sessions.length;
  Store.newSession.patch({date:'2026-09-21',start:'07:00',clientIds:['c1'],collisionAck:true});
  Store.newSession.save();
  return { addedRecords:DB.sessions.length-count, message:Store.get().toast.text };
})()`);
results.individualLogging = fresh()(`(() => {
  const s=DB.sessions.find(s=>s.kind === 'personal');
  Store.logging.open(s.id);
  return { session:s.id,expectedClient:s.clientId,activeClient:Store.get().logging.active,screenNamesClient:Trainer.session().includes(DB.client(s.clientId).name) };
})()`);
results.sheetMount = fresh()(`({ renderedAlreadyOpen:UI.Sheet(true,'example').includes('sheet-layer is-open') })`);
console.log(JSON.stringify(results,null,2));
