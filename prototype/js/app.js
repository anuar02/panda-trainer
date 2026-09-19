/* ============================================================================
   app.js — shell, router, action dispatch, annotations
   The prototype shell is: left rail (screen index) · center device · right
   inspector (what changes, who sees what). Actions are dispatched from
   `data-act` attributes so screens stay declarative strings.
   ========================================================================== */

(() => {
  const { esc, act } = UI;

  /* ── Screen registry ─────────────────────────────────────────────────────── */

  const SCREENS = {
    trainer: [
      { group: 'Сегодня и расписание', items: [
        ['t-today', 'Сегодня', 'home'],
        ['t-schedule', 'Расписание', 'calendar'],
        ['t-new', 'Новое занятие', 'plus'],
        ['t-inbox', 'Входящие', 'bell', 'pending'],
      ] },
      { group: 'Клиенты', items: [
        ['t-clients', 'Клиенты', 'users'],
        ['t-client', 'Карточка клиента', 'user'],
        ['t-invite', 'Приглашение', 'link'],
      ] },
      { group: 'Работа', items: [
        ['t-session', 'Проведение тренировки', 'play'],
        ['t-library', 'Библиотека', 'layers'],
        ['t-template', 'Шаблон', 'list'],
        ['t-billing', 'Пакеты и оплаты', 'wallet'],
      ] },
      { group: 'Прочее', items: [['t-profile', 'Профиль', 'settings']] },
    ],
    client: [
      { group: 'Клиент', items: [
        ['c-home', 'Главная', 'home'],
        ['c-program', 'Программа', 'dumbbell'],
        ['c-history', 'История', 'list'],
        ['c-progress', 'Прогресс', 'trend'],
        ['c-profile', 'Профиль', 'user'],
        ['c-first', 'Первый вход', 'link'],
      ] },
    ],
  };

  const RENDER = {
    't-today': () => Trainer.today(),
    't-schedule': () => Trainer.schedule(),
    't-new': () => Trainer.newSession(),
    't-inbox': () => Trainer.inbox(),
    't-clients': () => Trainer.clients(),
    't-client': () => Trainer.clientCard(),
    't-session': () => Trainer.session(),
    't-library': () => Trainer.library(),
    't-template': () => Trainer.template(),
    't-billing': () => Trainer.billing(),
    't-invite': () => Trainer.invite(),
    't-profile': () => Trainer.profile(),
    'c-home': () => Client.home(),
    'c-first': () => Client.first(),
    'c-program': () => Client.program(),
    'c-history': () => Client.history(),
    'c-progress': () => Client.progress(),
    'c-profile': () => Client.profile(),
  };

  /* ── Action handlers ─────────────────────────────────────────────────────── */

  const num = (v) => (v == null ? v : Number(v));

  const Actions = {
    'tab': (d) => Store.nav.tab(d.id),
    'nav.go': (d) => { Store.ui.closeSheet(); Store.nav.go(d.id); },
    'nav.back': () => Store.nav.back(),
    'day': (d) => Store.nav.day(d.date),
    'sheet.open': (d) => Store.ui.openSheet(d.id, d),
    'sheet.close': () => Store.ui.closeSheet(),
    'toast': (d) => Store.ui.toast('', d.text),
    'role': (d) => Store.nav.role(d.role),
    'width': (d) => Store.set({ deviceW: num(d.w) }),
    'scenario': (d) => Store.ui.scenario(d.s),
    'wide': () => Store.set({ wide: !Store.get().wide }),
    'reset': () => { Store.nav.role(Store.get().role); Store.ui.toast('', 'Прототип сброшен'); },

    /* clients */
    'client.open': (d) => set({ role: 'trainer', activeClient: d.id, screen: 't-client', stack: ['t-clients'], clientTab: 'sessions', sheet: null }),
    'client.tab': (d) => Store.ui.clientTab(d.tab),
    'history.exercise': (d) => Store.ui.historyExercise(num(d.i)),

    /* new session wizard */
    'ns.toggle': (d) => Store.newSession.toggleClient(d.id),
    'ns.patch': (d) => Store.newSession.patch({ [d.key]: d.key === 'duration' ? num(d.value) : d.value }),
    'ns.next': () => Store.newSession.next(),
    'ns.prev': () => Store.newSession.prev(),
    'ns.ack': () => Store.newSession.patch({ collisionAck: !Store.get().newSession.collisionAck }),
    'ns.save': () => Store.newSession.save(),

    /* reschedule (trainer) */
    'rs.accept': (d) => Store.reschedule.accept(d.id),
    'rs.decline': (d) => Store.reschedule.decline(d.id),
    'rs.withdraw': (d) => Store.reschedule.withdraw(d.id),
    'rs.counter': (d) => Store.ui.openSheet('counter', { rid: d.id }),
    'rs.openStale': (d) => Store.reschedule.openStale(d.id),
    'counter.pick': (d) => Store.set({ counterPick: { ...(Store.get().counterPick || {}), [d.key]: d.value } }),
    'counter.send': (d) => {
      const p = Store.get().counterPick || { date: DB.TODAY, start: '19:00' };
      Store.reschedule.counter(d.rid, { date: p.date || DB.TODAY, start: p.start || '19:00', end: '20:00' });
      Store.ui.closeSheet();
    },

    /* client reschedule */
    'cres.open': () => Store.ui.openSheet('cReschedule'),
    'cres.pick': (d) => Store.set({ reschedulePick: { ...(Store.get().reschedulePick || {}), [d.key]: d.value } }),
    'cres.send': () => {
      const p = Store.get().reschedulePick || { date: '2026-09-18', start: '19:00' };
      Store.reschedule.propose({
        sessionId: 's8',
        from: { date: '2026-09-17', start: '18:00', end: '19:00' },
        to: { date: p.date, start: p.start, end: DB.addMinutes(p.start, 60) },
      });
      Store.ui.closeSheet();
      Store.ui.toast('', 'Запрос отправлен · до подтверждения действует прежнее время');
    },
    'cres.cancel': () => { Store.sessions.cancel('s8'); Store.ui.toast('warn', 'Запись отменена · тренер отдельно решит вопрос списания'); },

    /* first login */
    'first.state': (d) => Store.set({ inviteState: d.state }),
    'first.accept': () => { Store.set({ inviteState: 'accepted' }); Store.nav.tab('c-home'); Store.ui.toast('', 'Вы подключены к карточке тренера'); },

    /* logging */
    'logging.open': (d) => Store.logging.open(d.id),
    'log.switch': (d) => Store.logging.switchTo(d.id),
    'log.finish': () => Store.logging.finish(),
    'log.continue': () => Store.logging.continueInput(),
    'log.confirmPartial': () => Store.logging.confirmPartial(),

    'setlog.step': (d) => {
      const st = Store.get();
      const cid = d.cid, ex = d.ex, si = num(d.si);
      const e = DB.programFor(DB.client(cid) && DB.client(cid).program).find(x => x.id === ex) || {};
      const arr = (st.logging.values[cid] || {})[ex] || [];
      // Start from the previous result so a single-field edit never drops the
      // other field. The value only becomes a fact after it is confirmed.
      const cur = arr[si] || (e.prev ? { ...e.prev } : {});
      const base = cur[d.field] != null ? cur[d.field] : 0;
      Store.logging.setValue(cid, ex, si, { ...cur, [d.field]: Math.max(0, base + num(d.by)) });
    },
    'setlog.repeat': (d) => {
      const e = DB.programFor(DB.client(d.cid) && DB.client(d.cid).program).find(x => x.id === d.ex) || {};
      Store.logging.setValue(d.cid, d.ex, num(d.si), { ...e.prev });
      Store.ui.toast('', 'Прошлый результат подставлен · подтвердите его');
    },
    'setlog.save': () => { Store.ui.closeSheet(); Store.ui.toast('', 'Подход записан'); },

    /* attendance & charge */
    'attendance.mark': (d) => Store.attendance.mark(d.sid, d.cid, d.value),
    'attendance.charge': (d) => Store.attendance.charge(d.sid, d.cid, {}),
    'attendance.markOnly': () => { Store.ui.closeSheet(); Store.ui.toast('', 'Посещение отмечено без списания'); },
    'attendance.correct': (d) => Store.attendance.correct(d.sid, d.cid),
    'session.cancel': (d) => Store.sessions.cancel(d.sid),

    /* billing */
    'pay.method': (d) => Store.set({ payMethod: d.m }),
    'pay.save': (d) => {
      const input = document.querySelector('[data-pay-amount]');
      const amount = Number((input && input.value) || 0);
      if (!amount) { Store.ui.toast('warn', 'Укажите сумму'); return; }
      Store.billing.recordPayment(d.cid, amount, Store.get().payMethod);
    },

    /* invite */
    'invite.create': () => Store.invite.create('c6'),
    'invite.copy': () => Store.invite.copy(),
    'invite.reissue': () => Store.invite.reissue(),
    'invite.revoke': () => Store.invite.revoke(),
    'invite.connected': () => Store.invite.connected(),
  };

  function set(patch) { Store.ui.closeSheet(); Store.set(patch); }

  /* ── Annotations for the inspector ───────────────────────────────────────── */

  const ANNOT = {
    't-today': { title: 'Сегодня', text: 'Один экран отвечает на «что дальше». Никаких финансовых виджетов и графиков.', rules: ['Пересечения — отдельные записи внутри рамки, не одна сессия.', 'Мини-группа — одна сессия с участниками.', 'Свободное окно внутри пересечения не показывается.', 'Пустой день объясняет и предлагает действие.'] },
    't-schedule': { title: 'Расписание', text: 'Неделя полосой дней, выбранный день — лентой. Основной перенос — явное действие.', rules: ['Конец одной записи = начало другой → пересечения нет.', 'Отменённые записи не занимают время.', 'Ход создания: клиенты → время → программа (можно позже).'] },
    't-new': { title: 'Новое занятие', text: 'Три шага. Пересечение требует явного подтверждения тренера.', rules: ['«Назначить программу позже» — обязательный пункт.', 'Подтверждение пересечения тренером не заменяет согласие клиента.', 'Клиент видит предложение времени, а не готовую запись.'] },
    't-inbox': { title: 'Входящие', text: 'Действующее и предложенное время, автор и ответственный.', rules: ['Принять · Другое время · Отклонить.', 'Автор может отозвать запрос.', 'Устаревшее уведомление открывает актуальное состояние.'] },
    't-clients': { title: 'Клиенты', text: 'Список с подписанными состояниями внимания.', rules: ['Пороги не выдумываются молча — они подписаны.', 'Новый клиент без данных — отдельное состояние.'] },
    't-client': { title: 'Карточка клиента', text: 'Пять разделов прокручиваемыми вкладками.', rules: ['Заметка тренера приватна, комментарий клиента помечен.', 'Остаток и «к оплате» — разные величины.', 'История не переписывается сменой программы.'] },
    't-session': { title: 'Проведение тренировки', text: 'Всегда видно, чьи результаты записываются.', rules: ['Переключение участников не теряет и не переносит данные.', 'Прошлое ≠ план ≠ сегодняшний факт.', 'Незаписанный подход не равен нулю.', 'Посещение и списание — отдельные действия.'] },
    't-library': { title: 'Библиотека', text: 'Шаблоны и упражнения, множественный выбор.', rules: ['Назначение создаёт независимую копию.', 'Правка библиотеки не переписывает прошлое.'] },
    't-template': { title: 'Шаблон', text: 'Порядок, подходы, повторения, веса, заметки.', rules: ['Результаты при замене шаблона сохраняются.', 'Незаметное удаление истории недопустимо.'] },
    't-billing': { title: 'Пакеты и оплаты', text: 'Две независимые истории: движение занятий и оплаты.', rules: ['Частичная оплата уменьшает долг, не посещения.', 'Нет подходящего пакета → посещение без привязки.', 'Повторное списание не создаёт вторую операцию.'] },
    't-invite': { title: 'Приглашение', text: 'Честные состояния: не подключён · ссылка создана · подключился.', rules: ['Открытие share-sheet ≠ отправка.', 'Срок действия, отзыв, перевыпуск.', 'Клиент подключается к существующей карточке.'] },
    't-profile': { title: 'Профиль', text: 'Настройки и точки входа в служебные разделы.', rules: [] },
    'c-home': { title: 'Главная клиента', text: 'Одна крупная карточка: действующее время и отдельно запрос переноса.', rules: ['До подтверждения действует прежнее время.', 'Свой запрос можно отозвать.', 'Отмена — в дополнительных действиях, с подтверждением.'] },
    'c-first': { title: 'Первый вход', text: '«Тренер Данияр приглашает вас» → согласованный вход → существующая карточка.', rules: ['SMS не требуется по умолчанию.', 'Истёкшая и отозванная ссылка имеют понятный путь.', 'Данные не раскрываются по одной открытой ссылке.'] },
    'c-program': { title: 'Программа', text: 'План и факт различимы, техника по нажатию.', rules: ['Право клиента редактировать результаты — открытый вопрос.'] },
    'c-history': { title: 'История', text: 'Занятия и движение занятий раздельно.', rules: ['Неявки и штрафные списания не считаются посещениями.'] },
    'c-progress': { title: 'Прогресс', text: 'Только факты. Одна тренировка — одна запись без тренда.', rules: ['Незаписанное не равно нулю.', 'Рабочий вес сравнивается с повторами.', 'Чужих результатов и рейтинга нет.'] },
    'c-profile': { title: 'Профиль клиента', text: 'Личные данные, пакет, настройки.', rules: [] },
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */

  function renderRail(st) {
    const groups = SCREENS[st.role];
    const pending = Object.values(st.requests).filter(r => r.state === 'pending' && r.awaiting === 'trainer').length;
    return `<aside class="rail" id="rail">
      <div class="rail__brand"><b>Кабинет тренера</b><span>Прототип · gymGO DNA</span></div>
      ${groups.map(g => `<div class="rail__group"><h3>${esc(g.group)}</h3>${g.items.map(([id, label, icon, badge]) => {
        const on = st.screen === id;
        const n = badge === 'pending' ? pending : 0;
        return `<button class="rail__item" ${on ? 'aria-current="true"' : ''} ${act('nav.go', { id })}>
          ${Icon.get(icon, { size: 18, sw: on ? 2.2 : 1.9 })}<span>${esc(label)}</span>${n ? `<span class="badge">${n}</span>` : ''}
        </button>`;
      }).join('')}</div>`).join('')}
      <div class="divider"></div>
      <button class="rail__item" ${act('reset')}>${Icon.get('refresh', { size: 18 })}<span>Сбросить прототип</span></button>
    </aside>`;
  }

  function renderInspector(st) {
    const a = ANNOT[st.screen] || { title: '', text: '', rules: [] };
    const saved = Object.values(st.recorded).length;
    return `<aside class="inspector" id="inspector">
      <div class="kicker">Экран</div>
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.text)}</p>
      ${a.rules.length ? `<div class="divider"></div><div class="kicker">Правила</div><ul class="rules">${a.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      <div class="divider"></div>
      <div class="kicker">Проверка сценариев</div>
      <ul class="rules">
        <li>Активных запросов: ${Object.values(st.requests).filter(r => r.state === 'pending').length}</li>
        <li>Списаний за сессию: ${saved}</li>
        <li>Переключатель: ${st.role === 'trainer' ? 'тренер' : 'клиент'} · ${st.deviceW}px</li>
      </ul>
      <div class="note">Данные вымышленные. Реальный прайс, клиенты и механизм входа не утверждены.</div>
    </aside>`;
  }

  function renderToolbar(st) {
    const scenarios = Object.entries(DB.SCENARIOS);
    return `<div class="toolbar">
      <div class="rolebar" role="group" aria-label="Роль">
        <button ${act('role', { role: 'trainer' })} aria-pressed="${st.role === 'trainer'}">${Icon.get('users', { size: 16 })} Тренер</button>
        <button ${act('role', { role: 'client' })} aria-pressed="${st.role === 'client'}">${Icon.get('user', { size: 16 })} Клиент</button>
      </div>
      <div class="toolbar" role="group" aria-label="Состояние">
        ${scenarios.map(([id, s]) => `<button class="tool" ${act('scenario', { s: id })} aria-pressed="${st.scenario === id}" title="${esc(s.desc)}">${esc(s.label)}</button>`).join('')}
      </div>
      <div class="toolbar" role="group" aria-label="Ширина">
        ${[375, 390, 430].map(w => `<button class="tool" ${act('width', { w })} aria-pressed="${st.deviceW === w}">${w}</button>`).join('')}
        ${st.role === 'trainer' ? `<button class="tool" ${act('wide')} aria-pressed="${st.wide}">Широкий</button>` : ''}
      </div>
    </div>`;
  }

  function renderScreen(st) {
    const useWide = st.role === 'trainer' && st.wide && st.screen === 't-today';
    if (useWide) return { html: Trainer.wide(), wide: true };
    const fn = RENDER[st.screen] || RENDER[st.role === 'trainer' ? 't-today' : 'c-home'];
    return { html: fn(), wide: false };
  }

  function render() {
    const st = Store.get();
    let html, wide = false, sheetInner = '';
    try {
      const r = renderScreen(st);
      html = r.html; wide = r.wide;
    } catch (e) {
      console.error('[screen]', e);
      html = `<div class="screen"><div style="padding:40px 22px"><h1 style="font-family:var(--disp);font-weight:800;font-size:24px">Ошибка экрана</h1><p style="color:var(--sec);font-size:14px;margin-top:8px">${esc(e.message)}</p></div></div>`;
    }
    try {
      sheetInner = Sheets.render(st);
    } catch (e) {
      console.error('[sheet]', e);
      sheetInner = '';
    }

    const device = document.getElementById('device');
    device.style.setProperty('--device-w', st.deviceW + 'px');
    device.classList.toggle('device--wide', wide);

    const screenEl = document.getElementById('screen');
    screenEl.innerHTML = `
      ${html}
      ${wide ? '' : UI.StatusBar()}
      <span class="device__home"></span>
      ${UI.Sheet(!!st.sheet, sheetInner)}
      ${UI.Toast(st.toast)}
    `;

    // Play the sheet slide-up after mount.
    if (st.sheet) requestAnimationFrame(() => {
      const layer = screenEl.querySelector('.sheet-layer');
      if (layer) layer.classList.add('is-open');
    });

    const rail = document.getElementById('rail');
    rail.outerHTML = renderRail(st);

    const insp = document.getElementById('inspector');
    if (insp) insp.outerHTML = renderInspector(st);

    document.getElementById('toolbar').innerHTML = renderToolbar(st);
  }

  /* ── Event delegation ────────────────────────────────────────────────────── */

  function handle(el) {
    const name = el.getAttribute('data-act');
    if (!name || !Actions[name]) return;
    const d = {};
    for (const key of Object.keys(el.dataset)) d[key] = el.dataset[key];
    Actions[name](d, el);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el) { e.preventDefault(); handle(el); return; }
    // clicking the scrim closes the sheet
    if (e.target.classList.contains('sheet__scrim')) Store.ui.closeSheet();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-act][role="button"]');
    if (el) { e.preventDefault(); handle(el); }
    if (e.key === 'Escape') Store.ui.closeSheet();
  });

  Store.subscribe(render);
  render();
})();
