const VoiceParse = (() => {
  const UNITS = {
    ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
    десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
    семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  };
  const TENS = { двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 };
  const HUNDREDS = { сто: 100, двести: 200, триста: 300, четыреста: 400 };
  const STOP = ['подход', 'повтор', 'разa', 'разо', 'секунд', 'кило', 'килограмм', 'сделал', 'сделала', 'делаем', 'давай', 'теперь', 'потом', 'затем', 'дальше', 'следующ', 'вес', 'весом', 'запиш', 'записать', 'номер', 'первый', 'второй', 'третий', 'четвертый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'работ', 'рабоч', 'легко', 'тяжело', 'отлично', 'хорошо', 'нормально', 'тоже', 'было', 'будет', 'просто'];
  const ORDINALS = { первый: 1, второй: 2, третий: 3, четвертый: 4, пятый: 5, шестой: 6, седьмой: 7, восьмой: 8 };

  function wordsToDigits(text) {
    const out = [];
    const words = text.split(/\s+/).filter(Boolean);
    let acc = null;
    const flush = () => { if (acc !== null) { out.push(String(acc)); acc = null; } };
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w in HUNDREDS) { flush(); acc = HUNDREDS[w]; continue; }
      if (w in TENS) { if (acc !== null && acc % 100 !== 0) flush(); acc = (acc || 0) + TENS[w]; continue; }
      if (w in UNITS) { if (acc !== null && acc % 10 !== 0) flush(); acc = (acc || 0) + UNITS[w]; continue; }
      if (w === 'с' && words[i + 1]?.startsWith('половин')) {
        if (acc !== null) { acc += 0.5; i++; continue; }
        const last = out.length ? Number(out[out.length - 1]) : NaN;
        if (Number.isFinite(last)) { out[out.length - 1] = String(last + 0.5); i++; continue; }
      }
      if (w === 'полтора') { flush(); out.push('1.5'); continue; }
      flush();
      out.push(w);
    }
    flush();
    return out.join(' ');
  }

  function normalize(text) {
    const base = String(text || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/(\d)\s*[xх×*]\s*(\d)/g, '$1 на $2')
      .replace(/[«»"“”:;,!?()]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return wordsToDigits(base).replace(/(\d+) \.5\b/g, '$1.5').replace(/(\d)\s*[xх×*]\s*(\d)/g, '$1 на $2');
  }

  function splitSegments(text) {
    return String(text || '')
      .split(/[.;!?\n]+|\s(?:и\s)?(?:потом|затем|дальше|следующий)\s/i)
      .map(s => s.trim()).filter(Boolean);
  }

  const prefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  const tokens = (s) => s.split(/[^a-zа-я0-9]+/).filter(Boolean);

  function matchExercise(words, exercises) {
    let best = null, bestScore = 0;
    for (const ex of exercises) {
      const nameWords = tokens([ex.name, ...(ex.aliases || []), ...((typeof DB !== 'undefined' && DB.exerciseLibrary.find(e => e.name === ex.name)?.aliases) || [])].join(' ').toLowerCase().replace(/ё/g, 'е')).filter(w => w.length >= 3);
      let score = 0;
      for (const nw of nameWords) {
        const need = Math.min(nw.length, nw.length <= 4 ? nw.length : 4);
        if (words.some(w => w.length >= 3 && prefix(w, nw) >= need)) score += nw.length;
      }
      if (score > bestScore) { best = ex; bestScore = score; }
    }
    return best;
  }

  function matchParticipant(words, participants) {
    return participants.find(p => {
      const name = p.short.toLowerCase().replace(/ё/g, 'е');
      const stem = name.slice(0, Math.max(3, name.length - 1));
      return words.some(w => w.startsWith(stem));
    }) || null;
  }

  const cap = (v) => v.charAt(0).toUpperCase() + v.slice(1);
  const cleanName = (v) => v.replace(/\d+(?:\.\d+)?/g, ' ').replace(/\b(?:на|по|кг|раз|подход\S*)\b/g, ' ').replace(/\s+/g, ' ').trim();

  function parse(text, ctx) {
    const items = [];
    const pending = {};
    const planned = (cid, exId) => pending[`${cid}:${exId}`] || [];
    const lastValue = {};
    const lists = {};
    const library = ctx.library || [];
    const libraryPrev = ctx.libraryPrev || (() => null);
    const listFor = (cid) => (lists[cid] ||= ctx.exercises(cid).map(e => ({ ...e })));
    const valuesOf = (cid, exId) => (String(exId).startsWith('new:') ? [] : ctx.values(cid, exId));
    const active = (cid) => listFor(cid).filter(e => !e.skipped);
    const unitOf = (ex) => ex.unit || (ex.name === 'Планка' ? 'сек' : 'повт');

    function resolveNew(cid, phraseWords, fallback) {
      const lib = matchExercise(phraseWords, library);
      const name = lib ? lib.name : cap(fallback);
      const existing = listFor(cid).find(e => e.name.toLowerCase() === name.toLowerCase() && !e.skipped);
      if (existing) return { ex: existing, created: false, fromLibrary: Boolean(lib) };
      const bodyweight = Boolean(lib?.bodyweight);
      const ex = { id: `new:${cid}:${name}`, name, sets: 3, prev: libraryPrev(name) || { kg: bodyweight ? 0 : null, reps: null }, unit: lib?.unit, origin: 'added', bodyweight };
      return { ex, created: true, fromLibrary: Boolean(lib) };
    }

    let clientId = ctx.active;
    const lastEx = {};
    for (const raw of splitSegments(text)) {
      const noteMatch = raw.match(/^\s*(?:заметка|заметку|запиши заметку|комментарий|примечание)\s*[:,-]?\s*(.*)$/i);
      if (noteMatch) {
        if (noteMatch[1].trim()) items.push({ type: 'note', clientId, text: noteMatch[1].trim() });
        continue;
      }
      const lowered = raw.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”:;,!?()]/g, ' ').replace(/\s+/g, ' ').trim();
      const whoWords = tokens(lowered);
      const who = ctx.participants.length > 1 ? matchParticipant(whoWords, ctx.participants) : null;
      if (who) clientId = who.clientId;
      const withoutWho = who ? lowered.replace(new RegExp(`\\b${who.short.toLowerCase().slice(0, 3)}\\S*`), ' ').trim() : lowered;

      const skipMatch = withoutWho.match(/^(?:пропуска\S*|пропусти\S*|пропустим|убира\S*|убери\S*|убрать|без)\s+(.+)$/);
      if (skipMatch) {
        const ex = matchExercise(tokens(skipMatch[1]), active(clientId));
        if (!ex) { items.push({ type: 'error', clientId, text: raw, reason: `Не нашёл «${skipMatch[1]}» в тренировке` }); continue; }
        ex.skipped = true;
        items.push({ type: 'skip', clientId, exId: ex.id, exName: ex.name, text: raw });
        continue;
      }
      const swap = withoutWho.match(/^(?:вместо)\s+(.+?)\s+(?:делаем|делать|будем делать|будет|сделаем|давай|-|—)\s+(.+)$/)
        || withoutWho.match(/^(?:замени\S*|поменя\S*|меняем)\s+(.+?)\s+на\s+(.+)$/);
      if (swap) {
        const from = matchExercise(tokens(swap[1]), active(clientId));
        const toText = cleanName(swap[2]);
        if (!from || !toText) { items.push({ type: 'error', clientId, text: raw, reason: from ? 'Не понял, на что заменить' : `Не нашёл «${swap[1]}» в тренировке` }); continue; }
        const { ex: to, created, fromLibrary } = resolveNew(clientId, tokens(toText), toText);
        const done = valuesOf(clientId, from.id).filter(Boolean).length;
        from.skipped = true;
        if (created) {
          to.sets = Math.max(1, from.sets - done);
          to.origin = 'replaced';
          listFor(clientId).push(to);
        }
        items.push({ type: 'replace', clientId, exId: from.id, exName: from.name, toName: to.name, tempId: to.id, bodyweight: to.bodyweight, fromLibrary, text: raw });
        continue;
      }

      const repeatRe = /(?:еще\s+(?:один|одну|такой|раз)(?:\s+такой)?(?:\s+же)?|такой же|то же самое|повтори(?:ть)?|так же)/g;
      const repeat = repeatRe.test(withoutWho);
      const norm = normalize(withoutWho.replace(repeatRe, ' '));
      const words = tokens(norm);
      const exercises = active(clientId);
      const filled = (ex) => {
        const done = valuesOf(clientId, ex.id);
        const extra = planned(clientId, ex.id);
        return Array.from({ length: ex.sets }, (_, i) => Boolean(done[i]) || extra.includes(i));
      };
      const textWords = words.filter(w => !/^\d/.test(w));
      let ex = matchExercise(textWords, exercises);
      const unknown = ex ? [] : textWords.filter(w => /^[а-яa-z]{4,}$/.test(w) && !STOP.some(stop => w.startsWith(stop)));
      const hasNumbers = /\d/.test(norm);
      if (!ex && unknown.length && (hasNumbers || repeat)) {
        const { ex: created, created: isNew, fromLibrary } = resolveNew(clientId, unknown, unknown.join(' '));
        if (isNew) {
          listFor(clientId).push(created);
          items.push({ type: 'add', clientId, tempId: created.id, name: created.name, bodyweight: created.bodyweight, fromLibrary, text: raw });
        }
        ex = created;
      }
      if (!ex) {
        const recent = lastEx[clientId] && !lastEx[clientId].skipped ? lastEx[clientId] : null;
        if (recent && (repeat || filled(recent).some(f => !f))) ex = recent;
        else ex = exercises.find(e => filled(e).some(f => !f)) || null;
      }
      const ordinalWord = Object.keys(ORDINALS).find(w => new RegExp(`${w}\\s+подход`).test(norm));
      const ordinalRaw = ordinalWord ? null : norm.match(/(\d+)\s*(?:-?й|-?ой)?\s*подход|подход\s*(?:номер\s*)?(\d+)(?!\s*(?:на|по|кг|кило|\.\d|\d))/);
      const ordinal = ordinalRaw && Number(ordinalRaw[1] || ordinalRaw[2]) <= 30 ? ordinalRaw : null;

      if (!ex) {
        if (hasNumbers || repeat) items.push({ type: 'error', clientId, text: raw, reason: 'Не понял, к какому упражнению это относится' });
        else items.push({ type: 'note', clientId, text: raw });
        continue;
      }

      let value = null, hint = '';
      const key = `${clientId}:${ex.id}`;
      const doneArr = valuesOf(clientId, ex.id);
      const lastDone = [...doneArr].reverse().find(Boolean);
      const bodyweight = ex.prev?.kg === 0;
      let numbersText = norm;
      if (ordinal) numbersText = numbersText.replace(ordinal[0], ' ');
      const pair = numbersText.match(/(\d+(?:\.\d+)?)\s*(?:кг|кило\S*|килограмм\S*)?\s*(?:на|по|раз по)\s*(\d+)/);
      const single = numbersText.match(/(\d+(?:\.\d+)?)\s*(повтор\S*|раз\S*|сек\S*|секунд\S*|кг|кило\S*|килограмм\S*)?/);
      if (pair) {
        value = { kg: bodyweight ? 0 : Number(pair[1]), reps: Number(pair[2]) };
      } else if (single && single[1] !== undefined) {
        const n = Number(single[1]);
        const unit = single[2] || '';
        if (bodyweight) value = { kg: 0, reps: Math.round(n) };
        else if (/^(кг|кило|килограмм)/.test(unit)) {
          value = { kg: n, reps: lastValue[key]?.reps || lastDone?.reps || ex.prev?.reps };
          hint = 'повторы как в прошлом подходе';
        } else {
          value = { kg: lastValue[key]?.kg ?? lastDone?.kg ?? ex.prev?.kg, reps: Math.round(n) };
          hint = 'вес как в прошлом подходе';
        }
      } else if (repeat) {
        const base = lastValue[key] || lastDone || ex.prev || {};
        value = { kg: base.kg, reps: base.reps };
        hint = lastValue[key] || lastDone ? 'как предыдущий подход' : 'как в прошлый раз';
      }

      if (!value) {
        items.push({ type: 'note', clientId, text: raw, exName: ex.name });
        continue;
      }
      if (!(value.kg >= 0) || !(value.reps > 0) || !Number.isInteger(value.reps) || value.kg > 1000 || value.reps > 1000) {
        items.push({ type: 'error', clientId, text: raw, reason: value.kg == null ? `Назовите вес для «${ex.name}»` : 'Проверьте вес и повторы' });
        continue;
      }
      const flags = filled(ex);
      const wanted = ordinal ? Number(ordinal[1] || ordinal[2]) : ordinalWord ? ORDINALS[ordinalWord] : null;
      let setId = wanted ? wanted - 1 : flags.findIndex(f => !f);
      let extra = false;
      if (setId < 0) setId = ex.sets;
      if (setId === ex.sets) { extra = true; ex.sets += 1; }
      else if (setId > ex.sets) {
        items.push({ type: 'error', clientId, text: raw, reason: `В «${ex.name}» сейчас ${ex.sets} подх.` });
        continue;
      }
      pending[key] = [...planned(clientId, ex.id), setId];
      lastValue[key] = value;
      lastEx[clientId] = ex;
      items.push({ type: 'set', clientId, exId: ex.id, exName: ex.name, setId, kg: value.kg, reps: value.reps, unit: unitOf(ex), replaces: Boolean(doneArr[setId]), extra, hint, text: raw });
    }
    return items;
  }

  return { parse, normalize, splitSegments };
})();

