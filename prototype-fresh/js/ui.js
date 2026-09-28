/* ============================================================================
   ui.js — component helpers (string templates)
   Mirrors the gymGO kit from `src_ui.jsx`. Every interactive element carries a
   `data-act` action name handled by the delegated listener in app.js, plus
   optional `data-*` arguments.

   Accessibility notes:
   - Interactive divs get role="button" + tabindex="0" and respond to Enter/Space.
   - `title` / `aria-label` is required on icon-only controls.
   ========================================================================== */

const UI = (() => {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Build a data-act attribute string from an action name and args. */
  const act = (name, args) => {
    if (!name) return '';
    let s = ` data-act="${esc(name)}"`;
    if (args) for (const k in args) {
      if (args[k] == null || args[k] === false) continue;
      s += ` data-${k}="${esc(args[k])}"`;
    }
    return s;
  };
  const tapable = (name) => name ? ' class="tap" role="button" tabindex="0"' : '';

  /** Icon-only interactive element. */
  const iconBtn = (name, { act: a, args, label, size = 22, sw = 2, cls = '', style = '' } = {}) =>
    `<button class="icon-button ${cls}" ${act(a, args)} aria-label="${esc(label)}" title="${esc(label)}" ${style ? `style="${style}"` : ''}>${Icon.get(name, { size, sw })}</button>`;

  /* ── Btn ─────────────────────────────────────────────────────────────────── */
  const Btn = (label, { kind = 'primary', icon = null, size = '', disabled = false, a = null, args = null, full = true, cls = '' } = {}) =>
    `<button class="btn btn--${kind}${size ? ' btn--' + size : ''}${full ? '' : ' btn--inline'}${cls ? ' ' + cls : ''}" ${act(a, args)} ${disabled ? 'disabled aria-disabled="true"' : ''}>
      ${icon ? Icon.get(icon, { size: 20, sw: 2.4 }) : ''}<span>${esc(label)}</span></button>`;

  /* ── Pill ────────────────────────────────────────────────────────────────── */
  const Pill = (label, { tone = 'mint', dot = true, pulse = false, cls = '' } = {}) =>
    `<span class="pill pill--${tone}${dot ? '' : ' pill--nodot'}${pulse ? ' pill--pulse' : ''}${cls ? ' ' + cls : ''}">
      ${dot ? '<i class="pill__dot"></i>' : ''}${esc(label)}</span>`;

  /* ── Card ────────────────────────────────────────────────────────────────── */
  const Card = (inner, { pad = false, rows = false, flush = false, lg = false, cls = '', style = '' } = {}) =>
    `<div class="card${pad ? ' card--pad' : ''}${rows ? ' card--rows' : ''}${flush ? ' card--flush' : ''}${lg ? ' card--lg' : ''}${cls ? ' ' + cls : ''}" ${style ? `style="${style}"` : ''}>${inner}</div>`;

  /* ── Lead ────────────────────────────────────────────────────────────────── */
  const Lead = (content, { tone = '', size = '', sq = false, icon = false } = {}) =>
    `<div class="lead${tone ? ' lead--' + tone : ''}${size ? ' lead--' + size : ''}${sq ? ' lead--sq' : ''}">
      ${icon ? Icon.get(content, { size: size === 'sm' ? 17 : 20 }) : esc(content)}</div>`;

  /* ── Row ─────────────────────────────────────────────────────────────────── */
  const Row = ({ lead = '', title, meta = '', right = '', a = null, args = null, last = false }) =>
    `<div class="row${a ? ' row--tap tap' : ''}" ${act(a, args)} ${a ? 'role="button" tabindex="0"' : ''}>
      ${lead}
      <div class="row__main">
        <div class="row__title">${esc(title)}</div>
        ${meta ? `<div class="row__meta">${meta}</div>` : ''}
      </div>
      <div class="row__right">${right}</div>
    </div>`;

  /* ── Section header ──────────────────────────────────────────────────────── */
  const SectionH = (title, { action = null, a = null, args = null } = {}) =>
    `<div class="section-h"><h2>${esc(title)}</h2>
      ${action ? `<span class="action tap" ${act(a, args)} role="button" tabindex="0">${esc(action)}${Icon.get('chevR', { size: 16 })}</span>` : ''}</div>`;

  /* ── Headers ─────────────────────────────────────────────────────────────── */
  const TopBar = ({ title = '', back = null, close = null, right = '', backLabel = 'Назад' } = {}) =>
    `<div class="topbar">
      <div class="topbar__side">
        ${back ? `<button class="topbar__btn" ${act(back)} aria-label="${esc(backLabel)}">${Icon.get('chevL', { size: 26, sw: 2.2 })}</button>` : ''}
        ${close ? `<button class="topbar__btn" ${act(close)} aria-label="Закрыть">${Icon.get('close', { size: 24, sw: 2.2 })}</button>` : ''}
      </div>
      ${title ? `<div class="topbar__title">${esc(title)}</div>` : '<div></div>'}
      <div class="topbar__side">${right}</div>
    </div>`;

  const PageTitle = ({ title, sub = '', size = null }) =>
    `<div class="page-title${size === 'sm' ? ' page-title--sm' : ''}">
      <h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;

  /* ── Status / save state / notice ────────────────────────────────────────── */
  const SaveState = (kind, text) => `<span class="savestate is-${kind}"><i></i>${esc(text)}</span>`;

  const Notice = (text, { tone = 'info', icon = null } = {}) =>
    `<div class="notice notice--${tone}">${icon ? Icon.get(icon, { size: 18 }) : ''}<div>${text}</div></div>`;

  const Empty = ({ icon = 'dumbbell', title, sub = '', action = '' }) =>
    `<div class="empty">
      <div class="empty__art empty__art--panda">${typeof Mascot !== 'undefined' ? Mascot.render(icon === 'calendar' ? 'sleep' : 'sit', 'empty') : Icon.get(icon, { size: 38, sw: 1.8 })}</div>
      <h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}${action}</div>`;

  const Meter = (value, max) =>
    `<div class="meter"><i style="width:${Math.min(100, Math.round(value / max * 100))}%"></i></div>`;

  const KV = (items) =>
    `<div class="kv">${items.map(([k, v]) => `<div class="kv__item"><span class="kv__k">${esc(k)}</span><span class="kv__v ${/₸|^\d/.test(v) ? 'num' : ''}">${esc(v)}</span></div>`).join('')}</div>`;

  const Stats = (items) =>
    `<div class="stats">${items.map(([v, l, tone]) => `<div class="card stat"><b class="${tone ? 'is-' + tone : ''}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

  /* ── Tab bar (each role has its own set) ─────────────────────────────────── */
  const TABS = {
    trainer: [
      { id: 't-today', label: 'Сегодня', icon: 'home' },
      { id: 't-schedule', label: 'Распи\u00adсание', icon: 'calendar' },
      { id: 't-clients', label: 'Клиенты', icon: 'users' },
      { id: 't-library', label: 'Библиотека', icon: 'layers' },
      { id: 't-profile', label: 'Профиль', icon: 'user' },
    ],
    client: [
      { id: 'c-home', label: 'Главная', icon: 'home' },
      { id: 'c-program', label: 'Программа', icon: 'dumbbell' },
      { id: 'c-history', label: 'История', icon: 'list' },
      { id: 'c-progress', label: 'Прогресс', icon: 'trend' },
      { id: 'c-profile', label: 'Профиль', icon: 'user' },
    ],
  };

  const TabBar = (role, active, badge = 0) => {
    const items = TABS[role];
    return `<nav class="tabbar" data-role="${role}" aria-label="Основная навигация">${items.map(t => {
      const on = active === t.id;
      return `<button class="tabbar__item${on ? ' is-on' : ''}" ${act('tab', { id: t.id })} aria-current="${on}">
        <span class="tabbar__icon">${Icon.get(t.icon, { size: 22, sw: on ? 2.3 : 1.8 })}${t.id === 't-today' && badge ? `<span class="count">${badge}</span>` : ''}</span>
        <span class="tabbar__label">${esc(t.label)}</span></button>`;
    }).join('')}</nav>`;
  };

  /* ── Sheet shell ─────────────────────────────────────────────────────────── */
  const Sheet = (open, inner, kind = '') =>
    `<div class="sheet-layer${open ? ' is-open' : ''}" aria-hidden="${!open}">
      <div class="sheet__scrim" ${act('sheet.close')}></div>
      <div class="sheet" data-sheet="${esc(kind)}" role="dialog" aria-modal="true" tabindex="-1">
        <div class="sheet__grip"><i></i></div>
        <div class="sheet__body">${inner}</div>
      </div>
    </div>`;

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  const Toast = (toast) =>
    `<div class="toast${toast ? ' is-on' : ''}${toast && toast.kind ? ' is-' + toast.kind : ''}" role="status">
      ${toast ? `<span class="toast__face">${toast.celebration && !Store.preferences.calm() ? Mascot.face('laugh', 30) : ''}</span>${Icon.get(toast.kind === 'warn' ? 'alert' : 'check', { size: 18, sw: 2.6 })}<span class="toast__text">${esc(toast.text)}</span>` : ''}</div>`;

  /* ── Status bar ──────────────────────────────────────────────────────────── */
  const StatusBar = () => `<div class="device__status">
    <span class="num">${esc(DB.NOW_TIME)}</span>
    <span class="status__icons">${Icon.get('wifi', { size: 15, sw: 2.2 })}${Icon.get('battery', { size: 22, sw: 1.6 })}</span>
  </div>`;

  /* ── Skeleton blocks ─────────────────────────────────────────────────────── */
  const Skeleton = (rows = 4) => Card(
    Array.from({ length: rows }).map(() =>
      `<div class="row"><div class="sk" style="width:42px;height:42px;border-radius:50%"></div>
        <div class="row__main"><div class="sk" style="width:60%;height:14px"></div><div class="sk" style="width:40%;height:12px;margin-top:8px"></div></div></div>`
    ).join(''), { rows: true });

  const WorkoutDock = () => {
    const st = Store.get();
    if (st.role !== 'trainer' || st.screen === 't-session') return '';
    const workout = Store.logging.resumable();
    if (!workout) return '';
    const draftDetail = workout.group && workout.draftParticipants ? ` · Черновики: ${workout.draftParticipants} участн.` : workout.drafts ? ' · Есть черновик' : '';
    const detail = workout.storageError ? 'Ошибка сохранения · вернитесь к журналу'
      : !workout.participating ? 'Участник не участвует'
      : workout.total ? `${workout.done} из ${workout.total} подходов` : 'Без программы';
    const description = detail + draftDetail;
    const live = typeof Workout !== 'undefined' && workout.participating && !workout.storageError && st.logging.sessionId === workout.sessionId && !st.logging.finished ? st.logging.active : null;
    const exercise = live ? Workout.current(live, Store.logging.exercises(live), st.logging.values[live] || {}) : null;
    const rest = live ? Workout.restOf(live) : null;
    const pct = workout.total ? Math.min(100, Math.round(workout.done / workout.total * 100)) : 0;
    const count = workout.total && workout.participating && !workout.storageError ? `<b class="num">${workout.done}/${workout.total}</b>` : '';
    const line = workout.storageError || !workout.participating || !workout.total ? `<span class="workout-dock__detail${workout.storageError ? ' is-error' : ''}">${esc(description)}</span>`
      : rest && !rest.done ? `<span class="workout-dock__rest">Отдых <span class="num" data-rest-left="${esc(live)}">${rest.label}</span></span>${exercise ? `<span class="workout-dock__ex">дальше ${esc(exercise.name)}</span>` : ''}`
      : rest ? `<span class="workout-dock__rest is-over">Отдых окончен</span>${exercise ? `<span class="workout-dock__ex">${esc(exercise.name)}</span>` : ''}`
      : exercise ? `<span class="workout-dock__ex">${esc(exercise.name)}</span>${draftDetail ? `<span class="workout-dock__detail">${esc(draftDetail.slice(3))}</span>` : ''}`
      : `<span class="workout-dock__detail"><span class="num">${workout.start}</span> · ${esc(description)}</span>`;
    return `<aside class="workout-dock${rest && !rest.done ? ' is-resting' : ''}" aria-label="Свёрнутая тренировка">
      <button class="workout-dock__button" ${act('log.resume', { id: workout.sessionId })} aria-label="Вернуться к тренировке: ${esc(workout.name)}, ${workout.start}. ${esc(description)}${exercise ? `. Сейчас: ${esc(exercise.name)}` : ''}">
        <span class="workout-dock__ring" style="--p:${pct}%" aria-hidden="true">${Icon.get('play', { size: 16, sw: 0 })}</span>
        <span class="workout-dock__text"><span class="workout-dock__name"><strong>${esc(workout.name)}</strong>${count}</span><span class="workout-dock__line">${line}</span>${isInstrument() ? Segments(workout.done, workout.total) : ''}</span>
        <span class="workout-dock__go" aria-hidden="true"><span>Вернуться</span>${Icon.get('chevR', { size: 18, sw: 2.4 })}</span>
      </button></aside>`;
  };

  const ProgramPreview = (clientId, name, role = 'client', sid = null) => {
    const exercises = DB.programForClient(clientId, name);
    if (exercises.length) return `${esc(name || 'Личная программа')} · ${exercises.slice(0,3).map(e=>esc(e.name)).join(', ')}${exercises.length > 3 ? ` · ещё ${exercises.length-3}` : ''}`;
    return role === 'client' ? 'Тренер подберёт упражнения на месте' : `Без программы${sid ? ` · <button class="btn btn--ghost btn--sm" ${act('sheet.open',{id:'chooseProgram',sid})}>Выбрать программу</button>` : ''}`;
  };

  const ChangesSummary = (clientId) => {
    const c = Store.logging.changes(clientId);
    const parts = [];
    if (c.replaced.length) parts.push(`заменено ${c.replaced.length}`);
    if (c.added.length) parts.push(`добавлено ${c.added.length}`);
    if (c.skipped.length) parts.push(`пропущено ${c.skipped.length}`);
    if (c.extra) parts.push(`сверх плана ${c.extra} ${DB.plural(c.extra, ['подход', 'подхода', 'подходов'])}`);
    if (!parts.length) return '';
    const details = [
      ...c.replaced.map(r => `${esc(r.from)} → ${esc(r.to)}`),
      ...c.added.map(n => `+ ${esc(n)}`),
      ...c.skipped.map(n => `без «${esc(n)}»`),
    ];
    return `<div class="plan-diff"><b>Отличия от программы:</b> ${parts.join(' · ')}${details.length ? `<span>${details.join('; ')}</span>` : ''}<small>Программа клиента не изменена.</small></div>`;
  };

  const isInstrument = () => typeof document !== 'undefined' && document.documentElement?.dataset?.visual === 'instrument';
  const Segments = (done, total) => total > 0 ? `<span class="segments" role="img" aria-label="Записано ${done} из ${total} подходов">${Array.from({ length: Math.min(total, 60) }, (_, i) => `<i class="${i < done ? 'is-done' : i === done ? 'is-current' : ''}"></i>`).join('')}</span>` : '';
  const CalmSwitch = () => `<button class="preference-switch" role="switch" aria-checked="${Store.preferences.calm()}" ${act('calm.toggle')}><span>Спокойный интерфейс</span><span class="switch-track" aria-hidden="true"><i></i></span></button>`;
  const ThemeChoice = () => isInstrument() ? `<div class="theme-choice" role="group" aria-labelledby="theme-choice-label"><span id="theme-choice-label" class="theme-choice__label">Тема</span><span class="theme-choice__seg">${[['auto', 'По роли'], ['dark', 'Тёмная'], ['light', 'Светлая']].map(([id, label]) => `<button type="button" data-theme-choice="${id}" aria-pressed="${(document.documentElement.dataset.themeChoice || 'auto') === id}">${label}</button>`).join('')}</span></div>` : '';
  const TransferDates = r => {
    const to = r.counter || r.to;
    return `<dl class="transfer-dates"><div><dt>Действует</dt><dd><span>${DB.fmtDate(r.from.date)}</span><strong class="num">${r.from.start}–${r.from.end}</strong></dd></div><span aria-hidden="true">${Icon.get('arrowRight', { size: 18 })}</span><div><dt>Предложено</dt><dd><span>${DB.fmtDate(to.date)}</span><strong class="num">${to.start}–${to.end}</strong></dd></div></dl>`;
  };
  const TransferCard = (r, title, actions) => {
    const to = r.counter || r.to;
    return `<details class="transfer-card"><summary><strong>${esc(title)}</strong><span class="num">${DB.fmtDate(r.from.date)} ${r.from.start} → ${DB.fmtDate(to.date)} ${to.start}</span><small>${r.awaiting === Store.get().role ? 'Нужен ваш ответ' : 'Ожидает ответа'}</small></summary><div class="transfer-card__body">${TransferDates(r)}<p>До согласия действует прежнее время.</p><div class="transfer-card__actions">${actions}</div></div></details>`;
  };
  const Sparkline = (rows, label) => {
    if (rows.length < 2) return '';
    const lo = Math.min(...rows.map(r => r.value)), hi = Math.max(...rows.map(r => r.value));
    const start = Date.parse(rows[0].date), span = Date.parse(rows[rows.length - 1].date) - start;
    const pts = rows.map(r => ({x: span ? 4 + (Date.parse(r.date) - start) / span * 192 : 100, y: hi === lo ? 24 : 44 - (r.value - lo) / (hi - lo) * 36}));
    const last = pts[pts.length - 1];
    return `<svg class="sparkline" viewBox="0 0 200 48" role="img" aria-label="${esc(label)}"><polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"/><circle cx="${last.x}" cy="${last.y}" r="3"/></svg>`;
  };
  return { TransferCard, Sparkline, isInstrument, Segments, CalmSwitch, ThemeChoice, TransferDates, ChangesSummary, ProgramPreview, esc, act, tapable, iconBtn, Btn, Pill, Card, Lead, Row, SectionH, TopBar, PageTitle, SaveState, Notice, Empty, Meter, KV, Stats, TabBar, Sheet, Toast, StatusBar, Skeleton, WorkoutDock };
})();
