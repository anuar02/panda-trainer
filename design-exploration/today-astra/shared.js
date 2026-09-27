(() => {
  'use strict';
  const M = TodayModel, concept = document.body.dataset.concept;
  let state = M.fresh(), selected = 'a', returnFocus;
  const app = document.querySelector('#app'), dialog = document.querySelector('#sheet');
  const paths = {
    arrow: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    swap: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="m5 12 4 4L19 6"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    play: '<path d="m9 5 10 7-10 7z"/>',
    overlap: '<path d="M4 4h10v10H4zM10 10h10v10H10"/>',
    inbox: '<path d="m4 4-2 10v6h20v-6L20 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const range = s => `${M.time(s.start)}–${M.time(s.end)}`;
  const next = () => M.ordered(state).find(s => s.start >= state.now);
  const summary = '1 подтвердил · 1 ждёт · 1 отменил';
  const status = s => s.confirmed ? `<span class="status confirmed">${icon('check')}Подтверждено</span>` : '';
  const workoutButton = s => `<button class="btn primary" data-action="workout" data-id="${s.id}">${icon('play')}Открыть тренировку</button>`;
  function request() {
    const pending = state.request === 'pending';
    const title = pending ? 'Айгерим просит перенос' : state.request === 'accepted' ? 'Перенос принят' : 'Перенос отклонён';
    const subtitle = pending ? 'Нужен ваш ответ · на 21:00–22:00' : state.request === 'accepted' ? 'Айгерим · теперь в 21:00–22:00' : 'Айгерим · остаётся в 18:00–19:00';
    return `<button class="request ${pending ? '' : 'resolved'}" data-action="request"><span class="request-icon">${icon(pending ? 'swap' : 'check')}</span><span class="copy"><strong>${title}</strong><small>${subtitle}</small></span>${icon('arrow')}</button>`;
  }
  function conflict(o) {
    return `<div class="conflict-label">${icon('overlap')}<div><strong>Пересечение · ${o.minutes} мин</strong><small>${range(o)} · два отдельных занятия</small></div></div>`;
  }
  const gap = g => `<div class="gap"><span>${range(g)}</span><strong>Свободно · ${g.minutes} мин</strong></div>`;
  function agendaEntry(s) {
    const isNext = s.id === next().id;
    const group = s.kind === 'group';
    const requestLink = s.id === 'a' ? `<button class="a-request-link ${state.request === 'pending' ? 'is-pending' : ''}" data-action="request" aria-label="${state.request === 'pending' ? 'Айгерим просит перенос. Нужен ваш ответ' : 'Решение по переносу Айгерим'}">${icon(state.request === 'pending' ? 'swap' : 'check')}<span>${state.request === 'pending' ? 'Перенос · ответить' : state.request === 'accepted' ? 'Перенос принят' : 'Перенос отклонён'}</span>${icon('arrow')}</button>` : '';
    return `<article class="a-session ${isNext ? 'a-next' : ''}" data-session="${s.id}">
      ${isNext ? `<div class="a-next-caption"><span>Следующая тренировка</span><strong>Через ${s.start - state.now} мин</strong></div>` : ''}
      <div class="a-time"><time>${M.time(s.start)}</time><small>до ${M.time(s.end)}</small></div>
      <div class="a-person">${isNext ? `<h3>${s.name}</h3>` : `<button class="a-person-button" data-action="details" data-id="${s.id}"><strong>${s.name}</strong>${icon('arrow')}</button>`}
        <p class="a-program">${group ? 'Алия, Дана, Мади' : `<strong>${s.workout}</strong><span>Индивидуальное</span>`}</p>
        ${group ? `<p class="a-group-summary">${summary}</p>` : status(s)}${requestLink}
      </div>${isNext ? workoutButton(s) : ''}
    </article>`;
  }
  function agendaConflict(o) {
    return `<button class="a-conflict-link" data-action="overlap" aria-label="Пересечение Айгерим и Армана, ${range(o)}, ${o.minutes} минут">${icon('overlap')}<span><strong>Пересечение · ${o.minutes} мин</strong><small>${range(o)} · два индивидуальных</small></span>${icon('arrow')}</button>`;
  }
  const agendaGap = g => `<button class="a-gap" data-action="new" data-start="${g.start}" data-end="${g.end}" aria-label="Добавить занятие в свободное окно ${range(g)}"><span class="a-gap-time">${M.time(g.start)}<small>до ${M.time(g.end)}</small></span><span><strong>Свободно · ${g.minutes} мин</strong><small>Добавить занятие</small></span>${icon('plus')}</button>`;
  function agenda() {
    const sessions = M.ordered(state), overlaps = M.overlaps(state), gaps = M.gaps(state);
    let html = '', enclosed = new Set();
    for (const s of sessions) {
      if (enclosed.has(s.id)) continue;
      const before = gaps.find(g => g.end === s.start);
      if (before) html += agendaGap(before);
      const o = overlaps.find(o => o.ids.includes(s.id));
      if (o) {
        html += `<section class="a-overlap" aria-label="Два пересекающихся индивидуальных занятия">${o.ids.map((id, i) => { enclosed.add(id); return `${i ? agendaConflict(o) : ''}${agendaEntry(sessions.find(s => s.id === id))}`; }).join('')}</section>`;
      } else html += agendaEntry(s);
    }
    return `<div class="a-agenda-heading"><h2>План на вечер</h2><span>3 занятия</span></div><div class="a-agenda">${html}</div><p class="day-end">Последнее занятие до ${M.time(sessions.at(-1).end)}</p>`;
  }
  function ledger() {
    const sessions = M.ordered(state), gaps = M.gaps(state), overlaps = M.overlaps(state), s = state.sessions.find(s => s.id === selected);
    let rows = '';
    for (const item of sessions) {
      const before = gaps.find(g => g.end === item.start);
      if (before) rows += gap(before);
      rows += `<button class="ledger-row" data-action="select" data-id="${item.id}" data-session="${item.id}" aria-pressed="${selected === item.id}" aria-controls="selection-detail"><span class="ledger-time">${range(item)}${item.id === next().id ? `<span class="next-caption">Через ${item.start - state.now} мин</span>` : ''}</span><span><span class="ledger-name">${item.name}</span><span class="meta">${item.kind === 'group' ? 'Алия, Дана, Мади' : `${item.workout} · индивидуальное`}</span></span>${icon('arrow')}${item.kind === 'group' ? `<span class="ledger-group-summary">${summary}</span>` : ''}</button>`;
      const after = overlaps.find(o => o.ids.at(-1) === item.id);
      if (after) rows += conflict(after);
    }
    return `<section class="ledger" aria-label="Занятия и выбранная тренировка"><div class="ledger-heading"><h2>План на вечер</h2><span>3 записи</span></div><div class="ledger-columns"><span>Начало — конец</span><span>Клиент / программа</span></div>${rows}<div class="detail-panel" id="selection-detail" role="region" aria-label="Детали выбранной записи" aria-live="polite">${s.kind === 'group' ? `<p class="detail-kind">Ответы участников</p><div class="compact-participants">${s.participants.map(p => `<span>${p.name} — ${p.response.toLowerCase()}</span>`).join('')}</div><button class="btn outline" data-action="details" data-id="c">Открыть участников</button>` : `<p class="detail-kind">Программа выбранного занятия</p><div class="detail-top"><h3>${s.workout}</h3>${status(s)}</div>${workoutButton(s)}`}</div></section><section class="response-section"><div class="section-line"><h2>${state.request === 'pending' ? 'Нужен ответ' : 'Решение по запросу'}</h2><span>${state.request === 'pending' ? '1 запрос' : 'Обработан'}</span></div>${request()}</section>`;
  }
  function render() {
    const header = concept === 'a' ? `<header class="top a-top"><div><h1>Сегодня</h1><p>Чт, 17 сентября <span>·</span> <time datetime="2026-09-17T17:35:00+05:00">17:35</time></p></div><button class="a-inbox icon-btn" data-action="inbox" aria-label="${state.request === 'pending' ? 'Входящие: 1 запрос требует ответа' : 'Входящие: нет запросов, требующих ответа'}">${icon('inbox')}${state.request === 'pending' ? '<span class="a-inbox-count">1</span>' : ''}</button></header>` : `<header class="top"><div><h1>Сегодня</h1><p>Четверг, 17 сентября</p></div><div class="clock"><time datetime="2026-09-17T17:35:00+05:00">17:35</time><small>Астана</small></div></header>`;
    app.innerHTML = `${header}<main class="content">${concept === 'a' ? agenda() : ledger()}</main><nav class="bottom-nav" aria-label="Основная навигация"><button class="nav-item" aria-current="page" data-action="today">${icon('home')}Сегодня</button><button class="nav-item" data-action="outside" data-title="Расписание">${icon('calendar')}Расписание</button><button class="nav-item nav-add" data-action="new" aria-label="Добавить занятие">${icon('plus')}Занятие</button><button class="nav-item" data-action="outside" data-title="Клиенты">${icon('users')}Клиенты</button><button class="nav-item" data-action="outside" data-title="Профиль">${icon('user')}Профиль</button></nav>`;
  }
  function openSheet(title, body) {
    if (!dialog.open) returnFocus = document.activeElement;
    dialog.innerHTML = `<div class="grip"></div><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${title}</h2><button class="icon-btn" data-action="close" aria-label="Закрыть">${icon('close')}</button></div>${body}`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('#sheet-title').focus();
  }
  function requestSheet() {
    if (state.request !== 'pending') {
      openSheet(state.request === 'accepted' ? 'Перенос принят' : 'Перенос отклонён', `<p class="sheet-sub">Айгерим · четверг, 17 сентября</p><div class="diff-row"><span>Действующее время</span><strong>${range(state.sessions.find(s => s.id === 'a'))}</strong></div><p class="sheet-note">Запрос обработан. Других запросов, требующих вашего ответа, нет.</p><button class="btn" data-action="close">Понятно</button>`);
      return;
    }
    openSheet('Запрос на перенос', `<p class="sheet-sub">Айгерим предлагает другое время.<br>Четверг, 17 сентября</p><div class="diff-row"><span>Сейчас подтверждено</span><strong>18:00–19:00</strong></div><div class="diff-row proposed"><span>Предлагает Айгерим</span><strong>21:00–22:00</strong></div><p class="sheet-note">До вашего согласия действует 18:00–19:00. В предложенное время пересечений нет.</p><div class="sheet-actions"><button class="btn primary large" data-action="accept">Принять перенос</button><button class="btn outline" data-action="decline">Отклонить · оставить 18:00</button></div>`);
  }
  function workoutSheet(id) {
    const s = state.sessions.find(s => s.id === id);
    openSheet(s.workout || 'Программы участников', `<p class="sheet-sub">${s.name} · ${range(s)}<br>Четверг, 17 сентября</p>${status(s)}<div class="preview-message">${s.kind === 'single' ? 'Назначена индивидуальная тренировка.' : 'У каждого участника своя программа.'}</div><p class="sheet-note">Это просмотр плана. Посещение не отмечено, тренировка не завершена. Упражнения в этой демоверсии не заданы.</p><button class="btn" data-action="close">Вернуться к занятиям</button>`);
  }
  function detailsSheet(id) {
    const s = state.sessions.find(s => s.id === id);
    if (s.kind !== 'group') return workoutSheet(id);
    openSheet('Участники мини-группы', `<p class="sheet-sub">20:00–21:00 · четверг, 17 сентября<br>${summary}</p>${s.participants.map(p => `<div class="person-row"><div><strong>${p.name}</strong><small>Посещение: ${p.attendance.toLowerCase()}</small></div><span class="reply">${p.response}</span></div>`).join('')}<p class="sheet-note">Отмена Мади относится только к его участию. Занятие для остальных остаётся в расписании.</p><button class="btn" data-action="close">Вернуться к занятиям</button>`);
  }
  function newSheet(start, end) {
    openSheet('Новое занятие', `<p class="sheet-sub">Четверг, 17 сентября 2026</p><form id="appointment-form"><label class="field">Клиент<select name="client"><option>Айгерим</option><option>Арман</option><option>Алия</option><option>Дана</option><option>Мади</option></select></label><div class="field-grid"><label class="field">Начало<input name="start" type="time" required value="19:30"></label><label class="field">Конец<input name="end" type="time" required value="20:00"></label></div><label class="field">Программа<select name="program"><option>Назначить позже</option><option>Низ А</option><option>Верх Б</option></select></label><div id="time-check" role="status"></div><button class="btn outline" type="submit">Проверить время</button></form><p class="sheet-note">Здесь можно проверить время. Создание записи — в полном прототипе.</p><a class="outside-link" href="../../prototype/index.html" target="_blank" rel="noopener">Открыть полный прототип</a>`);
    if (start !== undefined && end !== undefined) {
      dialog.querySelector('[name="start"]').value = M.time(Number(start));
      dialog.querySelector('[name="end"]').value = M.time(Number(end));
    }
  }
  dialog.addEventListener('submit', e => {
    e.preventDefault();
    const fields = new FormData(e.target), toMinutes = v => v.split(':').reduce((h, m) => Number(h) * 60 + Number(m));
    const start = toMinutes(fields.get('start')), end = toMinutes(fields.get('end'));
    const matches = state.sessions.filter(s => start < s.end && end > s.start);
    document.querySelector('#time-check').innerHTML = `<p class="preview-message">${end <= start ? 'Конец должен быть позже начала.' : matches.length ? `Пересечение: ${matches.map(s => `${s.name}, ${range(s)}`).join('; ')}. Запись не создана.` : `${esc(fields.get('client'))} · ${M.time(start)}–${M.time(end)}. Время свободно. Запись не создана.`}</p>`;
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const { action, id, title } = button.dataset;
    if (action === 'close') dialog.close();
    if (action === 'request') requestSheet();
    if (action === 'inbox') {
      if (state.request === 'pending') requestSheet();
      else openSheet('Всё разобрано', `<p class="sheet-sub">Запросов, требующих вашего ответа, нет.</p><button class="btn" data-action="request">Посмотреть решение по переносу</button>`);
    }
    if (action === 'overlap') {
      const o = M.overlaps(state)[0];
      if (o) openSheet(`Пересечение · ${o.minutes} мин`, `<p class="sheet-sub">${range(o)} у вас запланированы два отдельных индивидуальных занятия.</p>${o.ids.map(id => { const s = state.sessions.find(s => s.id === id); return `<div class="diff-row"><span>${s.name}<small class="a-overlap-program">${s.workout}</small></span><strong>${range(s)}</strong></div>`; }).join('')}<p class="sheet-note">У каждой записи своя программа. ${state.request === 'pending' ? 'Запрос переноса Айгерим не меняет её время до вашего согласия.' : 'Перенос Айгерим отклонён. Действует исходное время 18:00–19:00.'}</p><button class="btn" data-action="close">Вернуться к повестке</button>`);
    }
    if (action === 'workout') workoutSheet(id);
    if (action === 'details') detailsSheet(id);
    if (action === 'new') newSheet(button.dataset.start, button.dataset.end);
    if (action === 'today') window.scrollTo({ top: 0, behavior: 'instant' });
    if (action === 'select') { selected = id; render(); app.querySelector(`[data-action="select"][data-id="${id}"]`).focus({ preventScroll: true }); }
    if (action === 'accept' || action === 'decline') {
      if (M.resolve(state, action === 'accept' ? 'accepted' : 'declined')) {
        selected = next().id;
        dialog.close(); render();
        app.querySelector('[data-action="request"]').focus({ preventScroll: true });
        document.querySelector('#announcement').textContent = action === 'accept' ? 'Перенос принят. Айгерим в 21:00. Пересечений нет. Следующий — Арман в 18:30.' : 'Перенос отклонён. Действует 18:00–19:00.';
      }
    }
    if (action === 'outside') openSheet(esc(title), `<p class="sheet-sub">Раздел «${esc(title)}» находится за пределами этого концепта страницы «Сегодня».</p><p class="sheet-note">Откройте полный прототип и выберите «${esc(title)}» в навигации.</p><a class="btn outline" href="../../prototype/index.html" target="_blank" rel="noopener">Открыть полный прототип</a>`);
  });
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  // Keep Tab cycling inside the sheet, including from its initially focused heading.
  // Native modal dialog supplies Escape handling and an inert background.
  dialog.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)')];
    const first = controls[0], last = controls.at(-1), active = document.activeElement;
    if (e.shiftKey && (active === first || !controls.includes(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !controls.includes(active))) { e.preventDefault(); first.focus(); }
  });
  window.addEventListener('message', e => {
    if (e.source !== window.parent || (location.protocol !== 'file:' && e.origin !== location.origin)) return;
    if (e.data?.type === 'today-reset') {
      dialog.close(); state = M.fresh(); selected = 'a'; render();
      document.querySelector('#announcement').textContent = 'Демо сброшено. 17 сентября, 17:35.';
    }
  });
  render();
})();
