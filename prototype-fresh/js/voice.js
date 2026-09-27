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
      const nameWords = tokens(ex.name.toLowerCase().replace(/ё/g, 'е')).filter(w => w.length >= 3);
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

  function parse(text, ctx) {
    const items = [];
    const pending = {};
    const planned = (cid, exId) => pending[`${cid}:${exId}`] || [];
    const lastValue = {};
    let clientId = ctx.active;
    for (const raw of splitSegments(text)) {
      const noteMatch = raw.match(/^\s*(?:заметка|заметку|запиши заметку|комментарий|примечание)\s*[:,-]?\s*(.*)$/i);
      if (noteMatch) {
        if (noteMatch[1].trim()) items.push({ type: 'note', clientId, text: noteMatch[1].trim() });
        continue;
      }
      const lowered = raw.toLowerCase().replace(/ё/g, 'е');
      const repeatRe = /(?:еще\s+(?:один|одну|такой|раз)(?:\s+такой)?(?:\s+же)?|такой же|то же самое|повтори(?:ть)?|так же)/g;
      const repeat = repeatRe.test(lowered);
      const norm = normalize(lowered.replace(repeatRe, ' '));
      const words = tokens(norm);
      const who = ctx.participants.length > 1 ? matchParticipant(words, ctx.participants) : null;
      if (who) clientId = who.clientId;
      const exercises = ctx.exercises(clientId);
      const filled = (ex) => {
        const done = ctx.values(clientId, ex.id);
        const extra = planned(clientId, ex.id);
        return Array.from({ length: ex.sets }, (_, i) => Boolean(done[i]) || extra.includes(i));
      };
      const named = matchExercise(words.filter(w => !/^\d/.test(w)), exercises);
      const unknown = named ? [] : words.filter(w => /^[а-яa-z]{4,}$/.test(w) && !STOP.some(stop => w.startsWith(stop))
        && !(who && w.startsWith(who.short.toLowerCase().slice(0, 3))));
      if (!named && unknown.length && (/\d/.test(norm) || repeat)) {
        items.push({ type: 'error', clientId, text: raw, reason: `Не нашёл «${unknown[0]}» в программе` });
        continue;
      }
      const ex = named || exercises.find(e => filled(e).some(f => !f)) || null;
      const pair = norm.match(/(\d+(?:\.\d+)?)\s*(?:кг|кило\S*|килограмм\S*)?\s*(?:на|по|раз по)\s*(\d+)/);
      const single = norm.match(/(\d+(?:\.\d+)?)\s*(повтор\S*|раз\S*|сек\S*|секунд\S*|кг|кило\S*|килограмм\S*)?/);
      const ordinalWord = Object.keys(ORDINALS).find(w => new RegExp(`${w}\\s+подход`).test(norm));
      const ordinalRaw = ordinalWord ? null : norm.match(/(\d+)\s*(?:-?й|-?ой)?\s*подход|подход\s*(?:номер\s*)?(\d+)(?!\s*(?:на|по|кг|кило|\.\d|\d))/);
      const ordinal = ordinalRaw && Number(ordinalRaw[1] || ordinalRaw[2]) <= 20 ? ordinalRaw : null;

      if (!ex) {
        if (/\d/.test(norm) || repeat) items.push({ type: 'error', clientId, text: raw, reason: 'Не понял, к какому упражнению это относится' });
        else items.push({ type: 'note', clientId, text: raw });
        continue;
      }

      let value = null, hint = '';
      const key = `${clientId}:${ex.id}`;
      const doneArr = ctx.values(clientId, ex.id);
      const lastDone = [...doneArr].reverse().find(Boolean);
      const bodyweight = ex.prev.kg === 0;
      let numbersText = norm;
      if (ordinal) numbersText = numbersText.replace(ordinal[0], ' ');
      const pair2 = numbersText.match(/(\d+(?:\.\d+)?)\s*(?:кг|кило\S*|килограмм\S*)?\s*(?:на|по|раз по)\s*(\d+)/) || pair;
      const single2 = numbersText.match(/(\d+(?:\.\d+)?)\s*(повтор\S*|раз\S*|сек\S*|секунд\S*|кг|кило\S*|килограмм\S*)?/);
      if (pair2 && numbersText.includes(pair2[0])) {
        value = { kg: bodyweight ? 0 : Number(pair2[1]), reps: Number(pair2[2]) };
        if (bodyweight) value.reps = Number(pair2[2]);
      } else if (single2 && single2[1] !== undefined && numbersText.includes(single2[0])) {
        const n = Number(single2[1]);
        const unit = single2[2] || '';
        if (bodyweight) value = { kg: 0, reps: Math.round(n) };
        else if (/^(кг|кило|килограмм)/.test(unit)) {
          const reps = lastValue[key]?.reps || lastDone?.reps || ex.prev.reps;
          value = { kg: n, reps };
          hint = 'повторы как в прошлом подходе';
        } else {
          const kg = lastValue[key]?.kg ?? lastDone?.kg ?? ex.prev.kg;
          value = { kg, reps: Math.round(n) };
          hint = 'вес как в прошлом подходе';
        }
      } else if (repeat) {
        const base = lastValue[key] || lastDone || ex.prev;
        value = { kg: base.kg, reps: base.reps };
        hint = lastValue[key] || lastDone ? 'как предыдущий подход' : 'как в прошлый раз';
      }

      if (!value) {
        items.push(named ? { type: 'note', clientId, text: raw, exName: ex.name } : { type: 'note', clientId, text: raw });
        continue;
      }
      if (!(value.kg >= 0) || !(value.reps > 0) || !Number.isInteger(value.reps) || value.kg > 1000 || value.reps > 1000) {
        items.push({ type: 'error', clientId, text: raw, reason: 'Проверьте вес и повторы' });
        continue;
      }
      const flags = filled(ex);
      let setId = -1;
      const wanted = ordinal ? Number(ordinal[1] || ordinal[2]) : ordinalWord ? ORDINALS[ordinalWord] : null;
      if (wanted) setId = wanted - 1;
      else setId = flags.findIndex(f => !f);
      if (setId < 0 || setId >= ex.sets) {
        items.push({ type: 'error', clientId, text: raw, reason: wanted ? `В упражнении «${ex.name}» ${ex.sets} подх.` : `Все подходы «${ex.name}» уже записаны` });
        continue;
      }
      pending[key] = [...planned(clientId, ex.id), setId];
      lastValue[key] = value;
      items.push({ type: 'set', clientId, exId: ex.id, exName: ex.name, setId, kg: value.kg, reps: value.reps, unit: ex.name === 'Планка' ? 'сек' : 'повт', replaces: Boolean(doneArr[setId]), hint, text: raw });
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
    };
  }

  function refresh() { Store.set({}); }

  function reindex() {
    const ctx = context();
    const text = state.heard.join('. ');
    const parsed = text ? VoiceParse.parse(text, ctx) : [];
    const removed = new Set(state.removed || []);
    state.items = parsed.map((item, i) => ({ ...item, key: i })).filter(item => !removed.has(item.key));
  }

  function hear(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    state.heard.push(clean);
    reindex();
    refresh();
  }

  function setInterim(text) {
    state.interim = text;
    const el = hasWindow ? document.querySelector('[data-voice-interim]') : null;
    if (el) { el.textContent = text || (state.listening ? 'Слушаю…' : ''); el.classList.toggle('is-live', Boolean(text)); }
  }

  function start() {
    if (!SR) { state.error = 'Этот браузер не поддерживает распознавание речи. Напечатайте фразу или попробуйте Chrome / Safari.'; refresh(); return; }
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
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          wantListening = false;
          state.error = 'Нет доступа к микрофону. Разрешите его в настройках браузера или напечатайте фразу.';
        } else if (event.error === 'network') {
          wantListening = false;
          state.error = 'Распознавание недоступно без сети. Напечатайте фразу.';
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          state.error = 'Не удалось распознать речь. Попробуйте ещё раз.';
        }
      };
      rec.onend = () => {
        if (wantListening) { try { rec.start(); return; } catch (_) { wantListening = false; } }
        state.listening = false;
        setInterim('');
        refresh();
      };
      rec.start();
      state.listening = true;
      refresh();
    } catch (_) {
      wantListening = false;
      state.listening = false;
      state.error = 'Микрофон сейчас недоступен. Напечатайте фразу.';
      refresh();
    }
  }

  function stop(render = true) {
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
    hear(value);
    requestAnimationFrame(() => { const next = document.getElementById('voice-text'); if (next) { next.value = ''; next.focus(); } });
  }

  function remove(key) {
    state.removed = [...(state.removed || []), Number(key)];
    reindex();
    refresh();
  }

  function reset() {
    stop(false);
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

  function commit() {
    reindex();
    let sets = 0, notes = 0, failed = 0;
    for (const item of state.items) {
      if (item.type === 'set') {
        if (Store.logging.setValue(item.clientId, item.exId, item.setId, { kg: item.kg, reps: item.reps })) sets++;
        else failed++;
      } else if (item.type === 'note') {
        const text = item.exName ? `${item.exName}: ${item.text}` : item.text;
        if (Store.logging.addNote(item.clientId, text)) notes++;
        else failed++;
      }
    }
    reset();
    Store.ui.closeSheet();
    const parts = [];
    if (sets) parts.push(`${sets} ${DB.plural(sets, ['подход', 'подхода', 'подходов'])}`);
    if (notes) parts.push(`${notes} ${DB.plural(notes, ['заметка', 'заметки', 'заметок'])}`);
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
    if (other) list.push(`${other.name.split(' ')[0]} ${DB.fmtNumber(other.prev.kg)} на ${Math.max(1, other.prev.reps - 2)}`);
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
        <span class="vitem__main">${who}<b>${esc(item.exName)}</b><span class="vitem__meta">Подход ${item.setId + 1}${item.replaces ? ' · заменит записанный' : ''}${item.hint ? ' · ' + esc(item.hint) : ''}</span></span>
        <span class="vitem__val num">${val}</span>${remove}</li>`;
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

  function sheet() {
    const { esc, Btn } = UI;
    const writable = state.items.filter(i => i.type !== 'error').length;
    const mood = state.error ? 'worried' : state.listening ? 'excited' : state.items.length ? 'laugh' : 'smile';
    const micLabel = state.listening ? 'Остановить запись' : 'Начать диктовку';
    const status = state.error ? state.error
      : state.listening ? (state.demo ? 'Демо: диктуем фразу…' : 'Слушаю. Говорите по одной фразе.')
      : supported() ? 'Нажмите на микрофон и говорите' : 'Голос недоступен в этом браузере — напечатайте фразу';
    return `<div class="voice${state.listening ? ' is-listening' : ''}">
      <div class="voice__head">
        ${Mascot.face(mood, 52, 'voice__face')}
        <div><div class="sheet__title">Голосовой ввод</div>
        <p class="voice__sub">Говорите как обычно: «приседания 80 на 8», «ещё такой же», «заметка: …»</p></div>
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
    document.addEventListener('submit', (event) => {
      if (!event.target.matches('[data-voice-form]')) return;
      event.preventDefault();
      submitText();
    });
    Store.subscribe((st) => {
      if (st.sheet?.id !== 'voice' && (state.listening || state.demo)) stop(false);
    });
  }

  return { open, toggle, start, stop, demo, submitText, remove, commit, sheet, supported, state };
})();
