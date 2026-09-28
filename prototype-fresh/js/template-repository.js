/* Saved templates are applied before Store restores sessions. Programme keys
   retain old versions on rename, so already assigned sessions remain valid. */
const TemplateRepository = (() => {
  const KEY = 'trainer-prototype:templates:v1';
  const DRAFT = 'trainer-prototype:template-draft:v1';
  const FAVORITES = 'trainer-prototype:exercise-favorites:v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
  const safeName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !['__proto__', 'prototype', 'constructor'].includes(value);
  let error = '';
  let saved = { version: 1, items: [], archives: [] };
  let favorites = [];
  const validExercise = e => e && safeName(e.name) && typeof e.id === 'string' && Number.isInteger(e.sets) && e.sets >= 1 && e.sets <= 20 && typeof e.reps === 'string' && /^\d{1,4}(?:[–-]\d{1,4})?(?: сек)?$/.test(e.reps) && Number.isFinite(e.target) && e.target >= 0 && e.target <= 1000 && Number.isInteger(e.rest) && e.rest >= 0 && e.rest <= 600 && ['сек', 'повт'].includes(e.unit);
  const validList = list => Array.isArray(list) && list.length > 0 && list.length <= 50 && list.every(validExercise);
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data?.version === 1 && Array.isArray(data.items) && Array.isArray(data.archives)) {
      const ids = new Set(), names = new Set();
      saved.items = data.items.filter(t => {
        if (!t || typeof t.id !== 'string' || !safeName(t.name) || !safeName(t.program) || !validList(t.exercises) || ids.has(t.id) || names.has(key(t.name))) return false;
        ids.add(t.id); names.add(key(t.name)); return true;
      }).slice(0, 100);
      saved.archives = data.archives.filter(t => t && safeName(t.program) && validList(t.exercises));
    }
    const storedFavorites = JSON.parse(localStorage.getItem(FAVORITES));
    if (Array.isArray(storedFavorites)) favorites = storedFavorites.filter(safeName);
  } catch { /* Invalid storage leaves the built-in catalogue available. */ }

  function apply() {
    saved.archives.forEach(t => { DB.programs[t.program] = clone(t.exercises); });
    saved.items.forEach(t => {
      const template = { id: t.id, name: t.name, program: t.program, description: t.description || '', meta: `${t.exercises.length} ${DB.plural(t.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}`, uses: t.uses || 0, custom: true };
      const index = DB.templates.findIndex(item => item.id === t.id);
      if (index < 0) DB.templates.push(template); else DB.templates[index] = template;
      DB.programs[t.program] = clone(t.exercises);
    });
  }
  apply();

  function persist(storageKey, value) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); error = ''; return true; }
    catch { error = 'Не удалось сохранить в браузере. Освободите место и попробуйте ещё раз.'; return false; }
  }
  function save(draft) {
    const name = String(draft.name || '').trim().replace(/\s+/g, ' ');
    if (!safeName(name)) return { error: 'Введите название шаблона (до 80 символов).', field: 'name' };
    const original = DB.templates.find(t => t.id === draft.id);
    if (DB.templates.some(t => t.id !== draft.id && key(t.name) === key(name))) return { error: 'Шаблон с таким названием уже есть. Выберите другое.', field: 'name' };
    if (Object.hasOwn(DB.programs, name) && name !== original?.program) return { error: 'Это название уже используется программой. Выберите другое.', field: 'name' };
    if (!draft.exercises?.length) return { error: 'Добавьте хотя бы одно упражнение.' };
    if (draft.exercises.length > 50) return { error: 'В один шаблон можно добавить до 50 упражнений.' };
    const exercises = [];
    for (const [i, e] of draft.exercises.entries()) {
      const sets = Number(e.sets), target = Number(String(e.target || '0').replace(',', '.')), rest = Number(e.rest);
      const reps = String(e.reps || '').trim().replace(/\s*сек\s*$/, '').replace(/\s/g, '').replace('-', '–');
      const range = reps.split('–').map(Number);
      const out = { id: `e${i + 1}`, name: e.name, sets, reps: reps + (e.unit === 'сек' ? ' сек' : ''), target, rest, unit: e.unit, prev: { kg: null, reps: null }, pr: 0 };
      if (!validExercise(out) || range.some(n => n < 1 || n > (e.unit === 'сек' ? 3600 : 999)) || (range.length > 1 && range[0] > range[1])) return { error: `Проверьте упражнение ${i + 1}: 1–20 подходов, повторы или время больше нуля, вес 0–1000 кг, отдых 0–600 сек.`, exercise: i };
      exercises.push(out);
    }
    if (!original && saved.items.length >= 100) return { error: 'Можно сохранить до 100 шаблонов.' };
    const id = original?.id || `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const item = { id, name, program: name, description: String(draft.description || '').trim().slice(0, 400), exercises, uses: original?.uses || 0 };
    const next = clone(saved);
    if (original && original.program !== name) {
      next.archives = next.archives.filter(t => t.program !== original.program);
      next.archives.push({ program: original.program, exercises: clone(DB.programFor(original.program)).map(e => ({ ...e, rest: e.rest ?? 90, unit: e.unit || (/сек/.test(e.reps) ? 'сек' : 'повт') })) });
    }
    next.items = next.items.filter(t => t.id !== id).concat(item);
    if (!persist(KEY, next)) return { error };
    saved = next; apply(); clearDraft();
    return { id };
  }
  function readDraft() {
    try { const d = JSON.parse(localStorage.getItem(DRAFT)); return d && typeof d.name === 'string' && Array.isArray(d.exercises) && d.exercises.length <= 50 && d.exercises.every(e => e && safeName(e.name) && ['сек','повт'].includes(e.unit)) ? d : null; } catch { return null; }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT); } catch { /* Saving the template already succeeded. */ } }
  function toggleFavorite(name) {
    const next = favorites.includes(name) ? favorites.filter(n => n !== name) : [...favorites, name];
    if (!persist(FAVORITES, next)) return false;
    favorites = next; return true;
  }
  return { save, readDraft, writeDraft: draft => persist(DRAFT, draft), clearDraft, toggleFavorite, isFavorite: name => favorites.includes(name), error: () => error };
})();
