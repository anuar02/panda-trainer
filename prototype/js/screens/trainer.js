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
      meta = 'Программа появится позже';
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
        ${s.status !== 'cancelled' ? Btn(group ? 'Провести группу' : 'Провести', { kind: 'primary', size: 'compact', a: 'logging.open', args: { id: s.id }, icon: 'play' }) : ''}
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

  /* ── Сегодня ─────────────────────────────────────────────────────────────── */

  function today() {
    const st = Store.get();
    const pending = Object.values(st.requests).filter(r => r.state === 'pending' && r.awaiting === 'trainer');
    const todayCount = DB.byDate(st.day).length;
    const bellBadge = pending.length;

    const shell = (body) => `<div class="screen">
      <div class="topbar" style="padding-bottom:0">
        <div class="topbar__side">${Lead('ДС', { tone: 'ink', size: 'sm' })}</div>
        <div class="topbar__title">${esc(DB.todayLabel())}</div>
        <div class="topbar__side" style="position:relative">
          ${iconBtn('bell', { act: 'sheet.open', args: { id: 'notifications' }, label: 'Уведомления', size: 23 })}
          ${bellBadge ? `<span style="position:absolute;top:-4px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:var(--amber);color:var(--ink);font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--canvas)">${bellBadge}</span>` : ''}
        </div>
      </div>
      <div class="screen__body">${body}</div>
      ${TabBar('trainer', 't-today', pending.length)}
    </div>`;

    let body = PageTitle({
      title: 'Сегодня',
      sub: `${todayCount} ${DB.plural(todayCount, ['занятие', 'занятия', 'занятий'])} · ${DB.fmtDate(st.day)}`,
    });

    if (st.scenario !== 'loading' && st.scenario !== 'empty') {
      if (pending.length) {
        body += `<div style="padding:0 16px 16px">
          <button class="card card--pad tap" style="width:100%;text-align:left;display:block" ${act('tab', { id: 't-inbox' })} role="button">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="lead lead--amber">${Icon.get('swap', { size: 20 })}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:700">Требует ответа: ${pending.length}</div>
                <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">
                  ${pending.map(r => { const c = client(r.clientId); return c ? c.short : ''; }).join(' · ')} — перенос времени
                </div>
              </div>
              ${Icon.get('chevR', { size: 20, style: 'color:var(--ter)' })}
            </div>
          </button></div>`;
      }
      body += `<div style="padding:0 16px"><div class="label" style="margin-bottom:10px">Лента дня</div></div>`;
      body += feed(st.day);
    } else if (st.scenario === 'empty') {
      body += `<div style="padding:0 16px">${Card(Empty({ icon: 'calendar', title: 'Свободный день', sub: 'Занятий нет. Добавьте занятие — клиент получит предложение времени.', action: Btn('Добавить занятие', { kind: 'primary', size: 'compact', a: 'tab', args: { id: 't-new' }, icon: 'plus' }) }), { pad: true })}</div>`;
    } else {
      body += `<div style="padding:0 16px">${Skeleton(5)}</div>`;
    }

    if (st.scenario === 'offline') {
      body = `<div style="padding:0 16px 14px">${Notice('Нет связи. Расписание показано из последней загрузки, изменения сохранятся после восстановления.', { tone: 'warn', icon: 'wifioff' })}</div>` + body;
    }
    return shell(body);
  }

  /* ── Расписание ──────────────────────────────────────────────────────────── */

  function schedule() {
    const st = Store.get();
    const strip = DB.WEEK.map((date, i) => {
      const on = date === st.day;
      const count = DB.byDate(date).length;
      return `<button class="day${on ? ' is-on' : ''}" ${act('day', { date })} aria-pressed="${on}">
        <span class="day__dow">${DB.DOW[i]}</span>
        <span class="day__num">${Number(date.slice(8))}</span>
        <span class="day__dots">${Array.from({ length: Math.min(count, 3) }).map(() => '<i></i>').join('')}</span>
      </button>`;
    }).join('');

    return `<div class="screen">
      ${TopBar({ title: 'Расписание', right: Btn('Сегодня', { kind: 'ghost', size: 'sm', a: 'day', args: { date: DB.TODAY } }) })}
      <div class="screen__body">
        <div style="display:flex;align-items:baseline;justify-content:space-between;padding:2px 22px 8px">
          <h1 style="font-family:var(--disp);font-weight:800;font-size:27px;letter-spacing:-.5px">${esc(DB.fmtDate(st.day))}</h1>
          <span style="font-size:13px;font-weight:600;color:var(--sec)">${DB.byDate(st.day).length} занятия</span>
        </div>
        <div class="weekstrip">${strip}</div>
        ${feed(st.day)}
        <div style="padding:4px 16px 20px">
          ${Btn('Создать занятие', { kind: 'soft', a: 'tab', args: { id: 't-new' }, icon: 'plus' })}
        </div>
      </div>
      ${TabBar('trainer', 't-schedule')}
    </div>`;
  }

  /* ── Новое занятие (wizard) ──────────────────────────────────────────────── */

  function newSession() {
    const st = Store.get();
    const c = st.newSession;
    const step = c.step;
    const timeOpts = ['07:00', '09:00', '11:30', '14:00', '17:00', '18:00', '18:30', '19:00', '20:00'];

    const stepHead = `<div class="chips" style="padding:4px 16px 12px">
      ${['Клиенты', 'Время', 'Программа'].map((l, i) => `<span class="chip ${i === step ? 'is-on' : ''}" ${i < step ? act('ns.prev') : ''}>${i + 1}. ${l}</span>`).join('')}
    </div>`;

    let body = '';
    if (step === 0) {
      body = `<div style="padding:0 16px">
        <div class="label" style="margin-left:6px">Кто занимается</div>
        ${Card(DB.clients.filter(x => x.status !== 'new' || x.id === 'c6').map((x, i, arr) => Row({
          lead: Lead(x.initials, { tone: c.clientIds.includes(x.id) ? 'ink' : '', size: 'sm' }),
          title: x.name,
          meta: x.program ? esc(x.program) + (x.plan ? ` · осталось ${x.plan.remaining}` : '') : 'Программа появится позже',
          right: c.clientIds.includes(x.id) ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
          a: 'ns.toggle', args: { id: x.id }, last: i === arr.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:12px">${Notice('Несколько клиентов создают одну общую сессию. Программа у каждого своя.', { tone: 'info', icon: 'info' })}</div>
      </div>`;
    } else if (step === 1) {
      body = `<div style="padding:0 16px">
        <div class="label" style="margin-left:6px">Дата</div>
        ${Card(DB.WEEK.map((date, i, arr) => Row({
          lead: Lead('' + Number(date.slice(8)), { size: 'sm' }),
          title: DB.fmtDateLong(date) + (date === DB.TODAY ? ' · сегодня' : ''),
          right: c.date === date ? Icon.get('check', { size: 20, sw: 2.6 }) : '',
          a: 'ns.patch', args: { key: 'date', value: date }, last: i === arr.length - 1,
        })).join(''), { rows: true, cls: 'is-date' })}
        <div class="label" style="margin:16px 6px 10px">Начало</div>
        <div class="chips" style="flex-wrap:wrap">${timeOpts.map(t => `<span class="chip ${c.start === t ? 'is-on' : ''}" ${act('ns.patch', { key: 'start', value: t })} role="button" tabindex="0">${t}</span>`).join('')}</div>
        <div class="label" style="margin:18px 6px 10px">Длительность</div>
        <div class="chips">${[45, 60, 75, 90].map(d => `<span class="chip ${c.duration === d ? 'is-on' : ''}" ${act('ns.patch', { key: 'duration', value: d })} role="button" tabindex="0">${d} мин</span>`).join('')}</div>
      </div>`;
    } else {
      const collisions = c.collisions();
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
        <div style="display:flex;align-items:center;gap:12px">
          ${Lead(c ? c.initials : '?', { size: 'sm' })}
          <div style="flex:1;min-width:0">
            <div style="font-size:15.5px;font-weight:700">${esc(c ? c.name : 'Клиент')}</div>
            <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">Запрос на перенос · предложено клиентом</div>
          </div>
          ${r.awaiting === 'trainer' ? Pill('Ждёт вас', { tone: 'amber', pulse: true }) : Pill('Ждёт клиента', { tone: 'neutral', dot: false })}
        </div>
        <div style="margin-top:14px">
          ${UI.esc('')}<div class="diffcard ${r.state === 'counter' ? '' : 'is-warn'}" style="border:none;background:var(--sunken);padding:14px">
            <div class="diffcard__grid">
              <div class="diffcard__side is-old"><div class="t">${r.from.start}–${r.from.end}</div><div class="d">${DB.fmtDateLong(r.from.date)} · действует</div></div>
              <div class="diffcard__arrow">${Icon.get('arrowRight', { size: 18 })}</div>
              <div class="diffcard__side"><div class="t">${(r.counter || r.to).start}–${(r.counter || r.to).end}</div><div class="d">предложено</div></div>
            </div>
          </div>
        </div>
        ${awaitingMe && r.state === 'pending' ? `<div class="btn-row" style="margin-top:14px">
          ${Btn('Принять', { kind: 'mint', size: 'compact', a: 'rs.accept', args: { id: r.id } })}
          ${Btn('Другое время', { kind: 'soft', size: 'compact', a: 'sheet.open', args: { id: 'counter', rid: r.id } })}
        </div>
        <div style="margin-top:9px">${Btn('Отклонить', { kind: 'ghost', size: 'compact', a: 'rs.decline', args: { id: r.id } })}</div>` : ''}
        ${!awaitingMe ? `<div style="margin-top:14px">${Btn('Отозвать запрос', { kind: 'soft', size: 'compact', a: 'rs.withdraw', args: { id: r.id } })}</div>` : ''}
        <div style="margin-top:12px;font-size:12.5px;color:var(--sec)">${esc(r.history[r.history.length - 1].at)}</div>
      </div>`);
    };

    return `<div class="screen">
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
            meta: `${label} · ${DB.fmtDate(r.from.date)} → ${DB.fmtDate(r.to.date)}`,
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
    const q = (st.clientQuery || '').toLowerCase();
    const list = DB.clients.filter(c => c.status !== 'new' || c.id === 'c6')
      .filter(c => !q || c.name.toLowerCase().includes(q));

    const attentionLabel = (c) => {
      if (c.status === 'new') return 'Нет подключения';
      if (c.plan && c.plan.remaining <= 2) return `Осталось ${c.plan.remaining} ${c.plan.remaining === 1 ? 'занятие' : 'занятия'}`;
      if (c.plan && c.plan.due > 0) return `К оплате ${DB.fmtMoney(c.plan.due)}`;
      if (!c.nextSessionId) return 'Нет будущих занятий';
      return '';
    };

    return `<div class="screen">
      <div class="topbar" style="padding-bottom:2px">
        <div class="topbar__side"></div>
        <div class="topbar__title">Клиенты</div>
        <div class="topbar__side">${iconBtn('search', { act: 'sheet.open', args: { id: 'search' }, label: 'Поиск', size: 22 })}</div>
      </div>
      <div class="screen__body" style="padding:4px 16px 20px">
        ${PageTitle({ title: 'Клиенты', sub: `${DB.trainer.clientCount} активных · ${list.length} в списке`, size: 'sm' })}
        ${Card(list.map((c, i) => {
          const att = attentionLabel(c);
          return Row({
            lead: Lead(c.initials, { tone: c.status === 'attention' ? 'amber' : c.status === 'new' ? '' : 'mint' }),
            title: c.name,
            meta: `${c.program ? esc(c.program) : 'Без программы'}${c.plan ? ` · осталось ${c.plan.remaining}` : ''}`,
            right: att ? Pill(att, { tone: c.status === 'attention' ? 'amber' : 'neutral', dot: false }) : Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
            a: 'client.open', args: { id: c.id }, last: i === list.length - 1,
          });
        }).join(''), { rows: true })}
      </div>
      ${TabBar('trainer', 't-clients')}
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
          <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">${c.plan ? esc(c.plan.title) : 'Без покупки'} · с ${esc(c.since)}</div>
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
      content = `<div style="padding:0 16px">
        ${own.length ? Card(own.map((s, i) => Row({
          lead: Lead('' + Number(s.date.slice(8)), { size: 'sm' }),
          title: `${DB.fmtDate(s.date)} · ${s.start}–${s.end}`,
          meta: `${s.program || 'Программа позже'} · ${s.kind === 'group' ? 'мини-группа' : 'индивидуальное'}`,
          right: s.status === 'cancelled' ? Pill('Отменено', { tone: 'danger', dot: false }) : Pill('Подтверждено', { tone: 'mint', dot: false }),
          a: 'sheet.open', args: { id: 'session', sid: s.id }, last: i === own.length - 1,
        })).join(''), { rows: true }) : Card(Empty({ icon: 'calendar', title: 'Нет занятий', sub: 'Создайте занятие и назначьте программу.' }), { pad: true })}
        <div style="margin-top:12px">${Btn('Создать занятие', { kind: 'soft', a: 'tab', args: { id: 't-new' }, icon: 'plus' })}</div>
      </div>`;
    } else if (tab === 'program') {
      const exs = DB.programFor(c.program);
      content = `<div style="padding:0 16px">
        ${c.program ? `<div class="notice notice--info" style="margin-bottom:12px">${Icon.get('info', { size: 18 })}<div>Текущий шаблон: <b>${esc(c.program)}</b>. Изменение назначенной программы не переписывает прошлые занятия.</div></div>` : ''}
        ${exs.length ? Card(exs.map((e, i) => Row({
          lead: Lead('' + (i + 1), { size: 'sm' }),
          title: e.name, meta: `${e.sets} × ${e.reps}${e.target ? ' · ' + e.target + ' кг' : ''}`,
          right: e.pr ? `<span class="exrow__pr">${Icon.get('trophy', { size: 14 })}${e.pr}</span>` : '',
          last: i === exs.length - 1,
        })).join(''), { rows: true }) : Card(Empty({ icon: 'dumbbell', title: 'Программы нет', sub: 'Назначьте шаблон из библиотеки — программа применится к будущим занятиям.', action: Btn('Открыть библиотеку', { kind: 'soft', size: 'compact', a: 'nav.go', args: { id: 't-library' } }) }), { pad: true })}
      </div>`;
    } else if (tab === 'progress') {
      const h = DB.history[c.id] || [];
      content = h.length ? progressBlocks(c, h) : `<div style="padding:0 16px">${Card(Empty({ icon: 'trend', title: 'Пока нет данных', sub: 'История появится после первых записанных занятий. Отсутствие данных — не ноль.' }), { pad: true })}</div>`;
    } else if (tab === 'billing') {
      const p = DB.purchases.filter(x => x.clientId === c.id);
      const pays = DB.payments.filter(x => x.clientId === c.id);
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

    return `<div class="screen">
      ${TopBar({ back: 'nav.back', title: '', right: Btn('Пригласить', { kind: 'ghost', size: 'sm', a: 'nav.go', args: { id: 't-invite' } }) })}
      <div class="screen__body">${header}${chips}${content}<div style="height:24px"></div></div>
    </div>`;
  }

  /* ── Проведение тренировки ────────────────────────────────────────────────── */

  function session() {
    const st = Store.get();
    const lg = st.logging;
    const s = DB.sessions.find(x => x.id === lg.sessionId) || DB.sessions.find(x => x.id === 's6');
    const participants = (s.participants || []).map(p => ({ ...p, client: client(p.clientId) }));
    const active = lg.active || (participants[0] && participants[0].clientId);
    const activeClient = client(active);
    const programName = (participants.find(p => p.clientId === active) && participants.find(p => p.clientId === active).program) || (activeClient && activeClient.program);
    const exs = DB.programFor(programName);
    const totalSets = exs.reduce((a, e) => a + e.sets, 0);
    const doneSets = Object.values(lg.values[active] || {}).reduce((a, arr) => a + arr.filter(Boolean).length, 0);

    const strip = participants.length > 1 ? `<div class="pstrip">
      ${participants.map(p => {
        const vals = lg.values[p.clientId] || {};
        const total = DB.programFor(p.client.program).reduce((a, e) => a + e.sets, 0);
        const done = Object.values(vals).reduce((a, arr) => a + arr.filter(Boolean).length, 0);
        const on = p.clientId === active;
        return `<button class="pcard${on ? ' is-on' : ''}" ${act('log.switch', { id: p.clientId })} aria-pressed="${on}">
          <div class="pcard__name">${esc(p.client.short)}</div>
          <div class="pcard__meta">${done}/${total} подходов</div>
          <div class="pcard__prog">${esc(p.client.program || 'Программа позже')}</div>
        </button>`;
      }).join('')}
    </div>` : '';

    const rows = exs.map(e => {
      const arr = (lg.values[active] || {})[e.id] || [];
      const rowsHtml = Array.from({ length: e.sets }).map((_, si) => {
        const v = arr[si];
        const isNext = si === arr.filter(Boolean).length;
        return `<div class="setrow">
          <div class="setrow__no">${si + 1}</div>
          <div class="setrow__body">
            <div class="setrow__prev"><span class="tag">Прошлый раз</span>${e.prev.kg ? `${e.prev.kg} кг × ${e.prev.reps}` : `${e.prev.reps} повт`}</div>
            ${v
              ? `<div class="setrow__today num">${v.kg ? `${v.kg} кг <span class="r">× ${v.reps}</span>` : `${v.reps} повт`}</div>`
              : `<div class="setrow__today is-empty">${isNext ? 'Не записан' : `Подход ${si + 1} пуст`}</div>`}
          </div>
          ${v ? `<div class="setrow__done">${Icon.get('check', { size: 16, sw: 3 })}</div>`
            : `<button class="setrow__repeat" ${act('sheet.open', { id: 'setlog', cid: active, ex: e.id, si })}>Записать</button>`}
        </div>`;
      }).join('');
      const pr = e.pr ? `<span class="exrow__pr">${Icon.get('trophy', { size: 14 })}${e.pr}</span>` : '';
      return Card(`<div style="padding:14px 16px 4px;display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <div style="font-family:var(--disp);font-weight:700;font-size:16.5px">${esc(e.name)}</div>
            <div style="font-size:12.5px;font-weight:500;color:var(--sec);margin-top:2px">цель ${e.sets} × ${e.reps}${e.target ? ' · ' + e.target + ' кг' : ''}</div>
          </div>
          ${pr}
        </div>${rowsHtml}`, { rows: true, cls: 'card--flush' });
    }).join('<div style="height:12px"></div>');

    const saveState = lg.saveError
      ? SaveState('error', 'Не сохранено · черновик на устройстве')
      : lg.saving ? SaveState('saving', 'Сохраняем…')
        : lg.dirty ? SaveState('draft', 'Черновик на устройстве, ещё не отправлен')
          : SaveState('saved', 'Сохранено');

    return `<div class="screen">
      <div class="topbar" style="padding-bottom:2px">
        <div class="topbar__side">${iconBtn('chevD', { act: 'sheet.open', args: { id: 'finishConfirm' }, label: 'Завершить тренировку', size: 24 })}</div>
        <div class="timer"><i></i>38:12</div>
        <div class="topbar__side">${iconBtn('more', { act: 'sheet.open', args: { id: 'session', sid: s.id }, label: 'Ещё' })}</div>
      </div>
      <div class="screen__body">
        <div style="padding:2px 16px 12px">
          <h1 style="font-family:var(--disp);font-weight:800;font-size:26px;letter-spacing:-.5px">${esc(s.title || 'Тренировка')}</h1>
          <div style="font-size:13.5px;font-weight:600;color:var(--sec);margin-top:5px">${DB.fmtDateLong(s.date)} · ${s.start}–${s.end}${participants.length > 1 ? ' · мини-группа' : ''}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
            ${Meter(doneSets, totalSets)}
            <span class="num" style="font-size:13px;font-weight:700;color:var(--sec)">${doneSets}/${totalSets}</span>
          </div>
          <div style="margin-top:10px">${saveState}</div>
        </div>
        ${strip}
        <div style="padding:10px 16px 0;display:flex;align-items:center;gap:10px">
          ${Lead(activeClient ? activeClient.initials : '?', { size: 'sm' })}
          <div style="font-size:13.5px;font-weight:600">Записываем: <b>${esc(activeClient ? activeClient.name : '')}</b> <span style="color:var(--sec)">· ${esc(programName || 'без программы')}</span></div>
        </div>
        <div style="padding:14px 16px 0">${ProgramOrEmpty(activeClient, programName, rows)}</div>
        <div style="height:20px"></div>
      </div>
      <div style="padding:12px 16px 26px">
        ${Btn(lg.saveError ? 'Повторить сохранение' : 'Завершить тренировку', { kind: 'primary', a: 'log.finish' })}
      </div>
    </div>`;
  }

  function ProgramOrEmpty(activeClient, programName, rows) {
    if (!programName) {
      return Card(Empty({
        icon: 'dumbbell', title: 'Программы нет',
        sub: 'Можно провести занятие и записать результаты без программы — или назначить шаблон.',
        action: Btn('Назначить программу', { kind: 'soft', size: 'compact', a: 'nav.go', args: { id: 't-library' } }),
      }), { pad: true });
    }
    return rows;
  }

  /* ── Библиотека ───────────────────────────────────────────────────────────── */

  function library() {
    return `<div class="screen">
      ${TopBar({ back: 'nav.back', title: 'Библиотека', right: Btn('Создать', { kind: 'ghost', size: 'sm', a: 'sheet.open', args: { id: 'customEx' } }) })}
      <div class="screen__body" style="padding:4px 16px 20px">
        <div class="field field--search" style="margin-bottom:6px">${Icon.get('search', { size: 19, style: 'color:var(--ter)' })}<input placeholder="Упражнение или шаблон"></div>
        <div class="chips" style="padding:12px 0">
          ${['Все', 'Шаблоны', 'Ноги', 'Верх', 'Пресс', 'Мои'].map((f, i) => `<span class="chip chip--soft ${i === 0 ? 'is-on' : ''}">${f}</span>`).join('')}
        </div>
        <div class="label" style="margin-left:6px">Шаблоны</div>
        ${Card(DB.templates.map((t, i) => Row({
          lead: Lead('layers', { size: 'sm', icon: true }),
          title: t.name, meta: `${t.meta} · используется ${t.uses}`,
          right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
          a: 'nav.go', args: { id: 't-template' }, last: i === DB.templates.length - 1,
        })).join(''), { rows: true, cls: '' })}
        <div class="label" style="margin:18px 6px 10px">Упражнения</div>
        ${Card([
          ['Приседания со штангой', 'Ноги · штанга'],
          ['Румынская тяга', 'Ноги · штанга'],
          ['Жим лёжа', 'Грудь · штанга'],
          ['Жим гантелей под углом', 'Грудь · гантели'],
          ['Тяга блока к поясу', 'Спина · блок'],
          ['Планка', 'Пресс · вес тела'],
        ].map(([n, m], i, arr) => Row({
          lead: Lead('dumbbell', { size: 'sm', icon: true }),
          title: n, meta: m,
          right: Icon.get('plus', { size: 20, style: 'color:var(--sec)' }),
          a: 'sheet.open', args: { id: 'customEx' }, last: i === arr.length - 1,
        })).join(''), { rows: true })}
      </div>
    </div>`;
  }

  function template() {
    const exs = DB.programFor('Низ А');
    return `<div class="screen">
      ${TopBar({ back: 'nav.back', title: 'Низ А', right: iconBtn('edit', { act: 'sheet.open', args: { id: 'customEx' }, label: 'Редактировать шаблон' }) })}
      <div class="screen__body" style="padding:4px 16px 20px">
        ${PageTitle({ title: 'Низ А', sub: '5 упражнений · средний уровень · используется в 14 занятиях', size: 'sm' })}
        ${Card(exs.map((e, i) => Row({
          lead: Lead('' + (i + 1), { size: 'sm' }),
          title: e.name, meta: `${e.sets} × ${e.reps}${e.target ? ' · ' + e.target + ' кг' : ''}`,
          right: `<span style="display:flex;gap:6px;color:var(--ter)">${Icon.get('grip', { size: 18 })}</span>`,
          last: i === exs.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:14px">${Notice('Назначение шаблона на занятие создаёт независимую копию. Правка библиотеки не переписывает прошлые занятия.', { tone: 'info', icon: 'info' })}</div>
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
          ${Btn('Назначить на занятие', { kind: 'primary', a: 'sheet.open', args: { id: 'assignTemplate' }, icon: 'check' })}
          ${Btn('Дублировать шаблон', { kind: 'soft', a: 'toast', args: { text: 'Шаблон дублирован' } })}
        </div>
      </div>
    </div>`;
  }

  /* ── Пакеты и оплаты ──────────────────────────────────────────────────────── */

  function billing() {
    return `<div class="screen">
      ${TopBar({ back: 'nav.back', title: 'Пакеты и оплаты' })}
      <div class="screen__body" style="padding:4px 16px 20px">
        <div class="label" style="margin-left:6px">Активные покупки</div>
        ${DB.purchases.map(p => {
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
        ${Card(DB.unitTx.map((u, i) => {
          const c = client(u.clientId);
          return Row({
            lead: Lead(u.delta > 0 ? 'refresh' : 'minus', { size: 'sm', icon: true, tone: u.delta > 0 ? 'mint' : '' }),
            title: `${u.delta > 0 ? '+' : ''}${u.delta} занятие · ${c.short}`,
            meta: `${DB.fmtDate(u.date)} · ${u.reason}`,
            right: `<span class="num" style="font-family:var(--disp);font-weight:800;color:${u.delta > 0 ? 'var(--mint-ink)' : 'var(--ink)'}">${u.delta > 0 ? '+' : ''}${u.delta}</span>`,
            last: i === DB.unitTx.length - 1,
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
    return `<div class="screen">
      <div class="topbar" style="padding-bottom:2px"><div class="topbar__side"></div><div class="topbar__title">Профиль</div><div class="topbar__side"></div></div>
      <div class="screen__body" style="padding:4px 16px 20px">
        <div style="display:flex;align-items:center;gap:14px;padding:8px 6px 20px">
          ${Lead('ДС', { tone: 'ink' })}
          <div>
            <div style="font-family:var(--disp);font-weight:800;font-size:22px;letter-spacing:-.4px">${esc(DB.trainer.full)}</div>
            <div style="font-size:13.5px;font-weight:500;color:var(--sec);margin-top:2px">Тренер · ${DB.trainer.clientCount} клиента</div>
          </div>
        </div>
        ${Stats([['7', 'занятий сегодня'], ['2', 'запроса'], ['24', 'клиента']])}
        <div style="height:16px"></div>
        ${Card([
          ['layers', 'Библиотека и шаблоны', 't-library'],
          ['wallet', 'Пакеты и оплаты', 't-billing'],
          ['bell', 'Уведомления', null, 'sheet:notifications'],
          ['settings', 'Настройки', null],
        ].map(([icon, title, screen, kind], i, arr) => Row({
          lead: Lead(icon, { size: 'sm', icon: true }),
          title,
          right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
          a: screen ? 'nav.go' : 'sheet.open', args: screen ? { id: screen } : { id: 'notifications' },
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
    const pending = Object.values(st.requests).filter(r => r.state === 'pending').length;
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
  const { esc, Card, KV, Stats } = UI;
  const exNames = [...new Set(h.map(x => x.exercise))];
  const pick = Store.get().historyExercise % exNames.length;
  const ex = exNames[pick];
  const rows = h.filter(x => x.exercise === ex);
  const max = Math.max(...rows.map(r => r.top));
  const min = Math.min(...rows.map(r => r.top));

  const first = rows[0], last = rows[rows.length - 1];
  const delta = last.top - first.top;

  return `<div style="padding:0 16px;display:flex;flex-direction:column;gap:14px">
    <div class="chips">${exNames.map((n, i) => `<span class="chip chip--soft ${i === pick ? 'is-on' : ''}" ${UI.act('history.exercise', { i })} role="button" tabindex="0">${esc(n)}</span>`).join('')}</div>

    <div>${Stats([
      [String(last.top), 'рабочий вес, кг', ''],
      [`×${last.sets}`, 'подходы', ''],
      [delta > 0 ? '+' + delta : String(delta), 'за период, кг', delta > 0 ? 'mint' : ''],
    ])}</div>

    <div class="card card--pad">
      <div style="display:flex;align-items:baseline;justify-content:space-between">
        <div style="font-size:13px;font-weight:600;color:var(--sec)">Рабочий вес, кг</div>
        <div style="font-size:12px;font-weight:500;color:var(--sec)">окт – сен · 4 занятия</div>
      </div>
      <div class="chart">
        ${rows.map((r, i) => {
          const hgt = Math.max(8, Math.round((r.top - min + 5) / (max - min + 5) * 88));
          return `<div class="chart__col">
            <div class="chart__bar ${i === rows.length - 1 ? 'is-on' : ''}" style="height:${hgt}px" title="${r.top} кг × ${r.sets} подходов"></div>
            <div class="chart__lbl">${DB.fmtDate(r.date).split(' ')[0]}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:12px;font-weight:500;color:var(--sec);margin-top:12px;line-height:1.5">Рабочий вес показан с числом подходов. Больший вес не всегда означает лучший результат — сравнение корректно только при том же числе повторений.</div>
    </div>

    <div class="card card--pad">
      <div style="font-size:13px;font-weight:600;color:var(--sec);margin-bottom:10px">Фактическая история · ${esc(ex)}</div>
      ${KV(rows.slice().reverse().map(r => [DB.fmtDateLong(r.date), `${r.top} кг × ${r.sets} подх.`]))}
    </div>
  </div>`;
}
