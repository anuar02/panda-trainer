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
        counter: null,
        history: [{
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
    counterPick: null,
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
    openSheet(id, data = null) { set({ sheet: { id, data } }); },
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

  const reschedule = {
    propose({ sessionId, from, to }) {
      const id = 'r' + Date.now();
      const s = DB.sessions.find(x => x.id === sessionId);
      const req = {
        id, sessionId, clientId: (s && s.clientId) || null,
        from, to, state: 'pending', awaiting: 'trainer', author: 'client',
        counter: null,
        history: [{ at: 'только что', text: `Клиент предложил ${DB.fmtDateLong(to.date)}, ${to.start}` }],
      };
      if (s) s.request = req;
      set({ requests: { ...state.requests, [id]: req } });
      return id;
    },
    accept(id) {
      const r = state.requests[id];
      const next = { ...r, state: 'accepted', awaiting: null, history: [...r.history, { at: 'только что', text: 'Время подтверждено' }] };
      // An accepted request is the only thing that changes the session time.
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (s) { s.date = r.to.date; s.start = r.to.start; s.end = r.to.end; s.request = next; }
      set({ requests: { ...state.requests, [id]: next } });
      ui.toast('', 'Время подтверждено · занятие перенесено');
    },
    decline(id) {
      const r = state.requests[id];
      const next = { ...r, state: 'declined', awaiting: null, history: [...r.history, { at: 'только что', text: 'Запрос отклонён — действует прежнее время' }] };
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (s) s.request = next;
      set({ requests: { ...state.requests, [id]: next } });
      ui.toast('warn', 'Запрос отклонён · действует прежнее время');
    },
    withdraw(id) {
      const r = state.requests[id];
      const next = { ...r, state: 'withdrawn', awaiting: null, history: [...r.history, { at: 'только что', text: 'Запрос отозван автором' }] };
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (s) s.request = next;
      set({ requests: { ...state.requests, [id]: next } });
      ui.toast('warn', 'Запрос отозван · действует прежнее время');
    },
    counter(id, to) {
      const r = state.requests[id];
      const next = {
        ...r, state: 'counter', awaiting: 'client', author: 'trainer', counter: to,
        history: [...r.history, { at: 'только что', text: `Тренер предложил ${DB.fmtDateLong(to.date)}, ${to.start}` }],
      };
      const s = DB.sessions.find(x => x.id === r.sessionId);
      if (s) s.request = next;
      set({ requests: { ...state.requests, [id]: next } });
      ui.toast('', 'Встречное время отправлено клиенту');
    },
    /** Stale notification: opens the current state, never repeats the action. */
    openStale(id) {
      const r = state.requests[id];
      const next = r.state === 'pending' ? { ...r, state: 'stale' } : r;
      update('requests', { [id]: { ...next, opened: true } });
      ui.openSheet('stale', { id });
    },
  };

  /* ── Session logging ────────────────────────────────────────────────────── */

  const logging = {
    open(sessionId, participantId) {
      const participants = DB.sessions.find(s => s.id === sessionId)?.participants || [];
      const first = participantId || participants[0]?.clientId || null;
      set({
        logging: {
          ...initLogging(),
          sessionId,
          active: first,
          values: { ...DB.loggedDemo },
        },
      });
      nav.go('t-session');
    },
    switchTo(clientId) {
      // Switching participants must not move or lose values.
      update('logging', { active: clientId });
    },
    setValue(clientId, exId, setId, value) {
      const values = { ...state.logging.values };
      const perClient = { ...(values[clientId] || {}) };
      const arr = [...(perClient[exId] || [])];
      arr[setId] = value;
      perClient[exId] = arr;
      values[clientId] = perClient;
      update('logging', { values, dirty: true });
    },
    repeatLast(clientId, exId, prev) {
      const values = { ...state.logging.values };
      const perClient = { ...(values[clientId] || {}) };
      perClient[exId] = [{ ...prev }];
      values[clientId] = perClient;
      update('logging', { values, dirty: true });
    },
    async finish() {
      update('logging', { saving: true, saveError: false });
      await new Promise(r => setTimeout(r, 550));
      if (state.scenario === 'offline') {
        update('logging', { saving: false, saveError: true });
        return; // entered data is preserved
      }
      const hasUnwritten = hasUnwrittenSets();
      if (hasUnwritten) {
        ui.openSheet('finishConfirm');
        update('logging', { saving: false });
        return;
      }
      finalize();
    },
    continueInput() { ui.closeSheet(); update('logging', { finished: false }); },
    confirmPartial() {
      ui.closeSheet();
      finalize();
    },
    discardDraft() { update('logging', { saveError: false, dirty: false }); ui.toast('warn', 'Повторная отправка черновика'); },
  };

  function hasUnwrittenSets() {
    const { logging } = state;
    if (!logging.active && logging.values) {
      // group session — check every participant
      return Object.keys(logging.values).some(cid => participantHasGap(cid));
    }
    return participantHasGap(logging.active);
  }
  function participantHasGap(clientId) {
    const session = DB.sessions.find(s => s.id === state.logging.sessionId);
    if (!session) return false;
    const participants = session.participants || [];
    const p = participants.find(x => x.clientId === clientId);
    const client = DB.client(clientId);
    const programName = client?.program || (p && p.program) || null;
    const exs = DB.programFor(programName);
    const vals = state.logging.values[clientId] || {};
    return exs.some(ex => (vals[ex.id] || []).filter(Boolean).length < ex.sets);
  }
  function finalize() {
    set({ logging: { ...initLogging(), finished: true } });
    ui.toast('', 'Тренировка завершена · записанное сохранено');
  }

  /* ── Attendance & charge (separate entities) ────────────────────────────── */

  const attendance = {
    mark(sessionId, clientId, value) {
      const key = sessionId + ':' + clientId;
      const attendance = { ...state.attendance, [key]: value };
      set({ attendance });
      if (value === 'present') ui.openSheet('charge', { sid: sessionId, cid: clientId });
      else ui.toast('warn', 'Отмечена неявка · списание не выполнено автоматически');
    },
    correct(sessionId, clientId) {
      const key = sessionId + ':' + clientId;
      const attendance = { ...state.attendance };
      delete attendance[key];
      set({ attendance });
      ui.toast('', 'Отметка посещения снята · история сохранена');
    },
    /** Idempotent: a repeated click never creates a second operation. */
    charge(sessionId, clientId, { reason = 'Проведённое занятие', amount = 1 } = {}) {
      const key = 'charge:' + sessionId + ':' + clientId;
      if (state.recorded[key]) {
        ui.closeSheet();
        ui.toast('warn', 'Уже списано · повторное нажатие не создало операцию');
        return;
      }
      const recorded = { ...state.recorded, [key]: true };
      const billing = {
        ...state.billing,
        unitTx: [{ id: 'u' + Date.now(), clientId, delta: -amount, date: DB.TODAY, reason, source: 'p1' }, ...state.billing.unitTx],
      };
      set({ recorded, billing });
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
    patch(p) { update('newSession', p); },
    toggleClient(id) {
      const ids = state.newSession.clientIds.includes(id)
        ? state.newSession.clientIds.filter(x => x !== id)
        : [...state.newSession.clientIds, id];
      update('newSession', { clientIds: ids });
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
      if (c.collisions().length && !c.collisionAck) { ui.toast('warn', 'Подтвердите пересечение'); return; }
      ui.closeSheet();
      ui.toast('', 'Занятие создано · клиент увидит предложение времени');
      set({ newSession: { ...state.newSession, step: 0, clientIds: [], collisionAck: false } });
    },
  };

  /* ── Sessions: cancel / attendance reset ────────────────────────────────── */

  const sessions = {
    cancel(sessionId) {
      DB.sessions.forEach(s => { if (s.id === sessionId) s.status = 'cancelled'; });
      ui.closeSheet();
      ui.toast('warn', 'Запись отменена · списание не выполнено автоматически');
    },
  };

  return { get, set, update, silent, subscribe, commit, nav, ui, reschedule, logging, attendance, billing, invite, newSession, sessions, hasUnwrittenSets, participantHasGap };
})();
