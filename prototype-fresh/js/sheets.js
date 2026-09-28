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
      return `<div class="attendance-person">
        ${Lead(p.c.initials, { size: 'sm' })}
        <div class="attendance-person__identity">
          <div style="font-size:0.90625rem;font-weight:600">${esc(p.c.name)}</div>
          <div style="font-size:0.875rem;color:var(--sec);margin-top:1px">
            ${att === 'present' ? 'Присутствовал' : att === 'noshow' ? 'Неявка' : 'Пока не отмечено'}
          </div>
        </div>
        <div class="attendance-person__actions">${att ? Pill(att === 'present' ? (st.recorded['charge:' + s.id + ':' + p.clientId] ? 'Посещение · списано' : 'Без списания') : 'Неявка', { tone: att === 'present' ? 'mint' : 'danger', dot: false })
          : `<div class="attendance-person__buttons">
              <button class="btn btn--soft btn--sm" ${act('attendance.mark', { sid: s.id, cid: p.clientId, value: 'present' })}>Пришёл</button>
              <button class="btn btn--ghost btn--sm" ${act('attendance.mark', { sid: s.id, cid: p.clientId, value: 'noshow' })}>Не пришёл</button>
            </div>`}</div>
      </div>`;
    }).join('');

    return `<div class="sheet__title">${esc(s.title)}</div>
      <div class="sheet__sub">${DB.fmtDateLong(s.date)} · ${s.start}–${s.end}</div>
      ${r && ['pending', 'counter'].includes(r.state) ? `<div style="margin-top:14px">${Notice(`${r.author === 'trainer' ? 'Тренер' : 'Клиент'} предложил перенос на ${DB.fmtDateLong((r.counter || r.to).date)}, ${(r.counter || r.to).start}. До подтверждения действует ${DB.fmtDateLong(r.from.date)}, ${r.from.start}.`, { tone: 'warn', icon: 'swap' })}</div>` : ''}
      <div style="margin-top:16px">
        <div class="label" style="margin-left:0">Посещение и списание</div>
        ${attBlock}
      </div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${s.status !== 'cancelled' ? Btn(Store.logging.label(s.id), { a: 'logging.open', args: { id: s.id }, icon: 'play' }) : ''}
        ${s.status !== 'cancelled' ? Btn('Перенести занятие', { kind: 'soft', a: 'sheet.open', args: { id: 'trainerMove', sid: s.id }, icon: 'swap' }) : ''}
        ${s.status !== 'cancelled' ? Btn('Отменить запись', { kind: 'ghost', a: 'session.cancel', args: { sid: s.id } }) : ''}
      </div>
      <div style="margin-top:14px"><p class="attendance-help">Отмена не списывает занятие. Списание за отмену или неявку оформляется отдельно, с причиной.</p></div>`;
  }

  /* ── Set logging ─────────────────────────────────────────────────────────── */

  function setlog(st) {
    const d = st.sheet.data;
    const exs = Store.logging.exercises(d.cid);
    const e = exs.find(x => x.id === d.ex) || {};
    const cur = st.logging.editor || {};
    const kg = cur.kg ?? '';
    const reps = cur.reps ?? '';
    const unit = e.name === 'Планка' ? 'сек' : 'повт';
    const isReps = unit === 'сек';
    const storageHint = st.logging.storageError
      ? (st.logging.storageConflict
        ? 'Журнал изменён в другой вкладке. Ваши правки — только в этой вкладке. Скачайте копию перед перезагрузкой.'
        : 'Не удалось сохранить в браузере. Ваши правки — только в этой вкладке. Скачайте копию перед закрытием.')
      : '';
    const inputHint = [cur.error, storageHint].filter(Boolean).join(' ') || 'Поля сохраняются как черновик. Подтвердите сегодняшний результат.';
    return `<div class="log-editor">
      <header class="log-editor-head">
        <div><p>${esc(client(d.cid).name)} · подход ${Number(d.si) + 1}</p><h2>${esc(e.name || '')}</h2></div>
        ${Btn('Закрыть', { kind: 'ghost', size: 'sm', full: false, a: 'sheet.close' })}
      </header>
      <div class="log-editor-fields">
        <div class="log-editor-hint">Серые цифры — прошлый раз, это подсказка, не запись.</div>
      <div class="log-editor-inputs">
        ${e.prev.kg !== 0 ? `<div class="bignum">
          <label class="bignum__label" for="log-kg">Вес, кг</label>
          <div class="bignum__row">
            <button class="bignum__step" aria-label="Уменьшить вес на 2,5 кг" ${act('setlog.step', { field: 'kg', by: -2.5 })}>${Icon.get('minus', { size: 22 })}</button>
            <input id="log-kg" class="log-number num" data-log-field="kg" inputmode="decimal" enterkeyhint="next" autocomplete="off" value="${esc(kg)}" placeholder="${esc(DB.fmtNumber(e.prev.kg))}" aria-describedby="log-input-status" ${cur.error ? 'aria-invalid="true"' : ''}>
            <button class="bignum__step" aria-label="Увеличить вес на 2,5 кг" ${act('setlog.step', { field: 'kg', by: 2.5 })}>${Icon.get('plus', { size: 22 })}</button>
          </div>
        </div>` : ''}
        <div class="bignum">
          <label class="bignum__label" for="log-reps">${isReps ? 'Длительность, сек' : 'Повторы'}</label>
          <div class="bignum__row">
            <button class="bignum__step" aria-label="Уменьшить ${isReps ? 'длительность' : 'повторы'} на 1" ${act('setlog.step', { field: 'reps', by: -1 })}>${Icon.get('minus', { size: 22 })}</button>
            <input id="log-reps" class="log-number num" data-log-field="reps" inputmode="numeric" enterkeyhint="done" autocomplete="off" value="${esc(reps)}" placeholder="${esc(e.prev.reps ?? '—')}" aria-describedby="log-input-status" ${cur.error ? 'aria-invalid="true"' : ''}>
            <button class="bignum__step" aria-label="Увеличить ${isReps ? 'длительность' : 'повторы'} на 1" ${act('setlog.step', { field: 'reps', by: 1 })}>${Icon.get('plus', { size: 22 })}</button>
          </div>
        </div>
      </div>
      ${e.prev?.reps > 0 ? `<button class="log-repeat" ${act('setlog.repeat', { cid: d.cid, ex: d.ex, si: d.si })}>
        <span>Как в прошлый раз</span><b class="num">${e.prev.kg ? `${DB.fmtNumber(e.prev.kg)} кг × ` : ''}${e.prev.reps} ${unit}</b>
      </button>` : '<p class="log-editor-hint">Первый раз — прошлых результатов нет.</p>'}
      </div>
      <footer class="log-editor-footer">
      <p id="log-input-status" class="log-editor-hint" ${cur.error || st.logging.storageError ? 'role="alert"' : ''}>${esc(inputHint)}</p>
      <div${st.logging.storageError ? ' class="log-recovery"' : ''}>
      ${st.logging.storageError ? Btn('Скачать копию журнала', { kind: 'soft', size: 'compact', a: 'log.export' }) : ''}
      ${Btn(st.logging.storageError ? 'Записать только в этой вкладке' : 'Записать подход', { kind: 'primary', a: 'setlog.save', icon: 'check' })}
      </div>
      </footer></div>`;
  }

  function finishConfirm(st) {
    const rows = Object.keys(st.logging.plans).map(cid => {
      const p = Store.logging.progress(cid);
      return `<li><strong>${esc(client(cid).short)}</strong><span>${!Store.logging.eligible(cid) ? 'Не участвует' : p.total ? `${p.done} из ${p.total} записано · ${p.total - p.done} без записи${p.drafts ? ` · черновиков: ${p.drafts}` : ''}` : 'Упражнений нет · подходы не записаны'}</span>${Store.logging.eligible(cid) ? UI.ChangesSummary(cid) : ''}</li>`;
    }).join('');
    return `<div class="sheet__title">Завершить журнал?</div>
      <div class="sheet__sub">Сохраним только подтверждённые результаты. Пустые подходы и черновики не считаются выполненными. Посещение и списание не изменятся.</div>
      <ul class="log-review">${rows}</ul>
      ${st.logging.storageError ? `<p role="alert">${st.logging.storageConflict ? 'Журнал изменён в другой вкладке. Вернитесь к вводу и скачайте копию своих правок.' : 'Не удалось сохранить в браузере. Освободите место и повторите.'}</p>` : ''}
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Сохранить записанное и завершить', { kind: 'primary', a: 'log.confirmPartial' })}
        ${Btn('Продолжить ввод', { kind: 'soft', a: 'log.continue' })}
      </div>`;
  }

  function charge(st) {
    const { sid, cid } = st.sheet.data;
    const c = client(cid);
    return `<div class="sheet__title">Отметить посещение?</div>
      <div class="sheet__sub">${esc(c.name)}. Выберите: только посещение или посещение со списанием одного занятия.</div>
      <div style="margin-top:16px">${Notice('Отметить посещение и списать 1 занятие из пакета', { tone: 'mint', icon: 'check' })}</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Отметить и списать', { kind: 'mint', a: 'attendance.charge', args: { sid, cid }, icon: 'check' })}
        ${Btn('Только отметить, без списания', { kind: 'soft', a: 'attendance.markOnly', args: { sid, cid } })}
      </div>`;
  }


  /* ── Payment ─────────────────────────────────────────────────────────────── */

  function pay(st) {
    const { cid, due } = st.sheet.data;
    const c = client(cid);
    return `<div class="sheet__title">Записать оплату</div>
      <div class="sheet__sub">${esc(c.name)}${due ? ` · к оплате ${DB.fmtMoney(due)}` : ''}. Оплата уменьшает долг, но не количество посещений.</div>
      <div class="label" style="margin:18px 0 10px">Сумма, ₸</div>
      <div class="field"><input type="number" inputmode="numeric" data-pay-amount placeholder="0" value="${due || ''}" style="font-family:var(--disp);font-weight:800;font-size:1.5rem"></div>
      <div class="label" style="margin:18px 0 10px">Способ</div>
      <div class="chips">${['Kaspi', 'Перевод', 'Наличные'].map((m, i) => `<span class="chip chip--soft ${i === 0 ? 'is-on' : ''}" ${act('pay.method', { m })} role="button" tabindex="0">${m}</span>`).join('')}</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Записать оплату', { kind: 'mint', a: 'pay.save', args: { cid }, icon: 'check' })}
        ${Btn('Отмена', { kind: 'ghost', a: 'sheet.close' })}
      </div>`;
  }

  /* ── Notifications (internal inbox) ──────────────────────────────────────── */

  function notifications(st) {
    if (st.role === 'client') {
      const requests = st.scenario === 'empty' ? [] : Object.values(st.requests).filter(r => r.clientId === DB.DEMO_CLIENT_ID && ['pending', 'counter'].includes(r.state));
      return `<div class="sheet__title">Уведомления</div>
        <div class="sheet__sub">Изменения ваших занятий. Push-уведомления в демо не подключены.</div>
        <div class="client-notifications">${requests.length ? Card(requests.map(r => {
          const proposed = r.counter || r.to;
          return Row({ title: r.awaiting === 'client' ? 'Тренер предложил перенос' : 'Ваш запрос на перенос',
            meta: `${DB.fmtDateLong(proposed.date)} · ${proposed.start}–${proposed.end}<br>${r.awaiting === 'client' ? 'Нужен ваш ответ' : 'Ждём ответа тренера'}`,
            a: 'nav.go', args: { id: 'c-home' }, right: Icon.get('chevR', { size: 18 }),
          });
        }).join(''), { rows: true }) : Notice('Открытых запросов нет. Ближайшие занятия можно посмотреть на главной.', { icon: 'bell' })}</div>`;
    }
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
    const r = st.requests[st.sheet.data.id];
    const pending = r && ['pending', 'counter'].includes(r.state);
    return `<div class="sheet__title">Актуальное состояние запроса</div>
      <div class="sheet__sub">Открытие уведомления само по себе не подтверждает и не отклоняет перенос.</div>
      <div style="margin-top:16px">${Notice(pending ? `Предложение ещё открыто. ${r.awaiting === st.role ? 'Нужен ваш ответ.' : 'Ждём ответа другой стороны.'}` : 'Запрос уже закрыт. Действие не выполнено повторно.', { tone: 'info', icon: 'info' })}</div>
      <div style="margin-top:18px">${Btn('Открыть актуальное', { a: 'nav.go', args: { id: st.role === 'trainer' ? 't-inbox' : 'c-home' } })}</div>`;
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
      ...(cid === 'c6' ? [['link', 'Приглашение', 't-invite']] : []),
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
      <div class="sheet__sub">Макет редактора. Сохранение упражнения в библиотеку пока не подключено.</div>
      <div class="label" style="margin:18px 0 10px">Название</div>
      <div class="field field--sm"><input placeholder="Например, Тяга Т-грифа"></div>
      <div style="display:flex;gap:12px;margin-top:16px">
        <div style="flex:1"><div class="label" style="margin-left:0">Подходы</div><div class="field field--sm"><input type="number" value="3"></div></div>
        <div style="flex:1"><div class="label" style="margin-left:0">Повторы</div><div class="field field--sm"><input type="number" value="10"></div></div>
      </div>
      <div style="margin-top:18px">${Btn('Добавить в библиотеку', { disabled: true })}</div>`;
  }

  function assignTemplate() {
    return `<div class="sheet__title">Назначить на занятие</div>
      <div class="sheet__sub">Макет выбора занятия. Назначение на существующее занятие пока недоступно; программу можно выбрать при создании новой записи.</div>
      <div style="margin-top:16px">${Card([
      ['Айгерим Бекова', 'Сегодня 18:00 · Низ А'],
      ['Алия Нурлановa', 'Сегодня 20:00 · мини-группа'],
      ['Дана Ержанова', 'Сегодня 20:00 · мини-группа'],
    ].map(([t, m], i, arr) => Row({
      lead: Lead(t[0], { size: 'sm' }), title: t, meta: m,
      last: i === arr.length - 1,
    })).join(''), { rows: true })}</div>`;
  }

  /* ── Client-side: reschedule ─────────────────────────────────────────────── */


  /* ── Client-side: cancel ─────────────────────────────────────────────────── */

  function rescheduleForm(st) {
    const s = DB.sessions.find(x => x.id === st.sheet.data.sid);
    if (!s) return '<div class="sheet__title">Занятие недоступно</div>';
    const pick = st.reschedulePick || { date: s.date, start: s.start };
    const duration = (Number(s.end.slice(0, 2)) - Number(s.start.slice(0, 2))) * 60 + Number(s.end.slice(3)) - Number(s.start.slice(3));
    return `<div class="sheet__title">${st.sheet.data.rid ? 'Встречное предложение' : 'Перенос занятия'}</div>
      <div class="sheet__sub">${esc(client(s.clientId).name)} · ${duration} мин</div>
      <div class="reschedule-current"><strong>Действует</strong><span>${DB.fmtDateLong(s.date)}, ${s.start}–${s.end}</span></div>
      <p class="log-editor-hint">Дата и время ниже — предложение. Расписание изменится только после ответа второй стороны.</p>
      <div class="reschedule-fields">
        <label for="reschedule-date">Новая дата</label>
        <div class="field"><input id="reschedule-date" type="date" min="${DB.TODAY}" data-reschedule-field="date" value="${esc(pick.date)}" required></div>
        <label for="reschedule-time">Начало</label>
        <div class="field"><input id="reschedule-time" type="time" data-reschedule-field="start" value="${esc(pick.start)}" required></div>
      </div>
      <div style="margin-top:20px;display:grid;gap:10px">${Btn('Отправить предложение', { a: 'cres.send' })}${Btn('Закрыть', { kind: 'ghost', a: 'sheet.close' })}</div>`;
  }

  function cCancel(st) {
    const s = DB.sessions.find(x => x.id === st.sheet.data?.sid);
    if (!s) return '<div class="sheet__title">Выберите занятие</div>';
    return `<div class="sheet__title">Отменить запись?</div>
      <div class="reschedule-current">${DB.fmtDateLong(s.date)}, ${s.start}–${s.end}</div>
      <div class="sheet__sub">При отмене тренер отдельно решает вопрос списания. Отмена не создаёт автоматический штраф и не гарантирует, что занятие не будет списано.</div>
      <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Отменить запись', { kind: 'danger', a: 'cres.cancel', args: { sid: s.id } })}
        ${Btn('Оставить занятие', { kind: 'soft', a: 'sheet.close' })}
      </div>`;
  }

  /* ── Exercise technique (client) ─────────────────────────────────────────── */

  function exercise(st) {
    const id = st.sheet.data.ex;
    const program = st.sheet.data.program || DB.client(st.role === 'client' ? DB.DEMO_CLIENT_ID : st.activeClient)?.program;
    const e = (st.sheet.data.cid ? DB.programForClient(st.sheet.data.cid, program) : DB.programFor(program)).find(x => x.id === id);
    if (!e) return `<div class="sheet__title">Упражнение недоступно</div><p class="sheet__sub">Вернитесь к программе и выберите упражнение снова.</p>`;
    const timed = /сек/.test(e.reps);
    return `<div class="sheet__title">${esc(e.name)}</div>
      <div class="sheet__sub">План: ${e.sets} × ${e.reps}${e.target ? ' · ' + DB.fmtNumber(e.target) + ' кг' : ''}</div>
        <div style="margin-top:14px">${Card(UI.KV([['Прошлый раз', e.prev ? e.prev.kg ? `${DB.fmtNumber(e.prev.kg)} кг × ${e.prev.reps}` : `${e.prev.reps} ${timed ? 'сек' : 'повт.'}` : 'Нет записи'], ...(e.pr ? [['Личный рекорд', DB.fmtNumber(e.pr) + ' кг']] : [])]), { pad: true })}</div>
      ${exerciseGuide(e.name)}
      <div style="margin-top:16px">${Btn('Закрыть', { kind: 'soft', a: 'sheet.close' })}</div>`;
  }

  function exerciseGuide(name) {
    const item = DB.exerciseLibrary.find(e => e.name === name);
    if (!item?.instructions) return '<p class="client-footnote">Подсказка тренера по этому упражнению пока не добавлена.</p>';
    return `<div class="exercise-guide">
      <img class="exercise-guide__media" src="${esc(item.gif)}" alt="Демонстрация: ${esc(item.name)}" width="180" height="180">
      <p class="client-footnote"><a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer">${esc(item.attribution)}</a></p>
      <h3>Как выполнять</h3><ol>${item.instructions.map(step => `<li>${esc(step)}</li>`).join('')}</ol>
    </div>`;
  }

  function libraryExercise(st) {
    const item = Store.logging.library().find(e => e.name === st.sheet.data.name);
    if (!item) return '<h2 class="sheet__title">Упражнение недоступно</h2>';
    return `<h2 class="sheet__title">${esc(item.name)}</h2><p class="sheet__sub">${esc(item.group)}</p>
      ${exerciseGuide(item.name)}${Btn('Закрыть', { kind: 'soft', a: 'sheet.close' })}`;
  }

  /* ── Today: contextual reschedule request ────────────────────────────────── */

  function todayRequest(st) {
    const r = st.requests[st.sheet.data.rid];
    if (!r) return '';
    const c = client(r.clientId);
    const pending = ['pending', 'counter'].includes(r.state) && r.awaiting === 'trainer';
    const from = r.from, to = r.counter || r.to;
    const otherDay = from.date !== to.date;
    return `<div class="sheet__title">${pending ? 'Запрос на перенос' : 'Решение по переносу'}</div>
      <div class="sheet__sub">${esc(c ? c.name : 'Клиент')} предлагает другое время.</div>
      <div style="margin-top:16px">
        <div class="diffcard">
          <div class="diffcard__lbl">Было → предлагается</div>
          <div class="diffcard__grid">
            <div class="diffcard__side"><div class="t num">${from.start}–${from.end}</div><div class="d">${DB.fmtDateLong(from.date)} · действует</div></div>
            <div class="diffcard__arrow">${Icon.get('arrowRight', { size: 18 })}</div>
            <div class="diffcard__side"><div class="t num">${to.start}–${to.end}</div><div class="d">${DB.fmtDateLong(to.date)} · предложено</div></div>
          </div>
        </div>
      </div>
      <p class="diffcard__note">${pending
        ? `До вашего согласия действует ${from.start}–${from.end}.${otherDay ? ' Предложен другой день — текущая запись остаётся на месте до ответа.' : ''}`
        : ['pending', 'counter'].includes(r.state) ? 'Ждём ответа клиента. До согласия действует прежнее время.' : 'Запрос уже обработан — расписание не изменится повторно.'}</p>
      ${pending ? `<div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        ${Btn('Принять перенос', { kind: 'primary', a: 'rs.accept', args: { id: r.id }, icon: 'check' })}
        ${Btn('Другое время', { kind: 'soft', a: 'sheet.open', args: { id: 'counter', rid: r.id }, icon: 'swap' })}
        ${Btn(`Отклонить · оставить ${from.start}`, { kind: 'ghost', a: 'rs.decline', args: { id: r.id } })}
        ${Btn('Закрыть', { kind: 'ghost', a: 'sheet.close' })}
      </div>` : `<div style="margin-top:18px">${Btn('Закрыть', { kind: 'soft', a: 'sheet.close' })}</div>`}`;
  }

  /* ── Today: overlap details ──────────────────────────────────────────────── */

  function todayOverlap(st) {
    const { gid, date } = st.sheet.data;
    const g = DB.overlapGroups(date).find(x => x.id === gid);
    if (!g) return '';
    const toMin = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
    const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    const live = g.sessions.filter(s => s.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));
    const start = Math.max(...live.map(s => toMin(s.start)));
    const end = Math.min(...live.map(s => toMin(s.end)));
    const minutes = Math.max(0, end - start);
    return `<div class="sheet__title">Пересечение · ${minutes} мин</div>
      <div class="sheet__sub">${fmt(start)}–${fmt(end)} · ${live.length === 2 ? 'два отдельных занятия' : 'несколько отдельных занятий'}. Это не мини-группа: у каждой записи своя программа, посещение и списание.</div>
      <div style="margin-top:14px">${Card(live.map((s, i) => {
        const c = s.clientId ? client(s.clientId) : null;
        return Row({
          lead: Lead(c ? c.initials : '?', { size: 'sm' }),
          title: c ? c.short : s.title,
          meta: `${s.start}–${s.end} · ${UI.ProgramPreview(s.clientId,s.program,'trainer')}`,
          right: Pill('Индивидуальное', { tone: 'neutral', dot: false }),
          a: 'sheet.open', args: { id: 'session', sid: s.id }, last: i === live.length - 1,
        });
      }).join(''), { rows: true })}</div>
      <div style="margin-top:18px">${Btn('Вернуться к плану', { kind: 'soft', a: 'sheet.close' })}</div>`;
  }

  /* ── Dispatcher ──────────────────────────────────────────────────────────── */

  function clientCreate() {
    return `<div class="sheet__title">Новый клиент</div>
      <div class="sheet__sub">Начните с имени. Карточку можно вести до подключения клиента.</div>
      <label class="directory-name-label" for="client-create-name">Имя и фамилия</label>
      <div class="field"><input id="client-create-name" data-client-name placeholder="Например, Алия Нурланова" autocomplete="name" maxlength="100" required></div>
      <div class="directory-create-actions">${Btn('Создать карточку', { a: 'clients.create' })}${Btn('Отмена', { kind: 'ghost', a: 'sheet.close' })}</div>`;
  }

  function exMenu(st) {
    const { cid, ex } = st.sheet.data;
    const e = Store.logging.exercises(cid).find(x => x.id === ex);
    if (!e) return '';
    const done = (st.logging.values[cid]?.[ex] || []).filter(Boolean).length;
    const removable = e.origin === 'added' && !done;
    return `<div class="sheet__title">${esc(e.name)}</div>
      <div class="sheet__sub">Изменения только для этой тренировки${Object.keys(st.logging.plans).length > 1 ? ` и только для ${esc(client(cid).short)}` : ''}. Программа клиента не меняется.</div>
      <div class="exmenu">
        <button class="exmenu__item" ${act('sheet.open', { id: 'libraryExercise', name: e.name })}>${Icon.get('dumbbell', { size: 20 })}<span><b>Техника упражнения</b><small>Демонстрация и инструкция</small></span></button>
        <button class="exmenu__item" ${act('sheet.open', { id: 'exPick', mode: 'replace', cid, ex })}>${Icon.get('swap', { size: 20 })}<span><b>Заменить</b><small>${done ? `Записанные подходы (${done}) останутся` : 'Например, тренажёр занят'}</small></span></button>
        <button class="exmenu__item" ${act('ex.addSet', { cid, ex })}>${Icon.get('plus', { size: 20 })}<span><b>Добавить подход</b><small>Сейчас ${e.sets} ${DB.plural(e.sets, ['подход', 'подхода', 'подходов'])}</small></span></button>
        <button class="exmenu__item exmenu__item--danger" ${act('ex.skip', { cid, ex })}>${Icon.get(removable ? 'trash' : 'ban', { size: 20 })}<span><b>${removable ? 'Убрать из тренировки' : 'Пропустить'}</b><small>${removable ? 'Подходов ещё нет' : done ? 'Незаписанные подходы не учитываются' : 'Можно вернуть до завершения'}</small></span></button>
      </div>
      ${Btn('Закрыть', { kind: 'ghost', size: 'compact', a: 'sheet.close' })}`;
  }

  function exPick(st) {
    const { mode, cid, ex } = st.sheet.data;
    const current = Store.logging.exercises(cid);
    const target = current.find(x => x.id === ex);
    const inSession = new Set(current.filter(x => !x.skipped).map(x => x.name));
    const list = Store.logging.library();
    const title = mode === 'replace' && target ? `Заменить «${target.name}»` : 'Добавить упражнение';
    return `<div class="sheet__title">${esc(title)}</div>
      <div class="sheet__sub">${mode === 'replace' ? 'Выберите, что делаете вместо.' : 'Появится в этой тренировке с пометкой «не из программы».'} Программа клиента не изменится.</div>
      <div class="field field--search expick__search">${Icon.get('search', { size: 19, style: 'color:var(--ter)' })}<input id="ex-search" data-ex-search placeholder="Название упражнения" autocomplete="off" aria-label="Поиск упражнения" aria-controls="ex-list"></div>
      <p class="expick__similar" data-ex-similar hidden>Похожие уже есть в библиотеке — лучше выбрать из них, чтобы история не разделилась.</p>
      <ul class="expick__list" id="ex-list">${list.map(item => `<li data-ex-item data-name="${esc(item.name)}" data-search="${esc([item.name, ...(item.aliases || [])].join(' ').toLowerCase().replace(/ё/g, 'е'))}">
        <button class="expick__item" ${act('ex.pick', { name: item.name, bw: item.bodyweight ? 1 : null })}${item.name === target?.name ? ' disabled aria-disabled="true"' : ''}>
          <span class="expick__name">${esc(item.name)}</span>
          <span class="expick__meta">${esc(item.group)}${inSession.has(item.name) ? ' · уже в тренировке' : ''}</span>
        </button></li>`).join('')}</ul>
      <p class="expick__none" data-ex-none hidden>В библиотеке такого нет — создайте своё упражнение.</p>
      <button class="expick__create" data-act="ex.create" hidden>${Icon.get('plus', { size: 18, sw: 2.4 })}<span>Создать своё: «<b data-ex-new></b>»</span></button>`;
  }

  function programUpdate(st) {
    const cid = st.sheet.data.cid;
    const name = client(cid)?.short || '';
    const options = Store.programs.options(cid);
    return `<h2 class="sheet__title">Обновить программу ${esc(name)}</h2><p class="sheet__sub">Выберите изменения для следующих тренировок.</p>
      <div class="program-options">${options.map(o => `<label><input type="checkbox" data-program-change value="${esc(o.key)}" ${o.checked ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>
      ${Btn(`Сохранить в программу ${name}`, {kind:'primary',a:'program.save',args:{cid}})}
      <p class="client-footnote">${st.logging.plans[cid]?.name ? `Изменится только программа ${esc(name)} «${esc(st.logging.plans[cid].name)}». Шаблон и другие программы останутся прежними.` : `Изменятся только тренировки ${esc(name)} без программы. Шаблоны не меняются.`}</p>`;
  }

  function render(st) {
    const sh = st.sheet;
    if (!sh) return '';
    if (['templatePicker', 'templateDiscard', 'templateDraftConflict'].includes(sh.id)) return Library.sheet(sh.id);
    const map = {
      session, setlog, finishConfirm, charge, pay,
      notifications, stale, clientActions, search, customEx, assignTemplate,
      cCancel, exercise, libraryExercise, todayRequest, todayOverlap, clientCreate, rescheduleForm,
      voice: () => Voice.sheet(),
      exMenu, exPick, programUpdate,
      chooseProgram: () => `<h2 class="sheet__title">Выбрать программу</h2><p class="sheet__sub">Программа занятия. Уже открытый журнал сохраняет свой план.</p>${DB.templates.map(t=>Btn(t.name,{kind:'soft',a:'program.assign',args:{sid:st.sheet.data.sid,name:t.program}})).join('')}`,

      myExercises: () => `<h2 class="sheet__title">Мои упражнения</h2><p class="sheet__sub">Удаление из библиотеки не меняет уже записанные журналы.</p>${(st.customExercises || []).length ? st.customExercises.map(e => `<div class="row"><span class="row__main">${esc(e.name)}</span>${Btn('Удалить', { kind: 'ghost', size: 'sm', a: 'ex.deleteCustom', args: { name: e.name } })}</div>`).join('') : '<p>Своих упражнений пока нет. Добавьте упражнение в журнале через поиск.</p>'}`,

    };
    const fn = map[sh.id];
    return fn ? fn(st) : '';
  }

  return { render };
})();
