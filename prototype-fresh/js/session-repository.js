/* Local prototype appointments. No server, notifications or cross-tab merging.
   A write succeeds before DB is mutated; a stale tab cannot replace newer data. */
const SessionRepository = (() => {
  const KEY = 'trainer-prototype:appointments:v1';
  const initialClientIds = new Set(DB.clients.map(c => c.id));
  let readVersion = null, error = null;
  const clone = v => JSON.parse(JSON.stringify(v));
  const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const endTime = v => time(v) || v === '24:00';
  const date = v => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const parsed = new Date(v + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  };
  const interval = v => v && date(v.date) && time(v.start) && endTime(v.end) && v.start < v.end;
  function valid(record) {
    if (!record || record.version !== 1 || !Array.isArray(record.sessions) || !Array.isArray(record.clients)) return false;
    const ids = new Set(initialClientIds);
    for (const c of record.clients) {
      if (!c || typeof c.id !== 'string' || !c.id.startsWith('client-') || typeof c.name !== 'string' || typeof c.short !== 'string' || typeof c.initials !== 'string' || !date(c.joined)) return false;
      if (ids.has(c.id)) return false;
      ids.add(c.id);
    }
    const sessions = new Set(), requests = new Set();
    for (const s of record.sessions) {
      if (!s || typeof s.id !== 'string' || sessions.has(s.id) || !interval(s) || !['personal', 'group'].includes(s.kind)
        || !['confirmed', 'proposed', 'cancelled'].includes(s.status) || !Array.isArray(s.participants) || !s.participants.length) return false;
      sessions.add(s.id);
      if (s.kind === 'personal' && !ids.has(s.clientId)) return false;
      const participants = new Set();
      for (const p of s.participants) {
        if (!ids.has(p.clientId) || participants.has(p.clientId) || !['confirmed', 'pending', 'cancelled'].includes(p.reply)) return false;
        participants.add(p.clientId);
      }
      if (s.request) {
        const r = s.request;
        if (typeof r.id !== 'string' || requests.has(r.id) || r.sessionId !== s.id || !ids.has(r.clientId) || !interval(r.from) || !interval(r.to)
          || (r.counter && !interval(r.counter)) || !['pending', 'counter', 'accepted', 'declined', 'withdrawn'].includes(r.state)
          || !['client', 'trainer'].includes(r.author) || ![null, 'client', 'trainer'].includes(r.awaiting)
          || (r.history && (!Array.isArray(r.history) || r.history.some(h => typeof h.at !== 'string' || typeof h.text !== 'string')))) return false;
        requests.add(r.id);
      }
    }
    return true;
  }
  try {
    readVersion = localStorage.getItem(KEY);
    if (readVersion) {
      const saved = JSON.parse(readVersion);
      if (!valid(saved)) throw Error('format');
      DB.clients.push(...saved.clients);
      DB.sessions.splice(0, DB.sessions.length, ...saved.sessions);
    }
  } catch (e) {
    error = 'Не удалось прочитать локальное расписание. Показаны демоданные; сохранение заблокировано, прежние данные не перезаписаны.';
  }
  function commit(sessions) {
    if (error?.startsWith('Не удалось прочитать')) return false;
    const record = { version: 1, sessions, clients: DB.clients.filter(c => !initialClientIds.has(c.id)) };
    if (!valid(record)) { error = 'Не удалось проверить запись. Расписание не изменено.'; return false; }
    try {
      if (localStorage.getItem(KEY) !== readVersion) {
        error = 'Расписание изменилось в другой вкладке. Перезагрузите страницу перед новым действием.';
        return false;
      }
      const serialized = JSON.stringify(record);
      localStorage.setItem(KEY, serialized);
      readVersion = serialized;
      DB.sessions.splice(0, DB.sessions.length, ...clone(sessions));
      error = null;
      return true;
    } catch (e) {
      error = 'Не удалось сохранить расписание в этом браузере. Запись не изменена; повторите после освобождения места.';
      return false;
    }
  }
  return {
    error: () => error,
    upsert(session) {
      const exists = DB.sessions.some(s => s.id === session.id);
      return commit(exists ? DB.sessions.map(s => s.id === session.id ? session : s) : [...DB.sessions, session]);
    },
    validDate: date,
    validTime: time,
  };
})();
