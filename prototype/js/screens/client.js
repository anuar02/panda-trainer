/* ============================================================================
   screens/client.js — client-side screens
   Grammar: Главная · Программа · История · Прогресс · Профиль.
   The demo client is Айгерим Бекова. Her upcoming session (Thu 18:00) carries
   a pending reschedule request to Fri 19:00.
   ========================================================================== */

const Client = (() => {
  const { esc, act, Btn, Pill, Card, Lead, Row, SectionH, TopBar, PageTitle, Notice, Empty, KV, Stats, TabBar, Meter, iconBtn, Skeleton } = UI;
  const ME = DB.DEMO_CLIENT_ID;
  const me = () => DB.client(ME);

  function upcoming() {
    return DB.sessions
      .filter(s => s.status !== 'cancelled' && (s.clientId === ME || (s.participants || []).some(p => p.clientId === ME && p.reply !== 'cancelled'))
        && (s.date > DB.TODAY || (s.date === DB.TODAY && s.end > DB.NOW_TIME)) && Store.logging.status(s.id) !== 'finished')
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }

  // Generic booking titles carry no information; a named session («Растяжка») does.
  const GENERIC_TITLES = ['Индивидуальная', 'Мини-группа'];
  const sessionName = s => s.program || (GENERIC_TITLES.includes(s.title) ? 'Тренировка' : s.title);
  const sessionKind = s => s.kind === 'group' ? 'Занятие в мини-группе' : 'Индивидуальная тренировка';
  // Marks made in this demo win; past demo bookings carry their own recorded attendance.
  const attendanceOf = s => Store.get().attendance[s.id + ':' + ME] || (s.clientId === ME ? s.attendance : null) || null;

  /* ── Главная ─────────────────────────────────────────────────────────────── */

  function requestCard(r, offline = false) {
    const proposed = r.counter || r.to;
    return `<div class="pending client-request">
      <div class="pending__lbl">${Icon.get('swap', { size: 14 })} Перенос занятия</div>
      <dl class="client-request__dates">
        <div><dt>Действует</dt><dd>${DB.fmtDateLong(r.from.date)}<br><strong class="num">${r.from.start}–${r.from.end}</strong></dd></div>
        <div><dt>Предложено</dt><dd>${DB.fmtDateLong(proposed.date)}<br><strong class="num">${proposed.start}–${proposed.end}</strong></dd></div>
      </dl>
      <p class="client-request__status">${r.awaiting === 'client' ? 'Нужен ваш ответ.' : 'Ждём ответа тренера.'} До согласия действует прежнее время.</p>
      <div style="margin-top:12px;display:grid;gap:9px">
      ${r.awaiting === 'client' ? Btn('Подтвердить перенос', { a: 'rs.accept', args: { id: r.id }, disabled: offline })
        + Btn('Предложить другое', { kind: 'soft', size: 'compact', a: 'cres.open', args: { sid: r.sessionId }, disabled: offline })
        + Btn('Отклонить', { kind: 'ghost', size: 'compact', a: 'rs.decline', args: { id: r.id }, disabled: offline })
        : Btn('Отозвать запрос', { kind: 'soft', size: 'compact', a: 'rs.withdraw', args: { id: r.id }, disabled: offline })}
      </div></div>`;
  }

  function home() {
    const st = Store.get();
    const c = me();
    const list = upcoming();
    const reqs = Object.values(st.requests).filter(r => r.clientId === ME && ['pending', 'counter'].includes(r.state) && list.some(s => s.id === r.sessionId));
    const next = list[0];
    const myReq = reqs.find(r => r.sessionId === next?.id);
    const needsConfirmation = next?.participants.some(p => p.clientId === ME && p.reply === 'pending');
    const offline = st.scenario === 'offline';

    if (st.scenario === 'loading') return shell('c-home', '');
    if (!next || st.scenario === 'empty') {
      return shell('c-home', `${PageTitle({ title: `Привет, ${c.short}`, size: 'sm' })}<div class="client-content">${quietEmpty('calendar', 'Записей нет', 'Согласуйте следующее занятие с тренером. Он добавит время — запись появится здесь.', 'rest')}</div>`);
    }

    const hero = Card(`<div class="hero-card">
      <div class="hero-card__top">
        <div class="hero-card__date">${next.date === DB.TODAY ? 'Сегодня · ' : ''}${DB.fmtDateLong(next.date)}</div>
        ${myReq
          ? Pill('Есть перенос', { tone: 'amber', dot: false })
          : needsConfirmation ? Pill('Подтвердите участие', { tone: 'amber', dot: false }) : Pill('Подтверждено', { tone: 'mint', dot: false })}
      </div>
      <div class="hero-card__when num">${next.start}–<span>${next.end}</span></div>
      <div class="hero-card__meta">
        <h2>${esc(sessionName(next))}</h2>
        <span>${sessionKind(next)}${next.program ? '' : ' · программа появится позже'}</span>
      </div>
      ${myReq ? requestCard(myReq, offline) : ''}
      <div class="hero-card__actions">
        ${needsConfirmation ? Btn('Подтвердить участие', { a: 'session.confirm', args: { sid: next.id }, disabled: offline }) : ''}
        ${!myReq ? Btn('Предложить перенос', { kind: 'soft', size: 'compact', a: 'cres.open', args: { sid: next.id }, icon: 'swap', disabled: offline }) : ''}
        ${Btn('Отменить запись', { kind: 'ghost', size: 'compact', a: 'sheet.open', args: { id: 'cCancel', sid: next.id }, disabled: offline })}
      </div>
    </div>`, { flush: true });

    const balance = Card(`<div class="client-package">
      <div class="client-package__heading"><h2>Остаток пакета</h2><span>${esc(c.plan.title)}</span></div>
      <div class="client-package__value"><strong class="num">${c.plan.remaining}</strong><span>из ${c.plan.bought} занятий</span></div>
      ${Meter(c.plan.remaining, c.plan.bought)}
      ${c.plan.due > 0 ? `<div class="client-package__due">${Pill('К оплате ' + DB.fmtMoney(c.plan.due), { tone: 'amber', dot: false })}</div>` : ''}
    </div>`);

    const rest = list.filter(s => s.id !== (next && next.id));
    // A pending reschedule belongs to its booking: shown inside that row, not in a detached list.
    const restBlock = rest.length ? `<div class="client-upcoming">
      ${SectionH('Следующие занятия')}
      ${Card(rest.map((s, i) => {
        const r = reqs.find(x => x.sessionId === s.id);
        return `<div class="client-upcoming__item">${Row({
          title: `${DB.fmtDate(s.date)} · ${s.start}`,
          meta: `${esc(sessionName(s))}${s.kind === 'group' ? ' · Мини-группа' : ''}${s.program ? '' : ' · программа позже'}`,
          right: r ? Pill('Перенос', { tone: 'amber', dot: false }) : '',
          last: i === rest.length - 1,
        })}${r ? `<div class="client-upcoming__request">${requestCard(r, offline)}</div>` : ''}</div>`;
      }).join(''), { rows: true })}
    </div>` : '';

    return shell('c-home', `
      ${PageTitle({ title: `Привет, ${c.short}`, size: 'sm' })}
      ${st.scenario === 'offline' ? `<div style="padding:0 16px 14px">${Notice('Нет связи. Показаны сохранённые данные; перенос и отмена станут доступны, когда связь вернётся.', { tone: 'warn', icon: 'wifioff' })}</div>` : ''}
      <div style="padding:0 16px">${hero}</div>
      ${restBlock}
      <div style="padding:22px 16px 0">${balance}</div>
      <div style="height:20px"></div>`);
  }

  /* ── Первый вход / приглашение ───────────────────────────────────────────── */

  function first() {
    const st = Store.get();
    const inv = st.inviteState || 'invite'; // invite | expired | revoked | accepted | no_session

    const states = {
      invite: {
        title: 'Данияр приглашает вас', sub: 'Тренер создал для вас карточку. Подключитесь, чтобы видеть расписание, программу и остаток пакета.',
        pill: Pill('Ссылка активна', { tone: 'mint' }), action: Btn('Подключиться', { kind: 'primary', a: 'first.accept' }),
      },
      expired: {
        title: 'Ссылка истекла', sub: 'Попросите тренера прислать новое приглашение. Отправка запроса из приложения пока не подключена.',
        pill: Pill('Ссылка истекла', { tone: 'danger', dot: false }), action: Btn('На главную демо', { kind: 'primary', a: 'tab', args: { id: 'c-home' } }),
      },
      revoked: {
        title: 'Ссылка отозвана', sub: 'Для подключения нужно новое приглашение от тренера. Это демосостояние: реальный доступ здесь не меняется.',
        pill: Pill('Отозвана', { tone: 'danger', dot: false }), action: Btn('На главную демо', { kind: 'soft', a: 'tab', args: { id: 'c-home' } }),
      },
      accepted: {
        title: 'Приглашение уже принято', sub: 'Так выглядит экран после подключения. В демо можно перейти к вымышленному расписанию клиента.',
        pill: Pill('Уже подключено', { tone: 'neutral', dot: false }), action: Btn('Перейти на главную', { kind: 'primary', a: 'tab', args: { id: 'c-home' } }),
      },
      no_session: {
        title: 'Занятий пока нет', sub: 'Согласуйте первое занятие с тренером. Он добавит время и программу; запрос свободного времени из приложения пока недоступен.',
        pill: Pill('Записей пока нет', { tone: 'neutral', dot: false }), action: Btn('На главную демо', { kind: 'primary', a: 'tab', args: { id: 'c-home' } }),
      },
    };
    const s = states[inv];

    return `<div class="screen screen--surface onboarding">
      <div class="screen__body">
        <div class="onboarding-demo"><span>Демо: состояние приглашения</span>
          <div class="onboarding-states" role="group" aria-label="Состояние приглашения">
            ${['invite', 'expired', 'revoked', 'accepted', 'no_session'].map(k => `<button class="chip chip--soft ${k === inv ? 'is-on' : ''}" aria-pressed="${k === inv}" ${act('first.state', { state: k })}>${({ invite: 'Активна', expired: 'Истекла', revoked: 'Отозвана', accepted: 'Принята', no_session: 'Нет занятия' })[k]}</button>`).join('')}
          </div></div>
        <div class="invite-card">
          ${['invite', 'no_session', 'accepted'].includes(inv) ? Mascot.render(({ invite: 'welcome', no_session: 'waiting', accepted: 'approved' })[inv], 'onboarding') : `<div class="invite-card__seal">${Icon.get('link', { size: 28 })}</div>`}
          <h1>${esc(s.title)}</h1>
          <p>${esc(s.sub)}</p>
          <div style="margin-top:16px;display:flex;justify-content:center">${s.pill}</div>
          <div style="margin-top:20px">${s.action}</div>
          <div style="margin-top:12px;font-size:12.5px;color:var(--sec);line-height:1.5">
            Демонстрация интерфейса. Вход в аккаунт и проверка приглашения не подключены.
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ── Программа ───────────────────────────────────────────────────────────── */

  function program() {
    const c = me();
    // The nearest booking may have no plan yet (e.g. a stretching slot); show the
    // nearest one that does, and fall back to the client's current template.
    const planOf = s => s.kind === 'group' ? c.program : s.program;
    const session = upcoming().find(planOf);
    const name = Store.get().scenario === 'empty' ? null : session ? planOf(session) : c.program;
    const exs = DB.programFor(name);
    return shell('c-program', `
      ${PageTitle({ title: 'Программа', size: 'sm' })}
      <div class="client-content client-program">
        ${exs.length ? `<div class="client-program__heading"><h2>${esc(name)}</h2><p>${session ? `${DB.fmtDateLong(session.date)} · ${session.start}–${session.end}` : 'Текущий план от тренера'}</p></div>` : ''}
        ${!exs.length ? quietEmpty('dumbbell', 'Программа появится здесь', 'Тренер ещё не добавил упражнения. Время занятия можно посмотреть на главной.', 'reading')
          : Card(exs.map((e, i) => Row({
            lead: Lead('' + (i + 1), { size: 'sm' }),
            title: e.name,
            meta: `План: ${e.sets} × ${e.reps}${e.target ? ' · ' + DB.fmtNumber(e.target) + ' кг' : ''}`,
            right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
            a: 'sheet.open', args: { id: 'exercise', ex: e.id, program: name },
            last: i === exs.length - 1,
          })).join(''), { rows: true })}
        ${exs.length ? '<p class="client-footnote">Это план тренировки. Результаты записывает тренер во время занятия.</p>' : Btn('Посмотреть расписание', { kind: 'soft', a: 'tab', args: { id: 'c-home' } })}
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── История ─────────────────────────────────────────────────────────────── */

  function history() {
    const st = Store.get();
    const items = (st.scenario === 'empty' ? [] : DB.sessions)
      .filter(s => (s.clientId === ME || s.participants?.some(p => p.clientId === ME))
        && (s.status === 'cancelled' || s.participants?.some(p => p.clientId === ME && p.reply === 'cancelled') || attendanceOf(s) || Store.logging.status(s.id) === 'finished' || s.date < DB.TODAY || (s.date === DB.TODAY && s.end <= DB.NOW_TIME)))
      .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    const unit = (st.scenario === 'empty' ? [] : st.billing.unitTx).filter(u => u.clientId === ME).slice().sort((a, b) => b.date.localeCompare(a.date));
    const attendancePill = s => {
      const att = attendanceOf(s);
      const cancelled = s.status === 'cancelled' || s.participants?.some(p => p.clientId === ME && p.reply === 'cancelled');
      const label = att === 'present' ? 'Посещение' : att === 'noshow' ? 'Неявка' : cancelled ? 'Отменено' : Store.logging.status(s.id) === 'finished' ? 'Журнал завершён' : 'Нет отметки';
      return Pill(label, { tone: att === 'present' ? 'mint' : att === 'noshow' ? 'danger' : 'neutral', dot: false });
    };

    return shell('c-history', `
      ${PageTitle({ title: 'История', size: 'sm' })}
      <div class="client-content client-history">
        <section><h2 class="client-section-title">Прошедшие занятия</h2>
        ${items.length ? Card(items.map(s => `<article class="client-history__entry">
          <time class="client-history__date num" datetime="${s.date}T${s.start}" aria-label="${DB.fmtDateLong(s.date)} · ${s.start}"><strong>${Number(s.date.slice(8))}</strong><span>${DB.MONTHS_SHORT[Number(s.date.slice(5, 7)) - 1]}</span><small>${s.start}</small></time>
          <div class="client-history__record"><h3>${esc(s.program || 'Без программы')}</h3>
          <p>${s.kind === 'group' ? 'Мини-группа' : 'Индивидуальное занятие'}</p>
          ${attendancePill(s)}</div>
        </article>`).join('')) : quietEmpty('calendar', 'Занятий пока нет', 'Здесь появятся прошедшие и отменённые записи из расписания.')}</section>
        <section><h2 class="client-section-title">Списания и возвраты</h2>
        ${unit.length ? Card(unit.map((u, i) => Row({
          title: u.reason,
          meta: DB.fmtDate(u.date),
          right: `<span class="client-unit num" aria-label="${u.delta > 0 ? 'Возврат' : 'Списание'}: ${Math.abs(u.delta)}">${u.delta > 0 ? '+' : '−'}${Math.abs(u.delta)}</span>`,
          last: i === unit.length - 1,
        })).join(''), { rows: true }) : quietEmpty('list', 'Списаний пока нет', 'Изменения остатка пакета будут показаны отдельно от посещений.')}
        <p class="client-footnote">Списание не подтверждает посещение: оно может быть связано с неявкой.</p></section>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Прогресс ────────────────────────────────────────────────────────────── */

  function progress() {
    const c = me();
    const h = Store.get().scenario === 'empty' ? [] : DB.history[ME] || [];
    // Four calendar weeks ending with the current one: enough to show a rhythm.
    const marks = {};
    if (Store.get().scenario !== 'empty') DB.sessions.forEach(s => { const v = attendanceOf(s); if (v) marks[s.date] = v; });
    const monday = new Date(DB.WEEK[0] + 'T12:00:00Z');
    const days = Array.from({ length: 28 }, (_, i) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() - 21 + i); return d.toISOString().slice(0, 10); });
    const cells = days.map(d => {
      const m = marks[d];
      const state = m === 'present' ? 'посещение' : m === 'noshow' ? 'неявка' : d > DB.TODAY ? 'впереди' : 'нет отметки';
      return `<div class="heat__cell ${m === 'present' ? 'is-on' : m === 'noshow' ? 'is-skip' : d > DB.TODAY ? 'is-future' : 'is-off'}${d === DB.TODAY ? ' is-today' : ''}" role="img" aria-label="${DB.fmtDateLong(d)}: ${state}">${Number(d.slice(8))}</div>`;
    }).join('');
    const present = days.filter(d => marks[d] === 'present').length;
    const noshow = days.filter(d => marks[d] === 'noshow').length;

    return shell('c-progress', `
      ${PageTitle({ title: 'Прогресс', size: 'sm' })}
      ${h.length ? progressBlocks(c, h) : `<div class="client-content">${quietEmpty('trend', 'Первые результаты — впереди', 'Когда тренер запишет подходы, здесь можно будет сравнить результаты. Пока данных нет.', 'ready')}</div>`}
      <section class="client-content client-visits">
        <h2 class="client-section-title">Посещения за 4 недели</h2>
        <div class="card card--pad">
          <div class="heat">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div class="client-weekday">${d}</div>`).join('')}${cells}</div>
          <p class="client-footnote">${present || noshow ? `Посещений: ${present}${noshow ? ` · неявок: ${noshow}` : ''}. Зелёным — подтверждённые посещения, красным — неявки.` : 'Отметок о посещении пока нет.'} Отменённые занятия не отмечаются.</p>
        </div>
      </section>
      <div style="height:20px"></div>`);
  }

  /* ── Профиль ─────────────────────────────────────────────────────────────── */

  function profile() {
    const c = me();
    const plan = Store.get().scenario === 'empty' ? null : c.plan;
    return shell('c-profile', `
      ${PageTitle({ title: 'Профиль', size: 'sm' })}
      <div class="client-content client-profile">
        <div class="client-profile__person">
          ${Lead(c.initials)}
          <div><h2>${esc(c.name)}</h2><p>Начало занятий: ${esc(c.since)}</p></div>
        </div>
        <section><h2 class="client-section-title">Личные данные</h2>
          ${Card(`<dl class="client-details"><div><dt>Телефон</dt><dd>${esc(c.phone || 'Не указан')}</dd></div><div><dt>Тренер</dt><dd>${esc(DB.trainer.full)}</dd></div></dl>`, { pad: true })}
        </section>
        <section><h2 class="client-section-title">Пакет занятий</h2>
          ${plan ? Card(`<div class="client-package"><div class="client-package__heading"><h2>${esc(plan.title)}</h2></div>
            <div class="client-package__value"><strong class="num">${plan.remaining}</strong><span>из ${plan.bought} занятий осталось</span></div>
            ${Meter(plan.remaining, plan.bought)}
            <dl class="client-details client-details--payment"><div><dt>К оплате</dt><dd class="num">${DB.fmtMoney(plan.due)}</dd></div></dl>
            <p class="client-footnote">${plan.due > 0 ? 'Оплату согласуйте с тренером.' : 'По текущему пакету задолженности нет.'} Оплата в приложении не подключена.</p></div>`) : quietEmpty('wallet', 'Пакета пока нет', 'Условия и количество занятий можно согласовать с тренером.')}
        </section>
        ${Btn('Уведомления', { kind: 'soft', icon: 'bell', a: 'sheet.open', args: { id: 'notifications' } })}
        <p class="client-footnote">Демонстрационные данные. Изменение профиля и настройки аккаунта пока недоступны.</p>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Shell ───────────────────────────────────────────────────────────────── */

  function quietEmpty(icon, title, text, mascot = false) {
    return `<div class="client-empty${mascot ? ' client-empty--mascot' : ''}">${mascot ? Mascot.render(mascot) : Lead(icon, { icon: true })}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }

  // Loading keeps the section title and mirrors the shape of the content that
  // will arrive, so the layout does not jump when data lands.
  const TITLES = { 'c-home': `Привет, ${me().short}`, 'c-program': 'Программа', 'c-history': 'История', 'c-progress': 'Прогресс', 'c-profile': 'Профиль' };
  function loading(tab) {
    const bar = (w, h, extra = '') => `<div class="sk" style="width:${w};height:${h}px${extra}"></div>`;
    const hero = Card(`<div class="hero-card">${bar('46%', 14)}${bar('62%', 32, ';margin-top:14px')}${bar('54%', 18, ';margin-top:22px')}${bar('100%', 44, ';margin-top:22px;border-radius:var(--r-button-compact)')}</div>`);
    return `${PageTitle({ title: TITLES[tab], size: 'sm' })}<div class="client-content" role="status" aria-label="Загрузка раздела">${tab === 'c-home' ? hero : Skeleton(4)}</div>`;
  }

  function shell(tab, body) {
    const scenario = Store.get().scenario;
    return `<div class="screen client-screen">
      <div class="topbar client-topbar">
        <div class="trainer-chip"><span class="trainer-chip__av" aria-hidden="true">${esc(DB.trainer.full.split(' ').map(w => w[0]).join('').slice(0, 2))}</span><span class="trainer-chip__text"><small>Ваш тренер</small>${esc(DB.trainer.name)}</span></div>
        <div class="topbar__side">${iconBtn('bell', { act: 'sheet.open', args: { id: 'notifications' }, label: 'Уведомления', size: 22 })}</div>
      </div>
      <div class="screen__body">${scenario === 'loading' ? loading(tab) : `${scenario === 'offline' && tab !== 'c-home' ? '<p class="client-offline" role="status">Нет связи. Показаны данные демо.</p>' : ''}${body}`}</div>
      ${TabBar('client', tab)}
    </div>`;
  }

  return { home, first, program, history, progress, profile };
})();
