/* ============================================================================
   screens/trainer.js — trainer-side screens
   Grammar: Сегодня · Расписание · + Занятие · Клиенты · Профиль.
   Every screen is a pure function of Store state, returning an HTML string.
   ========================================================================== */

const Trainer = (() => {
  const { esc, act, Btn, Pill, Card, Lead, Row, SectionH, TopBar, PageTitle, Notice, Empty, Meter, KV, Stats, TabBar, SaveState, Skeleton, iconBtn } = UI;

  const client = (id) => DB.client(id);
  const initials = (name) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const mins = (start, end) => {
    const t = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    return t(end) - t(start);
  };
  const dur = (s) => (mins(s.start, s.end) === 60 ? '60 мин' : mins(s.start, s.end) + ' мин');

  /* ── Session row ─────────────────────────────────────────────────────────── */

  function sessionRow(s, { last = false, showActions = true } = {}) {
    const st = Store.get();
    const group = s.kind === 'group';
    const c = s.clientId ? client(s.clientId) : null;
    const attending = group
      ? s.participants.filter(p => p.reply !== 'cancelled').length + ' участника'
      : (c ? c.program || 'Программа' : '');
    const attendanceKey = (cid) => st.attendance[s.id + ':' + cid];

    let title, meta, pillTone = 'neutral', pillLabel = '';
    if (group) {
      title = s.title;
      meta = `${s.participants.length} ${DB.plural(s.participants.length, ['участник', 'участника', 'участников'])} <span class="sep">·</span> разные программы`;
    } else if (c) {
      title = c.short;
      meta = c.plan
        ? `осталось ${c.plan.remaining} ${DB.plural(c.plan.remaining, ['занятие', 'занятия', 'занятий'])}`
        : 'Разовое занятие';
    } else {
      title = s.title;
      meta = UI.ProgramPreview(s.clientId,s.program,'trainer',s.id);
    }

    const req = s.request || (st.sessionRequests || {})[s.id];
    if (req && req.state === 'pending') { pillTone = 'amber'; pillLabel = 'Запрос переноса'; }
    if (s.status === 'cancelled') { pillTone = 'danger'; pillLabel = 'Отменено'; }
    if (group) {
      const cancelled = s.participants.filter(p => p.reply === 'cancelled').length;
      if (cancelled) { pillTone = 'amber'; pillLabel = `Отменён 1 из ${s.participants.length}`; }
    }

    const att = !group && c ? attendanceKey(c.id) : null;
    const attPill = att === 'present'
      ? Pill('Присутствовал', { tone: 'mint', dot: false })
      : att === 'noshow'
        ? Pill('Неявка', { tone: 'danger', dot: false })
        : '';

    const actions = showActions ? `<div class="session__actions">
        ${s.status !== 'cancelled' ? Btn(Store.logging.label(s.id), { kind: 'primary', size: 'compact', a: 'logging.open', args: { id: s.id }, icon: 'play' }) : ''}
        ${iconBtn('more', { act: 'sheet.open', args: { id: 'session', sid: s.id }, label: 'Действия с занятием', size: 20, cls: 'row__right' })}
      </div>` : '';

    return `<div class="session" ${act('sheet.open', { id: 'session', sid: s.id })}>
      <div class="session__time">${esc(s.start)}<small>${dur(s)}</small></div>
      <div class="session__main">
        <div class="session__title">${esc(title)} ${s.status !== 'cancelled' && !group && c ? `<span class="kind">${esc(s.program || '')}</span>` : ''}</div>
        <div class="session__meta">${meta}</div>
        ${group ? participantMini(s) : ''}
        ${req && req.state === 'pending' ? `<div style="margin-top:9px">${Pill('Ожидает ответа тренера', { tone: 'amber', pulse: true })}</div>` : ''}
        ${attPill ? `<div style="margin-top:9px">${attPill}</div>` : ''}
        ${actions}
      </div>
    </div>`;
  }

  function participantMini(s) {
    return `<div class="avatars" style="margin-top:10px">
      ${s.participants.map(p => {
        const c = client(p.clientId);
        if (!c) return '';
        const tone = p.reply === 'cancelled' ? 'danger' : p.reply === 'pending' ? 'amber' : 'mint';
        return `<span class="lead" title="${esc(c.name)} — ${p.reply === 'cancelled' ? 'отменил' : p.reply === 'pending' ? 'ожидает' : 'подтвердил'}"
          style="background:var(--${tone}-soft);color:var(--${tone === 'mint' ? 'mint-ink' : tone})">${esc(c.initials)}</span>`;
      }).join('')}
      <span style="margin-left:10px;align-self:center;font-size:12.5px;font-weight:600;color:var(--sec)">
        ${s.participants.filter(p => p.reply === 'confirmed').length} подтвердил · ${s.participants.filter(p => p.reply === 'pending').length} ожидает
      </span>
    </div>`;
  }

  /* ── Today feed ──────────────────────────────────────────────────────────── */

  function feed(date) {
    const st = Store.get();
    if (st.scenario === 'loading') return Skeleton(5);
    const all = DB.byDate(date);
    if (!all.length) {
      return Card(Empty({
        icon: 'calendar', title: 'Свободный день',
        sub: 'На этот день занятий нет. Добавьте занятие, чтобы клиент получил предложение времени.',
        action: Btn('Добавить занятие', { kind: 'primary', size: 'compact', a: 'tab', args: { id: 't-new' }, icon: 'plus' }),
      }), { pad: true });
    }

    const groups = DB.overlapGroups(date);
    const groupedIds = new Set(groups.flatMap(g => g.sessions.map(s => s.id)));
    const items = [];

    all.forEach(s => {
      if (groupedIds.has(s.id)) return;
      items.push({ type: 'session', s, at: s.start });
    });
    groups.forEach(g => items.push({ type: 'overlap', g, at: g.sessions[0].start }));
    items.sort((a, b) => a.at.localeCompare(b.at));

    let html = '';
    let prevEnd = null;
    const t = v => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };

    items.forEach(item => {
      const start = item.type === 'overlap' ? item.g.sessions[0].start : item.s.start;
      const end = item.type === 'overlap'
        ? item.g.sessions.reduce((mx, s) => (t(s.end) > t(mx) ? s.end : mx), '00:00')
        : item.s.end;
      if (prevEnd && t(start) > t(prevEnd)) html += `<div class="gap">${t(start) - t(prevEnd)} мин свободно</div>`;
      if (item.type === 'overlap') {
        html += `<div class="overlap-frame" style="margin:0 16px 10px">
          <div class="overlap-frame__head">${Icon.get('alert', { size: 13 })} Пересечение · подтверждено тренером</div>
          ${item.g.sessions.map(s => sessionRow(s)).join('').replace(/<div class="session"/g, '<div class="session" style="border-top:none"')}
        </div>`;
      } else {
        html += `<div class="card card--flush" style="margin:0 16px 10px">${sessionRow(item.s)}</div>`;
      }
      if (t(end) > t(prevEnd || '00:00')) prevEnd = end;
    });
    return html;
  }

  /* ── Сегодня page helpers (scoped to the Today screen) ───────────────────── */

  const pad2 = (n) => String(n).padStart(2, '0');
  const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };
  const fmtHM = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
  const nowMin = () => toMin(DB.NOW_TIME);
  const byStart = (a, b) => a.start.localeCompare(b.start);

  const humanDur = (m) => {
    const h = Math.floor(m / 60), mm = m % 60;
    if (!h) return `${mm} мин`;
    if (!mm) return `${h} ч`;
    return `${h} ч ${mm} мин`;
  };

  /** Requests that need the trainer's own response (any day). A client-awaiting
      request must never inflate this count. */
  const pendingTrainer = () =>
    Store.reschedule.awaiting('trainer');

  /** The request attached to a session, wherever it currently lives. */
  const sessionRequest = (s) => s.request || (Store.get().requests || {})[s.id] || null;
  const awaitsTrainer = (r) => Boolean(r) && ['pending', 'counter'].includes(r.state) && r.awaiting === 'trainer';

  /** Agreement status — deliberately separate from the temporal hint. */
  function agreementPill(s) {
    if (s.status === 'cancelled') return Pill('Отменено', { tone: 'neutral', dot: false });
    const r = sessionRequest(s);
    if (r && (r.state === 'pending' || r.state === 'counter')) {
      return r.awaiting === 'trainer'
        ? Pill('Ждёт вашего ответа', { tone: 'amber' })
        : Pill('Ждём ответа клиента', { tone: 'neutral', dot: false });
    }
    return s.status === 'proposed' ? Pill('Ждём согласия', { tone: 'amber' }) : Pill('Подтверждено', { tone: 'mint' });
  }

  const attPill = (s, c) => {
    if (s.kind === 'group' || !c) return '';
    const att = Store.get().attendance[s.id + ':' + c.id];
    if (att === 'present') return Pill('Присутствовал', { tone: 'mint', dot: false });
    if (att === 'noshow') return Pill('Неявка', { tone: 'danger', dot: false });
    return '';
  };

  const relHint = (n) => (n <= 0 ? '' : n < 60 ? `Через ${n} мин` : `Через ${humanDur(n)}`);

  const participantNames = (s) => s.participants
    .map(p => { const c = client(p.clientId); return c ? c.short : ''; })
    .filter(Boolean).join(', ');

  function groupSummary(s) {
    const count = (reply) => s.participants.filter(p => p.reply === reply).length;
    const conf = count('confirmed'), pend = count('pending'), canc = count('cancelled');
    const parts = [];
    if (conf) parts.push(`${conf} ${DB.plural(conf, ['подтвердил', 'подтвердили', 'подтвердили'])}`);
    if (pend) parts.push(`${pend} ${DB.plural(pend, ['ждёт', 'ждут', 'ждут'])}`);
    if (canc) parts.push(`${canc} ${DB.plural(canc, ['отменил', 'отменили', 'отменили'])}`);
    return parts.join(' · ');
  }

  /* ── Header ──────────────────────────────────────────────────────────────── */

  function todayHeader() {
    const pending = pendingTrainer().length;
    const inboxLabel = pending
      ? `Входящие: ${pending} ${DB.plural(pending, ['запрос требует', 'запроса требуют', 'запросов требуют'])} ответа`
      : 'Входящие: нет запросов, требующих ответа';
    return `<header class="today-head">
      <div class="today-head__main">
        <p class="today-head__hello">${esc(greeting())}, ${esc(DB.trainer.name)}</p>
        <h1 class="today-head__title">Сегодня</h1>
        <p class="today-head__sub">${esc(DB.fmtDateLong(Store.get().day))}<span class="today-head__dot">·</span><time class="num">${esc(DB.NOW_TIME)}</time></p>
      </div>
      <div class="today-head__actions">
        <button class="today-inbox" ${act('tab', { id: 't-inbox' })} aria-label="${esc(inboxLabel)}" title="Входящие">
          ${Icon.get('inbox', { size: 22 })}
          ${pending ? `<span class="today-inbox__count">${pending}</span>` : ''}
        </button>
        <button class="today-inbox" ${act('tab', { id: 't-new' })} aria-label="Создать занятие" title="Создать занятие">
          ${Icon.get('plus', { size: 22, sw: 2.2 })}
        </button>
      </div>
    </header>`;
  }

  function greeting() {
    const h = Math.floor(toMin(DB.NOW_TIME) / 60);
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  function todayBuddy(all) {
    const live = all.filter(s => s.status !== 'cancelled');
    const now = toMin(DB.NOW_TIME);
    const isToday = Store.get().day === DB.TODAY;
    const done = live.filter(s => s.date < DB.TODAY || (isToday && toMin(s.end) <= now)).length;
    const ongoing = isToday ? live.filter(s => toMin(s.start) <= now && now < toMin(s.end)).length : 0;
    const left = live.length - done - ongoing;
    const pending = pendingTrainer().length;
    const pct = live.length ? Math.round(done / live.length * 100) : 0;
    const mood = 'calm';
    const line = !live.length ? 'Свободный день — можно восстановиться.'
      : left === 0 && !ongoing ? 'Все занятия позади. Отличная работа!'
      : ongoing ? `Сейчас идёт ${ongoing} ${DB.plural(ongoing, ['занятие', 'занятия', 'занятий'])}.`
      : done === 0 ? `Впереди ${left} ${DB.plural(left, ['занятие', 'занятия', 'занятий'])}. Разминаемся!`
      : `Осталось ${left} ${DB.plural(left, ['занятие', 'занятия', 'занятий'])} — вы в ритме.`;
    return `<section class="buddy" aria-label="Сводка дня">
      <div class="buddy__face">${Mascot.face(mood, 58)}</div>
      <div class="buddy__main">
        <p class="buddy__line">${esc(line)}</p>
        <div class="buddy__bar" role="img" aria-label="По времени завершилось ${done} из ${live.length}"><i style="--p:${pct}%"></i></div>
        <div class="buddy__stats">
          <span><b class="num">${done}</b> позади</span>
          <span><b class="num">${left}</b> впереди</span>
          ${ongoing ? `<span><b class="num">${ongoing}</b> сейчас</span>` : ''}
          ${pending ? `<button class="buddy__req" ${act('tab', { id: 't-inbox' })}><b class="num">${pending}</b> ${DB.plural(pending, ['запрос', 'запроса', 'запросов'])}</button>` : ''}
        </div>
      </div>
    </section>`;
  }

  function todayHeaderSkeleton() {
    return `<header class="today-head today-head--sk">
      <div class="today-head__main">
        <div class="sk" style="width:120px;height:24px"></div>
        <div class="sk" style="width:150px;height:12px;margin-top:10px"></div>
      </div>
      <div class="sk" style="width:44px;height:44px;border-radius:14px"></div>
    </header>`;
  }

  /* ── One chronological agenda ────────────────────────────────────────────── */

  const captionRow = (label, value) =>
    `<div class="today-entry__caption"><span>${esc(label)}</span><strong class="num">${esc(value)}</strong></div>`;

  function todayEntry(s, role) {
    const group = s.kind === 'group';
    const c = s.clientId ? client(s.clientId) : null;
    const title = group ? s.title : (c ? c.short : s.title);
    const cancelled = s.status === 'cancelled';
    const expanded = Boolean(role);
    const r = sessionRequest(s);

    const requestLink = awaitsTrainer(r) && !cancelled
      ? `<button class="today-request is-pending" ${act('sheet.open', { id: 'todayRequest', rid: r.id })}
          aria-label="Перенос: ${esc(title)}, ${r.from.start}–${r.from.end} → ${r.to.start}–${r.to.end}. Нужен ваш ответ">
          ${Icon.get('swap', { size: 16, sw: 2.2 })}<span>Перенос · ответить</span>${Icon.get('chevR', { size: 14, style: 'color:var(--ter)' })}</button>`
      : '';

    const pastHint = (!group && !cancelled && (s.date < DB.TODAY || (s.date === DB.TODAY && toMin(s.end) <= nowMin())))
      ? `<span class="today-entry__past">время прошло</span>` : '';

    const programLine = group
      ? `<p class="today-entry__program"><strong>${esc(participantNames(s))}</strong></p>`
      : `<p class="today-entry__program"><strong>${UI.ProgramPreview(s.clientId, s.program, 'trainer', s.id)}</strong><span>Индивидуальное</span></p>`;

    const summaryLine = group
      ? (expanded
        ? `<button class="today-entry__summary" ${act('sheet.open', { id: 'session', sid: s.id })}
            aria-label="Участники мини-группы: ${esc(groupSummary(s))}">
            <span>${esc(groupSummary(s))}</span>${Icon.get('chevR', { size: 15, style: 'color:var(--ter)' })}</button>`
        : `<p class="today-entry__summary is-static">${esc(groupSummary(s))}</p>`)
      : '';

    const nameRow = expanded
      ? `<h3 class="today-entry__name">${esc(title)}</h3>`
      : `<button class="today-entry__name-btn" ${act('sheet.open', { id: 'session', sid: s.id })}
          aria-label="Занятие ${esc(title)}, ${s.start}–${s.end}"><strong>${esc(title)}</strong>
          <span class="today-entry__name-right">${pastHint}${Icon.get('chevR', { size: 16, style: 'color:var(--ter)' })}</span></button>`;

    let statusRow = '';
    if (expanded) {
      statusRow = `<div class="today-entry__status">${agreementPill(s)}</div>`;
    } else if (cancelled) {
      statusRow = `<div class="today-entry__status">${Pill('Отменено', { tone: 'neutral', dot: false })}</div>`;
    } else if (r && (r.state === 'pending' || r.state === 'counter')) {
      statusRow = `<div class="today-entry__status">${agreementPill(s)}</div>`;
    } else {
      const att = attPill(s, c);
      if (att) statusRow = `<div class="today-entry__status">${att}</div>`;
    }
    const journalStatus = Store.logging.status(s.id);
    if (journalStatus) statusRow += `<div class="today-entry__status">${Pill(journalStatus === 'finished' ? 'Журнал завершён' : 'Журнал в работе', { tone: 'neutral', dot: false })}</div>`;

    let caption = '';
    if (role === 'now') caption = captionRow('Идёт сейчас', `до ${s.end}`);
    else if (role === 'next') caption = captionRow('Следующая тренировка', relHint(toMin(s.start) - nowMin()));

    const sameAsDock = journalStatus === 'draft' && Store.logging.resumable()?.sessionId === s.id;
    const entryLabel = journalStatus === 'draft' ? `Открыть журнал · ${title}` : Store.logging.label(s.id);
    const cta = expanded && !sameAsDock
      ? `<button class="btn ${journalStatus === 'draft' ? 'btn--soft' : 'btn--primary'} today-entry__cta" ${act('logging.open', { id: s.id })}>
          ${Icon.get('play', { size: 20, sw: 2.4 })}<span>${esc(entryLabel)}</span></button>`
      : '';

    return `<article class="today-entry${expanded ? ' is-expanded' : ''}${cancelled ? ' is-cancelled' : ''}" data-session="${s.id}">
      ${caption}
      <div class="today-entry__time"><time class="num">${s.start}</time><small>до ${s.end}</small></div>
      <div class="today-entry__main">
        ${nameRow}
        ${programLine}
        ${summaryLine}
        ${statusRow}
        ${requestLink}
      </div>
      ${cta}
    </article>`;
  }

  function overlapInfo(g) {
    const live = g.sessions.filter(s => s.status !== 'cancelled');
    if (live.length < 2) return null;
    const start = Math.max(...live.map(s => toMin(s.start)));
    const end = Math.min(...live.map(s => toMin(s.end)));
    if (end <= start) return null; // touching intervals do not overlap
    return { start, end, minutes: end - start, count: live.length };
  }

  const overlapLink = (ov, g, date) =>
    `<button class="today-conflict" ${act('sheet.open', { id: 'todayOverlap', gid: g.id, date })}
      aria-label="Пересечение: ${fmtHM(ov.start)}–${fmtHM(ov.end)}, ${ov.minutes} минут. Сведения о конфликтующих записях">
      ${Icon.get('swap', { size: 18, style: 'color:var(--sec)' })}
      <span><strong>Пересечение · ${humanDur(ov.minutes)}</strong><small>${fmtHM(ov.start)}–${fmtHM(ov.end)} · отдельные занятия</small></span>
      ${Icon.get('chevR', { size: 15, style: 'color:var(--ter)' })}
    </button>`;

  function gapMarker(from, to, date) {
    return `<button class="today-gap" ${act('today.newwindow', { date, start: fmtHM(from), end: fmtHM(to) })}
      aria-label="Свободно ${fmtHM(from)}–${fmtHM(to)}, ${humanDur(to - from)}. Добавить занятие">
      <span class="today-gap__time">${fmtHM(from)}<small>до ${fmtHM(to)}</small></span>
      <span class="today-gap__main"><strong>Свободно · <span class="nowrap">${humanDur(to - from)}</span></strong><small>Добавить занятие</small></span>
      ${Icon.get('plus', { size: 19, style: 'color:var(--sec)' })}
    </button>`;
  }

  function todayAgenda(date) {
    const all = DB.byDate(date);
    if (!all.length) return '';
    const now = nowMin();

    const groups = DB.overlapGroups(date);
    const groupedIds = new Set(groups.flatMap(g => g.sessions.map(s => s.id)));
    const items = [];
    all.forEach(s => { if (!groupedIds.has(s.id)) items.push({ type: 'session', s, at: s.start }); });
    groups.forEach(g => items.push({ type: 'overlap', g, at: g.sessions[0].start }));
    items.sort((a, b) => a.at.localeCompare(b.at));

    // Completion is a journal state, not attendance. Stop treating its time slot
    // as the current workout, without deleting the booking or changing charges.
    const live = all.filter(s => s.status !== 'cancelled' && Store.logging.status(s.id) !== 'finished');
    const active = live.filter(s => toMin(s.start) <= now && now < toMin(s.end)).sort(byStart);
    const upcoming = live.filter(s => toMin(s.start) > now).sort(byStart);
    const role = {};
    if (active.length) active.forEach(s => { role[s.id] = 'now'; });
    else if (upcoming.length) role[upcoming[0].id] = 'next';

    let html = '';
    let cursor = null; // end of the merged union of occupied intervals so far
    items.forEach(item => {
      const sessions = (item.type === 'overlap' ? item.g.sessions : [item.s]).slice().sort(byStart);
      const liveSessions = sessions.filter(s => s.status !== 'cancelled');
      const start = Math.min(...sessions.map(s => toMin(s.start)));
      const end = liveSessions.length ? Math.max(...liveSessions.map(s => toMin(s.end))) : start;
      if (cursor != null && start > cursor) html += gapMarker(cursor, start, date);

      const ov = item.type === 'overlap' ? overlapInfo(item.g) : null;
      if (ov) {
        sessions.forEach((s, i) => {
          if (i) html += overlapLink(ov, item.g, date);
          html += todayEntry(s, role[s.id] || null);
        });
      } else {
        sessions.forEach(s => { html += todayEntry(s, role[s.id] || null); });
      }
      if (liveSessions.length) cursor = cursor == null ? end : Math.max(cursor, end);
    });
    return `<div class="today-agenda">${html}</div>`;
  }

  /* ── Сегодня ─────────────────────────────────────────────────────────────── */

  function today() {
    const st = Store.get();
    const all = DB.byDate(st.day);
    const live = all.filter(s => s.status !== 'cancelled');
    const isEmpty = st.scenario === 'empty' || all.length === 0;

    const shell = (body) => `<div class="screen today">
      ${todayHeader()}
      <div class="screen__body">${body}</div>
      ${TabBar('trainer', 't-today')}
    </div>`;

    if (st.scenario === 'loading') {
      return `<div class="screen today">
        ${todayHeaderSkeleton()}
        <div class="screen__body">
          <div style="padding:2px 22px 12px"><div class="sk" style="width:92px;height:12px"></div></div>
          <div style="padding:0 16px">
            <div class="sk" style="height:280px;border-radius:26px"></div>
          </div>
        </div>
        ${TabBar('trainer', 't-today')}
      </div>`;
    }

    let body = '';
    if (st.scenario === 'offline') {
      body += `<div class="today-notice">${Notice('Нет связи. Показано из последней загрузки, изменения могут быть не отправлены.', { tone: 'warn', icon: 'wifioff' })}</div>`;
    }

    if (isEmpty) {
      body += `<div class="today-empty">${Card(Empty({
        icon: 'calendar', title: 'Сегодня занятий нет',
        sub: 'Добавьте занятие — клиент получит предложение времени.',
        action: Btn('Добавить занятие', { kind: 'primary', size: 'compact', a: 'tab', args: { id: 't-new' }, icon: 'plus' }),
      }), { pad: true })}</div>`;
    } else {
      const count = all.length;
      body += todayBuddy(all);
      body += `<section class="today-section">
        <div class="today-section__head">
          <h2 class="today-section__title">План дня</h2>
          <span class="today-section__count">${count} ${DB.plural(count, ['занятие', 'занятия', 'занятий'])}</span>
        </div>
        ${todayAgenda(st.day)}
        ${live.length ? `<p class="today-end">Последнее занятие до ${fmtHM(Math.max(...live.map(s => toMin(s.end))))}</p>` : ''}
      </section>`;
    }
    return shell(body);
  }

  /* ── Расписание ──────────────────────────────────────────────────────────── */

  // Calendar dates use UTC arithmetic so navigation never depends on the host zone.
  const calendarDate = (iso, offset = 0) => {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  function calendarEntry(s) {
    const group = s.kind === 'group';
    const c = s.clientId ? client(s.clientId) : null;
    const request = Object.values(Store.get().requests).find(r => r.sessionId === s.id && ['pending', 'counter'].includes(r.state));
    const cancelled = s.status === 'cancelled';
    const title = group ? s.title : c?.short || s.title;
    return `<article class="cal-entry${cancelled ? ' is-cancelled' : ''}">
      <button class="cal-entry__open" ${act('sheet.open', { id: 'session', sid: s.id })} aria-label="${esc(title)}, ${s.start}–${s.end}. Открыть занятие">
        <span class="cal-entry__time num"><strong>${s.start}</strong><span>${s.end}</span></span>
        <span class="cal-entry__content"><strong>${esc(title)}</strong>
          <span>${esc(group ? participantNames(s) : s.program || 'Программа пока не назначена')}</span>
          ${group ? `<small>${esc(groupSummary(s))}</small>` : ''}
          ${Store.logging.status(s.id) ? `<small class="cal-entry__journal">${Store.logging.status(s.id) === 'finished' ? 'Журнал завершён' : 'Журнал в работе'}</small>` : ''}
          ${cancelled ? '<small class="cal-entry__cancelled">Отменено</small>' : !request ? `<small class="cal-entry__confirmed">${s.status === 'proposed' ? 'Ждём согласия' : Icon.get('check', { size: 12 }) + (group ? ' Общее занятие' : ' Подтверждено')}</small>` : ''}
        </span>${Icon.get('chevR', { size: 16 })}
      </button>
      ${request && !cancelled ? `<button class="cal-request" ${act('sheet.open', request.awaiting === 'trainer' ? { id: 'todayRequest', rid: request.id } : { id: 'session', sid: s.id })}>
        ${Icon.get('swap', { size: 15 })}<span>${request.awaiting === 'trainer' ? 'Перенос · нужен ваш ответ' : 'Перенос · ждём клиента'}<small>Предложено ${DB.fmtDate((request.counter || request.to).date)}, ${(request.counter || request.to).start}</small></span>${Icon.get('chevR', { size: 14 })}</button>` : ''}
    </article>`;
  }

  function calendarAgenda(date) {
    const all = DB.byDate(date).slice().sort(byStart);
    if (!all.length || Store.get().scenario === 'empty') return `<div class="cal-empty">${Empty({ icon: 'calendar', title: 'День свободен', sub: 'Запланируйте занятие — выбранная дата уже будет заполнена.', action: Btn('Добавить занятие', { a: 'calendar.new', icon: 'plus', size: 'compact' }) })}</div>`;
    // Group actual intersections, including chained overlaps. Cancelled entries occupy no time.
    const clusters = [];
    all.filter(s => s.status !== 'cancelled').forEach(s => {
      const last = clusters[clusters.length - 1];
      if (last && toMin(s.start) < last.end) {
        last.sessions.push(s); last.end = Math.max(last.end, toMin(s.end));
      } else clusters.push({ start: toMin(s.start), end: toMin(s.end), sessions: [s] });
    });
    const rows = clusters.map(g => ({ at: g.start, html: g.sessions.length > 1
      ? `<section class="cal-overlap"><div class="cal-overlap__label">${Icon.get('alert', { size: 14 })} Пересечение · ${g.sessions.length} ${DB.plural(g.sessions.length, ['занятие', 'занятия', 'занятий'])}</div>${g.sessions.map(calendarEntry).join('')}</section>`
      : calendarEntry(g.sessions[0]) }));
    clusters.slice(1).forEach((g, i) => {
      const from = clusters[i].end;
      if (g.start > from) rows.push({ at: from, html: `<button class="cal-gap" ${act('today.newwindow', { date, start: fmtHM(from), end: fmtHM(g.start) })}><span class="num">${fmtHM(from)}–${fmtHM(g.start)}</span><span>Свободно · ${humanDur(g.start - from)}</span>${Icon.get('plus', { size: 16 })}</button>` });
    });
    all.filter(s => s.status === 'cancelled').forEach(s => rows.push({ at: toMin(s.start), html: calendarEntry(s) }));
    return `<div class="cal-agenda">${rows.sort((a, b) => a.at - b.at).map(r => r.html).join('')}</div>`;
  }

  function schedule() {
    const st = Store.get(), loading = st.scenario === 'loading';
    const weekday = (new Date(st.day + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const monday = calendarDate(st.day, -weekday);
    const dates = Array.from({ length: 7 }, (_, i) => calendarDate(monday, i));
    const all = st.scenario === 'empty' ? [] : DB.byDate(st.day);
    const live = all.filter(s => s.status !== 'cancelled');
    const month = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'Asia/Almaty' }).format(new Date(st.day + 'T12:00:00Z')).replace(' г.', '');
    const fullDate = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' }).format(new Date(st.day + 'T12:00:00Z'));
    return `<div class="screen calendar-screen">
      <header class="cal-head"><h1>Расписание</h1>${iconBtn('plus', { act: 'calendar.new', label: 'Добавить занятие на выбранный день', cls: 'cal-add' })}</header>
      <div class="screen__body">
        <section class="cal-nav" aria-label="Выбор даты">
          <div class="cal-month"><h2>${esc(month)}</h2><button ${act('day', { date: DB.TODAY })}>Сегодня</button></div>
          <div class="cal-week-nav">${iconBtn('chevL', { act: 'calendar.shift', args: { offset: -7 }, label: 'Предыдущая неделя' })}<span>${DB.fmtDate(dates[0])} — ${DB.fmtDate(dates[6])}</span>${iconBtn('chevR', { act: 'calendar.shift', args: { offset: 7 }, label: 'Следующая неделя' })}</div>
          <div class="cal-week">${dates.map((date, i) => {
            const count = st.scenario === 'empty' ? 0 : DB.byDate(date).filter(s => s.status !== 'cancelled').length;
            return `<button class="cal-day${date === st.day ? ' is-selected' : ''}${date === DB.TODAY ? ' is-today' : ''}" ${act('day', { date })} aria-pressed="${date === st.day}" ${date === DB.TODAY ? 'aria-current="date"' : ''} aria-label="${DB.fmtDateLong(date)}${loading ? '' : `, ${count} ${DB.plural(count, ['занятие', 'занятия', 'занятий'])}`}"><span>${DB.DOW[i]}</span><strong class="num">${Number(date.slice(8))}</strong><small>${loading ? '—' : count || '—'}</small></button>`;
          }).join('')}</div>
          <p class="cal-key">Количество занятий под датой <span>Алматы</span></p>
        </section>
        <section class="cal-day-section" aria-label="Занятия выбранного дня">
          <div class="cal-day-heading"><h2>${esc(fullDate)}</h2><p>${loading ? 'Загружаем расписание…' : `${live.length} ${DB.plural(live.length, ['занятие', 'занятия', 'занятий'])}${live.length ? ` · ${humanDur(live.reduce((sum, s) => sum + mins(s.start, s.end), 0))} занятий` : ''}`}</p></div>
          ${st.scenario === 'offline' ? Notice('Нет связи. Показано сохранённое расписание.', { icon: 'wifi', tone: 'warn' }) : ''}
          ${loading ? Skeleton(4) : calendarAgenda(st.day)}
        </section>
      </div>${TabBar('trainer', 't-schedule')}
    </div>`;
  }

  /* ── Новое занятие (wizard) ──────────────────────────────────────────────── */

  function newSession() {
    const st = Store.get();
    const c = st.newSession;
    const step = c.step;
    const timeOpts = Array.from(new Set(['07:00', '09:00', '11:30', '14:00', '17:00', '18:00', '18:30', '19:00', '20:00', c.start])).sort();

    const stepHead = `<div class="chips" style="padding:4px 16px 12px">
      ${['Клиенты', 'Время', 'Программа'].map((l, i) => `<span class="chip ${i === step ? 'is-on' : ''}" ${i < step ? act('ns.prev') : ''}>${i + 1}. ${l}</span>`).join('')}
    </div>`;

    let body = '';
    if (step === 0) {
      body = `<div style="padding:0 16px">
        <div class="label" style="margin-left:6px">Кто занимается</div>
        ${Card(DB.clients.map((x, i, arr) => Row({
          lead: Lead(x.initials, { tone: c.clientIds.includes(x.id) ? 'ink' : '', size: 'sm' }),
          title: x.name,
          meta: x.program ? esc(x.program) + (x.plan ? ` · осталось ${x.plan.remaining}` : '') : 'Без программы · выберите на следующем шаге',
          right: c.clientIds.includes(x.id) ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
          a: 'ns.toggle', args: { id: x.id }, last: i === arr.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:12px">${Notice('Несколько клиентов создают общее занятие. Выбранная программа будет назначена каждому; результаты записываются отдельно.', { tone: 'info', icon: 'info' })}</div>
      </div>`;
    } else if (step === 1) {
      body = `<div style="padding:0 16px">
        <div class="label" style="margin-left:6px">Дата</div>
          ${Card([...new Set([...DB.WEEK, c.date])].sort().map((date, i, arr) => Row({
          lead: Lead('' + Number(date.slice(8)), { size: 'sm' }),
          title: DB.fmtDateLong(date) + (date === DB.TODAY ? ' · сегодня' : ''),
          right: c.date === date ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
          a: 'ns.patch', args: { key: 'date', value: date }, last: i === arr.length - 1,
        })).join(''), { rows: true, cls: 'is-date' })}
        <div class="label" style="margin:16px 6px 10px">Начало</div>
        <div class="chips" style="flex-wrap:wrap">${timeOpts.map(t => `<span class="chip ${c.start === t ? 'is-on' : ''}" ${act('ns.patch', { key: 'start', value: t })} role="button" tabindex="0">${t}</span>`).join('')}</div>
        <div class="label" style="margin:18px 6px 10px">Длительность</div>
        <div class="chips">${Array.from(new Set([45, 60, 75, 90, Number(c.duration)])).filter(Boolean).sort((a, b) => a - b).map(d => `<span class="chip ${c.duration === d ? 'is-on' : ''}" ${act('ns.patch', { key: 'duration', value: d })} role="button" tabindex="0">${d} мин</span>`).join('')}</div>
      </div>`;
    } else {
      const collisions = Store.newSession.collisions();
      body = `<div style="padding:0 16px">
        ${collisions.length ? `<div style="margin-bottom:14px">${Notice(`Пересечение с ${collisions.length} ${collisions.length === 1 ? 'записью' : 'записями'}: ${collisions.map(s => `${s.start} ${s.clientId ? client(s.clientId).short : s.title}`).join(', ')}. Подтверждение тренера не заменяет согласие клиента на время.`, { tone: 'warn', icon: 'alert' })}</div>
        <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface);border-radius:14px;margin-bottom:14px">
          <input type="checkbox" ${c.collisionAck ? 'checked' : ''} ${act('ns.ack')} style="width:20px;height:20px;accent-color:var(--ink)">
          <span style="font-size:14px;font-weight:600">Подтверждаю пересечение</span>
        </label>` : ''}
        <div class="label" style="margin-left:6px">Программа</div>
        ${Card(DB.templates.map((t, i, arr) => Row({
          lead: Lead('dumbbell', { size: 'sm', icon: true }),
          title: t.name, meta: t.meta,
          right: c.program === t.program ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
          a: 'ns.patch', args: { key: 'program', value: t.program }, last: i === arr.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:12px">
          ${Card(Row({
            lead: Lead('clock', { size: 'sm', icon: true }),
            title: 'Назначить программу позже',
            meta: 'Клиент сможет согласовать время без программы',
            right: c.programLater ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
            a: 'ns.patch', args: { key: 'programLater', value: '1' }, last: true,
          }), { rows: true })}
        </div>
      </div>`;
    }

    return `<div class="screen">
      ${TopBar({ close: 'nav.back', title: 'Новое занятие' })}
      ${PageTitle({ title: 'Когда и с кем', sub: 'Сначала согласуем время. Программу можно назначить позже.', size: 'sm' })}
      ${stepHead}
      <div class="screen__body" style="padding-bottom:16px">${body}</div>
      <div style="padding:12px 16px 26px;display:flex;gap:10px">
        ${step > 0 ? Btn('Назад', { kind: 'soft', a: 'ns.prev' }) : ''}
        ${step < 2 ? Btn('Продолжить', { a: 'ns.next', disabled: step === 0 && !c.clientIds.length }) : Btn('Создать занятие', { a: 'ns.save', kind: 'mint' })}
      </div>
    </div>`;
  }

  /* ── Входящие ─────────────────────────────────────────────────────────────── */

  function inbox() {
    const st = Store.get();
    const rows = Object.values(st.requests);
    const active = rows.filter(r => r.state === 'pending' || r.state === 'counter');
    const past = rows.filter(r => !['pending', 'counter'].includes(r.state));

    const reqCard = (r) => {
      const c = client(r.clientId);
      const awaitingMe = r.awaiting === 'trainer';
      return Card(`<div style="padding:16px">
        <div class="request-person">
          ${Lead(c ? c.initials : '?', { size: 'sm' })}
          <div style="flex:1;min-width:0">
            <div style="font-size:15.5px;font-weight:700">${esc(c ? c.name : 'Клиент')}</div>
            <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">Запрос на перенос · ${r.author === 'trainer' ? 'предложено вами' : 'предложено клиентом'}</div>
          </div>
          ${r.awaiting === 'trainer' ? Pill('Ждёт вас', { tone: 'amber', pulse: true }) : Pill('Ждёт клиента', { tone: 'neutral', dot: false })}
        </div>
        <div style="margin-top:14px">
          ${UI.esc('')}<div class="diffcard ${r.state === 'counter' ? '' : 'is-warn'}" style="border:none;background:var(--sunken);padding:14px">
            <div class="diffcard__grid">
              <div class="diffcard__side"><div class="t">${r.from.start}–${r.from.end}</div><div class="d">${DB.fmtDateLong(r.from.date)} · действует</div></div>
              <div class="diffcard__arrow">${Icon.get('arrowRight', { size: 18 })}</div>
              <div class="diffcard__side"><div class="t">${(r.counter || r.to).start}–${(r.counter || r.to).end}</div><div class="d">${DB.fmtDateLong((r.counter || r.to).date)} · предложено</div></div>
            </div>
          </div>
        </div>
        ${awaitingMe && ['pending', 'counter'].includes(r.state) ? `<div class="btn-row" style="margin-top:14px">
          ${Btn('Принять', { kind: 'mint', size: 'compact', a: 'rs.accept', args: { id: r.id } })}
          ${Btn('Другое время', { kind: 'soft', size: 'compact', a: 'sheet.open', args: { id: 'counter', rid: r.id } })}
        </div>
        <div style="margin-top:9px">${Btn('Отклонить', { kind: 'ghost', size: 'compact', a: 'rs.decline', args: { id: r.id } })}</div>` : ''}
        ${!awaitingMe ? `<div style="margin-top:14px">${Btn('Отозвать запрос', { kind: 'soft', size: 'compact', a: 'rs.withdraw', args: { id: r.id } })}</div>` : ''}
        <div style="margin-top:12px;font-size:12.5px;color:var(--sec)">${esc(r.history[r.history.length - 1].at)}</div>
      </div>`);
    };

    return `<div class="screen request-inbox">
      ${TopBar({ back: 'nav.back', title: 'Входящие' })}
      <div class="screen__body" style="padding:4px 16px 20px">
        <div class="label" style="margin:6px 6px 12px">Активные</div>
        ${active.length ? active.map(r => `<div style="margin-bottom:12px">${reqCard(r)}</div>`).join('') : Card(Empty({ icon: 'check', title: 'Всё согласовано', sub: 'Новых запросов на перенос нет.' }), { pad: true })}
        ${past.length ? `<div class="label" style="margin:20px 6px 12px">История</div>${Card(past.map((r, i) => {
          const c = client(r.clientId);
          const label = { accepted: 'Перенос принят', declined: 'Отклонён', withdrawn: 'Отозван', stale: 'Устарел' }[r.state] || r.state;
          return Row({
            lead: Lead(c ? c.initials : '?', { size: 'sm' }),
            title: c ? c.short : 'Клиент',
            meta: `${label} · ${DB.fmtDate(r.from.date)} → ${DB.fmtDate((r.counter || r.to).date)}`,
            right: r.state === 'accepted' ? Pill('Принят', { tone: 'mint', dot: false }) : Pill('Закрыт', { tone: 'neutral', dot: false }),
            last: i === past.length - 1,
          });
        }).join(''), { rows: true })}` : ''}
      </div>
    </div>`;
  }

  /* ── Клиенты ──────────────────────────────────────────────────────────────── */

  function clients() {
    const st = Store.get();
    const loading = st.scenario === 'loading';
    const query = (st.clientQuery || '').trim().toLocaleLowerCase('ru');
    const filter = st.clientFilter || 'all';
    const people = st.scenario === 'empty' ? [] : DB.clients.filter(c => c.id !== 'c7');
    const upcoming = (c) => DB.sessions.filter(s => s.status !== 'cancelled'
      && (s.date > DB.TODAY || (s.date === DB.TODAY && s.end > DB.NOW_TIME))
      && (s.clientId === c.id || (s.participants || []).some(p => p.clientId === c.id && p.reply !== 'cancelled')))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
    const rows = people.map(c => ({ c, next: upcoming(c) }));
    const filters = [
      { id: 'all', label: 'Все', count: rows.length },
      { id: 'due', label: 'К оплате', count: rows.filter(x => x.c.plan?.due > 0).length },
      { id: 'unscheduled', label: 'Без записи', count: rows.filter(x => !x.next).length },
    ];
    const list = rows.filter(({c, next}) => (filter === 'all' || (filter === 'due' ? c.plan?.due > 0 : !next))
      && (!query || c.name.toLocaleLowerCase('ru').includes(query) || (c.phone || '').replace(/\D/g, '').includes(query.replace(/\D/g, '') || '!')))
      .sort((a,b) => a.c.name.localeCompare(b.c.name,'ru'));
    const row = ({c,next}) => {
      const connected = c.status !== 'new';
      const date = next ? (next.date === DB.TODAY ? 'Сегодня' : DB.fmtDate(next.date)) : '';
      return `<li class="directory-row"><button class="directory-row__open" ${act('client.open', {id:c.id})}>
        <span class="directory-avatar" aria-hidden="true">${esc(c.initials)}</span>
        <span class="directory-row__main"><strong>${esc(c.name)}</strong><span class="directory-row__program">${esc(c.program || 'Программа не назначена')}</span></span>
        <span class="directory-balance" aria-label="${c.plan ? `Осталось ${c.plan.remaining} ${DB.plural(c.plan.remaining,['занятие','занятия','занятий'])}` : 'Нет пакета'}">${c.plan ? `<strong class="num">${c.plan.remaining}</strong><small>осталось</small>` : '<small>Нет<br>пакета</small>'}</span>
        <span class="directory-row__next">${Icon.get('calendar',{size:14})}<span>${next ? `${esc(date)} · ${next.start}${next.kind === 'group' ? ' · мини-группа' : ''}` : 'Нет будущих занятий'}</span>${Icon.get('chevR',{size:14})}</span>
        ${c.plan?.due > 0 || !connected ? `<span class="directory-row__flags">${c.plan?.due > 0 ? `<span class="directory-due">К оплате ${DB.fmtMoney(c.plan.due)}</span>` : ''}${!connected ? '<span class="directory-connection">Не подключён</span>' : ''}</span>` : ''}
      </button></li>`;
    };
    return `<div class="screen directory-screen">
      <header class="directory-head"><div><h1>Клиенты</h1><p>${loading ? 'Загружаем список…' : `${people.length} ${DB.plural(people.length,['клиент','клиента','клиентов'])} в вашей базе`}</p></div>${iconBtn('plus',{act:'sheet.open',args:{id:'clientCreate'},label:'Добавить клиента',cls:'directory-add'})}</header>
      <div class="directory-controls">
        <div class="directory-search">${Icon.get('search',{size:19})}<input type="search" data-directory-search aria-label="Поиск клиента по имени или телефону" placeholder="Имя или телефон" value="${esc(st.clientQuery || '')}" autocomplete="off">${st.clientQuery ? iconBtn('close',{act:'clients.clear',label:'Очистить поиск'}) : ''}</div>
        <div class="directory-filters" role="group" aria-label="Фильтр клиентов">${filters.map(f=>`<button ${act('clients.filter',{filter:f.id})} aria-pressed="${filter===f.id}" class="${filter===f.id?'is-selected':''}">${f.label}<span>${loading?'—':f.count}</span></button>`).join('')}</div>
      </div>
      <div class="screen__body directory-body">
        ${st.scenario === 'offline' ? Notice('Нет связи. Показан сохранённый список клиентов.',{icon:'wifi'}) : ''}
        <div class="directory-list-head"><span>${query ? 'Результаты поиска' : filters.find(f=>f.id===filter).label === 'Все' ? 'По алфавиту' : filters.find(f=>f.id===filter).label}</span><span role="status" aria-live="polite">${loading ? '' : `${list.length} ${DB.plural(list.length,['клиент','клиента','клиентов'])}`}</span></div>
        ${loading ? Skeleton(5) : list.length ? `<ul class="directory-list">${list.map(row).join('')}</ul>` : `<div class="directory-empty">${Empty({icon:query?'search':'users',title:query?'Клиент не найден':people.length?'В этом списке пока никого':'Ваш первый клиент',sub:query?'Проверьте имя или телефон. Можно также сбросить фильтры.':people.length?'Все клиенты доступны в общем списке.':'Создайте карточку. Программу и занятия можно добавить до подключения клиента.',action:people.length?Btn('Сбросить поиск и фильтры',{kind:'soft',a:'clients.reset',size:'compact'}):Btn('Добавить клиента',{a:'sheet.open',args:{id:'clientCreate'},icon:'plus',size:'compact'})})}</div>`}
      </div>${TabBar('trainer','t-clients')}
    </div>`;
  }

  /* ── Карточка клиента ─────────────────────────────────────────────────────── */

  function clientCard() {
    const st = Store.get();
    const c = client(st.activeClient) || client('c1');
    const tab = st.clientTab;

    const tabs = ['sessions', 'program', 'progress', 'billing', 'notes'];
    const tabLabels = { sessions: 'Занятия', program: 'Программа', progress: 'Прогресс', billing: 'Оплаты', notes: 'Заметки' };

    const header = `<div style="padding:6px 16px 0">
      <div style="display:flex;align-items:center;gap:14px">
        ${Lead(c.initials, { size: '' })}
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--disp);font-weight:800;font-size:22px;letter-spacing:-.4px">${esc(c.name)}</div>
          <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">${c.plan ? esc(c.plan.title) : 'Без покупки'}</div>
        </div>
        ${iconBtn('more', { act: 'sheet.open', args: { id: 'clientActions', cid: c.id }, label: 'Действия', size: 22 })}
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <div class="card" style="flex:1;padding:13px 14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sec)">Остаток</div>
          <div class="num" style="font-family:var(--disp);font-weight:900;font-size:24px;letter-spacing:-1px;margin-top:4px">${c.plan ? c.plan.remaining : 0}</div>
        </div>
        <div class="card" style="flex:1;padding:13px 14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sec)">К оплате</div>
          <div class="num" style="font-family:var(--disp);font-weight:900;font-size:19px;letter-spacing:-.6px;margin-top:6px;${c.plan && c.plan.due > 0 ? 'color:var(--amber-ink)' : ''}">${c.plan ? DB.fmtMoney(c.plan.due) : '0 ₸'}</div>
        </div>
      </div>
    </div>`;

    const chips = `<div class="chips" style="padding:18px 16px 10px">
      ${tabs.map(t => `<span class="chip chip--soft ${tab === t ? 'is-on' : ''}" ${act('client.tab', { tab: t })} role="button" tabindex="0">${tabLabels[t]}</span>`).join('')}
    </div>`;

    let content = '';
    if (tab === 'sessions') {
      const own = DB.sessions.filter(s => s.clientId === c.id || (s.participants || []).some(p => p.clientId === c.id));
      content = `<div class="trainer-bookings" style="padding:0 16px">
        ${own.length ? Card(own.map((s, i) => Row({
          title: `${DB.fmtDate(s.date)} · ${s.start}–${s.end}`,
          meta: `${s.program || 'Программа позже'} · ${s.kind === 'group' ? 'мини-группа' : 'индивидуальное'}`,
          right: agreementPill(s),
          a: 'sheet.open', args: { id: 'session', sid: s.id }, last: i === own.length - 1,
        })).join(''), { rows: true }) : Card(Empty({ icon: 'calendar', title: 'Нет занятий', sub: 'Создайте занятие и назначьте программу.' }), { pad: true })}
        <div style="margin-top:12px">${Btn('Создать занятие', { kind: 'soft', a: 'tab', args: { id: 't-new' }, icon: 'plus' })}</div>
      </div>`;
    } else if (tab === 'program') {
      const exs = DB.programForClient(c.id, c.program);
      content = `<div style="padding:0 16px">
        ${c.program ? `<div class="notice notice--info" style="margin-bottom:12px">${Icon.get('info', { size: 18 })}<div>Текущий шаблон: <b>${esc(c.program)}</b>. Изменение назначенной программы не переписывает прошлые занятия.</div></div>` : ''}
        ${exs.length ? Card(exs.map((e, i) => Row({
          lead: Lead('' + (i + 1), { size: 'sm' }),
          title: e.name, meta: `${e.sets} × ${e.reps}${e.target ? ' · ' + DB.fmtNumber(e.target) + ' кг' : ''}`,
          right: e.pr ? `<span class="exrow__pr">${Icon.get('trophy', { size: 14 })}${DB.fmtNumber(e.pr)}</span>` : '',
          last: i === exs.length - 1,
        })).join(''), { rows: true }) : Card(Empty({ icon: 'dumbbell', title: 'Программы нет', sub: 'Назначьте шаблон из библиотеки — программа применится к будущим занятиям.', action: Btn('Открыть библиотеку', { kind: 'soft', size: 'compact', a: 'nav.go', args: { id: 't-library' } }) }), { pad: true })}
      </div>`;
    } else if (tab === 'progress') {
      const h = DB.history[c.id] || [];
      content = h.length ? progressBlocks(c, h) : `<div style="padding:0 16px">${Card(Empty({ icon: 'trend', title: 'Пока нет данных', sub: 'История появится после первых записанных занятий. Отсутствие данных — не ноль.' }), { pad: true })}</div>`;
    } else if (tab === 'billing') {
      const p = st.billing.purchases.filter(x => x.clientId === c.id);
      const pays = st.billing.payments.filter(x => x.clientId === c.id);
      content = `<div style="padding:0 16px">
        ${p.length ? p.map(pur => Card(`<div style="padding:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="font-size:15.5px;font-weight:700">${esc(pur.title)}</div>
            ${pur.due > 0 ? Pill('К оплате ' + DB.fmtMoney(pur.due), { tone: 'amber', dot: false }) : Pill('Оплачено', { tone: 'mint', dot: false })}
          </div>
          <div style="margin-top:10px">${KV([
            ['Стоимость', DB.fmtMoney(pur.price)],
            ['Получено', DB.fmtMoney(pur.paid)],
            ['Занятий', `${pur.units} · использовано ${pur.used}`],
            ['Срок', pur.expires ? DB.fmtDate(pur.expires) : 'без срока'],
          ])}</div>
          <div style="margin-top:12px">${Btn('Записать оплату', { kind: 'soft', size: 'compact', a: 'sheet.open', args: { id: 'pay', cid: c.id, due: pur.due } })}</div>
        </div>`) + '<div style="height:12px"></div>').join('') : Card(Empty({ icon: 'wallet', title: 'Покупок нет', sub: 'Разовое занятие или пакет появятся здесь после покупки.' }), { pad: true })}
        <div class="label" style="margin:8px 6px 10px">История оплат</div>
        ${pays.length ? Card(pays.map((x, i) => Row({
          lead: Lead('wallet', { size: 'sm', icon: true, tone: 'mint' }),
          title: DB.fmtMoney(x.amount),
          meta: `${DB.fmtDateLong(x.date)} · ${x.method}${x.note ? ' · ' + x.note : ''}`,
          right: Pill('Записано', { tone: 'neutral', dot: false }),
          last: i === pays.length - 1,
        })).join(''), { rows: true }) : `<div class="card card--pad" style="font-size:13px;color:var(--sec)">Оплат пока нет.</div>`}
      </div>`;
    } else {
      content = `<div style="padding:0 16px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div class="label" style="margin-left:6px">План и цель</div>
          ${Card(KV([['Цель', c.goal || '—'], ['Программа', c.program || '—'], ['Проведено', `${c.sessionsDone} занятий`], ['В приложении', 'с ' + DB.fmtDate(c.joined)]]), { pad: true })}
        </div>
        <div>
          <div class="label" style="margin-left:6px">Заметка тренера · приватно</div>
          ${Card(`<div style="display:flex;gap:10px">${Icon.get('lock', { size: 18, style: 'color:var(--ter);flex-shrink:0;margin-top:2px' })}<div style="font-size:14px;line-height:1.5">${c.note ? esc(c.note) : 'Заметок нет.'}</div></div>`, { pad: true })}
        </div>
        <div>
          <div class="label" style="margin-left:6px">Комментарий для клиента</div>
          ${Card(`<div style="display:flex;gap:10px">${Icon.get('eye', { size: 18, style: 'color:var(--ter);flex-shrink:0;margin-top:2px' })}<div style="font-size:14px;line-height:1.5">${c.clientComment ? esc(c.clientComment) : 'Пусто. Клиент увидит этот текст.'}</div></div>`, { pad: true })}
        </div>
      </div>`;
    }

    return `<div class="screen reference-screen">
      ${TopBar({ back: 'nav.back', title: '', right: c.id === 'c6' ? Btn('Пригласить', { kind: 'ghost', size: 'sm', a: 'nav.go', args: { id: 't-invite' } }) : '' })}
      <div class="screen__body">${header}${chips}${content}<div style="height:24px"></div></div>
    </div>`;
  }

  /* ── Проведение тренировки ────────────────────────────────────────────────── */

  function session() {
    const st = Store.get();
    const lg = st.logging;
    const booking = DB.sessions.find(x => x.id === lg.sessionId);
    if (!booking) return `<div class="screen">${TopBar({ title: 'Журнал тренировки' })}<div class="screen__body" style="padding:16px">${Empty({ icon: 'calendar', title: 'Выберите занятие', sub: 'Откройте нужную запись в расписании. Результаты сохраняются отдельно для каждого занятия.', action: Btn('К расписанию', { a: 'tab', args: { id: 't-schedule' } }) })}</div></div>`;
    const s = { ...booking, ...lg.context };
    const participants = Object.entries(lg.plans).map(([clientId, p]) => ({ ...p, clientId, client: client(clientId) }));
    const active = lg.active || (participants[0] && participants[0].clientId);
    const activeClient = client(active);
    const programName = lg.plans[active]?.name;
    const exs = Store.logging.exercises(active);
    const { total: totalSets, done: doneSets } = Store.logging.progress(active);
    const eligible = Store.logging.eligible(active);

    const strip = participants.length > 1 ? `<div class="pstrip" role="group" aria-label="Участники и записанные подходы">
      ${participants.map(p => {
        const { total, done, drafts } = Store.logging.progress(p.clientId);
        const on = p.clientId === active;
        const participating = Store.logging.eligible(p.clientId);
        const label = `${p.client.short} ${participating ? `${done}/${total} подходов` : 'Не участвует'}${drafts ? ' · Есть черновик' : ''}${p.reply === 'pending' ? ' · Ждём ответа' : ''}`;
        return `<button class="pcard${on ? ' is-on' : ''}" ${act('log.switch', { id: p.clientId })} aria-pressed="${on}" aria-label="${esc(label)}">
          <div class="pcard__name">${esc(p.client.short)}</div>
          <div class="pcard__meta">${participating ? `${done}/${total}` : 'Не участвует'}</div>
          ${drafts ? '<div class="pcard__prog">Есть черновик</div>' : ''}
          ${p.reply === 'pending' ? '<div class="pcard__prog">Ждём ответа</div>' : ''}
        </button>`;
      }).join('')}
    </div>` : '';

    const interactive = !lg.finished && eligible;
    const valuesOf = e => (lg.values[active] || {})[e.id] || [];
    const nextEx = exs.find(e => !e.skipped && Array.from({ length: e.sets }).some((_, i) => !valuesOf(e)[i]));
    const rows = exs.map(e => {
      const arr = valuesOf(e);
      if (e.skipped && e.replacedBy && !arr.some(Boolean)) return '';
      const nextIndex = e === nextEx ? Array.from({ length: e.sets }).findIndex((_, i) => !arr[i]) : -1;
      const unit = e.unit || (e.name === 'Планка' ? 'сек' : 'повт');
      const hasPrev = e.prev && e.prev.reps > 0;
      const weighted = e.prev?.kg !== 0;
      const prev = !hasPrev ? '—' : e.prev.kg ? `${DB.fmtNumber(e.prev.kg)} кг × ${e.prev.reps}` : `${e.prev.reps} ${unit}`;
      const prevMeta = hasPrev ? `прошлый раз ${prev}` : 'первый раз';
      const planned = e.origin === 'added' ? 0 : (e.plannedSets ?? e.sets);
      const indices = e.skipped ? arr.map((v, i) => (v ? i : -1)).filter(i => i >= 0) : Array.from({ length: e.sets }, (_, i) => i);
      const rowsHtml = indices.map(si => {
        const v = arr[si];
        const draft = lg.drafts[active]?.[e.id]?.[si];
        const isNext = interactive && !v && si === nextIndex;
        const verb = draft ? 'Продолжить' : v ? 'Изменить' : 'Записать';
        const draftText = draft ? (weighted
          ? `${esc(draft.kg || '—')} кг × ${esc(draft.reps || '—')}`
          : `${esc(draft.reps || '—')} ${unit}`) : '';
        const value = draft
          ? `<span class="setrow__draft num">${draftText}</span><span class="setrow__meta">${v ? `записано ${DB.fmtNumber(v.kg)} кг × ${v.reps}` : prevMeta}</span>`
          : v
          ? `<span class="setrow__today num">${v.kg ? `${DB.fmtNumber(v.kg)} кг <span class="r">× ${v.reps}</span>` : `${v.reps} <span class="r">${unit}</span>`}</span>
             <span class="setrow__meta">${prevMeta}</span>`
          : `<span class="setrow__plan num">${prev}</span>
             <span class="setrow__meta">${lg.finished ? 'не записан' : hasPrev ? 'прошлый раз' : 'первый раз'}</span>`;
        const mark = v && !draft
          ? `<span class="setrow__done" aria-hidden="true">${Icon.get('check', { size: 15, sw: 3 })}</span>`
          : interactive ? `<span class="setrow__pen" aria-hidden="true">${Icon.get(isNext && !draft ? 'plus' : 'edit', { size: 17, sw: 2.2 })}</span>` : '';
        const inner = `<span class="setrow__no num">${si + 1}</span>
          <span class="setrow__body">${value}${draft ? `<span class="log-draft-label">${lg.finished ? 'Черновик не учтён' : 'Черновик'}</span>` : ''}${planned && si >= planned ? '<span class="log-extra-label">сверх плана</span>' : ''}</span>
          ${mark}`;
        const cls = `setrow${v ? ' is-done' : ''}${isNext ? ' is-next' : ''}${draft ? ' is-draft' : ''}`;
        const suggestion = Store.logging.repeatSuggestion(active, e.id, si);
        if (interactive && suggestion) {
          const proposed = suggestion.kg ? `${DB.fmtNumber(suggestion.kg)} кг × ${suggestion.reps}` : `${suggestion.reps} ${unit}`;
          return `<div class="${cls} setrow--quick">
            <span class="setrow__no num">${si + 1}</span>
            <button class="setrow__quick" aria-label="Записать как в прошлый раз: ${proposed}, подход ${si + 1}: ${esc(e.name)}" ${act('setlog.quick', { cid: active, ex: e.id, si, kg: suggestion.kg, reps: suggestion.reps })}>
              <span class="setrow__source">Как в прошлый раз</span><span class="setrow__proposal num">${Icon.get('check', { size: 16 })}<span>Записать ${proposed}</span></span>
            </button>
            <button class="setrow__adjust" aria-label="${verb} подход ${si + 1}: ${esc(e.name)}" title="Изменить значения" ${act('sheet.open', { id: 'setlog', cid: active, ex: e.id, si })}>${Icon.get('edit', { size: 19 })}</button>
          </div>`;
        }
        return interactive
          ? `<button class="${cls}" aria-label="${verb} подход ${si + 1}: ${esc(e.name)}" ${act('sheet.open', { id: 'setlog', cid: active, ex: e.id, si })}>${inner}</button>`
          : `<div class="${cls}">${inner}</div>`;
      }).join('');
      const tag = e.origin === 'replaced' ? `<span class="extag extag--swap">${Icon.get('swap', { size: 12, sw: 2.4 })}вместо ${esc(e.replaces)}</span>`
        : e.origin === 'added' ? `<span class="extag extag--add">${Icon.get('plus', { size: 12, sw: 2.6 })}не из программы</span>`
        : e.skipped ? `<span class="extag extag--skip">${e.replacedBy ? 'заменено' : 'пропущено'}</span>` : '';
      const goal = e.skipped ? `записано ${arr.filter(Boolean).length}`
        : e.origin === 'added' ? `${e.sets} ${DB.plural(e.sets, ['подход', 'подхода', 'подходов'])}`
        : e.reps ? `цель ${planned} × ${e.reps}${e.target ? ' · ' + DB.fmtNumber(e.target) + ' кг' : ''}` : `цель ${planned} ${DB.plural(planned, ['подход', 'подхода', 'подходов'])}`;
      const last = e.sets - 1;
      const canRemove = e.sets > Math.max(1, planned) && !arr[last] && !lg.drafts[active]?.[e.id]?.[last];
      const foot = !interactive ? ''
        : e.skipped ? (e.replacedBy ? '' : `<div class="excard__foot"><button class="excard__btn" ${act('ex.unskip', { cid: active, ex: e.id })}>${Icon.get('refresh', { size: 16 })}Вернуть упражнение</button></div>`)
        : `<div class="excard__foot"><button class="excard__btn" ${act('ex.addSet', { cid: active, ex: e.id })} aria-label="Добавить подход: ${esc(e.name)}">${Icon.get('plus', { size: 16, sw: 2.4 })}Подход</button>${canRemove ? `<button class="excard__btn excard__btn--quiet" ${act('ex.removeSet', { cid: active, ex: e.id })} aria-label="Убрать пустой подход ${e.sets}: ${esc(e.name)}">${Icon.get('minus', { size: 16, sw: 2.4 })}Убрать пустой</button>` : ''}</div>`;
      return Card(`<div class="excard__head">
          <div class="excard__title"><div class="excard__name">${esc(e.name)}</div>${tag}</div>
          <div class="excard__goal num">${goal}</div>
          ${interactive && !e.skipped ? `<button class="excard__menu" ${act('sheet.open', { id: 'exMenu', cid: active, ex: e.id })} aria-label="Изменить упражнение: ${esc(e.name)}">${Icon.get('more', { size: 20 })}</button>` : ''}
        </div>${rowsHtml}${foot}`, { rows: true, cls: `card--flush excard${e.skipped ? ' excard--skipped' : ''}` });
    }).filter(Boolean).join('<div style="height:12px"></div>')
      + (interactive && exs.length ? `<button class="log-add-ex" ${act('sheet.open', { id: 'exPick', mode: 'add', cid: active })}>${Icon.get('plus', { size: 18, sw: 2.4 })}Добавить упражнение</button>` : '');

    const saveState = lg.storageError
      ? SaveState('error', lg.storageConflict ? 'Журнал изменён в другой вкладке · местные правки не отправлены' : 'Только в памяти вкладки · не закрывайте её')
      : '';

    return `<div class="screen session-journal${participants.length > 1 ? ' session-journal--group' : ''}">
      <div class="topbar" style="padding-bottom:2px">
        <div class="topbar__side">${lg.finished ? iconBtn('chevL', { act: 'log.leave', label: 'Назад к расписанию', size: 24 }) : `<button class="log-minimize" ${act('log.minimize')} aria-label="Свернуть тренировку">${Icon.get('chevD', { size: 18 })}<span>Свернуть</span></button>`}</div>
        <div class="log-screen-status"><span class="log-screen-status__default">${lg.finished ? 'Результаты' : 'Журнал тренировки'}</span><span class="log-screen-status__client">${esc(participants.length > 1 ? `Мини-группа · ${activeClient.short}` : activeClient.name)}</span></div>
        <div class="topbar__side">${iconBtn('more', { act: 'sheet.open', args: { id: 'session', sid: s.id }, label: 'Ещё' })}</div>
      </div>
      <div class="screen__body">
        <div class="log-head">
          <h1 tabindex="-1" class="log-head__title">${esc(s.kind === 'personal' ? activeClient.name : s.title)}</h1>
          <div class="log-head__sub num">${DB.fmtDateLong(s.date)} · ${s.start}–${s.end}</div>
          ${saveState ? `<div class="log-head__save">${saveState}</div>` : ''}
          ${lg.storageError ? `<div class="log-recovery">${lg.storageConflict ? '<p>Скачайте копию этой вкладки перед перезагрузкой. Автоматическое объединение не поддерживается.</p>' : Btn('Повторить сохранение', { kind: 'soft', size: 'compact', a: 'log.retry' })}${Btn('Скачать копию журнала', { kind: 'soft', size: 'compact', a: 'log.export' })}</div>` : ''}
          ${lg.completedElsewhere ? `<div class="log-recovery" role="status"><p>Журнал завершён в другой вкладке. Результаты открыты для просмотра. Прежние данные этой вкладки доступны в копии журнала. Скачайте её перед перезагрузкой.</p>${Btn('Скачать копию журнала', { kind: 'soft', size: 'compact', a: 'log.export' })}</div>` : ''}
          ${lg.finished ? `<div class="log-completed" role="status">
            <div class="log-completed__score num"><b>${doneSets}</b><span>из ${totalSets} подходов</span></div>
            <strong>Журнал завершён</strong><p>Посещение и списание не изменены. Ниже — подтверждённые результаты.</p>${UI.ChangesSummary(active)}${lg.finished && Store.programs.options(active).length ? Btn('Обновить программу клиента', {kind:'soft', a:'sheet.open', args:{id:'programUpdate',cid:active}}) : ''}</div>` : ''}
        </div>
        <div class="log-context">${strip}
        ${participants.length === 1 ? `<div class="log-context__solo">
          <div class="log-context__line"><span>${esc(programName || 'Без программы')}</span>${totalSets && eligible ? `<span class="num log-context__count">${doneSets}/${totalSets}</span>` : ''}</div>
          ${totalSets && eligible ? `<div class="log-progress">${Meter(doneSets, totalSets)}</div>` : ''}
        </div>` : `<div class="log-context__who">
          <div class="log-context__identity">${lg.finished ? 'Результаты' : eligible ? 'Записываем' : 'Участник'}: <b>${esc(activeClient ? activeClient.name : '')}</b></div>
          <div class="log-context-meta">${esc(programName || 'Без программы')}</div>${lg.plans[active]?.reply === 'pending' ? '<div class="log-context-meta">Участие пока не подтверждено</div>' : ''}
        </div>`}
        </div>
        ${notesCard(active, lg)}
        <div style="padding:14px 16px 0">${!eligible ? Notice('Участник отменил запись или отмечен как не пришедший. Запись подходов недоступна; ранее записанное сохранено.', { tone: 'info', icon: 'info' }) : ''}${ProgramOrEmpty(activeClient, programName, rows, exs.length, interactive, active)}</div>
        ${lg.finished ? '' : '<p class="log-footnote">Выход не завершает журнал. Посещение и списание — отдельно. Записи хранятся в этом браузере, без синхронизации.</p>'}
        <div style="height:20px"></div>
      </div>
      <div style="padding:12px 16px 26px">
        ${!lg.finished ? `<div class="log-feedback"><div class="log-action-status" role="status">${lg.feedback ? esc(lg.storageError ? 'Изменения только в этой вкладке · ошибка сохранения' : lg.feedback) : ''}</div>
          ${lg.quickUndo ? `<button class="log-undo" aria-label="Отменить запись" ${act('setlog.undoQuick', { cid: lg.quickUndo.clientId, ex: lg.quickUndo.exId, si: lg.quickUndo.setId })}>Отменить</button>` : ''}</div>` : ''}
        ${lg.finished || !eligible ? Btn(lg.finished ? 'Вернуться к расписанию' : 'Завершить тренировку', { kind: lg.finished ? 'primary' : 'soft', a: lg.finished ? 'tab' : 'log.finish', args: lg.finished ? { id: 't-schedule' } : {} })
          : `<div class="log-actions">
            <button class="log-voice" data-voice-hold aria-label="Голос: удерживайте и говорите. Короткое нажатие открывает ввод текстом" title="Удерживайте и говорите">
              <span class="log-voice__face">${Store.preferences.calm() ? Icon.get('mic', { size: 28 }) : Mascot.face('smile', 34)}<span class="log-voice__mic">${Icon.get('mic', { size: 12, sw: 2.6 })}</span></span>
              <span class="log-voice__txt"><b>Голос</b><small>удерживайте</small></span>
            </button>
            ${Btn('Завершить тренировку', { kind: 'soft', a: 'log.finish' })}
          </div>`}
      </div>
    </div>`;
  }

  function notesCard(clientId, lg) {
    const notes = lg.notes?.[clientId] || [];
    if (!notes.length) return '';
    return `<section class="log-notes" aria-label="Заметки тренера">
      <div class="log-notes__head">${Icon.get('note', { size: 17 })}<span>Заметки</span><span class="num">${notes.length}</span></div>
      <ul>${notes.map((n, i) => `<li><span class="log-notes__time num">${esc(n.at)}</span><span class="log-notes__text">${esc(n.text)}</span><button class="note-share" role="switch" aria-checked="${n.shared === true}" ${act('note.share', {cid:clientId,i})}>Видно клиенту · ${n.shared === true ? 'да' : 'нет'}</button>${lg.finished ? '' : `<button class="log-notes__x" ${act('note.remove', { cid: clientId, i })} aria-label="Удалить заметку: ${esc(n.text)}">${Icon.get('close', { size: 15, sw: 2.4 })}</button>`}</li>`).join('')}</ul>
    </section>`;
  }

  function ProgramOrEmpty(activeClient, programName, rows, count = 0, interactive = false, clientId = null) {
    if (!count) {
      return Card(Empty({
        icon: 'dumbbell', title: programName ? 'В программе нет упражнений' : 'Тренировка без программы',
        sub: interactive ? 'Добавляйте упражнения по ходу — кнопкой или голосом. Программа клиента не изменится.' : 'Упражнения не записаны. Посещение отмечается отдельно через меню занятия.',
        action: interactive ? Btn('Добавить упражнение', { kind: 'primary', size: 'compact', icon: 'plus', a: 'sheet.open', args: { id: 'exPick', mode: 'add', cid: clientId } }) : '',
      }), { pad: true });
    }
    return rows;
  }

  /* ── Библиотека ───────────────────────────────────────────────────────────── */

  function library() {
    return `<div class="screen reference-screen">
      ${TopBar({ back: 'nav.back', title: 'Библиотека', right: Btn('Создать', { kind: 'ghost', size: 'sm', a: 'sheet.open', args: { id: 'customEx' } }) })}
      <div class="screen__body" style="padding:4px 16px 20px">
        <div class="field field--search" style="margin-bottom:6px">${Icon.get('search', { size: 19, style: 'color:var(--ter)' })}<input placeholder="Упражнение или шаблон" aria-label="Поиск упражнений" data-ex-search></div>
        <div class="chips" style="padding:12px 0">
          ${['Все', 'Шаблоны', 'Ноги', 'Верх', 'Пресс', 'Мои'].map((f, i) => `<span class="chip chip--soft ${i === 0 ? 'is-on' : ''}" aria-disabled="true">${f}</span>`).join('')}
        </div>
        <p class="client-footnote" style="margin:0 4px 16px">Показана вся библиотека. Ищите по названию или разговорному имени. Фильтры пока недоступны.</p>
        <div class="label" style="margin-left:6px">Шаблоны</div>
        ${Card(DB.templates.map((t, i) => Row({
          lead: Lead('layers', { size: 'sm', icon: true }),
          title: t.name, meta: `${t.meta} · используется ${t.uses}`,
          right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
          a: 'template.open', args: { id: t.id }, last: i === DB.templates.length - 1,
        })).join(''), { rows: true, cls: '' })}
        <div class="label" style="margin:18px 6px 10px">Упражнения</div>
        <ul class="expick__list">${Store.logging.library().map(e => `<li data-ex-item data-name="${esc(e.name)}" data-search="${esc([e.name, ...(e.aliases || [])].join(' '))}">${Row({lead: Lead('dumbbell', {size:'sm', icon:true}), title:e.name, meta:e.group})}</li>`).join('')}</ul>
      </div>
    </div>`;
  }

  function template() {
    const template = DB.templates.find(t => t.id === Store.get().selectedTemplate) || DB.templates[0];
    const exs = DB.programFor(template.program);
    return `<div class="screen reference-screen">
      ${TopBar({ back: 'nav.back', title: 'Шаблон' })}
      <div class="screen__body" style="padding:4px 16px 20px">
        ${PageTitle({ title: template.name, sub: `${template.meta} · использований: ${template.uses}`, size: 'sm' })}
        ${Card(exs.map((e, i) => Row({
          lead: Lead('' + (i + 1), { size: 'sm' }),
          title: e.name, meta: `${e.sets} × ${e.reps}${e.target ? ' · ' + DB.fmtNumber(e.target) + ' кг' : ''}`,
          last: i === exs.length - 1,
        })).join(''), { rows: true })}
        <p class="client-footnote">Программу можно выбрать при создании занятия. Редактирование и дублирование шаблонов в демо пока недоступны.</p>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
          ${Btn('Создать занятие', { kind: 'primary', a: 'tab', args: { id: 't-new' }, icon: 'plus' })}
        </div>
      </div>
    </div>`;
  }

  /* ── Пакеты и оплаты ──────────────────────────────────────────────────────── */

  function billing() {
    return `<div class="screen reference-screen">
      ${TopBar({ back: 'nav.back', title: 'Пакеты и оплаты' })}
      <div class="screen__body" style="padding:4px 16px 20px">
        <div class="label" style="margin-left:6px">Активные покупки</div>
        ${Store.get().billing.purchases.map(p => {
          const c = client(p.clientId);
          return Card(`<div style="padding:16px">
            <div style="display:flex;align-items:center;gap:12px">
              ${Lead(c.initials, { tone: p.due > 0 ? 'amber' : 'mint', size: 'sm' })}
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:700">${esc(c.short)} <span style="font-weight:500;color:var(--sec)">· ${esc(p.title)}</span></div>
                <div style="font-size:12.5px;font-weight:500;color:var(--sec);margin-top:2px">${p.units} занятий · использовано ${p.used}</div>
              </div>
            </div>
            <div style="margin-top:12px">${KV([['Стоимость', DB.fmtMoney(p.price)], ['Получено', DB.fmtMoney(p.paid)], ['К оплате', DB.fmtMoney(p.due)]])}</div>
            <div style="margin-top:12px">${Btn('Записать оплату', { kind: 'soft', size: 'compact', a: 'sheet.open', args: { id: 'pay', cid: c.id, due: p.due } })}</div>
          </div>`);
        }).join('<div style="height:12px"></div>')}
        <div class="label" style="margin:18px 6px 10px">Движение занятий · отдельная история</div>
        ${Card(Store.get().billing.unitTx.map((u, i) => {
          const c = client(u.clientId);
          return Row({
            lead: Lead(u.delta > 0 ? 'refresh' : 'minus', { size: 'sm', icon: true, tone: u.delta > 0 ? 'mint' : '' }),
            title: `${u.delta > 0 ? '+' : ''}${u.delta} занятие · ${c.short}`,
            meta: `${DB.fmtDate(u.date)} · ${u.reason}`,
            right: `<span class="num" style="font-family:var(--disp);font-weight:800;color:${u.delta > 0 ? 'var(--mint-ink)' : 'var(--ink)'}">${u.delta > 0 ? '+' : ''}${u.delta}</span>`,
            last: i === Store.get().billing.unitTx.length - 1,
          });
        }).join(''), { rows: true })}
      </div>
    </div>`;
  }

  /* ── Приглашение ──────────────────────────────────────────────────────────── */

  function invite() {
    const st = Store.get();
    const inv = st.invite;
    const statePill = {
      not_connected: Pill('Не подключён', { tone: 'neutral', dot: false }),
      link_created: Pill('Ссылка создана', { tone: 'amber', pulse: true }),
      connected: Pill('Подключился', { tone: 'mint', dot: false }),
    }[inv.state];

    let actions = '';
    if (inv.state === 'not_connected') {
      actions = Btn('Создать ссылку-приглашение', { a: 'invite.create', icon: 'link' });
    } else if (inv.state === 'link_created') {
      actions = `<div style="display:flex;flex-direction:column;gap:10px">
        ${Btn('Скопировать ссылку', { a: 'invite.copy', icon: 'copy' })}
        ${Btn('Поделиться', { kind: 'soft', a: 'invite.copy', icon: 'share' })}
        ${Btn('Перевыпустить', { kind: 'ghost', size: 'compact', a: 'invite.reissue' })}
        ${Btn('Отозвать ссылку', { kind: 'ghost', size: 'compact', a: 'invite.revoke' })}
      </div>`;
    } else {
      actions = Btn('Открыть карточку клиента', { kind: 'soft', a: 'nav.go', args: { id: 't-clients' } });
    }

    return `<div class="screen">
      ${TopBar({ back: 'nav.back', title: 'Приглашение' })}
      <div class="screen__body" style="padding:4px 16px 20px">
        ${PageTitle({ title: 'Подключить клиента', sub: 'Карточку можно вести до подключения. Открытие «Поделиться» не означает, что ссылка отправлена.', size: 'sm' })}
        <div class="invite-card">
          <div class="invite-card__seal">${Icon.get('user', { size: 28 })}</div>
          <h3>Тимур Ахметов</h3>
          <p>Карточка создана 12 сентября. Программа и покупка не назначены.</p>
          <div style="margin-top:14px;display:flex;justify-content:center">${statePill}</div>
          ${inv.link ? `<div class="field field--sm" style="margin-top:16px;font-family:var(--ui);font-weight:600;font-size:14px">${Icon.get('link', { size: 18, style: 'color:var(--ter)' })}<input readonly value="${esc(inv.link)}" style="font-family:var(--ui);font-weight:600;font-size:14px"></div>
          <div style="font-size:12.5px;color:var(--sec);margin-top:8px">Действует до ${esc(inv.expires)}</div>` : ''}
        </div>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">${actions}</div>
        <div style="margin-top:16px">${Notice('Истёкшая или отозванная ссылка не раскрывает данные. Повторное принятие другим аккаунтом не создаёт дубликат карточки.', { tone: 'info', icon: 'lock' })}</div>
      </div>
    </div>`;
  }

  function profile() {
    const count = DB.clients.filter(c => c.id !== 'c7').length;
    const todayCount = DB.sessions.filter(s => s.date === DB.TODAY && s.status !== 'cancelled').length;
    const pending = Store.reschedule.awaiting('trainer').length;
    return `<div class="screen reference-screen">
      <div class="topbar" style="padding-bottom:2px"><div class="topbar__side"></div><div class="topbar__title">Профиль</div><div class="topbar__side"></div></div>
      <div class="screen__body" style="padding:4px 16px 20px">
        <div style="display:flex;align-items:center;gap:14px;padding:8px 6px 20px">
          ${Lead('ДС', { tone: 'ink' })}
          <div>
            <div style="font-family:var(--disp);font-weight:800;font-size:22px;letter-spacing:-.4px">${esc(DB.trainer.full)}</div>
            <div style="font-size:13.5px;font-weight:500;color:var(--sec);margin-top:2px">Независимый тренер</div>
          </div>
        </div>
        <button class="btn btn--soft" role="switch" aria-checked="${Store.preferences.calm()}" ${act('calm.toggle')}>Спокойный интерфейс · ${Store.preferences.calm() ? 'вкл' : 'выкл'}</button>
        ${Btn('Мои упражнения', { kind: 'soft', a: 'sheet.open', args: { id: 'myExercises' } })}
        ${Stats([[String(todayCount), 'занятий сегодня'], [String(pending), 'ждут ответа'], [String(count), 'клиентов в базе']])}
        <div style="height:16px"></div>
        ${Card([
          ['layers', 'Библиотека и шаблоны', 't-library'],
          ['wallet', 'Пакеты и оплаты', 't-billing'],
          ['bell', 'Уведомления', null, 'sheet:notifications'],
          ['settings', 'Настройки', null],
        ].map(([icon, title, screen, kind], i, arr) => Row({
          lead: Lead(icon, { size: 'sm', icon: true }),
          title,
          meta: title === 'Настройки' ? 'Пока недоступны' : '',
          right: title === 'Настройки' ? '' : Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
          a: title === 'Настройки' ? null : screen ? 'nav.go' : 'sheet.open', args: screen ? { id: screen } : { id: 'notifications' },
          last: i === arr.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:16px">${Notice('Это прототип. Данные вымышленные, действия не изменяют реальные записи.', { tone: 'info', icon: 'info' })}</div>
      </div>
      ${TabBar('trainer', 't-profile')}
    </div>`;
  }

  /* ── Wide layout (desktop/tablet) ────────────────────────────────────────── */

  function wide() {
    const st = Store.get();
    const pending = Store.reschedule.awaiting('trainer').length;
    const navItems = [
      ['t-today', 'home', 'Сегодня'],
      ['t-schedule', 'calendar', 'Расписание'],
      ['t-clients', 'users', 'Клиенты'],
      ['t-library', 'layers', 'Библиотека'],
      ['t-billing', 'wallet', 'Оплаты'],
    ];
    const attention = DB.clients.filter(c => c.status === 'attention' || c.status === 'new');
    return `<div class="wide">
      <aside class="wide__side">
        <div class="brand">Кабинет тренера</div>
        ${navItems.map(([id, icon, label]) => `<button class="wide__nav${st.screen === id ? ' is-on' : ''}" ${act('nav.go', { id })}>${Icon.get(icon, { size: 20 })} ${esc(label)}</button>`).join('')}
        <div style="flex:1"></div>
        <button class="wide__nav" ${act('tab', { id: 't-inbox' })}>${Icon.get('bell', { size: 20 })} Входящие ${pending ? `<span class="pill pill--amber pill--nodot" style="margin-left:auto">${pending}</span>` : ''}</button>
      </aside>
      <main class="wide__main">
        <div class="wide__head">
          <div>
            <h1 style="font-family:var(--disp);font-weight:800;font-size:32px;letter-spacing:-.6px">Сегодня</h1>
            <div style="font-size:14px;font-weight:500;color:var(--sec);margin-top:6px">${esc(DB.todayLabel())} · ${DB.byDate(st.day).length} занятия · 2 требуют ответа</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            ${Btn('Создать занятие', { kind: 'primary', size: 'sm', a: 'tab', args: { id: 't-new' }, icon: 'plus' })}
          </div>
        </div>
        <div class="wide__grid">
          <div>
            <div class="label" style="margin-left:4px">Лента дня</div>
            ${feed(st.day)}
          </div>
          <div>
            <div class="label" style="margin-left:4px">Требует внимания</div>
            ${Card(attention.map((c, i) => Row({
              lead: Lead(c.initials, { tone: c.status === 'new' ? '' : 'amber', size: 'sm' }),
              title: c.name,
              meta: c.status === 'new' ? 'Нет подключения' : (c.plan && c.plan.remaining <= 2 ? `Осталось ${c.plan.remaining} занятия` : `К оплате ${DB.fmtMoney(c.plan.due)}`),
              right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
              a: 'client.open', args: { id: c.id }, last: i === attention.length - 1,
            })).join(''), { rows: true })}
          </div>
        </div>
      </main>
    </div>`;
  }

  return { today, schedule, newSession, inbox, clients, clientCard, session, library, template, billing, invite, profile, wide, sessionRow, feed, progressBlocks };
})();

