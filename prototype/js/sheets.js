/* ============================================================================
   sheets.js — bottom sheets (both roles)
   Rendered by app.js from `state.sheet`. Keeping them in one place makes the
   "what changes / what the other side sees" annotations easier to audit.
   ========================================================================== */

const Sheets = (() => {
  const { esc, act, Btn, Pill, Card, Lead, Notice, Row } = UI;
  const client = (id) => DB.client(id);
  const req = (st, id) => st.requests[id];

  /* ── Session actions (trainer) ───────────────────────────────────────────── */

  function session(st) {
    const sid = st.sheet.data.sid;
    const s = DB.sessions.find(x => x.id === sid);
    if (!s) return '';
    const reqs = { ...st.requests, ...(st.sessionRequests || {}) };
    const r = s.request || reqs[s.id];
    const participants = s.kind === 'group'
      ? s.participants.map(p => ({ ...p, c: client(p.clientId) }))
      : [{ clientId: s.clientId, c: client(s.clientId) }];

    const attBlock = participants.map(p => {
      if (!p.c) return '';
      const key = s.id + ':' + p.clientId;
      const att = st.attendance[key];
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--hair)">
        ${Lead(p.c.initials, { size: 'sm' })}
        <div style="flex:1;min-width:0">
          <div style="font-size:14.5px;font-weight:600">${esc(p.c.short)}</div>
          <div style="font-size:12.5px;color:var(--sec);margin-top:1px">
            ${att === 'present' ? 'Присутствовал' : att === 'noshow' ? 'Неявка' : 'Посещение не отмечено'}
          </div>
        </div>
        ${att ? Pill(att === 'present' ? 'Списано' : 'Неявка', { tone: att === 'present' ? 'mint' : 'danger', dot: false })
          : `<div style="display:flex;gap:6px">
              <button class="btn btn--soft btn--sm" ${act('attendance.mark', { sid: s.id, cid: p.clientId, value: 'present' })}>Пришёл</button>
              <button class="btn btn--ghost btn--sm" ${act('attendance.mark', { sid: s.id, cid: p.clientId, value: 'noshow' })}>Не пришёл</button>
            </div>`}
      </div>`;
    }).join('');

    return `<div class="sheet__title">${esc(s.title)}</div>
      <div class="sheet__sub">${DB.fmtDateLong(s.date)} · ${s.start}–${s.end} · ${s.kind === 'group' ? 'мини-группа' : 'индивидуальное'}</div>
      ${r && r.state === 'pending' ? `<div style="margin-top:14px">${Notice(`Клиент предложил перенос на ${DB.fmtDateLong(r.to.date)}, ${r.to.start}. До подтверждения действует ${DB.fmtDateLong(r.from.date)}, ${r.from.start}.`, { tone: 'warn', icon: 'swap' })}</div>` : ''}
      <div style="margin-top:16px">
        <div class="label" style="margin-left:0">Посещение и списание</div>
        ${attBlock}
      </div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${s.status !== 'cancelled' ? Btn('Провести тренировку', { a: 'logging.open', args: { id: s.id }, icon: 'play' }) : ''}
        ${s.status !== 'cancelled' ? Btn('Перенести занятие', { kind: 'soft', a: 'sheet.open', args: { id: 'trainerMove', sid: s.id }, icon: 'swap' }) : ''}
        ${s.status !== 'cancelled' ? Btn('Отменить запись', { kind: 'ghost', a: 'session.cancel', args: { sid: s.id } }) : ''}
      </div>
      <div style="margin-top:14px">${Notice('Отмена не списывает занятие автоматически. Списание за отмену или неявку — отдельное действие с причиной.', { tone: 'info', icon: 'info' })}</div>`;
  }

  /* ── Set logging ─────────────────────────────────────────────────────────── */

  function setlog(st) {
    const d = st.sheet.data;
    const exs = DB.programFor(client(d.cid) && client(d.cid).program);
    const e = exs.find(x => x.id === d.ex) || {};
    const arr = (st.logging.values[d.cid] || {})[d.ex] || [];
    const cur = arr[d.si] || {};
    const kg = cur.kg != null ? cur.kg : (e.prev && e.prev.kg) || 0;
    const reps = cur.reps != null ? cur.reps : (e.prev && e.prev.reps) || 0;
    const unit = e.name === 'Планка' ? 'сек' : 'повт';
    const isReps = unit === 'сек';
    return `<div style="text-align:center;margin-bottom:4px">
        <div style="font-size:13px;font-weight:600;color:var(--sec)">Подход ${d.si + 1}</div>
        <div style="font-family:var(--disp);font-weight:800;font-size:21px;letter-spacing:-.3px;margin-top:2px">${esc(e.name || '')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
        <div class="bignum">
          <div class="bignum__label">${isReps ? 'Вес не нужен' : 'Вес'}</div>
          <div class="bignum__row">
            <button class="bignum__step" ${act('setlog.step', { cid: d.cid, ex: d.ex, si: d.si, field: 'kg', by: -2.5 })}>${Icon.get('minus', { size: 22 })}</button>
            <div class="bignum__value"><b class="num">${kg}</b><span>кг</span></div>
            <button class="bignum__step" ${act('setlog.step', { cid: d.cid, ex: d.ex, si: d.si, field: 'kg', by: 2.5 })}>${Icon.get('plus', { size: 22 })}</button>
          </div>
        </div>
        <div class="bignum">
          <div class="bignum__label">${isReps ? 'Длительность' : 'Повторы'}</div>
          <div class="bignum__row">
            <button class="bignum__step" ${act('setlog.step', { cid: d.cid, ex: d.ex, si: d.si, field: 'reps', by: -1 })}>${Icon.get('minus', { size: 22 })}</button>
            <div class="bignum__value"><b class="num">${reps}</b><span>${unit}</span></div>
            <button class="bignum__step" ${act('setlog.step', { cid: d.cid, ex: d.ex, si: d.si, field: 'reps', by: 1 })}>${Icon.get('plus', { size: 22 })}</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;justify-content:center;flex-wrap:wrap">
        <button class="chip" ${act('setlog.repeat', { cid: d.cid, ex: d.ex, si: d.si })}>Повторить прошлый результат</button>
      </div>
      <div style="margin-top:18px">${Btn('Записать подход', { kind: 'mint', a: 'setlog.save', args: { cid: d.cid, ex: d.ex, si: d.si }, icon: 'check' })}</div>`;
  }

  function finishConfirm(st) {
    let n = 0;
    const s = DB.sessions.find(x => x.id === st.logging.sessionId);
    const ids = s && s.participants ? s.participants.map(p => p.clientId) : [st.logging.active];
    ids.forEach(cid => {
      const c = client(cid);
      DB.programFor(c && c.program).forEach(e => {
        const arr = (st.logging.values[cid] || {})[e.id] || [];
        n += e.sets - arr.filter(Boolean).length;
      });
    });
    return `<div class="sheet__title">Завершить тренировку?</div>
      <div class="sheet__sub">Записано не всё: ${n} ${DB.plural(n, ['подход остался', 'подхода остались', 'подходов остались'])} незаписанными. Они не станут нулём и не будут считаться выполненными.</div>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Сохранить записанное и завершить', { kind: 'primary', a: 'log.confirmPartial' })}
        ${Btn('Продолжить ввод', { kind: 'soft', a: 'log.continue' })}
      </div>`;
  }

  function charge(st) {
    const { sid, cid } = st.sheet.data;
    const c = client(cid);
    return `<div class="sheet__title">Отметить посещение?</div>
      <div class="sheet__sub">${esc(c.name)} · занятие будет списано из пакета. Посещение, программа и списание — разные сущности.</div>
      <div style="margin-top:16px">${Notice('Отметить посещение и списать 1 занятие из пакета', { tone: 'mint', icon: 'check' })}</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Отметить и списать', { kind: 'mint', a: 'attendance.charge', args: { sid, cid }, icon: 'check' })}
        ${Btn('Только отметить, без списания', { kind: 'soft', a: 'attendance.markOnly', args: { sid, cid } })}
      </div>`;
  }

  /* ── Reschedule counter-offer (trainer side) ─────────────────────────────── */

  function counter(st) {
    const stt = Store.get();
    const r = req(stt, st.sheet.data.rid);
    const c = client(r.clientId);
    const times = ['17:00', '18:00', '18:30', '19:00', '20:00', '21:00'];
    const sel = stt.counterPick || { start: '19:00' };
    return `<div class="sheet__title">Другое время</div>
      <div class="sheet__sub">Для ${esc(c.name)}. Встречное предложение заменит текущий запрос — история сохранится.</div>
      <div class="label" style="margin:18px 0 10px">Дата</div>
      <div class="chips">${DB.WEEK.map(d => `<span class="chip chip--soft ${(stt.counterPick && stt.counterPick.date === d) ? 'is-on' : ''}" ${act('counter.pick', { key: 'date', value: d })} role="button" tabindex="0">${DB.fmtDate(d)}</span>`).join('')}</div>
      <div class="label" style="margin:18px 0 10px">Начало</div>
      <div class="chips" style="flex-wrap:wrap">${times.map(t => `<span class="chip ${(stt.counterPick && stt.counterPick.start === t) ? 'is-on' : ''}" ${act('counter.pick', { key: 'start', value: t })} role="button" tabindex="0">${t}</span>`).join('')}</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Отправить встречное время', { kind: 'primary', a: 'counter.send', args: { rid: r.id } })}
        ${Btn('Закрыть', { kind: 'ghost', a: 'sheet.close' })}
      </div>`;
  }

  function trainerMove(st) {
    const times = ['09:00', '11:30', '17:00', '18:00', '19:00', '20:00'];
    return `<div class="sheet__title">Перенести занятие</div>
      <div class="sheet__sub">Новое время отправится клиенту как запрос. До подтверждения действует прежнее время.</div>
      <div class="label" style="margin:18px 0 10px">Новая дата</div>
      <div class="chips">${DB.WEEK.map(d => `<span class="chip chip--soft" ${act('toast', { text: 'Время предложено клиенту' })} role="button" tabindex="0">${DB.fmtDate(d)}</span>`).join('')}</div>
      <div class="label" style="margin:18px 0 10px">Начало</div>
      <div class="chips" style="flex-wrap:wrap">${times.map(t => `<span class="chip" ${act('toast', { text: 'Время предложено клиенту' })} role="button" tabindex="0">${t}</span>`).join('')}</div>
      <div style="margin-top:18px">${Btn('Отправить предложение', { a: 'toast', args: { text: 'Предложение отправлено клиенту' } })}</div>`;
  }

  /* ── Payment ─────────────────────────────────────────────────────────────── */

  function pay(st) {
    const { cid, due } = st.sheet.data;
    const c = client(cid);
    return `<div class="sheet__title">Записать оплату</div>
      <div class="sheet__sub">${esc(c.name)}${due ? ` · к оплате ${DB.fmtMoney(due)}` : ''}. Оплата уменьшает долг, но не количество посещений.</div>
      <div class="label" style="margin:18px 0 10px">Сумма, ₸</div>
      <div class="field"><input type="number" inputmode="numeric" data-pay-amount placeholder="0" value="${due || ''}" style="font-family:var(--disp);font-weight:800;font-size:24px"></div>
      <div class="label" style="margin:18px 0 10px">Способ</div>
      <div class="chips">${['Kaspi', 'Перевод', 'Наличные'].map((m, i) => `<span class="chip chip--soft ${i === 0 ? 'is-on' : ''}" ${act('pay.method', { m })} role="button" tabindex="0">${m}</span>`).join('')}</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Записать оплату', { kind: 'mint', a: 'pay.save', args: { cid }, icon: 'check' })}
        ${Btn('Отмена', { kind: 'ghost', a: 'sheet.close' })}
      </div>`;
  }

  /* ── Notifications (internal inbox) ──────────────────────────────────────── */

  function notifications() {
    const items = [
      ['swap', 'Айгерим предложила перенос', 'Чт 18:00 → Пт 19:00 · ждёт вашего ответа', 'amber'],
      ['check', 'Алия подтвердила занятие', 'Сегодня 20:00 · мини-группа', 'mint'],
      ['ban', 'Мади отменил занятие', 'Сегодня 20:00 · списание не выполнено', 'danger'],
      ['wallet', 'Арман оплатил 18 000 ₸', 'Разовые занятия · остаток 6 000 ₸', ''],
    ];
    return `<div class="sheet__title">Уведомления</div>
      <div class="sheet__sub">Внутренние события. Доставка при закрытом приложении не обещается — push отложен до выбора платформы.</div>
      <div style="margin-top:14px">${Card(items.map(([icon, title, meta, tone], i) => Row({
      lead: Lead(icon, { size: 'sm', icon: true, tone: tone || '' }),
      title, meta,
      last: i === items.length - 1,
    })).join(''), { rows: true })}</div>`;
  }

  /* ── Stale notification ──────────────────────────────────────────────────── */

  function stale(st) {
    return `<div class="sheet__title">Уведомление устарело</div>
      <div class="sheet__sub">Пока уведомление было непрочитанным, состояние запроса изменилось. Открываем актуальное состояние — повторное нажатие не повторяет действие.</div>
      <div style="margin-top:16px">${Notice('Запрос уже обработан. Действие не выполнено повторно.', { tone: 'info', icon: 'info' })}</div>
      <div style="margin-top:18px">${Btn('Открыть актуальное', { a: 'nav.go', args: { id: 't-inbox' } })}</div>`;
  }

  /* ── Client actions (trainer) ────────────────────────────────────────────── */

  function clientActions(st) {
    const cid = st.sheet.data.cid;
    const c = client(cid);
    return `<div class="sheet__title">${esc(c.name)}</div>
      <div class="sheet__sub">${c.plan ? esc(c.plan.title) : 'Без покупки'} · осталось ${c.plan ? c.plan.remaining : 0}</div>
      <div style="margin-top:16px">${Card([
      ['calendarPlus', 'Создать занятие', 't-new'],
      ['layers', 'Назначить программу', 't-library'],
      ['wallet', 'Записать оплату', null],
      ['link', 'Приглашение', 't-invite'],
    ].map(([icon, title, screen], i, arr) => Row({
      lead: Lead(icon, { size: 'sm', icon: true }),
      title,
      right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
      a: title === 'Записать оплату' ? 'sheet.open' : 'nav.go',
      args: title === 'Записать оплату' ? { id: 'pay', cid, due: c.plan ? c.plan.due : 0 } : { id: screen },
      last: i === arr.length - 1,
    })).join(''), { rows: true })}</div>`;
  }

  /* ── Search (trainer) ────────────────────────────────────────────────────── */

  function search() {
    return `<div class="sheet__title">Поиск</div>
      <div class="field field--search" style="margin-top:16px">${Icon.get('search', { size: 19, style: 'color:var(--ter)' })}<input data-client-search placeholder="Имя клиента"></div>
      <div style="margin-top:14px">${Card(DB.clients.filter(c => c.status !== 'new' || c.id === 'c6').map((c, i, arr) => Row({
      lead: Lead(c.initials, { size: 'sm' }),
      title: c.name,
      meta: c.program ? c.program : 'Без программы',
      a: 'client.open', args: { id: c.id }, last: i === arr.length - 1,
    })).join(''), { rows: true })}</div>`;
  }

  /* ── Custom exercise / assign template ───────────────────────────────────── */

  function customEx() {
    return `<div class="sheet__title">Новое упражнение</div>
      <div class="sheet__sub">Своё упражнение появится в библиотеке и не изменит прошлые занятия.</div>
      <div class="label" style="margin:18px 0 10px">Название</div>
      <div class="field field--sm"><input placeholder="Например, Тяга Т-грифа"></div>
      <div style="display:flex;gap:12px;margin-top:16px">
        <div style="flex:1"><div class="label" style="margin-left:0">Подходы</div><div class="field field--sm"><input type="number" value="3"></div></div>
        <div style="flex:1"><div class="label" style="margin-left:0">Повторы</div><div class="field field--sm"><input type="number" value="10"></div></div>
      </div>
      <div style="margin-top:18px">${Btn('Добавить в библиотеку', { a: 'toast', args: { text: 'Упражнение добавлено в библиотеку' } })}</div>`;
  }

  function assignTemplate() {
    return `<div class="sheet__title">Назначить на занятие</div>
      <div class="sheet__sub">Будет создана независимая копия шаблона. Правка библиотеки не перепишет назначенное.</div>
      <div style="margin-top:16px">${Card([
      ['Айгерим Бекова', 'Сегодня 18:00 · Низ А'],
      ['Алия Нурлановa', 'Сегодня 20:00 · мини-группа'],
      ['Дана Ержанова', 'Сегодня 20:00 · мини-группа'],
    ].map(([t, m], i, arr) => Row({
      lead: Lead(t[0], { size: 'sm' }), title: t, meta: m,
      right: Icon.get('chevR', { size: 20, style: 'color:var(--ter)' }),
      a: 'toast', args: { text: 'Шаблон назначен · создана копия' }, last: i === arr.length - 1,
    })).join(''), { rows: true })}</div>`;
  }

  /* ── Client-side: reschedule ─────────────────────────────────────────────── */

  function cReschedule(st) {
    const pick = st.reschedulePick || { date: '2026-09-18', start: '19:00' };
    const from = { date: '2026-09-17', start: '18:00', end: '19:00' };
    const times = ['07:00', '09:00', '18:00', '19:00', '20:00', '21:00'];
    return `<div class="sheet__title">Перенос занятия</div>
      <div class="sheet__sub">Выберите новое время. До подтверждения действует прежнее время.</div>
      <div style="margin-top:16px">
        <div class="diffcard">
          <div class="diffcard__lbl">Было → станет</div>
          <div class="diffcard__grid">
            <div class="diffcard__side is-old"><div class="t">${from.start}–${from.end}</div><div class="d">${DB.fmtDateLong(from.date)}</div></div>
            <div class="diffcard__arrow">${Icon.get('arrowRight', { size: 18 })}</div>
            <div class="diffcard__side"><div class="t">${pick.start}–${DB.addMinutes(pick.start, 60)}</div><div class="d">${DB.fmtDateLong(pick.date)}</div></div>
          </div>
        </div>
      </div>
      <div class="label" style="margin:18px 0 10px">Новая дата</div>
      <div class="chips">${DB.WEEK.map(d => `<span class="chip chip--soft ${pick.date === d ? 'is-on' : ''}" ${act('cres.pick', { key: 'date', value: d })} role="button" tabindex="0">${DB.fmtDate(d)}</span>`).join('')}</div>
      <div class="label" style="margin:18px 0 10px">Начало</div>
      <div class="chips" style="flex-wrap:wrap">${times.map(t => `<span class="chip ${pick.start === t ? 'is-on' : ''}" ${act('cres.pick', { key: 'start', value: t })} role="button" tabindex="0">${t}</span>`).join('')}</div>
      <div style="margin-top:20px">${Btn('Отправить запрос', { a: 'cres.send' })}</div>
      <div style="margin-top:10px">${Btn('Закрыть', { kind: 'ghost', a: 'sheet.close' })}</div>`;
  }

  /* ── Client-side: cancel ─────────────────────────────────────────────────── */

  function cCancel(st) {
    return `<div class="sheet__title">Отменить запись?</div>
      <div class="sheet__sub">При отмене тренер отдельно решает вопрос списания. Отмена не создаёт автоматический штраф и не гарантирует, что занятие не будет списано.</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Отменить запись', { kind: 'danger', a: 'cres.cancel' })}
        ${Btn('Оставить занятие', { kind: 'soft', a: 'sheet.close' })}
      </div>`;
  }

  /* ── Exercise technique (client) ─────────────────────────────────────────── */

  function exercise(st) {
    const id = st.sheet.data.ex;
    const e = DB.programFor('Низ А').find(x => x.id === id) || DB.programFor('Низ А')[0];
    return `<div class="sheet__title">${esc(e.name)}</div>
      <div class="sheet__sub">План: ${e.sets} × ${e.reps}${e.target ? ' · ' + e.target + ' кг' : ''}</div>
      <div style="margin-top:16px">${Notice('Техника: спина нейтральна, движение подконтрольное, без рывка в нижней точке. Текст техники задаёт тренер.', { tone: 'info', icon: 'info' })}</div>
      <div style="margin-top:14px">${Card(KV([['Прошлый раз', e.prev.kg ? `${e.prev.kg} кг × ${e.prev.reps}` : `${e.prev.reps} повт`], ['Личный рекорд', e.pr ? e.pr + ' кг' : '—']]), { pad: true })}</div>
      <div style="margin-top:16px">${Btn('Закрыть', { kind: 'soft', a: 'sheet.close' })}</div>`;
  }

  /* ── Dispatcher ──────────────────────────────────────────────────────────── */

  function render(st) {
    const sh = st.sheet;
    if (!sh) return '';
    const map = {
      session, setlog, finishConfirm, charge, counter, trainerMove, pay,
      notifications, stale, clientActions, search, customEx, assignTemplate,
      cReschedule, cCancel, exercise,
    };
    const fn = map[sh.id];
    return fn ? fn(st) : '';
  }

  return { render };
})();
