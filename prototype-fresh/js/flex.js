const Flex = (() => {
  const hasWindow = typeof window !== 'undefined';
  const norm = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[-‐‑–—]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = (v) => norm(v).split(/[^a-zа-я0-9]+/).filter(Boolean);
  const prefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

  function matches(query, name) {
    const q = words(query);
    if (!q.length) return true;
    const n = words(name);
    return q.every(w => n.some(x => x.startsWith(w) || prefix(x, w) >= Math.min(4, w.length)));
  }

  function similar(query, list) {
    const q = words(query).filter(w => w.length >= 3);
    if (!q.length) return [];
    return list.filter(item => q.some(w => words(item.name).some(x => prefix(x, w) >= Math.min(4, w.length))));
  }

  function filter(value) {
    const items = [...document.querySelectorAll('[data-ex-item]')];
    let shown = 0;
    items.forEach(li => {
      const ok = matches(value, li.dataset.search);
      li.hidden = !ok;
      if (ok) shown++;
    });
    const clean = value.trim();
    const exact = items.some(li => norm(li.dataset.name) === norm(clean));
    const create = document.querySelector('.expick__create');
    if (create) {
      create.hidden = !clean || exact;
      create.classList.toggle('is-quiet', shown > 0);
      const label = create.querySelector('[data-ex-new]');
      if (label) label.textContent = clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    const similarNote = document.querySelector('[data-ex-similar]');
    if (similarNote) similarNote.hidden = !clean || exact || !shown;
    const none = document.querySelector('[data-ex-none]');
    if (none) none.hidden = shown > 0 || !clean;
  }

  function choose(spec) {
    const sheet = Store.get().sheet;
    if (!sheet || sheet.id !== 'exPick') return;
    const { mode, cid, ex } = sheet.data;
    Store.ui.closeSheet();
    const id = mode === 'replace' ? Store.logging.replaceExercise(cid, ex, spec) : Store.logging.addExercise(cid, spec);
    if (id && typeof Workout !== 'undefined') { Workout.setFocus(cid, id); return; }
    if (hasWindow) requestAnimationFrame(() => {
      const cards = document.querySelectorAll('.session-journal .excard');
      const target = [...cards].find(card => card.querySelector('.excard__name')?.textContent === Store.logging.exercises(cid).find(e => e.name.toLowerCase() === spec.name.toLowerCase())?.name);
      target?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      target?.classList.add('is-new');
    });
  }

  function create() {
    const input = hasWindow ? document.getElementById('ex-search') : null;
    const raw = (input?.value || '').trim().replace(/\s+/g, ' ');
    if (!raw) { input?.focus(); return; }
    choose({ name: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }

  if (hasWindow) {
    document.addEventListener('input', (event) => {
      if (event.target.matches('[data-ex-search]')) filter(event.target.value);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('[data-ex-search]')) return;
      event.preventDefault();
      const first = [...document.querySelectorAll('[data-ex-item]')].find(li => !li.hidden)?.querySelector('button:not([disabled])');
      if (first) first.click();
      else if (event.target.value.trim()) create();
    });
    let lastSheet = null;
    Store.subscribe((st) => {
      const key = st.sheet?.id === 'exPick' ? JSON.stringify(st.sheet.data) : null;
      if (key && key !== lastSheet) requestAnimationFrame(() => document.getElementById('ex-search')?.focus({ preventScroll: true }));
      lastSheet = key;
    });
  }

  return { matches, similar, filter, choose, create };
})();
