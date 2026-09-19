/* ============================================================================
   screens/client.js — client-side screens
   Grammar: Главная · Программа · История · Прогресс · Профиль.
   The demo client is Айгерим Бекова. Her upcoming session (Thu 18:00) carries
   a pending reschedule request to Fri 19:00.
   ========================================================================== */

const Client = (() => {
  const { esc, act, Btn, Pill, Card, Lead, Row, SectionH, TopBar, PageTitle, Notice, Empty, KV, Stats, TabBar, Meter, iconBtn, Skeleton } = UI;
  const ME = 'c1';
  const me = () => DB.client(ME);

  function upcoming() {
    return DB.sessions
      .filter(s => (s.clientId === ME || (s.participants || []).some(p => p.clientId === ME)) && s.date >= DB.TODAY)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }

  /* ── Главная ─────────────────────────────────────────────────────────────── */

  function home() {
    const st = Store.get();
    const c = me();
    const list = upcoming();
    const reqs = Object.values(st.requests).filter(r => r.clientId === ME && ['pending', 'counter'].includes(r.state));
    const myReq = reqs[0];
    // If there is a live request, the hero shows the session that request is
    // about — otherwise the request would appear under an unrelated session.
    const next = (myReq && list.find(s => s.id === myReq.sessionId)) || list[0];

    if (st.scenario === 'loading') {
      return shell('c-home', `<div style="padding:16px">${Skeleton(4)}</div>`);
    }
    if (!next) {
      return shell('c-home', `<div style="padding:0 16px">${Card(Empty({
        icon: 'calendar', title: 'Записей нет',
        sub: 'Ближайших занятий нет. Можно предложить тренеру удобное время.',
        action: Btn('Предложить время', { a: 'cres.open', icon: 'swap' }),
      }), { pad: true })}</div>`);
    }

    const hero = Card(`<div class="hero-card">
      <div class="hero-card__top">
        <div style="font-size:13px;font-weight:600;color:var(--sec)">${
          next.date === DB.TODAY ? 'Сегодня' : esc('Ближайшее занятие')
        }</div>
        ${myReq
          ? Pill('Ожидает ответа', { tone: 'amber', pulse: true })
          : Pill('Подтверждено', { tone: 'mint', dot: false })}
      </div>
      <div class="hero-card__when">${DB.fmtDateLong(next.date)}<br>${next.start}–${next.end}</div>
      <div class="hero-card__meta">
        ${Icon.get('user', { size: 17 })} Тренер ${esc(DB.trainer.name)}
        <span class="sep">·</span>
        ${Icon.get('dumbbell', { size: 17 })} ${next.program ? esc(next.program) : 'Программа появится позже'}
      </div>
      ${myReq ? `<div class="pending" style="margin-top:16px">
        <div class="pending__lbl">${Icon.get('swap', { size: 14 })} Запрос на перенос</div>
        <div class="pending__body">
          Действует: <b>${DB.fmtDateLong(myReq.from.date)}, ${myReq.from.start}</b><br>
          Предложено: <b>${DB.fmtDateLong((myReq.counter || myReq.to).date)}, ${(myReq.counter || myReq.to).start}</b><br>
          ${myReq.awaiting === 'trainer' ? 'Ждём ответа тренера.' : 'Ждём вашего ответа.'}
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:9px">
          ${myReq.awaiting === 'client'
            ? Btn('Подтвердить', { kind: 'mint', a: 'rs.accept', args: { id: myReq.id } }) + Btn('Предложить другое', { kind: 'soft', size: 'compact', a: 'cres.open' })
            : Btn('Отозвать запрос', { kind: 'soft', size: 'compact', a: 'rs.withdraw', args: { id: myReq.id } })}
        </div>
      </div>` : ''}
      <div class="hero-card__actions">
        ${!myReq ? Btn('Предложить перенос', { kind: 'soft', a: 'cres.open', icon: 'swap' }) : ''}
        ${!myReq ? Btn('Отменить запись', { kind: 'ghost', size: 'compact', a: 'sheet.open', args: { id: 'cCancel' } }) : ''}
      </div>
    </div>`, { flush: true });

    const balance = Card(`<div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--sec)">Остаток пакета</div>
          <div class="num" style="font-family:var(--disp);font-weight:900;font-size:30px;letter-spacing:-1.2px;margin-top:4px">${c.plan.remaining} <span style="font-size:15px;font-weight:700;color:var(--sec)">из ${c.plan.bought}</span></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12.5px;font-weight:600;color:var(--sec)">${esc(c.plan.title)}</div>
          ${c.plan.due > 0 ? `<div style="margin-top:6px">${Pill('К оплате ' + DB.fmtMoney(c.plan.due), { tone: 'amber', dot: false })}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:12px">${Meter(c.plan.remaining, c.plan.bought)}</div>
    </div>`);

    const rest = list.filter(s => s.id !== (next && next.id));
    const restBlock = rest.length ? `<div style="padding:0 16px;margin-top:18px">
      ${SectionH('Следующие занятия')}
      ${Card(rest.map((s, i) => Row({
        lead: Lead('' + Number(s.date.slice(8)), { size: 'sm' }),
        title: `${DB.fmtDate(s.date)} · ${s.start}`,
        meta: `${s.program || 'Программа позже'} · тренер ${DB.trainer.name}`,
        right: Pill(s.kind === 'group' ? 'Группа' : 'Личное', { tone: 'neutral', dot: false }),
        last: i === rest.length - 1,
      })).join(''), { rows: true })}
    </div>` : '';

    return shell('c-home', `
      ${PageTitle({ title: 'Привет, Айгерим', sub: 'Ваше ближайшее занятие и остаток пакета — на одном экране.', size: 'sm' })}
      ${st.scenario === 'offline' ? `<div style="padding:0 16px 14px">${Notice('Нет связи. Показано последнее загруженное расписание.', { tone: 'warn', icon: 'wifioff' })}</div>` : ''}
      <div style="padding:0 16px">${hero}</div>
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
        title: 'Ссылка истекла', sub: 'Ссылка-приглашение действовала 7 дней. Данные карточки сохранены — попросите новую ссылку.',
        pill: Pill('Ссылка истекла', { tone: 'danger', dot: false }), action: Btn('Запросить новую ссылку', { kind: 'primary', a: 'toast', args: { text: 'Запрос отправлен тренеру' } }),
      },
      revoked: {
        title: 'Ссылка отозвана', sub: 'Тренер отозвал ссылку. Это не удаляет карточку и историю — доступ можно вернуть новой ссылкой.',
        pill: Pill('Отозвана', { tone: 'danger', dot: false }), action: Btn('Запросить новую ссылку', { kind: 'soft', a: 'toast', args: { text: 'Запрос отправлен тренеру' } }),
      },
      accepted: {
        title: 'Приглашение уже принято', sub: 'Эта ссылка уже подключена к аккаунту. Данные не раскрываются повторно и дубликат карточки не создаётся.',
        pill: Pill('Уже подключено', { tone: 'neutral', dot: false }), action: Btn('Перейти на главную', { kind: 'primary', a: 'tab', args: { id: 'c-home' } }),
      },
      no_session: {
        title: 'Занятий пока нет', sub: 'Карточка подключена. Тренер ещё не назначил занятие — можно предложить удобное время.',
        pill: Pill('Программа появится позже', { tone: 'amber', dot: false }), action: Btn('Предложить время', { kind: 'primary', a: 'cres.open', icon: 'swap' }),
      },
    };
    const s = states[inv];

    return `<div class="screen screen--surface">
      <div class="screen__body" style="display:flex;flex-direction:column;justify-content:center;padding:0 20px 40px">
        <div class="invite-card">
          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px">
            ${['invite', 'expired', 'revoked', 'accepted', 'no_session'].map(k => `<button class="chip chip--soft ${k === inv ? 'is-on' : ''}" ${act('first.state', { state: k })}>${({ invite: 'Активна', expired: 'Истекла', revoked: 'Отозвана', accepted: 'Принята', no_session: 'Нет занятия' })[k]}</button>`).join('')}
          </div>
          <div class="invite-card__seal">${Icon.get('user', { size: 28 })}</div>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.sub)}</p>
          <div style="margin-top:16px;display:flex;justify-content:center">${s.pill}</div>
          <div style="margin-top:20px">${s.action}</div>
          <div style="margin-top:12px;font-size:12.5px;color:var(--sec);line-height:1.5">
            Вход не требует SMS. Способ авторизации выбирается отдельно и не задаётся этим прототипом.
          </div>
        </div>
        <div style="margin-top:18px">${Notice('Открытие ссылки не раскрывает частные результаты: доступ проверяется до показа данных.', { tone: 'info', icon: 'lock' })}</div>
      </div>
    </div>`;
  }

  /* ── Программа ───────────────────────────────────────────────────────────── */

  function program() {
    const c = me();
    const exs = DB.programFor(c.program);
    const session = upcoming()[0];
    return shell('c-program', `
      ${PageTitle({ title: 'Программа', sub: session ? `${DB.fmtDateLong(session.date)} · ${session.program || 'появится позже'}` : 'Программа появится позже', size: 'sm' })}
      <div style="padding:0 16px">
        ${!c.program ? Card(Empty({ icon: 'dumbbell', title: 'Программы пока нет', sub: 'Тренер назначит программу — она появится здесь вместе с планом подходов.' }), { pad: true })
          : Card(exs.map((e, i) => Row({
            lead: Lead('' + (i + 1), { size: 'sm' }),
            title: e.name,
            meta: `План: ${e.sets} × ${e.reps}${e.target ? ' · ' + e.target + ' кг' : ''}`,
            right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
            a: 'sheet.open', args: { id: 'exercise', ex: e.id },
            last: i === exs.length - 1,
          })).join(''), { rows: true })}
        <div style="margin-top:14px">${Notice('План и факт различаются. Редактирование результатов клиентом — открытый вопрос, в прототипе оно выключено.', { tone: 'info', icon: 'info' })}</div>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── История ─────────────────────────────────────────────────────────────── */

  function history() {
    const items = DB.sessions
      .filter(s => s.clientId === ME && s.date < DB.TODAY)
      .sort((a, b) => b.date.localeCompare(a.date));
    const unit = DB.unitTx.filter(u => u.clientId === ME);

    return shell('c-history', `
      ${PageTitle({ title: 'История', sub: 'Занятия, посещения и списания. Неявки и штрафные списания не считаются посещениями.', size: 'sm' })}
      <div style="padding:0 16px">
        <div class="label" style="margin-left:6px">Занятия</div>
        ${items.length ? Card(items.map((s, i) => Row({
          lead: Lead('' + Number(s.date.slice(8)), { size: 'sm' }),
          title: `${DB.fmtDate(s.date)} · ${s.start}`,
          meta: `${s.program || 'Программа'} · ${s.kind === 'group' ? 'мини-группа' : 'индивидуальное'}`,
          right: Pill('Посещение', { tone: 'mint', dot: false }),
          last: i === items.length - 1,
        })).join(''), { rows: true }) : Card(Empty({ icon: 'list', title: 'История пуста', sub: 'Первое занятие появится здесь после проведения.' }), { pad: true })}
        <div class="label" style="margin:18px 6px 10px">Движение занятий</div>
        ${Card(unit.map((u, i) => Row({
          lead: Lead('minus', { size: 'sm', icon: true }),
          title: u.reason,
          meta: DB.fmtDate(u.date),
          right: `<span class="num" style="font-family:var(--disp);font-weight:800">${u.delta}</span>`,
          last: i === unit.length - 1,
        })).join(''), { rows: true })}
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Прогресс ────────────────────────────────────────────────────────────── */

  function progress() {
    const c = me();
    const h = DB.history[ME] || [];
    const visits = DB.sessions.filter(s => s.clientId === ME).map(s => s.date);
    const cells = DB.WEEK.map(d => {
      const on = visits.includes(d);
      return `<div class="heat__cell ${on ? 'is-on' : 'is-off'}">${Number(d.slice(8))}</div>`;
    }).join('');

    return shell('c-progress', `
      ${PageTitle({ title: 'Прогресс', sub: 'Фактические результаты и посещения. При одной тренировке тренд не рисуется.', size: 'sm' })}
      ${h.length ? progressBlocks(c, h) : `<div style="padding:0 16px">${Card(Empty({ icon: 'trend', title: 'Данных пока нет', sub: 'Незаписанное значение не равно нулю — поэтому здесь пусто, а не нули.' }), { pad: true })}</div>`}
      <div style="padding:16px">
        <div class="label" style="margin-left:6px">Посещения · эта неделя</div>
        <div class="card card--pad">
          <div class="heat">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => `<div style="font-size:10px;font-weight:700;color:var(--ter);text-align:center">${d}</div>`).join('')}${cells}</div>
          <div style="font-size:12.5px;color:var(--sec);margin-top:12px">Посещение фиксируется по факту. Отмена и неявка не считаются посещением.</div>
        </div>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Профиль ─────────────────────────────────────────────────────────────── */

  function profile() {
    const c = me();
    return shell('c-profile', `
      <div style="padding:6px 16px 0">
        <div style="display:flex;align-items:center;gap:14px">
          ${Lead(c.initials)}
          <div><div style="font-family:var(--disp);font-weight:800;font-size:22px;letter-spacing:-.4px">${esc(c.name)}</div>
            <div style="font-size:13px;font-weight:500;color:var(--sec);margin-top:2px">Тренер ${esc(DB.trainer.name)} · с ${esc(c.since)}</div></div>
        </div>
        <div style="height:16px"></div>
        ${Stats([['7', 'осталось занятий'], ['31', 'проведено'], ['40 000 ₸', 'к оплате']])}
        <div style="height:16px"></div>
        ${Card([
          ['user', 'Личные данные'],
          ['wallet', 'Пакет и оплаты'],
          ['bell', 'Уведомления'],
          ['settings', 'Настройки'],
        ].map(([icon, title], i, arr) => Row({
          lead: Lead(icon, { size: 'sm', icon: true }),
          title,
          right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
          a: 'toast', args: { text: 'Раздел в разработке' }, last: i === arr.length - 1,
        })).join(''), { rows: true })}
        <div style="margin-top:16px">${Notice('Прототип. Данные вымышленные.', { tone: 'info', icon: 'info' })}</div>
      </div>
      <div style="height:20px"></div>`);
  }

  /* ── Shell ───────────────────────────────────────────────────────────────── */

  function shell(tab, body) {
    return `<div class="screen">
      <div class="topbar" style="padding-bottom:0">
        <div class="topbar__side"></div>
        <div class="topbar__title">Тренер ${esc(DB.trainer.name)}</div>
        <div class="topbar__side">${iconBtn('bell', { act: 'sheet.open', args: { id: 'notifications' }, label: 'Уведомления', size: 22 })}</div>
      </div>
      <div class="screen__body">${body}</div>
      ${TabBar('client', tab)}
    </div>`;
  }

  return { home, first, program, history, progress, profile };
})();
