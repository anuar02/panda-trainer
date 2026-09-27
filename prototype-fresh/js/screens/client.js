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

  /* ── Главная ─────────────────────────────────────────────────────────────── */

  function requestCard(r) {
    const proposed = r.counter || r.to;
    return `<div class="pending client-request">
      <div class="pending__lbl">${Icon.get('swap', { size: 14 })} Перенос занятия</div>
      <dl class="client-request__dates">
        <div><dt>Действует</dt><dd>${DB.fmtDateLong(r.from.date)}<br><strong class="num">${r.from.start}–${r.from.end}</strong></dd></div>
        <div><dt>Предложено</dt><dd>${DB.fmtDateLong(proposed.date)}<br><strong class="num">${proposed.start}–${proposed.end}</strong></dd></div>
      </dl>
      <p class="client-request__status">${r.awaiting === 'client' ? 'Нужен ваш ответ.' : 'Ждём ответа тренера.'} До согласия действует прежнее время.</p>
      <div style="margin-top:12px;display:grid;gap:9px">
      ${r.awaiting === 'client' ? Btn('Подтвердить перенос', { a: 'rs.accept', args: { id: r.id } })
        + Btn('Предложить другое', { kind: 'soft', size: 'compact', a: 'cres.open', args: { sid: r.sessionId } })
        + Btn('Отклонить', { kind: 'ghost', size: 'compact', a: 'rs.decline', args: { id: r.id } })
        : Btn('Отозвать запрос', { kind: 'soft', size: 'compact', a: 'rs.withdraw', args: { id: r.id } })}
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

    if (st.scenario === 'loading') {
      return shell('c-home', `<div style="padding:16px">${Skeleton(4)}</div>`);
    }
    if (!next || st.scenario === 'empty') {
      return shell('c-home', `${PageTitle({ title: `Привет, ${c.short}`, size: 'sm' })}<div class="client-content">${quietEmpty('calendar', 'Записей нет', 'Согласуйте следующее занятие с тренером. Он добавит время — запись появится здесь.', 'sit')}</div>`);
    }

    const hero = Card(`<div class="hero-card">
      ${Mascot.render(needsConfirmation || myReq ? 'clipboard' : 'wave', 'hero')}
      <div class="hero-card__top">
        <div style="font-size:13px;font-weight:600;color:var(--sec)">${
          next.date === DB.TODAY ? 'Сегодня' : esc('Ближайшее занятие')
        }</div>
        ${myReq
          ? Pill('Есть перенос', { tone: 'amber', dot: false })
          : needsConfirmation ? Pill('Подтвердите участие', { tone: 'amber', dot: false }) : Pill('Подтверждено', { tone: 'mint', dot: false })}
      </div>
      <div class="hero-card__date">${DB.fmtDateLong(next.date)}</div>
      <div class="hero-card__when num">${next.start}–<span>${next.end}</span></div>
      <div class="hero-card__meta">
        <h2>${next.program ? esc(next.program) : 'Программа появится позже'}</h2>
        <span>${next.kind === 'group' ? 'Занятие в мини-группе' : 'Индивидуальная тренировка'}</span>
      </div>
      ${myReq ? requestCard(myReq) : ''}
      <div class="hero-card__actions">
        ${needsConfirmation ? Btn('Подтвердить участие', { a: 'session.confirm', args: { sid: next.id } }) : ''}
        ${!myReq ? Btn('Предложить перенос', { kind: 'soft', size: 'compact', a: 'cres.open', args: { sid: next.id }, icon: 'swap' }) : ''}
        ${Btn('Отменить запись', { kind: 'ghost', size: 'compact', a: 'sheet.open', args: { id: 'cCancel', sid: next.id } })}
      </div>
    </div>`, { flush: true });

    const balance = Card(`<div class="client-package">
      <div class="client-package__heading"><h2>Остаток пакета</h2><span>${esc(c.plan.title)}</span></div>
      <div class="client-package__value"><strong class="num">${c.plan.remaining}</strong><span>из ${c.plan.bought} занятий</span></div>
      ${Meter(c.plan.remaining, c.plan.bought)}
      ${c.plan.due > 0 ? `<div class="client-package__due">${Pill('К оплате ' + DB.fmtMoney(c.plan.due), { tone: 'amber', dot: false })}</div>` : ''}
    </div>`);

    const rest = list.filter(s => s.id !== (next && next.id));
    const restBlock = rest.length ? `<div class="client-upcoming">
      ${SectionH('Следующие занятия')}
      ${Card(rest.map((s, i) => Row({
        title: `${DB.fmtDate(s.date)} · ${s.start}`,
        meta: `${esc(s.program || 'Программа появится позже')}${s.kind === 'group' ? ' · Мини-группа' : ''}`,
        last: i === rest.length - 1,
      })).join(''), { rows: true })}
    </div>` : '';

    return shell('c-home', `
      <div class="client-hello"><p>${next.date === DB.TODAY ? 'Сегодня тренировка — вы справитесь!' : 'Скоро тренировка. Панда уже разминается.'}</p>${PageTitle({ title: `Привет, ${c.short}`, size: 'sm' })}</div>
      ${st.scenario === 'offline' ? `<div style="padding:0 16px 14px">${Notice('Нет связи. Показаны данные демо.', { tone: 'warn', icon: 'wifioff' })}</div>` : ''}
      <div style="padding:0 16px">${hero}</div>
      ${reqs.filter(r => r.sessionId !== next.id).length ? `<section class="client-requests"><h2>Переносы других занятий</h2>${reqs.filter(r => r.sessionId !== next.id).map(requestCard).join('')}</section>` : ''}
      <div style="padding:16px 16px 0">${balance}</div>
      ${restBlock}
      <div style="padding:18px 16px 0">
        ${Btn('История занятий', { kind: 'soft', a: 'nav.go', args: { id: 'c-history' }, icon: 'list' })}
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Первый вход / приглашение ───────────────────────────────────────────── */

  function first() {
    const st = Store.get();
    const inv = st.inviteState || 'invite'; // invite | expired | revoked | accepted | no_session

    const states = {
      invite: {
        title: 'Данияр приглашает вас', sub: 'Тренер создал для вас карточку. Подключитесь, чтобы видеть расписание, программу и остаток пакета.',
        pill: Pill('Ссылка активна', { tone: 'mint', pulse: true }), action: Btn('Подключиться', { kind: 'primary', a: 'first.accept' }),
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
        pill: Pill('Программа появится позже', { tone: 'amber', dot: false }), action: Btn('На главную демо', { kind: 'primary', a: 'tab', args: { id: 'c-home' } }),
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
    const session = upcoming()[0];
    const name = Store.get().scenario === 'empty' ? null : session ? (session.kind === 'group' ? c.program : session.program) : c.program;
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
        && (s.status === 'cancelled' || s.participants?.some(p => p.clientId === ME && p.reply === 'cancelled') || st.attendance[s.id + ':' + ME] || Store.logging.status(s.id) === 'finished' || s.date < DB.TODAY || (s.date === DB.TODAY && s.end <= DB.NOW_TIME)))
      .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    const unit = (st.scenario === 'empty' ? [] : st.billing.unitTx).filter(u => u.clientId === ME).slice().sort((a, b) => b.date.localeCompare(a.date));
    const attendancePill = s => {
      const att = st.attendance[s.id + ':' + ME];
      const cancelled = s.status === 'cancelled' || s.participants?.some(p => p.clientId === ME && p.reply === 'cancelled');
      const label = att === 'present' ? 'Посещение' : att === 'noshow' ? 'Неявка' : cancelled ? 'Отменено' : Store.logging.status(s.id) === 'finished' ? 'Журнал завершён' : 'Нет отметки';
      return Pill(label, { tone: att === 'present' ? 'mint' : 'neutral', dot: false });
    };

    return shell('c-history', `
      ${PageTitle({ title: 'История', size: 'sm' })}
      <div class="client-content client-history">
        <section><h2 class="client-section-title">Прошедшие занятия</h2>
        ${items.length ? Card(items.map(s => `<article class="client-history__entry">
          <time class="client-history__date num" datetime="${s.date}T${s.start}" aria-label="${DB.fmtDateLong(s.date)} · ${s.start}"><strong>${s.date.slice(8)}</strong><span>${DB.MONTHS_SHORT[Number(s.date.slice(5, 7)) - 1]}</span><small>${s.start}</small></time>
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
        <p class="client-footnote">Списание не подтверждает посещение: оно может быть связано с неявкой. Записи демо показывают только часть истории.</p></section>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Прогресс ────────────────────────────────────────────────────────────── */

  function progress() {
    const c = me();
    const h = Store.get().scenario === 'empty' ? [] : DB.history[ME] || [];
    const visits = Store.get().scenario === 'empty' ? [] : DB.sessions.filter(s => Store.get().attendance[s.id + ':' + ME] === 'present').map(s => s.date);
    const cells = DB.WEEK.map(d => {
      const on = visits.includes(d);
      return `<div class="heat__cell ${on ? 'is-on' : 'is-off'}" aria-label="${DB.fmtDateLong(d)}: ${on ? 'посещение отмечено' : 'нет отметки посещения'}">${Number(d.slice(8))}</div>`;
    }).join('');

    return shell('c-progress', `
      ${PageTitle({ title: 'Прогресс', size: 'sm' })}
      ${h.length ? progressBlocks(c, h) : `<div class="client-content">${quietEmpty('trend', 'Первые результаты — впереди', 'Когда тренер запишет подходы, здесь можно будет сравнить результаты. Пока данных нет.', 'rest')}</div>`}
      <section class="client-content client-visits">
        <h2 class="client-section-title">Посещения за неделю</h2>
        <div class="card card--pad">
          <div class="heat">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div class="client-weekday">${d}</div>`).join('')}${cells}</div>
          <p class="client-footnote">${visits.some(d => DB.WEEK.includes(d)) ? 'Зелёным отмечены подтверждённые посещения.' : 'На этой неделе пока нет отметок о посещении.'} Отмена и неявка не учитываются.</p>
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
        <button class="btn btn--soft" role="switch" aria-checked="${Store.preferences.calm()}" ${UI.act('calm.toggle')}>Спокойный интерфейс · ${Store.preferences.calm() ? 'вкл' : 'выкл'}</button>
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

  function shell(tab, body) {
    const scenario = Store.get().scenario;
    return `<div class="screen client-screen">
      <div class="topbar client-topbar">
        <div class="trainer-chip"><span class="trainer-chip__av" aria-hidden="true">${esc(DB.trainer.full.split(' ').map(w => w[0]).join('').slice(0, 2))}</span><span class="trainer-chip__text"><small>Ваш тренер</small>${esc(DB.trainer.name)}</span></div>
        <div class="topbar__side">${iconBtn('bell', { act: 'sheet.open', args: { id: 'notifications' }, label: 'Уведомления', size: 22 })}</div>
      </div>
      <div class="screen__body">${scenario === 'loading' ? `<div class="client-content" role="status" aria-label="Загрузка раздела">${Skeleton(4)}</div>` : `${scenario === 'offline' && tab !== 'c-home' ? '<p class="client-offline" role="status">Нет связи. Показаны данные демо.</p>' : ''}${body}`}</div>
      ${TabBar('client', tab)}
    </div>`;
  }

  return { home, first, program, history, progress, profile };
})();
