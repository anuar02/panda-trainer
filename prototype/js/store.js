/* ============================================================================
   store.js — prototype state + actions
   A deliberately small observable store. Screens are pure functions of state,
   so re-rendering on every action is fine at prototype scale.

   State is grouped by the domain objects from the handoff:
   requests (reschedule), logging (session in progress), billing, invite,
   attendance, plus UI state (role, screen, day, scenario, sheet, toast).
   ========================================================================== */

const Store = (() => {
  let state = {};
  const subs = new Set();

  /* ── Reschedule requests: state machine from handoff §8 ─────────────────── */
  function initRequests() {
    const req = {};
    DB.sessions.filter(s => s.request).forEach(s => {
      req[s.request.id] = {
        ...s.request,
        counter: s.request.counter || null,
        history: s.request.history?.length ? s.request.history : [{
          at: 'сегодня, 08:41',
          text: `${DB.client(s.request.clientId).short} предложил ${DB.fmtDateLong(s.request.to.date)}, ${s.request.to.start}`,
        }],
      };
    });
    return req;
  }

  function initLogging() {
    // Per-participant values are isolated; switching never moves data across.
    return {
      sessionId: null,
      active: null,
      values: {},          // clientId -> { exId: [{kg,reps}] }
      finished: false,
      dirty: false,
      saving: false,
      saveError: false,
      plans: {},
      context: null,
      drafts: {},
      editor: null,
      feedback: null,      // Ephemeral confirmation, never persisted as workout data.
      quickUndo: null,     // Only the latest quick entry; never part of a saved journal.
      storageError: false,
      storageConflict: false,
    };
  }

  state = {
    role: 'trainer',
    screen: 't-today',
    stack: [],
    day: DB.TODAY,
    week: DB.WEEK[0],
    scenario: 'normal',
    wide: false,
    deviceW: 390,
    activeClient: 'c1',
    inviteState: 'invite',
    reschedulePick: null,
    payMethod: 'Kaspi',
    clientQuery: '',

    sheet: null,          // { id, data }
    toast: null,          // { kind, text, at }

    requests: initRequests(),
    logging: initLogging(),
    attendance: {},       // sessionId -> { clientId: 'present' | 'noshow' }
    recorded: {},         // guard against double charge: key -> true
    billing: { purchases: DB.purchases, payments: DB.payments, unitTx: DB.unitTx },
    invite: { ...DB.client('c6').invite },
    newSession: { step: 0, clientIds: [], date: DB.TODAY, start: '19:00', duration: 60, program: null, programLater: false, collisionAck: false },
    sessionTab: 'log',    // client card tab
    clientTab: 'sessions',
    historyExercise: 0,
    payAmount: '',
    finishedResult: null,
  };

  function get() { return state; }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  function commit() { subs.forEach(fn => fn(state)); }

  /** Update state and re-render. */
  function set(patch) {
    state = { ...state, ...patch };
    commit();
  }
  /** Update nested branch and re-render. */
  function update(key, patch) {
    state = { ...state, [key]: { ...state[key], ...patch } };
    commit();
  }
  /** Update without re-render (uncontrolled inputs). */
  function silent(patch) { state = { ...state, ...patch }; }

  /* ── Navigation ─────────────────────────────────────────────────────────── */

  const nav = {
    go(screen, { replace = false } = {}) {
      const stack = replace ? state.stack : (screen === state.screen ? state.stack : [...state.stack, state.screen]);
      set({ screen, stack });
    },
    back() {
      const stack = state.stack.slice();
      const prev = stack.pop();
      if (prev) set({ screen: prev, stack });
    },
    tab(screen) { set({ screen, stack: [] }); },
    role(role) {
      const home = role === 'trainer' ? 't-today' : 'c-home';
      set({ role, screen: home, stack: [], sheet: null });
    },
    day(date) { set({ day: date }); },
    setRoleTo(screen) { set({ screen }); },
  };

  /* ── UI helpers ─────────────────────────────────────────────────────────── */

  const ui = {
    openSheet(id, data = null) { set({ sheet: { id, data }, toast: null }); },
    closeSheet() { set({ sheet: null }); },
    toast(kind, text) {
      const at = Date.now();
      set({ toast: { kind, text, at } });
      setTimeout(() => {
        if (state.toast && state.toast.at === at) set({ toast: null });
      }, 2600);
    },
    scenario(s) { set({ scenario: s, screen: state.role === 'trainer' ? 't-today' : 'c-home', stack: [] }); },
    wide(v) { set({ wide: v }); },
    clientTab(t) { set({ clientTab: t }); },
    sessionTab(t) { set({ sessionTab: t }); },
    historyExercise(i) { set({ historyExercise: i }); },
  };

  /* ── Reschedule actions (both roles) ────────────────────────────────────── */

  const liveRequest = r => r && ['pending', 'counter'].includes(r.state);
  const ownsRequest = r => state.role === 'trainer' || r?.clientId === DB.DEMO_CLIENT_ID;
  function actionableRequest(id, author = false) {
    const r = state.requests[id];
    const s = r && DB.sessions.find(x => x.id === r.sessionId);
    return liveRequest(r) && ownsRequest(r) && s?.status !== 'cancelled' && logging.status(s?.id) !== 'finished'
      && s && (author ? r.author : r.awaiting) === state.role
      && s.date === r.from.date && s.start === r.from.start && s.end === r.from.end ? r : null;
  }
  function rescheduleTarget(s, to) {
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(to.start)) return null;
    const date = new Date(to.date + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== to.date || to.date < DB.TODAY || (to.date === DB.TODAY && to.start <= DB.NOW_TIME)) return null;
    const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const duration = minutes(s.end) - minutes(s.start);
    if (duration <= 0 || minutes(to.start) + duration > 1440 || (to.date === s.date && to.start === s.start)) return null;
    return { date: to.date, start: to.start, end: DB.addMinutes(to.start, duration) };
  }
  function requestFailure(text = 'Запрос изменился или недоступен для этой роли. Расписание не изменено.') {
    ui.toast('warn', text);
    return false;
  }

  const reschedule = {
    awaiting(role = state.role) { return Object.values(state.requests).filter(r => liveRequest(r) && r.awaiting === role && (role !== 'client' || r.clientId === DB.DEMO_CLIENT_ID)); },
    current(sessionId) { return Object.values(state.requests).find(r => r.sessionId === sessionId && liveRequest(r)); },
    openForm(sessionId) {
      const s = DB.sessions.find(x => x.id === sessionId);
      if (!s || s.status === 'cancelled' || logging.status(s.id) === 'finished' || (state.role === 'client' && s.clientId !== DB.DEMO_CLIENT_ID)) return requestFailure();
      if (s.kind !== 'personal') return requestFailure('Перенос всей мини-группы ещё не реализован. Время группы не изменено.');
      const r = reschedule.current(sessionId);
      if (r && !actionableRequest(r.id)) return requestFailure('По этому занятию уже ждём ответ. Сначала отзовите свой запрос.');
      const proposal = r ? r.counter || r.to : s;
      set({ reschedulePick: { date: proposal.date, start: proposal.start }, toast: null, sheet: { id: 'rescheduleForm', data: { sid: sessionId, rid: r?.id } } });
    },
    propose({ sessionId, to }) {
      const s = DB.sessions.find(x => x.id === sessionId);
      if (!s || s.kind !== 'personal' || s.status === 'cancelled' || logging.status(s.id) === 'finished' || (state.role === 'client' && s.clientId !== DB.DEMO_CLIENT_ID) || reschedule.current(sessionId)) return requestFailure();
      const target = rescheduleTarget(s, to);
      if (!target) return requestFailure('Выберите другую будущую дату и время. Длительность занятия сохраняется.');
      const id = 'r' + Date.now() + '-' + Object.keys(state.requests).length;
      const req = {
        id, sessionId, clientId: (s && s.clientId) || null,
        from: { date: s.date, start: s.start, end: s.end }, to: target, state: 'pending', awaiting: state.role === 'trainer' ? 'client' : 'trainer', author: state.role,
        counter: null,
        history: [{ at: 'только что', text: `${state.role === 'trainer' ? 'Тренер' : 'Клиент'} предложил ${DB.fmtDateLong(target.date)}, ${target.start}` }],
      };
      if (!SessionRepository.upsert({ ...s, request: req })) return requestFailure(SessionRepository.error());
      set({ requests: { ...state.requests, [id]: req }, sheet: null });
      ui.toast('', 'Предложение добавлено · до подтверждения действует прежнее время');
      return id;
    },
    accept(id) {
      const r = actionableRequest(id);
      if (!r) return requestFailure();
      const next = { ...r, state: 'accepted', awaiting: null, history: [...r.history, { at: 'только что', text: 'Время подтверждено' }] };
      // An accepted request is the only thing that changes the session time.
      const s = DB.sessions.find(x => x.id === r.sessionId);
      const target = rescheduleTarget(s, r.counter || r.to);
      if (!target) return requestFailure('Предложенное время уже недоступно. Предложите другое.');
      const changed = { ...s, ...target, request: next };
      delete changed.overlapGroup;
      if (!SessionRepository.upsert(changed)) return requestFailure(SessionRepository.error());
      set({ requests: { ...state.requests, [id]: next }, sheet: null });
      ui.toast('', 'Время подтверждено · занятие перенесено');
      return true;
    },
    decline(id) {
      const r = actionableRequest(id);
      if (!r) return requestFailure();
      const next = { ...r, state: 'declined', awaiting: null, history: [...r.history, { at: 'только что', text: 'Запрос отклонён — действует прежнее время' }] };
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (!SessionRepository.upsert({ ...s, request: next })) return requestFailure(SessionRepository.error());
      set({ requests: { ...state.requests, [id]: next }, sheet: null });
      ui.toast('warn', 'Запрос отклонён · действует прежнее время');
      return true;
    },
    withdraw(id) {
      const r = actionableRequest(id, true);
      if (!r) return requestFailure();
      const next = { ...r, state: 'withdrawn', awaiting: null, history: [...r.history, { at: 'только что', text: 'Запрос отозван автором' }] };
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (!SessionRepository.upsert({ ...s, request: next })) return requestFailure(SessionRepository.error());
      set({ requests: { ...state.requests, [id]: next }, sheet: null });
      ui.toast('warn', 'Запрос отозван · действует прежнее время');
      return true;
    },
    counter(id, to) {
      const r = actionableRequest(id);
      if (!r) return requestFailure();
      const s = DB.sessions.find(x => x.id === r.sessionId);
      const target = rescheduleTarget(s, to);
      if (!target) return requestFailure('Выберите другую будущую дату и время. Длительность занятия сохраняется.');
      const next = {
        ...r, state: 'counter', awaiting: state.role === 'trainer' ? 'client' : 'trainer', author: state.role, counter: target,
        history: [...r.history, { at: 'только что', text: `${state.role === 'trainer' ? 'Тренер' : 'Клиент'} предложил ${DB.fmtDateLong(target.date)}, ${target.start}` }],
      };
      if (!SessionRepository.upsert({ ...s, request: next })) return requestFailure(SessionRepository.error());
      set({ requests: { ...state.requests, [id]: next }, sheet: null });
      ui.toast('', 'Встречное предложение добавлено · прежнее время действует');
      return true;
    },
    /** Stale notification: opens the current state, never repeats the action. */
    openStale(id) {
      const r = state.requests[id];
      if (!r || !ownsRequest(r)) return requestFailure();
      ui.openSheet('stale', { id });
    },
  };

  /* ── Session logging ────────────────────────────────────────────────────── */

  const logCache = new Map();
  const logReadVersion = new Map();
  const logKey = id => 'trainer-prototype:journal:v1:' + id;
  const resumeKey = 'trainer-prototype:resume-journal:v1';
  let resumeId = null;
  try { resumeId = localStorage.getItem(resumeKey) || null; } catch (_) { /* Journal errors are reported separately. */ }
  function rememberWorkout(id) {
    resumeId = id;
    try { localStorage.setItem(resumeKey, id || ''); } catch (_) { /* A bookmark is optional; the journal remains available. */ }
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const validSet = v => v && Number.isFinite(v.kg) && v.kg >= 0 && Number.isSafeInteger(v.reps) && v.reps > 0;
  const recoveredLogs = new Map();
  function readLog(id, fresh = false) {
    if (!fresh && logCache.has(id)) return logCache.get(id);
    let raw;
    try { raw = localStorage.getItem(logKey(id)); }
    catch (error) { return null; } // Memory-only mode; persistLog reports the failure.
    if (!raw) { if (!fresh) logReadVersion.set(id, null); return null; }
    try {
      const v = JSON.parse(raw);
      if (v.version !== 1 || v.sessionId !== id || typeof v.finished !== 'boolean' || !v.plans || !v.values || !v.drafts || !Object.keys(v.plans).length || !v.plans[v.active]) throw Error('format');
      if (v.context && (!/^\d{4}-\d{2}-\d{2}$/.test(v.context.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.context.start) || !/^([01]\d|2[0-4]):[0-5]\d$/.test(v.context.end) || !['personal', 'group'].includes(v.context.kind))) throw Error('context');
      for (const [cid, p] of Object.entries(v.plans)) {
        if (!DB.client(cid) || !Array.isArray(p.exercises) || p.exercises.some(e => !e.id || !e.name || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 100 || !e.prev)) throw Error('plan');
        for (const e of p.exercises) {
          const arr = v.values[cid]?.[e.id] || [];
          if (!Array.isArray(arr) || arr.length > e.sets || arr.some(x => x != null && !validSet(x))) throw Error('values');
        }
        for (const [exId, arr] of Object.entries(v.drafts[cid] || {})) {
          const ex = p.exercises.find(e => e.id === exId);
          if (!ex || !Array.isArray(arr) || arr.length > ex.sets || arr.some(x => x != null && (typeof x.kg !== 'string' || typeof x.reps !== 'string'))) throw Error('drafts');
        }
      }
      if (!fresh) { logCache.set(id, v); logReadVersion.set(id, raw); }
      return v;
    } catch (error) {
      // Never overwrite an unreadable saved journal on opening.
      return { unreadable: true };
    }
  }
  // A fresh read is only adopted when completed. Never grant stale local data
  // a newer write version; conflicting edits remain available as a separate copy.
  function completedElsewhere(id) {
    const local = state.logging.sessionId === id ? state.logging : readLog(id);
    const fresh = readLog(id, true);
    if (!fresh || fresh.unreadable || !fresh.finished || local?.finished) return false;
    if (local && !local.unreadable) recoveredLogs.set(id, clone(local));
    logCache.set(id, fresh);
    silent({ logging: { ...initLogging(), ...clone(fresh), completedElsewhere: true }, sheet: null });
    return true;
  }
  function persistLog() {
    const lg = state.logging;
    const record = clone({ version: 1, sessionId: lg.sessionId, active: lg.active, plans: lg.plans, context: lg.context,
      values: lg.values, drafts: lg.drafts, finished: lg.finished, startedAt: lg.startedAt, completedAt: lg.completedAt || null });
    logCache.set(lg.sessionId, record);
    let storageError = false, storageConflict = false;
    try {
      const current = localStorage.getItem(logKey(lg.sessionId));
      if (current !== (logReadVersion.get(lg.sessionId) ?? null)) {
        storageConflict = true;
        throw Error('Journal changed in another tab');
      }
      const serialized = JSON.stringify(record);
      localStorage.setItem(logKey(lg.sessionId), serialized);
      logReadVersion.set(lg.sessionId, serialized);
    }
    catch (error) { storageError = true; }
    silent({ logging: { ...state.logging, storageError, storageConflict } });
    return !storageError;
  }
  function changeLog(patch, render = true) {
    silent({ logging: { ...state.logging, ...patch } });
    const wasError = state.logging.storageError;
    persistLog();
    if (render || wasError !== state.logging.storageError) commit();
  }
  function eligible(cid) {
    const s = DB.sessions.find(s => s.id === state.logging.sessionId);
    return Boolean(s && s.status !== 'cancelled' && state.logging.plans[cid]) && s.participants?.find(p => p.clientId === cid)?.reply !== 'cancelled'
      && state.logging.plans[cid]?.reply !== 'cancelled' && state.attendance[state.logging.sessionId + ':' + cid] !== 'noshow';
  }

  const logging = {
    resumable() {
      const candidate = id => {
        if (!id) return null;
        const booking = DB.sessions.find(s => s.id === id);
        const record = state.logging.sessionId === id ? state.logging : readLog(id);
        return booking && booking.status !== 'cancelled' && record && !record.unreadable && !record.finished ? { booking, record } : null;
      };
      let target = candidate(resumeId);
      if (!target) {
        target = DB.sessions.filter(s => s.date === DB.TODAY)
          .sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id))
          .map(s => candidate(s.id)).find(Boolean);
        if (!target) return null;
        rememberWorkout(target.booking.id);
      }
      const { booking, record } = target;
      const plan = record.plans[record.active];
      if (!plan) return null;
      const total = plan.exercises.reduce((n, e) => n + e.sets, 0);
      const done = plan.exercises.reduce((n, e) => n + (record.values?.[record.active]?.[e.id] || []).filter(validSet).length, 0);
      const drafts = Object.values(record.drafts?.[record.active] || {}).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
      const draftParticipants = Object.values(record.drafts || {}).filter(exercises => Object.values(exercises).some(arr => arr.some(Boolean))).length;
      const clientName = DB.client(record.active)?.name || 'Участник';
      const participating = plan.reply !== 'cancelled'
        && booking.participants?.find(p => p.clientId === record.active)?.reply !== 'cancelled'
        && state.attendance[resumeId + ':' + record.active] !== 'noshow';
      return { sessionId: resumeId, name: booking.kind === 'group' ? `${booking.title} · ${clientName}` : clientName,
        start: record.context?.start || booking.start, group: booking.kind === 'group', draftParticipants, total, done, drafts, participating, storageError: Boolean(record.storageError) };
    },
    minimize() {
      if (state.role !== 'trainer' || !state.logging.sessionId || state.logging.finished) return false;
      rememberWorkout(state.logging.sessionId);
      set({ screen: 't-today', stack: [], sheet: null });
      return true;
    },
    resume(sessionId) {
      if (state.role !== 'trainer') return false;
      const target = sessionId ? { sessionId } : logging.resumable();
      if (target && completedElsewhere(target.sessionId)) {
        set({ screen: 't-session', stack: [], sheet: null });
        return true;
      }
      if (!target) return false;
      if (target.sessionId === state.logging.sessionId) {
        // Keep the live editor/drafts and memory-only data; do not reopen from storage.
        set({ screen: 't-session', stack: [], sheet: null });
      } else logging.open(target.sessionId);
      return true;
    },
    exportData() {
      return clone({ version: 1, sessionId: state.logging.sessionId, plans: state.logging.plans, context: state.logging.context,
        values: state.logging.values, drafts: state.logging.drafts, finished: state.logging.finished,
        localRecovery: recoveredLogs.get(state.logging.sessionId) || null,
        exportedAt: new Date().toISOString(), source: 'trainer-prototype-local-journal' });
    },
    status(id) {
      const record = readLog(id);
      return !record || record.unreadable ? null : record.finished ? 'finished' : 'draft';
    },
    label(id) {
      const saved = readLog(id);
      return saved?.finished ? 'Посмотреть результаты' : saved && !saved.unreadable ? 'Продолжить тренировку' : 'Начать тренировку';
    },
    exercises(cid) { return state.logging.plans[cid]?.exercises || []; },
    eligible,
    progress(cid) {
      const exercises = logging.exercises(cid);
      const total = exercises.reduce((n, e) => n + e.sets, 0);
      const done = exercises.reduce((n, e) => n + (state.logging.values[cid]?.[e.id] || []).filter(validSet).length, 0);
      const drafts = Object.values(state.logging.drafts[cid] || {}).reduce((n, arr) => n + arr.filter(Boolean).length, 0);
      return { total, done, drafts };
    },
    open(sessionId, participantId) {
      const session = DB.sessions.find(s => s.id === sessionId);
      if (!session || session.status === 'cancelled') return ui.toast('warn', 'Эта запись недоступна для старта');
      if (completedElsewhere(sessionId)) { nav.go('t-session'); return; }
      const saved = readLog(sessionId);
      if (saved?.unreadable) return ui.toast('warn', 'Не удалось прочитать локальный журнал. Сохранённые данные не перезаписаны.');
      const plans = {};
      (session.participants || [{ clientId: session.clientId }]).forEach(p => {
        const name = session.kind === 'personal' ? session.program : (p.program !== undefined ? p.program : DB.client(p.clientId)?.program);
        plans[p.clientId] = { name, reply: p.reply, exercises: clone(DB.programFor(name)) };
      });
      const record = saved || { sessionId, plans, active: Object.keys(plans).find(eligibleId => plans[eligibleId].reply !== 'cancelled') || Object.keys(plans)[0], startedAt: Date.now() };
      const context = record.context || { date: session.date, start: session.start, end: session.end, title: session.title, kind: session.kind, clientId: session.clientId };
      silent({ logging: { ...initLogging(), ...clone(record), context, completedElsewhere: recoveredLogs.has(sessionId), active: participantId && record.plans[participantId] ? participantId : record.active }, sheet: null });
      if (!state.logging.finished) { persistLog(); rememberWorkout(sessionId); }
      nav.go('t-session');
    },
    switchTo(clientId) {
      if (!state.logging.plans[clientId]) return;
      const patch = { active: clientId, feedback: null, quickUndo: null };
      if (state.logging.finished) set({ logging: { ...state.logging, ...patch } });
      else changeLog(patch);
    },
    repeatSuggestion(clientId, exId, setId) {
      const lg = state.logging;
      const ex = logging.exercises(clientId).find(e => e.id === exId);
      if (lg.finished || lg.storageError || clientId !== lg.active || !eligible(clientId) || !ex
        || !Number.isInteger(setId) || setId < 0 || setId >= ex.sets
        || lg.values[clientId]?.[exId]?.[setId] || lg.drafts[clientId]?.[exId]?.[setId]
        || !validSet(ex.prev)) return null;
      return { kg: ex.prev.kg, reps: ex.prev.reps };
    },
    quickRepeat(clientId, exId, setId, expected) {
      if (state.sheet) return false;
      const value = logging.repeatSuggestion(clientId, exId, setId);
      // Confirm exactly what the button showed; never silently substitute a new proposal.
      if (!value || value.kg !== expected?.kg || value.reps !== expected?.reps) return false;
      const values = clone(state.logging.values);
      values[clientId] ||= {};
      values[clientId][exId] ||= [];
      values[clientId][exId][setId] = value;
      const quickUndo = { sessionId: state.logging.sessionId, clientId, exId, setId, value };
      changeLog({ values, quickUndo, dirty: true, feedback: `Подход ${setId + 1} записан · ${DB.client(clientId).short}` });
      return true;
    },
    undoQuick(clientId, exId, setId) {
      const lg = state.logging, undo = lg.quickUndo;
      if (!undo || state.sheet || lg.finished || !eligible(clientId) || lg.active !== clientId
        || undo.sessionId !== lg.sessionId || undo.clientId !== clientId || undo.exId !== exId || undo.setId !== setId
        || lg.drafts[clientId]?.[exId]?.[setId]) return false;
      const current = lg.values[clientId]?.[exId]?.[setId];
      if (!current || current.kg !== undo.value.kg || current.reps !== undo.value.reps) return false;
      const values = clone(lg.values);
      values[clientId][exId][setId] = null;
      changeLog({ values, quickUndo: null, feedback: `Запись подхода ${setId + 1} отменена · ${DB.client(clientId).short}` });
      return true;
    },
    setValue(clientId, exId, setId, value) {
      const ex = logging.exercises(clientId).find(e => e.id === exId);
      if (state.logging.finished || !eligible(clientId) || !ex || !Number.isInteger(setId) || setId < 0 || setId >= ex.sets || !validSet(value)) return false;
      const values = { ...state.logging.values };
      const perClient = { ...(values[clientId] || {}) };
      const arr = [...(perClient[exId] || [])];
      arr[setId] = { kg: value.kg, reps: value.reps };
      perClient[exId] = arr;
      values[clientId] = perClient;
      changeLog({ values, dirty: true, quickUndo: null });
      return true;
    },
    edit(clientId, exId, setId) {
      const ex = logging.exercises(clientId).find(e => e.id === exId);
      if (state.logging.finished || !eligible(clientId) || !ex || !Number.isInteger(setId) || setId < 0 || setId >= ex.sets) return;
      const current = state.logging.drafts[clientId]?.[exId]?.[setId] || state.logging.values[clientId]?.[exId]?.[setId] || { kg: '', reps: '' };
      set({ logging: { ...state.logging, feedback: null, quickUndo: null, editor: { clientId, exId, setId, kg: String(current.kg), reps: String(current.reps), error: '' } }, toast: null,
        sheet: { id: 'setlog', data: { cid: clientId, ex: exId, si: setId } } });
    },
    input(patch, render = false) {
      const old = state.logging.editor;
      if (!old || state.logging.finished) return;
      const editor = { ...old, ...patch, error: '' };
      const drafts = clone(state.logging.drafts);
      drafts[old.clientId] ||= {};
      drafts[old.clientId][old.exId] ||= [];
      drafts[old.clientId][old.exId][old.setId] = { kg: editor.kg, reps: editor.reps };
      changeLog({ editor, drafts }, render);
    },
    saveSet() {
      const ed = state.logging.editor;
      if (!ed) return;
      const ex = logging.exercises(ed.clientId).find(e => e.id === ed.exId);
      const kgText = ed.kg.trim().replace(',', '.');
      const repsText = ed.reps.trim();
      const kg = ex?.prev.kg === 0 ? 0 : Number(kgText);
      const reps = Number(repsText);
      if ((ex?.prev.kg !== 0 && !/^\d+(\.\d+)?$/.test(kgText)) || !/^\d+$/.test(repsText) || !validSet({ kg, reps })) {
        update('logging', { editor: { ...ed, error: 'Укажите вес от 0 кг и целое число повторов / секунд больше 0.' } });
        return false;
      }
      if (!logging.setValue(ed.clientId, ed.exId, ed.setId, { kg, reps })) return false;
      const drafts = clone(state.logging.drafts);
      if (drafts[ed.clientId]?.[ed.exId]) drafts[ed.clientId][ed.exId][ed.setId] = null;
      changeLog({ drafts, editor: null, feedback: `Подход ${ed.setId + 1} записан · ${DB.client(ed.clientId).short}` });
      ui.closeSheet();
      if (state.logging.storageError) ui.toast('warn', 'Подход записан только в памяти вкладки');
      return true;
    },
    retrySave() { persistLog(); commit(); },
    finish() {
      if (!state.logging.sessionId || state.logging.finished) return;
      if (!persistLog()) { commit(); return; }
      if (hasUnwrittenSets()) return ui.openSheet('finishConfirm');
      finalize();
    },
    continueInput() { ui.closeSheet(); },
    confirmPartial() {
      if (state.sheet?.id !== 'finishConfirm') return;
      finalize();
    },
  };

  function hasUnwrittenSets() {
    return Object.keys(state.logging.plans).some(cid => eligible(cid) && participantHasGap(cid));
  }
  function participantHasGap(clientId) {
    const p = logging.progress(clientId);
    return p.total === 0 || p.done < p.total || p.drafts > 0;
  }
  function finalize() {
    if (!state.logging.sessionId || state.logging.finished) return;
    silent({ logging: { ...state.logging, finished: true, completedAt: Date.now(), editor: null } });
    if (!persistLog()) {
      silent({ logging: { ...state.logging, finished: false, completedAt: null } });
      persistLog();
      commit();
      return;
    }
    if (resumeId === state.logging.sessionId) rememberWorkout(null);
    set({ sheet: null, toast: null });
  }

  /* ── Attendance & charge (separate entities) ────────────────────────────── */

  function canMarkAttendance(sessionId, clientId) {
    const s = DB.sessions.find(s => s.id === sessionId);
    return state.role === 'trainer' && s && s.status !== 'cancelled'
      && (s.clientId === clientId || s.participants?.some(p => p.clientId === clientId && p.reply !== 'cancelled'));
  }

  const attendance = {
    mark(sessionId, clientId, value) {
      if (!canMarkAttendance(sessionId, clientId) || !['present', 'noshow'].includes(value)) return false;
      if (value === 'present') { ui.openSheet('charge', { sid: sessionId, cid: clientId }); return true; }
      const key = sessionId + ':' + clientId;
      const attendance = { ...state.attendance, [key]: value };
      set({ attendance });
      ui.toast('warn', 'Отмечена неявка · списание не выполнено автоматически');
      return true;
    },
    markOnly(sessionId, clientId) {
      if (!canMarkAttendance(sessionId, clientId)) return false;
      set({ attendance: { ...state.attendance, [sessionId + ':' + clientId]: 'present' }, sheet: null });
      ui.toast('', 'Посещение отмечено без списания');
      return true;
    },
    correct(sessionId, clientId) {
      if (state.role !== 'trainer') return false;
      const key = sessionId + ':' + clientId;
      const attendance = { ...state.attendance };
      delete attendance[key];
      set({ attendance });
      ui.toast('', 'Отметка посещения снята · списание не отменено');
    },
    /** Idempotent: a repeated click never creates a second operation. */
    charge(sessionId, clientId, { reason = 'Проведённое занятие', amount = 1 } = {}) {
      if (!canMarkAttendance(sessionId, clientId) || amount !== 1) return false;
      const key = 'charge:' + sessionId + ':' + clientId;
      if (state.recorded[key]) {
        ui.closeSheet();
        ui.toast('warn', 'Уже списано · повторное нажатие не создало операцию');
        return;
      }
      const purchase = state.billing.purchases.find(p => p.clientId === clientId && p.used < p.units);
      if (!purchase) {
        ui.toast('warn', 'В демо нет пакета с доступными занятиями. Можно отметить посещение без списания.');
        return false;
      }
      const session = DB.sessions.find(s => s.id === sessionId);
      const recorded = { ...state.recorded, [key]: true };
      const billing = {
        ...state.billing,
        purchases: state.billing.purchases.map(p => p.id === purchase.id ? { ...p, used: p.used + 1 } : p),
        unitTx: [{ id: 'u' + Date.now() + '-' + Object.keys(recorded).length, clientId, sessionId, delta: -amount, date: session.date, reason, source: purchase.id }, ...state.billing.unitTx],
      };
      const client = DB.client(clientId);
      if (client?.plan) client.plan.remaining = purchase.units - purchase.used - 1;
      set({ recorded, billing, attendance: { ...state.attendance, [sessionId + ':' + clientId]: 'present' } });
      ui.closeSheet();
      ui.toast('', 'Посещение отмечено · списано 1 занятие из пакета');
    },
  };

  /* ── Billing ────────────────────────────────────────────────────────────── */

  const billing = {
    recordPayment(clientId, amount, method = 'Kaspi', date = DB.TODAY) {
      const payments = [{ id: 'pay' + Date.now(), clientId, amount, date, method, note: '' }, ...state.billing.payments];
      set({ billing: { ...state.billing, payments } });
      ui.closeSheet();
      ui.toast('', `Оплата ${DB.fmtMoney(amount)} записана`);
    },
  };

  /* ── Invite ─────────────────────────────────────────────────────────────── */

  const invite = {
    create(clientId) {
      set({ invite: { state: 'link_created', expires: '2026-09-21', link: 'trn.app/i/TM-8F3KQ' } });
      ui.toast('', 'Ссылка создана · срок действия 7 дней');
    },
    copy() { ui.toast('', 'Ссылка скопирована'); },
    reissue() {
      set({ invite: { state: 'link_created', expires: '2026-09-28', link: 'trn.app/i/TM-NEW7D' } });
      ui.toast('', 'Ссылка перевыпущена · прежняя отозвана');
    },
    revoke() {
      set({ invite: { state: 'not_connected', expires: null, link: null } });
      ui.toast('warn', 'Ссылка отозвана');
    },
    connected() {
      set({ invite: { state: 'connected', expires: null, link: null } });
      ui.toast('', 'Клиент подключился · карточка сохранена');
    },
  };

  /* ── New session wizard ─────────────────────────────────────────────────── */

  const newSession = {
    patch(p) {
      const next = { ...p };
      if (p.program) next.programLater = false;
      if (p.programLater) next.program = null;
      if (['date', 'start', 'duration', 'clientIds'].some(k => k in p)) next.collisionAck = false;
      update('newSession', next);
    },
    toggleClient(id) {
      const ids = state.newSession.clientIds.includes(id)
        ? state.newSession.clientIds.filter(x => x !== id)
        : [...state.newSession.clientIds, id];
      update('newSession', { clientIds: ids, collisionAck: false });
    },
    next() { update('newSession', { step: Math.min(state.newSession.step + 1, 2) }); },
    prev() { update('newSession', { step: Math.max(state.newSession.step - 1, 0) }); },
    collisions() {
      const { date, start, duration, clientIds } = state.newSession;
      const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const s0 = toMin(start), s1 = s0 + Number(duration);
      return DB.byDate(date).filter(s => {
        if (s.status === 'cancelled') return false;
        const e0 = toMin(s.start), e1 = toMin(s.end);
        return s0 < e1 && e0 < s1;
      });
    },
    save() {
      const c = state.newSession;
      const fail = text => { ui.toast('warn', text); return false; };
      if (state.role !== 'trainer') return false;
      if (!c.clientIds.length || new Set(c.clientIds).size !== c.clientIds.length || c.clientIds.some(id => !DB.clients.some(x => x.id === id))) return fail('Выберите клиентов');
      if (!SessionRepository.validDate(c.date) || c.date < DB.TODAY || !SessionRepository.validTime(c.start) || (c.date === DB.TODAY && c.start <= DB.NOW_TIME)) return fail('Выберите будущее время занятия');
      const minutes = Number(c.start.slice(0, 2)) * 60 + Number(c.start.slice(3)) + Number(c.duration);
      if (!Number.isInteger(Number(c.duration)) || Number(c.duration) <= 0 || minutes > 1440) return fail('Проверьте длительность занятия');
      if (!c.programLater && !DB.templates.some(t => t.program === c.program)) return fail('Выберите программу или назначьте её позже');
      if (newSession.collisions().length && !c.collisionAck) return fail('Подтвердите пересечение');
      const id = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const program = c.programLater ? null : c.program;
      const session = { id, date: c.date, start: c.start, end: String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'),
        kind: c.clientIds.length > 1 ? 'group' : 'personal', clientId: c.clientIds.length === 1 ? c.clientIds[0] : null,
        title: c.clientIds.length > 1 ? 'Общее занятие' : DB.client(c.clientIds[0]).name, program,
        status: 'proposed', attendance: null, participants: c.clientIds.map(clientId => ({ clientId, reply: 'pending', program })) };
      if (!SessionRepository.upsert(session)) return fail(SessionRepository.error());
      set({ sheet: null, screen: 't-schedule', day: c.date, newSession: { ...c, step: 0, clientIds: [], collisionAck: false, program: null, programLater: false } });
      ui.toast('', 'Занятие сохранено в этом браузере · ждём согласия клиента');
      return id;
    },
  };

  /* ── Sessions: cancel / attendance reset ────────────────────────────────── */

  const sessions = {
    cancel(sessionId) {
      const s = DB.sessions.find(x => x.id === sessionId);
      if (!s || s.status === 'cancelled') return false;
      const next = { ...s, participants: s.participants.map(p => ({ ...p })) };
      if (state.role === 'client') {
        const p = next.participants.find(p => p.clientId === DB.DEMO_CLIENT_ID);
        if (s.clientId !== DB.DEMO_CLIENT_ID && !p) return false;
        if (s.kind === 'group') { if (p.reply === 'cancelled') return false; p.reply = 'cancelled'; }
        else next.status = 'cancelled';
      } else next.status = 'cancelled';
      const requests = { ...state.requests };
      Object.values(requests).filter(r => r.sessionId === sessionId && liveRequest(r) && (state.role === 'trainer' || r.clientId === DB.DEMO_CLIENT_ID)).forEach(r => {
        requests[r.id] = { ...r, state: 'withdrawn', awaiting: null, history: [...r.history, { at: 'только что', text: 'Запись отменена; запрос закрыт' }] };
        if (next.request?.id === r.id) next.request = requests[r.id];
      });
      if (!SessionRepository.upsert(next)) return requestFailure(SessionRepository.error());
      set({ requests, sheet: null });
      ui.toast('warn', 'Запись отменена · списание не выполнено автоматически');
      return true;
    },
    confirm(sessionId) {
      const s = DB.sessions.find(x => x.id === sessionId);
      if (state.role !== 'client' || !s || s.status === 'cancelled') return false;
      const p = s.participants.find(p => p.clientId === DB.DEMO_CLIENT_ID);
      if (!p || p.reply !== 'pending') return false;
      const participants = s.participants.map(p => p.clientId === DB.DEMO_CLIENT_ID ? { ...p, reply: 'confirmed' } : { ...p });
      const next = { ...s, participants, status: participants.every(p => p.reply !== 'pending') ? 'confirmed' : 'proposed' };
      if (!SessionRepository.upsert(next)) return requestFailure(SessionRepository.error());
      set({ sheet: null });
      ui.toast('', 'Участие подтверждено · сохранено в этом браузере');
      return true;
    },
  };

  return { get, set, update, silent, subscribe, commit, nav, ui, reschedule, logging, attendance, billing, invite, newSession, sessions, hasUnwrittenSets, participantHasGap };
})();
