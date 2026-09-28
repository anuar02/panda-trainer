const Workout = (() => {
  const hasWindow = typeof window !== 'undefined';
  const focus = {};
  const rest = {};
  const restLen = {};
  const started = new Set();
  let timer = null;

  const valid = v => v && Number.isFinite(v.kg) && v.kg >= 0 && Number.isSafeInteger(v.reps) && v.reps > 0;
  const now = () => Date.now();
  const bodyweight = ex => ex?.prev?.kg === 0;
  const clock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  function openSets(ex, arr) {
    return Array.from({ length: ex.sets }, (_, i) => i).filter(i => !valid(arr[i]));
  }

  function current(cid, exs, values) {
    const usable = exs.filter(e => !(e.skipped && e.replacedBy && !(values[e.id] || []).some(Boolean)));
    const chosen = usable.find(e => e.id === focus[cid]);
    if (chosen) return chosen;
    return usable.find(e => !e.skipped && openSets(e, values[e.id] || []).length) || null;
  }

  function setFocus(cid, exId) {
    focus[cid] = exId;
    Store.commit();
    if (hasWindow) requestAnimationFrame(() => {
      const card = document.querySelector('.wfocus');
      const body = card?.closest('.screen__body');
      if (body) body.scrollTo({ top: Math.max(0, card.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      card?.querySelector('.wfocus__name')?.focus({ preventScroll: true });
    });
  }

  function reveal() {
    if (!hasWindow) return;
    const target = document.querySelector('.wfocus [data-act="workout.save"]') || document.querySelector('.wfocus [data-act="log.finish"]');
    const body = target?.closest('.screen__body');
    if (!body) return;
    const gap = target.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 12;
    if (gap > 0) body.scrollBy({ top: gap, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function prefill(cid, ex, si, lg) {
    const arr = lg.values[cid]?.[ex.id] || [];
    const draft = lg.drafts[cid]?.[ex.id]?.[si];
    if (draft && (String(draft.kg ?? '') !== '' || String(draft.reps ?? '') !== '')) return { kg: String(draft.kg ?? ''), reps: String(draft.reps ?? ''), source: 'черновик', draft: true };
    const before = arr.slice(0, si).map((v, i) => [v, i]).filter(([v]) => valid(v)).at(-1);
    if (before) return { kg: DB.fmtNumber(before[0].kg), reps: String(before[0].reps), source: `как подход ${before[1] + 1}` };
    if (ex.prev && ex.prev.reps > 0) return { kg: DB.fmtNumber(ex.prev.kg ?? 0), reps: String(ex.prev.reps), source: 'как в прошлый раз' };
    const reps = parseInt(ex.reps, 10);
    if (reps > 0) return { kg: ex.target ? DB.fmtNumber(ex.target) : '', reps: String(reps), source: 'по плану' };
    return { kg: '', reps: '', source: 'первый раз · введите значения' };
  }

  function restOf(cid) {
    const r = rest[cid];
    if (!r) return null;
    const left = Math.ceil((r.until - now()) / 1000);
    return { ...r, left: Math.max(0, left), over: Math.max(0, -left), done: left <= 0, label: left > 0 ? clock(left) : `+${clock(-left)}` };
  }

  function lengthFor(exId, ex) {
    return restLen[exId] || (bodyweight(ex) ? 60 : 90);
  }

  function startRest(cid, exId, ex) {
    const total = lengthFor(exId, ex);
    rest[cid] = { exId, total, until: now() + total * 1000, buzzed: false };
    tick();
  }

  function addRest(cid, by) {
    const r = rest[cid];
    if (!r) return;
    const left = Math.max(5, Math.ceil((r.until - now()) / 1000) + by);
    r.until = now() + left * 1000;
    r.total = Math.max(left, Math.min(600, Math.max(15, r.total + by)));
    restLen[r.exId] = r.total;
    r.buzzed = false;
    Store.commit();
    tick();
  }

  function skipRest(cid) {
    delete rest[cid];
    Store.commit();
  }

  function paint() {
    if (!hasWindow) return;
    for (const cid of Object.keys(rest)) {
      const r = restOf(cid);
      document.querySelectorAll(`[data-rest-left="${cid}"]`).forEach(el => { el.textContent = r.label; });
      document.querySelectorAll(`[data-rest-bar="${cid}"]`).forEach(el => { el.style.setProperty('--p', `${Math.min(100, 100 - r.left / r.total * 100)}%`); });
      if (r.done && !rest[cid].buzzed) {
        rest[cid].buzzed = true;
        try { navigator.vibrate?.([90, 60, 90]); } catch (_) { }
        Store.commit();
      }
    }
  }

  function tick() {
    if (!hasWindow) return;
    if (!Object.keys(rest).length) { clearInterval(timer); timer = null; return; }
    if (!timer) timer = setInterval(() => { if (!Object.keys(rest).length) { clearInterval(timer); timer = null; } else paint(); }, 500);
    paint();
  }

  function count(values) {
    let n = 0;
    for (const arr of Object.values(values || {})) for (const v of arr || []) if (valid(v)) n++;
    return n;
  }

  function afterAction(name, before, after) {
    const lg = after.logging;
    if (!lg || lg.finished || before.logging?.sessionId !== lg.sessionId) return;
    const cid = lg.active;
    const was = before.logging.values?.[cid] || {};
    const is = lg.values?.[cid] || {};
    if (count(is) <= count(was)) return;
    const exs = Store.logging.exercises(cid);
    const changed = exs.find(e => (is[e.id] || []).filter(valid).length > (was[e.id] || []).filter(valid).length);
    if (!changed) return;
    started.clear();
    if (focus[cid] === changed.id && !openSets(changed, is[changed.id] || []).length) delete focus[cid];
    const remaining = exs.some(e => !e.skipped && openSets(e, is[e.id] || []).length);
    if (remaining) startRest(cid, changed.id, changed);
    else delete rest[cid];
    Store.commit();
  }

  function touch(key) {
    if (started.has(key)) return;
    started.add(key);
    Store.field.touchStart('inline');
  }

  function parse(ex, kgText, repsText) {
    const kgRaw = String(kgText ?? '').trim().replace(',', '.');
    const repsRaw = String(repsText ?? '').trim();
    const kg = bodyweight(ex) ? 0 : Number(kgRaw);
    const reps = Number(repsRaw);
    if ((!bodyweight(ex) && !/^\d+(\.\d+)?$/.test(kgRaw)) || !/^\d+$/.test(repsRaw) || !valid({ kg, reps })) return null;
    return { kg, reps };
  }

  function save(cid, exId, si) {
    const ex = Store.logging.exercises(cid).find(e => e.id === exId);
    if (!ex || !hasWindow) return false;
    const box = document.querySelector(`[data-composer="${exId}:${si}"]`);
    const value = parse(ex, box?.querySelector('[data-wfield="kg"]')?.value, box?.querySelector('[data-wfield="reps"]')?.value);
    const error = box?.querySelector('[data-composer-error]');
    if (!value) {
      if (error) error.textContent = bodyweight(ex) ? 'Укажите целое число больше 0.' : 'Укажите вес от 0 кг и целое число повторов больше 0.';
      box?.querySelector('input')?.focus();
      return false;
    }
    return Store.logging.record(cid, exId, si, value);
  }

  function step(button) {
    const box = button.closest('[data-composer]');
    const input = box?.querySelector(`[data-wfield="${button.dataset.wstep}"]`);
    if (!input) return;
    touch(box.dataset.composer);
    const by = Number(button.dataset.by);
    const base = Number(String(input.value).trim().replace(',', '.'));
    const start = Number.isFinite(base) && input.value.trim() !== '' ? base : 0;
    const min = button.dataset.wstep === 'reps' ? 1 : 0;
    input.value = DB.fmtNumber(Math.max(min, Math.round((start + by) * 100) / 100));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    box.querySelector('[data-composer-error]').textContent = '';
  }

  if (hasWindow) {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-wstep]');
      if (button) { event.preventDefault(); step(button); }
    });
    document.addEventListener('input', (event) => {
      const box = event.target.closest('[data-composer]');
      if (!box || !event.target.matches('[data-wfield]')) return;
      touch(box.dataset.composer);
      const kg = box.querySelector('[data-wfield="kg"]')?.value;
      const reps = box.querySelector('[data-wfield="reps"]')?.value;
      const preview = box.querySelector('[data-composer-preview]');
      if (preview) preview.textContent = kg === undefined ? `${reps || '—'}` : `${kg || '—'} × ${reps || '—'}`;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || !event.target.matches('[data-composer] [data-wfield]')) return;
      event.preventDefault();
      event.target.closest('[data-composer]').querySelector('[data-act="workout.save"]')?.click();
    });
  }

  return { reveal, current, setFocus, prefill, restOf, addRest, skipRest, afterAction, save, parse, openSets, clock, tick };
})();
