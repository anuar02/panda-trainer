/* Shared, deterministic demo model. No clock, storage, network or attendance mutations. */
(function (root) {
  const initial = {
    date: '2026-09-17', now: 17 * 60 + 35, request: 'pending',
    sessions: [
      { id: 'a', name: 'Айгерим', start: 1080, end: 1140, kind: 'single', workout: 'Низ А', confirmed: true },
      { id: 'b', name: 'Арман', start: 1110, end: 1170, kind: 'single', workout: 'Верх Б' },
      { id: 'c', name: 'Мини-группа', start: 1200, end: 1260, kind: 'group', participants: [
        { name: 'Алия', response: 'Подтвердила', attendance: 'Не отмечено' },
        { name: 'Дана', response: 'Ждёт ответа', attendance: 'Не отмечено' },
        { name: 'Мади', response: 'Отменил', attendance: 'Не отмечено' }
      ] }
    ]
  };
  const fresh = () => JSON.parse(JSON.stringify(initial));
  const time = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const ordered = state => [...state.sessions].sort((a, b) => a.start - b.start);
  function overlaps(state) {
    const result = [], sessions = ordered(state);
    sessions.forEach((a, i) => sessions.slice(i + 1).forEach(b => {
      const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
      if (end > start) result.push({ ids: [a.id, b.id], start, end, minutes: end - start });
    }));
    return result;
  }
  function gaps(state) {
    const sessions = ordered(state), result = [];
    let cursor = null;
    for (const s of sessions) {
      if (cursor !== null && s.start > cursor) result.push({ start: cursor, end: s.start, minutes: s.start - cursor });
      cursor = Math.max(cursor ?? s.end, s.end);
    }
    return result;
  }
  function resolve(state, decision) {
    if (state.request !== 'pending' || !['accepted', 'declined'].includes(decision)) return false;
    if (decision === 'accepted') Object.assign(state.sessions.find(s => s.id === 'a'), { start: 1260, end: 1320 });
    state.request = decision;
    return true;
  }
  const model = { fresh, time, ordered, overlaps, gaps, resolve };
  if (typeof module !== 'undefined') module.exports = model;
  else root.TodayModel = model;
})(typeof window !== 'undefined' ? window : globalThis);
