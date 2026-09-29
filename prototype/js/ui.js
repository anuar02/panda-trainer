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
    `<button class="${cls}" ${act(a, args)} aria-label="${esc(label)}" title="${esc(label)}" ${style ? `style="${style}"` : ''}>${Icon.get(name, { size, sw })}</button>`;

  /* ── Btn ─────────────────────────────────────────────────────────────────── */
  const Btn = (label, { kind = 'primary', icon = null, size = '', disabled = false, a = null, args = null, full = true, cls = '' } = {}) =>
    `<button class="btn btn--${kind}${size ? ' btn--' + size : ''}${full ? '' : ' btn--inline'}${cls ? ' ' + cls : ''}" ${act(a, args)} ${disabled ? 'disabled aria-disabled="true"' : ''}>
      ${icon ? Icon.get(icon, { size: 20, sw: 2.4 }) : ''}<span>${esc(label)}</span></button>`;

  /* ── Pill ────────────────────────────────────────────────────────────────── */
  const Pill = (label, { tone = 'mint', dot = true, cls = '' } = {}) =>
    `<span class="pill pill--${tone}${dot ? '' : ' pill--nodot'}${cls ? ' ' + cls : ''}">
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
      <div class="empty__art">${Icon.get(icon, { size: 38, sw: 1.8 })}</div>
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
      { id: 't-schedule', label: 'Расписание', icon: 'calendar' },
      { id: 't-clients', label: 'Клиенты', icon: 'users' },
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
    return `<nav class="tabbar" aria-label="Основная навигация">${items.map(t => {
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
      ${toast ? `${Icon.get(toast.kind === 'warn' ? 'alert' : 'check', { size: 18, sw: 2.6 })}${esc(toast.text)}` : ''}</div>`;

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
    return `<aside class="workout-dock" aria-label="Свёрнутая тренировка">
      <button class="workout-dock__button" ${act('log.resume', { id: workout.sessionId })} aria-label="Вернуться к тренировке: ${esc(workout.name)}, ${workout.start}. ${esc(description)}">
        <span class="workout-dock__text"><span class="workout-dock__action">Вернуться к тренировке</span><strong>${esc(workout.name)}</strong><span class="workout-dock__time num">${workout.start} · Не завершена</span><span class="workout-dock__detail${workout.storageError ? ' is-error' : ''}">${esc(description)}</span></span>
        <span class="workout-dock__expand" aria-hidden="true">${Icon.get('chevD', { size: 22 })}</span>
      </button></aside>`;
  };

  return { esc, act, tapable, iconBtn, Btn, Pill, Card, Lead, Row, SectionH, TopBar, PageTitle, SaveState, Notice, Empty, Meter, KV, Stats, TabBar, Sheet, Toast, StatusBar, Skeleton, WorkoutDock };
})();