function progressBlocks(c, h) {
  const { esc, act } = UI;
  const exNames = [...new Set(h.map(x => x.exercise))];
  if (!exNames.length) return '';
  const pick = Store.get().historyExercise % exNames.length;
  const ex = exNames[pick];
  const rows = h.filter(x => x.exercise === ex).slice().sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(10, Math.ceil(Math.max(...rows.map(r => r.top)) / 10) * 10);

  const first = rows[0], last = rows[rows.length - 1];
  // Subtraction can introduce binary tails (0.3 - 0.1); round the derived label only.
  const delta = Number((last.top - first.top).toPrecision(12));
  const number = DB.fmtNumber;
  const firstDay = Date.parse(first.date + 'T00:00:00Z');
  const daySpan = Date.parse(last.date + 'T00:00:00Z') - firstDay;
  const points = rows.map(r => ({
    x: daySpan ? 34 + 264 * (Date.parse(r.date + 'T00:00:00Z') - firstDay) / daySpan : 166,
    y: 140 - 114 * r.top / max,
  }));
  return `<div class="progress-records">
    <div class="progress-picker" role="group" aria-label="Упражнение для сравнения">${exNames.map((n, i) => `<button class="chip chip--soft ${i === pick ? 'is-on' : ''}" ${act('history.exercise', { i })} aria-pressed="${i === pick}">${esc(n)}</button>`).join('')}</div>
    <section class="card card--pad progress-summary">
      <h2>${esc(ex)}</h2>
      <p class="progress-summary__date">Последняя запись · ${DB.fmtDateLong(last.date)}</p>
      <div class="progress-summary__value"><strong class="num">${number(last.top)}</strong><span>кг</span></div>
      <p class="progress-summary__sets">Подходов: ${last.sets}</p>
      ${rows.length > 1 ? `<p class="progress-summary__change">${delta > 0 ? '+' : ''}${number(delta)} кг с ${DB.fmtDate(first.date)}</p>` : '<p class="client-footnote">Пока одна запись. Сравнение появится после следующей.</p>'}
    </section>
    ${rows.length > 1 ? `<section class="card card--pad progress-chart">
      <h2>Рабочий вес</h2><p class="client-footnote">${DB.fmtDate(first.date)} — ${DB.fmtDate(last.date)} · записей: ${rows.length}</p>
      <svg class="progress-chart__plot" viewBox="0 0 320 174" aria-hidden="true" focusable="false">
        ${[0, max / 2, max].map(n => `<line class="progress-chart__rule" x1="34" x2="298" y1="${140 - 114 * n / max}" y2="${140 - 114 * n / max}"/><text class="progress-chart__axis" x="24" y="${144 - 114 * n / max}" text-anchor="end">${number(n)}</text>`).join('')}
        <polyline class="progress-chart__line" points="${points.map(p => `${p.x},${p.y}`).join(' ')}"/>
        ${points.map((p, i) => `<circle class="progress-chart__point${i === points.length - 1 ? ' is-latest' : ''}" cx="${p.x}" cy="${p.y}" r="${i === points.length - 1 ? 5 : 4}"/>`).join('')}
        <text class="progress-chart__axis" x="34" y="166">${DB.fmtDate(first.date)}</text>
        <text class="progress-chart__axis" x="298" y="166" text-anchor="end">${DB.fmtDate(last.date)}</text>
      </svg>
      <p class="client-footnote">Точки — отдельные записи, точные значения ниже. Шкала от нуля, вес в кг. Больший вес сам по себе не означает лучший результат: важны повторы и техника.</p>
    </section>` : ''}
    <section class="card card--pad progress-table">
      <h2>Записи по упражнению</h2>
      <table><caption class="sr-only">${esc(ex)}: дата, рабочий вес и число подходов</caption>
        <thead><tr><th scope="col">Дата</th><th scope="col">Вес, кг</th><th scope="col">Подходы</th></tr></thead>
        <tbody>${rows.slice().reverse().map(r => `<tr><th scope="row">${DB.fmtDate(r.date)}</th><td class="num">${number(r.top)}</td><td class="num">${r.sets}</td></tr>`).join('')}</tbody>
      </table>
    </section>
  </div>`;
}