const Voice = (() => {
  const hasWindow = typeof window !== 'undefined';
  const SR = hasWindow ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const state = { items: [], listening: false, interim: '', error: '', heard: [], demo: false };
  let rec = null;
  let wantListening = false;
  let demoTimer = null;

  const supported = () => Boolean(SR);

  function context() {
    const st = Store.get();
    const lg = st.logging;
    return {
      active: lg.active,
      participants: Object.keys(lg.plans).filter(cid => Store.logging.eligible(cid)).map(cid => ({ clientId: cid, short: DB.client(cid)?.short || '' })),
      exercises: (cid) => Store.logging.exercises(cid),
      values: (cid, exId) => lg.values[cid]?.[exId] || [],
      library: Store.logging.library(),
      libraryPrev: (name) => DB.libraryPrev(name),
    };
  }

  function refresh() { Store.set({}); }

  function reindex() {
    const ctx = context();
    const text = state.heard.join('. ');
    const parsed = text ? VoiceParse.parse(text, ctx) : [];
    const removed = new Set(state.removed || []);
    const kept = parsed.map((item, i) => ({ ...item, key: i })).filter(item => !removed.has(item.key));
    const created = new Set(kept.filter(i => i.type === 'add' || i.type === 'replace').map(i => i.tempId));
    state.items = kept.filter(item => item.type !== 'set' || !String(item.exId).startsWith('new:') || created.has(item.exId));
  }

  function hear(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    state.heard.push(clean);
    reindex();
    Store.field.voiceEvent('heard',{text:clean,items:JSON.parse(JSON.stringify(state.items))});
    if (hold.phase) renderHoldList();
    refresh();
  }

  function setInterim(text) {
    state.interim = text;
    if (!hasWindow) return;
    document.querySelectorAll('[data-voice-interim]').forEach(el => {
      el.textContent = text || el.dataset.voiceEmpty || (state.listening ? 'Слушаю…' : '');
      el.classList.toggle('is-live', Boolean(text));
    });
  }

  function start() {
    Store.field.voiceStart();
    if (!SR) { Store.field.voiceEvent('error',{error:'unsupported'}); state.error = 'Этот браузер не поддерживает распознавание речи. Напечатайте фразу или попробуйте Chrome / Safari.'; refresh(); return; }
    stopDemo();
    wantListening = true;
    state.error = '';
    try {
      rec = new SR();
      rec.lang = 'ru-RU';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) hear(r[0].transcript);
          else interim += r[0].transcript;
        }
        setInterim(interim);
      };
      rec.onerror = (event) => {
        Store.field.voiceEvent('error',{error:event.error});
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          wantListening = false;
          state.error = 'Нет доступа к микрофону. Разрешите его в настройках браузера или напечатайте фразу.';
        } else if (event.error === 'network') {
          wantListening = false;
          state.error = 'Распознавание недоступно без сети. Напечатайте фразу.';
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          state.error = 'Не удалось распознать речь. Попробуйте ещё раз.';
        }
        if (hold.phase === 'listening' && state.error) showHold('error');
      };
      rec.onend = () => {
        if (wantListening) { try { rec.start(); return; } catch (_) { wantListening = false; } }
        state.listening = false;
        setInterim('');
        if (hold.phase === 'thinking') { finishHold(); return; }
        refresh();
      };
      rec.start();
      state.listening = true;
      refresh();
    } catch (_) {
      wantListening = false;
      state.listening = false;
      Store.field.voiceEvent('error',{error:'start-failed'});
      state.error = 'Микрофон сейчас недоступен. Напечатайте фразу.';
      refresh();
    }
  }

  function stop(render = true) {
    Store.field.voiceEvent('release');
    wantListening = false;
    stopDemo();
    if (rec) { try { rec.stop(); } catch (_) { } }
    state.listening = false;
    state.interim = '';
    if (render) refresh();
  }

  function toggle() { state.listening ? stop() : start(); }

  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
    if (state.demo) { state.demo = false; state.listening = false; }
  }

  function demo(phrase) {
    Store.field.voiceStart('demo');
    if (state.listening && !state.demo) stop(false);
    stopDemo();
    const reduce = hasWindow && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { hear(phrase); return; }
    state.demo = true;
    state.listening = true;
    refresh();
    let i = 0;
    demoTimer = setInterval(() => {
      i += 2;
      setInterim(phrase.slice(0, i));
      if (i >= phrase.length) {
        clearInterval(demoTimer);
        demoTimer = null;
        setTimeout(() => {
          state.demo = false;
          state.listening = false;
          state.interim = '';
          hear(phrase);
        }, 250);
      }
    }, 38);
  }

  function submitText() {
    const input = hasWindow ? document.getElementById('voice-text') : null;
    const value = input?.value || '';
    if (!value.trim()) { input?.focus(); return; }
    Store.field.voiceStart('text');
    Store.field.voiceEvent('edit');
    hear(value);
    requestAnimationFrame(() => { const next = document.getElementById('voice-text'); if (next) { next.value = ''; next.focus(); } });
  }

  function remove(key) {
    Store.field.voiceEvent('remove',{key:Number(key),item:state.items.find(i=>i.key===Number(key))});
    state.removed = [...(state.removed || []), Number(key)];
    reindex();
    refresh();
  }

  function reset() {
    Store.field.voiceCancel();
    stop(false);
    state.fromHold = false;
    state.items = [];
    state.heard = [];
    state.removed = [];
    state.error = '';
    state.interim = '';
  }

  function open() {
    reset();
    Store.ui.openSheet('voice');
  }

  const hold = { phase: null, startedAt: 0, timer: null, lastInterim: '', kind: null };
  const plural = (n, forms) => (typeof DB !== 'undefined' ? DB.plural(n, forms) : forms[2]);

  function summary(item) {
    if (item.type === 'set') return `${item.exName} · ${item.kg ? `${DB.fmtNumber(item.kg)} × ${item.reps}` : `${item.reps} ${item.unit}`}`;
    if (item.type === 'note') return `Заметка: ${item.text}`;
    if (item.type === 'skip') return `Пропустить: ${item.exName}`;
    if (item.type === 'replace') return `${item.exName} → ${item.toName}`;
    if (item.type === 'add') return `+ ${item.name}`;
    return `Не понял: «${item.text}»`;
  }

  function holdCopy(kind, n = 0) {
    return {
      listening: { pose: 'clipboard', title: 'Слушаю', hint: 'Говорите, потом отпустите кнопку' },
      thinking: { pose: 'clipboard', title: 'Разбираю…', hint: '' },
      done: { pose: 'thumbs', title: `Понял: ${n} ${plural(n, ['запись', 'записи', 'записей'])}`, hint: 'Проверьте и подтвердите' },
      empty: { pose: 'sit', title: 'Ничего не слышно', hint: 'Удерживайте кнопку и говорите' },
      unsupported: { pose: 'sit', title: 'Голос недоступен в этом браузере', hint: 'Отпустите — откроется ввод текстом' },
      error: { pose: 'sit', title: 'Не получилось', hint: state.error || 'Попробуйте ещё раз' },
    }[kind];
  }

  function holdLayer() {
    const device = document.getElementById('device');
    let layer = device?.querySelector('.hold');
    if (!layer && device) {
      layer = document.createElement('div');
      layer.className = 'hold';
      layer.setAttribute('role', 'status');
      layer.setAttribute('aria-live', 'polite');
      device.appendChild(layer);
    }
    return layer;
  }

  function showHold(kind, n = 0) {
    const layer = holdLayer();
    if (!layer) return;
    const copy = holdCopy(kind, n);
    layer.classList.remove('is-leaving');
    layer.dataset.state = kind;
    const poseChanged = hold.kind === null || holdCopy(hold.kind)?.pose !== copy.pose;
    hold.kind = kind;
    if (poseChanged || !layer.querySelector('.hold__bubble')) {
      layer.innerHTML = `<div class="hold__glow"></div>
        <div class="hold__panda">${Store.preferences.calm() ? Icon.get('mic', { size: 56 }) : Mascot.render(copy.pose, 'inline')}</div>
        <div class="hold__bubble"><b class="hold__title"></b><p class="hold__text" data-voice-interim></p><div class="hold__bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><ul class="hold__list"></ul></div>`;
    }
    layer.querySelector('.hold__title').textContent = copy.title;
    const text = layer.querySelector('.hold__text');
    text.dataset.voiceEmpty = copy.hint;
    text.textContent = kind === 'listening' && state.interim ? state.interim : copy.hint;
    text.classList.toggle('is-live', kind === 'listening' && Boolean(state.interim));
    renderHoldList();
  }

  function renderHoldList() {
    const list = hasWindow ? document.querySelector('.hold__list') : null;
    if (!list) return;
    const items = state.items.slice(-3);
    list.innerHTML = items.map(item => `<li class="${item.type === 'error' ? 'is-error' : ''}">${UI.esc(summary(item))}</li>`).join('');
  }

  function hideHold(delay = 0) {
    clearTimeout(hold.timer);
    hold.timer = setTimeout(() => {
      const layer = document.querySelector('#device .hold');
      if (!layer) return;
      layer.classList.add('is-leaving');
      setTimeout(() => { if (layer.classList.contains('is-leaving')) layer.remove(); }, 260);
      hold.kind = null;
    }, delay);
  }

  function holdStart() {
    if (hold.phase || Store.get().sheet || Store.get().logging.finished) return;
    reset();
    hold.phase = 'listening';
    hold.startedAt = Date.now();
    Store.field.voiceStart();
    hold.lastInterim = '';
    document.documentElement.classList.add('is-voice-holding');
    try { navigator.vibrate?.(12); } catch (_) { }
    showHold(SR ? 'listening' : 'unsupported');
    if (SR) start();
  }

  function holdEnd(cancel = false) {
    if (hold.phase !== 'listening') return;
    document.documentElement.classList.remove('is-voice-holding');
    Store.field.voiceEvent('release',{cancel});
    const quick = Date.now() - hold.startedAt < 350;
    hold.lastInterim = state.interim;
    if (cancel) { hold.phase = null; stop(false); hideHold(); return; }
    if (!SR) { hold.phase = null; hideHold(); open(); return; }
    if (state.error && !state.heard.length) { hold.phase = null; stop(false); hideHold(1600); return; }
    if (quick && !state.heard.length && !state.interim) { hold.phase = null; stop(false); hideHold(); open(); return; }
    hold.phase = 'thinking';
    showHold('thinking');
    wantListening = false;
    if (rec) { try { rec.stop(); } catch (_) { } }
    clearTimeout(hold.timer);
    hold.timer = setTimeout(finishHold, 1800);
  }

  function finishHold() {
    if (hold.phase !== 'thinking') return;
    clearTimeout(hold.timer);
    if (!state.heard.length && hold.lastInterim) hear(hold.lastInterim);
    state.listening = false;
    state.interim = '';
    const n = state.items.length;
    if (!n) {
      hold.phase = 'done';
      showHold('empty');
      hideHold(1800);
      setTimeout(() => { hold.phase = null; }, 1800);
      return;
    }
    hold.phase = 'done';
    showHold('done', n);
    setTimeout(() => {
      hold.phase = null;
      hideHold();
      state.fromHold = true;
      Store.ui.openSheet('voice');
    }, 900);
  }

  function commit() {
    reindex();
    let sets = 0, notes = 0, changes = 0, failed = 0;
    const ids = {};
    for (const item of state.items) {
      if (item.type === 'skip') {
        if (Store.logging.skipExercise(item.clientId, item.exId, true)) changes++;
        else failed++;
      } else if (item.type === 'replace' || item.type === 'add') {
        const spec = { name: item.type === 'replace' ? item.toName : item.name, bodyweight: item.bodyweight };
        const id = item.type === 'replace' ? Store.logging.replaceExercise(item.clientId, item.exId, spec) : Store.logging.addExercise(item.clientId, spec);
        if (id) { ids[item.tempId] = id; changes++; }
        else failed++;
      } else if (item.type === 'set') {
        const exId = ids[item.exId] || item.exId;
        let ex = Store.logging.exercises(item.clientId).find(e => e.id === exId);
        while (ex && ex.sets <= item.setId && Store.logging.addSet(item.clientId, exId)) ex = Store.logging.exercises(item.clientId).find(e => e.id === exId);
        if (Store.logging.setValue(item.clientId, exId, item.setId, { kg: item.kg, reps: item.reps })) sets++;
        else failed++;
      } else if (item.type === 'note') {
        const text = item.exName ? `${item.exName}: ${item.text}` : item.text;
        if (Store.logging.addNote(item.clientId, text)) notes++;
        else failed++;
      }
    }
    Store.field.voiceFinish(sets,failed);
    reset();
    Store.ui.closeSheet();
    const parts = [];
    if (sets) parts.push(`${sets} ${DB.plural(sets, ['подход', 'подхода', 'подходов'])}`);
    if (notes) parts.push(`${notes} ${DB.plural(notes, ['заметка', 'заметки', 'заметок'])}`);
    if (changes) parts.push(`${changes} ${DB.plural(changes, ['изменение', 'изменения', 'изменений'])} упражнений`);
    if (failed) Store.ui.toast('warn', `Записано: ${parts.join(', ') || 'ничего'} · ${failed} не удалось, проверьте журнал`);
    else if (parts.length) Store.ui.toast('', `Записано голосом: ${parts.join(', ')}`);
  }

  function demoPhrases() {
    const ctx = context();
    const exs = ctx.exercises(ctx.active);
    const next = exs.find(e => Array.from({ length: e.sets }).some((_, i) => !ctx.values(ctx.active, e.id)[i])) || exs[0];
    if (!next) return ['Заметка: без программы, отработали технику'];
    const other = exs.find(e => e !== next && e.prev.kg > 0);
    const first = next.prev.kg ? `${next.name} ${DB.fmtNumber(next.prev.kg + 2.5)} на ${next.prev.reps}` : `${next.name} ${next.prev.reps + 5} секунд`;
    const list = [first, 'Ещё один такой же'];
    if (other) list.push(`Вместо «${other.name}» делаем жим гантелей сидя`);
    list.push('Бицепс 12 на 12');
    list.push('Заметка: левое колено уходит внутрь, следить за техникой');
    return list;
  }

  function itemHtml(item) {
    const { esc } = UI;
    const who = Object.keys(Store.get().logging.plans).length > 1 ? `<span class="vitem__who">${esc(DB.client(item.clientId)?.short || '')}</span>` : '';
    const remove = `<button class="vitem__x" data-act="voice.remove" data-key="${item.key}" aria-label="Убрать">${Icon.get('close', { size: 16, sw: 2.4 })}</button>`;
    if (item.type === 'set') {
      const val = item.kg ? `${DB.fmtNumber(item.kg)} кг × ${item.reps}` : `${item.reps} ${item.unit}`;
      return `<li class="vitem vitem--set">
        <span class="vitem__icon">${Icon.get('dumbbell', { size: 18 })}</span>
        <span class="vitem__main">${who}<b>${esc(item.exName)}</b><span class="vitem__meta">Подход ${item.setId + 1}${item.extra ? ' · сверх плана' : ''}${item.replaces ? ' · заменит записанный' : ''}${item.hint ? ' · ' + esc(item.hint) : ''}</span></span>
        <span class="vitem__val num">${val}</span>${remove}</li>`;
    }
    if (item.type === 'skip') {
      return `<li class="vitem vitem--flow">
        <span class="vitem__icon">${Icon.get('ban', { size: 18 })}</span>
        <span class="vitem__main">${who}<b>Пропустить</b><span class="vitem__meta">${esc(item.exName)}</span></span>${remove}</li>`;
    }
    if (item.type === 'replace') {
      return `<li class="vitem vitem--flow">
        <span class="vitem__icon">${Icon.get('swap', { size: 18 })}</span>
        <span class="vitem__main">${who}<b>Замена</b><span class="vitem__meta">${esc(item.exName)} → ${esc(item.toName)}${item.fromLibrary ? '' : ' · своё упражнение'}</span></span>${remove}</li>`;
    }
    if (item.type === 'add') {
      return `<li class="vitem vitem--flow">
        <span class="vitem__icon">${Icon.get('plus', { size: 18, sw: 2.4 })}</span>
        <span class="vitem__main">${who}<b>Добавить упражнение</b><span class="vitem__meta">${esc(item.name)} · ${item.fromLibrary ? 'из библиотеки' : 'своё, проверьте название'}</span></span>${remove}</li>`;
    }
    if (item.type === 'note') {
      return `<li class="vitem vitem--note">
        <span class="vitem__icon">${Icon.get('note', { size: 18 })}</span>
        <span class="vitem__main">${who}<b>Заметка</b><span class="vitem__meta">${item.exName ? esc(item.exName) + ': ' : ''}${esc(item.text)}</span></span>${remove}</li>`;
    }
    return `<li class="vitem vitem--error">
      <span class="vitem__icon">${Icon.get('alert', { size: 18 })}</span>
      <span class="vitem__main"><b>${esc(item.reason)}</b><span class="vitem__meta">«${esc(item.text)}» — не будет записано</span></span>${remove}</li>`;
  }

  function confirmSheet(writable) {
    const { Btn } = UI;
    const errors = state.items.filter(i => i.type === 'error').length;
    return `<div class="voice voice--confirm">
      <div class="voice__head">
        ${Mascot.face(errors && !writable ? 'worried' : 'laugh', 52, 'voice__face')}
        <div><div class="sheet__title">Проверьте запись</div>
        <p class="voice__sub">${writable ? 'Уберите лишнее крестиком и подтвердите.' : 'Ничего не удалось разобрать.'}${errors ? ' Строки с «!» не будут записаны.' : ''}</p></div>
      </div>
      <ul class="voice__list" aria-live="polite">${state.items.map(itemHtml).join('')}</ul>
      <div class="voice__actions">
        ${Btn(writable ? `Записать (${writable})` : 'Записать', { a: 'voice.commit', disabled: !writable, icon: 'check' })}
        <div class="voice__more">
          ${Btn('Добавить ещё', { kind: 'soft', size: 'compact', a: 'voice.more', icon: 'mic' })}
          ${Btn('Отмена', { kind: 'ghost', size: 'compact', a: 'sheet.close' })}
        </div>
      </div>
    </div>`;
  }

  function more() {
    state.fromHold = false;
    refresh();
  }

  function sheet() {
    const { esc, Btn } = UI;
    const writable = state.items.filter(i => i.type !== 'error').length;
    if (state.fromHold && state.items.length) return confirmSheet(writable);
    const mood = state.error ? 'worried' : state.listening ? 'excited' : state.items.length ? 'laugh' : 'smile';
    const micLabel = state.listening ? 'Остановить запись' : 'Начать диктовку';
    const status = state.error ? state.error
      : state.listening ? (state.demo ? 'Демо: диктуем фразу…' : 'Слушаю. Говорите по одной фразе.')
      : supported() ? 'Нажмите на микрофон и говорите' : 'Голос недоступен в этом браузере — напечатайте фразу';
    return `<div class="voice${state.listening ? ' is-listening' : ''}">
      <div class="voice__head">
        ${Mascot.face(mood, 52, 'voice__face')}
        <div><div class="sheet__title">Голосовой ввод</div>
        <p class="voice__sub">«Приседания 80 на 8», «ещё такой же», «вместо жима делаем…», «пропускаем выпады», «заметка: …»</p></div>
      </div>
      <div class="voice__stage">
        <button class="voice__mic" data-act="voice.toggle" aria-pressed="${state.listening}" aria-label="${micLabel}" ${!supported() ? 'disabled aria-disabled="true"' : ''}>
          <span class="voice__ring"></span><span class="voice__ring voice__ring--2"></span>
          ${Icon.get(supported() ? 'mic' : 'micOff', { size: 30, sw: 2.2 })}
        </button>
        <div class="voice__status${state.error ? ' is-error' : ''}" role="status">${esc(status)}</div>
        <div class="voice__interim${state.interim ? ' is-live' : ''}" data-voice-interim aria-live="off">${esc(state.interim || (state.listening ? 'Слушаю…' : ''))}</div>
        ${state.listening ? '<div class="voice__bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' : ''}
      </div>
      <form class="voice__type" data-voice-form>
        <label class="sr-only" for="voice-text">Фраза для записи</label>
        <input id="voice-text" class="voice__input" placeholder="Или напечатайте: жим 60 на 10" autocomplete="off" enterkeyhint="send">
        <button class="voice__send" type="submit" data-act="voice.text" aria-label="Разобрать фразу">${Icon.get('send', { size: 18 })}</button>
      </form>
      <div class="voice__try"><span>Попробовать:</span>${demoPhrases().map(p => `<button class="chip chip--soft voice__chip" data-act="voice.demo" data-phrase="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="voice__list-head"><span>Распознано</span><span class="num">${state.items.length}</span></div>
      ${state.items.length
        ? `<ul class="voice__list" aria-live="polite">${state.items.map(itemHtml).join('')}</ul>`
        : '<p class="voice__empty">Здесь появятся подходы и заметки. В журнал ничего не попадёт, пока вы не нажмёте «Записать».</p>'}
      <div class="voice__actions">
        ${Btn(writable ? `Записать (${writable})` : 'Записать', { a: 'voice.commit', disabled: !writable, icon: 'check' })}
        ${Btn('Закрыть', { kind: 'ghost', size: 'compact', a: 'sheet.close' })}
      </div>
      <p class="voice__foot">Распознавание выполняет браузер. В Chrome звук обрабатывается на серверах Google; текст и записи остаются в этом браузере.</p>
    </div>`;
  }

  if (hasWindow) {
    const isHoldKey = (event) => event.key === ' ' || event.key === 'Enter';
    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest?.('[data-voice-hold]') || event.button > 0) return;
      event.preventDefault();
      holdStart();
    });
    document.addEventListener('pointerup', () => holdEnd());
    document.addEventListener('pointercancel', () => holdEnd());
    document.addEventListener('contextmenu', (event) => { if (event.target.closest?.('[data-voice-hold]')) event.preventDefault(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && hold.phase === 'listening') { event.preventDefault(); holdEnd(true); return; }
      if (!isHoldKey(event) || !event.target.closest?.('[data-voice-hold]')) return;
      event.preventDefault();
      if (!event.repeat) holdStart();
    });
    document.addEventListener('keyup', (event) => {
      if (!isHoldKey(event) || hold.phase !== 'listening') return;
      event.preventDefault();
      holdEnd();
    });
    window.addEventListener('blur', () => holdEnd());
    document.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-voice-form]')) return;
      event.preventDefault();
      submitText();
    });
    Store.subscribe((st) => {
      if (!hold.phase && st.sheet?.id !== 'voice' && (state.listening || state.demo)) stop(false);
    });
  }

  return { open, toggle, start, stop, demo, submitText, remove, commit, sheet, supported, state, holdStart, holdEnd, more };
})();
