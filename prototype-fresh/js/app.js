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

  ['pointerdown','keydown'].forEach(type => document.addEventListener(type,event=>{
    if (type === 'keydown' && !['Enter',' '].includes(event.key)) return;
    if (event.target.closest('[data-act="setlog.quick"]')) Store.field.touchStart('quick');
  }));

  const Actions = {
    'field.clear': () => Store.field.clear(),
    'field.export': () => {
      const data = Store.field.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link = document.createElement('a');
      link.href=url; link.download='field-journal.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    'program.assign': (d) => Store.sessions.assignProgram(d.sid,d.name),
    'note.share': (d) => Store.logging.shareNote(d.cid,Number(d.i)),
    'program.save': (d) => Store.programs.save(d.cid, [...document.querySelectorAll('[data-program-change]:checked')].map(el => el.value)),
    'calm.toggle': () => Store.preferences.toggleCalm(),
    'tab': (d) => Store.nav.tab(d.id),
    'nav.go': (d) => { Store.ui.closeSheet(); Store.nav.go(d.id); },
    'nav.back': () => Store.nav.back(),
    'day': (d) => Store.nav.day(d.date),
    'calendar.shift': (d) => {
      const date = new Date(Store.get().day + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + Number(d.offset));
      Store.nav.day(date.toISOString().slice(0, 10));
    },
    'calendar.new': () => {
      Store.newSession.patch({ step: 0, clientIds: [], date: Store.get().day, start: '09:00', duration: 60, program: null, programLater: false, collisionAck: false });
      Store.nav.tab('t-new');
    },
    'today.newwindow': (d) => {
      const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };
      const duration = Math.max(15, toMin(d.end) - toMin(d.start));
      // Opening the existing creation flow with this window pre-filled — not a save.
      Store.newSession.patch({ step: 0, clientIds: [], date: d.date, start: d.start, duration, program: null, programLater: false, collisionAck: false });
      Store.nav.tab('t-new');
    },
    'sheet.open': (d) => {
      if (d.id === 'setlog') return Store.logging.edit(d.cid, d.ex, num(d.si));
      if (d.id === 'counter') return Store.reschedule.openForm(Store.get().requests[d.rid]?.sessionId);
      if (d.id === 'trainerMove' || d.id === 'cReschedule') return Store.reschedule.openForm(d.sid);
      Store.ui.openSheet(d.id, d);
    },
    'sheet.close': () => Store.ui.closeSheet(),
    'voice.open': () => Voice.open(),
    'voice.toggle': () => Voice.toggle(),
    'voice.demo': (d) => Voice.demo(d.phrase),
    'voice.text': () => Voice.submitText(),
    'voice.remove': (d) => Voice.remove(d.key),
    'voice.commit': () => Voice.commit(),
    'voice.more': () => Voice.more(),
    'note.remove': (d) => Store.logging.removeNote(d.cid, Number(d.i)),
    'ex.addSet': (d) => { Store.logging.addSet(d.cid, d.ex); if (Store.get().sheet) Store.ui.closeSheet(); },
    'ex.removeSet': (d) => Store.logging.removeSet(d.cid, d.ex),
    'ex.skip': (d) => { Store.ui.closeSheet(); Store.logging.skipExercise(d.cid, d.ex, true); },
    'ex.unskip': (d) => Store.logging.skipExercise(d.cid, d.ex, false),
    'ex.pick': (d) => Flex.choose({ name: d.name, bodyweight: d.bw === '1' }),
    'ex.deleteCustom': (d) => Store.logging.removeCustom(d.name),
    'ex.create': () => Flex.create(),
    'toast': (d) => Store.ui.toast('', d.text),
    'role': (d) => Store.nav.role(d.role),
    'width': (d) => Store.set({ deviceW: num(d.w) }),
    'scenario': (d) => Store.ui.scenario(d.s),
    'wide': () => Store.set({ wide: !Store.get().wide }),
    'reset': () => { Store.nav.role(Store.get().role); Store.ui.toast('', 'Главный экран · сохранённые данные не изменены'); },

    /* clients */
    'clients.filter': (d) => Store.set({ clientFilter: d.filter }),
    'clients.clear': () => { Store.set({ clientQuery: '' }); document.querySelector('[data-directory-search]')?.focus(); },
    'clients.reset': () => Store.set({ clientQuery: '', clientFilter: 'all' }),
    'clients.create': () => {
      const input = document.querySelector('[data-client-name]');
      if (!input || !input.value.trim()) { input?.setCustomValidity('Введите имя клиента'); input?.reportValidity(); return; }
      const name = input.value.trim().replace(/\s+/g, ' ');
      const id = 'client-' + Date.now();
      DB.clients.push({ id, name, short: name.split(' ')[0], initials: name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(), phone: null, since: 'сентябрь 2026', joined: DB.TODAY, program: null, plan: null, nextSessionId: null, goal: null, note: '', clientComment: '', status: 'new', sessionsDone: 0, invite: { state: 'not_connected', expires: null, link: null } });
      Store.set({ clientQuery: '', clientFilter: 'all', sheet: null, scenario: 'normal', screen: 't-clients' });
      Store.ui.toast('', 'Карточка клиента создана');
    },
    'client.open': (d) => Store.set({ role: 'trainer', activeClient: d.id, screen: 't-client', stack: ['t-clients'], clientTab: 'sessions', sheet: null }),
    'client.tab': (d) => Store.ui.clientTab(d.tab),
    'template.open': (d) => { Store.set({ selectedTemplate: d.id }); Store.nav.go('t-template'); },
    'history.exercise': (d) => Store.ui.historyExercise(num(d.i)),

    /* new session wizard */
    'ns.toggle': (d) => Store.newSession.toggleClient(d.id),
    'ns.patch': (d) => Store.newSession.patch({ [d.key]: d.key === 'duration' ? num(d.value) : d.value }),
    'ns.next': () => Store.newSession.next(),
    'ns.prev': () => Store.newSession.prev(),
    'ns.ack': () => Store.newSession.patch({ collisionAck: !Store.get().newSession.collisionAck }),
    'ns.save': () => Store.newSession.save(),
    'session.confirm': (d) => Store.sessions.confirm(d.sid),

    /* reschedule (trainer) */
    'rs.accept': (d) => Store.reschedule.accept(d.id),
    'rs.decline': (d) => Store.reschedule.decline(d.id),
    'rs.withdraw': (d) => Store.reschedule.withdraw(d.id),
    'rs.counter': (d) => Store.reschedule.openForm(Store.get().requests[d.id]?.sessionId),
    'rs.openStale': (d) => Store.reschedule.openStale(d.id),

    /* client reschedule */
    'cres.open': (d) => Store.reschedule.openForm(d.sid),
    'cres.send': () => {
      const st = Store.get(), data = st.sheet?.data;
      if (st.sheet?.id !== 'rescheduleForm' || !data) return;
      if (data.rid) Store.reschedule.counter(data.rid, st.reschedulePick);
      else Store.reschedule.propose({ sessionId: data.sid, to: st.reschedulePick });
    },
    'cres.cancel': (d) => Store.sessions.cancel(d.sid),

    /* first login */
    'first.state': (d) => Store.set({ inviteState: d.state }),
    'first.accept': () => { Store.set({ inviteState: 'accepted' }); Store.nav.tab('c-home'); Store.ui.toast('', 'Демо: открыт главный экран клиента'); },

    /* logging */
    'logging.open': (d) => Store.logging.open(d.id),
    'log.switch': (d) => Store.logging.switchTo(d.id),
    'log.finish': () => Store.logging.finish(),
    'log.continue': () => Store.logging.continueInput(),
    'log.confirmPartial': () => Store.logging.confirmPartial(),
    'log.retry': () => Store.logging.retrySave(),
    'log.export': () => {
      const data = Store.logging.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `journal-${data.sessionId}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    'log.leave': () => Store.nav.tab('t-today'),
    'log.minimize': () => Store.logging.minimize(),
    'log.resume': d => Store.logging.resume(d.id),

    'setlog.step': (d) => {
      const ed = Store.get().logging.editor;
      if (!ed) return;
      const exercise = Store.logging.exercises(ed.clientId).find(e => e.id === ed.exId);
      const raw = String(ed[d.field]).trim();
      const base = raw === '' ? Number(exercise?.prev[d.field]) : Number(raw.replace(',', '.'));
      if (!Number.isFinite(base)) return;
      Store.logging.input({ [d.field]: DB.fmtNumber(Math.max(0, base + num(d.by))) }, true);
    },
    'setlog.repeat': (d) => {
      const e = Store.logging.exercises(d.cid).find(x => x.id === d.ex);
      if (e) Store.logging.input({ kg: String(e.prev.kg), reps: String(e.prev.reps) }, true);
    },
    'setlog.save': () => Store.logging.saveSet(),
    'setlog.quick': (d) => Store.logging.quickRepeat(d.cid, d.ex, num(d.si), { kg: num(d.kg), reps: num(d.reps) }),
    'setlog.undoQuick': (d) => Store.logging.undoQuick(d.cid, d.ex, num(d.si)),

    /* attendance & charge */
    'attendance.mark': (d) => Store.attendance.mark(d.sid, d.cid, d.value),
    'attendance.charge': (d) => Store.attendance.charge(d.sid, d.cid, {}),
    'attendance.markOnly': (d) => Store.attendance.markOnly(d.sid, d.cid),
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
    't-today': { title: 'Сегодня', text: 'Одна хронологическая повестка отвечает на «что дальше»: дата и текущее время, единый список занятий, ближайшее раскрыто. Без отдельной hero-карточки и без финансовых виджетов.', rules: ['Демо-время зафиксировано (DB.NOW_TIME, ?now=HH:MM). Реальные часы не используются.', 'Временная подсказка («Через N мин», «Идёт сейчас») не заменяет статус договорённости.', 'Запросы, требующие ответа тренера, показаны счётчиком в шапке и действием внутри своей записи.', 'Пересечения — отдельные записи со спокойной связкой; это не мини-группа.', 'Свободные окна считаются по объединению занятых интервалов; нажатие открывает форму нового занятия с этим временем, но не создаёт запись.', 'Мини-группа — одна сессия с участниками; отмена участника не отменяет группу.'] },
    't-schedule': { title: 'Расписание', text: 'Неделя полосой дней, выбранный день — лентой. Основной перенос — явное действие.', rules: ['Конец одной записи = начало другой → пересечения нет.', 'Отменённые записи не занимают время.', 'Ход создания: клиенты → время → программа (можно позже).'] },
    't-new': { title: 'Новое занятие', text: 'Три шага. Пересечение требует явного подтверждения тренера.', rules: ['«Назначить программу позже» — обязательный пункт.', 'Подтверждение пересечения тренером не заменяет согласие клиента.', 'Клиент видит предложение времени, а не готовую запись.'] },
    't-inbox': { title: 'Входящие', text: 'Действующее и предложенное время, автор и ответственный.', rules: ['Принять · Другое время · Отклонить.', 'Автор может отозвать запрос.', 'Устаревшее уведомление открывает актуальное состояние.'] },
    't-clients': { title: 'Клиенты', text: 'Список с подписанными состояниями внимания.', rules: ['Пороги не выдумываются молча — они подписаны.', 'Новый клиент без данных — отдельное состояние.'] },
    't-client': { title: 'Карточка клиента', text: 'Пять разделов прокручиваемыми вкладками.', rules: ['Заметка тренера приватна, комментарий клиента помечен.', 'Остаток и «к оплате» — разные величины.', 'История не переписывается сменой программы.'] },
    't-session': { title: 'Проведение тренировки', text: 'Всегда видно, чьи результаты записываются.', rules: ['Переключение участников не теряет и не переносит данные.', 'Прошлое ≠ план ≠ сегодняшний факт.', 'Незаписанный подход не равен нулю.', 'Посещение и списание — отдельные действия.'] },
    't-library': { title: 'Библиотека', text: 'Просмотр шаблонов и упражнений. Поиск, фильтры и сохранение редактора пока не подключены.', rules: ['Выбранный шаблон открывает свою программу.', 'Программа назначается при создании занятия.'] },
    't-template': { title: 'Шаблон', text: 'Порядок, подходы, повторения, веса, заметки.', rules: ['Результаты при замене шаблона сохраняются.', 'Незаметное удаление истории недопустимо.'] },
    't-billing': { title: 'Пакеты и оплаты', text: 'Две независимые истории: движение занятий и оплаты.', rules: ['Частичная оплата уменьшает долг, не посещения.', 'Нет подходящего пакета → посещение без привязки.', 'Повторное списание не создаёт вторую операцию.'] },
    't-invite': { title: 'Приглашение', text: 'Честные состояния: не подключён · ссылка создана · подключился.', rules: ['Открытие share-sheet ≠ отправка.', 'Срок действия, отзыв, перевыпуск.', 'Клиент подключается к существующей карточке.'] },
    't-profile': { title: 'Профиль', text: 'Настройки и точки входа в служебные разделы.', rules: [] },
    'c-home': { title: 'Главная клиента', text: 'Одна крупная карточка: действующее время и отдельно запрос переноса.', rules: ['До подтверждения действует прежнее время.', 'Свой запрос можно отозвать.', 'Отмена — в дополнительных действиях, с подтверждением.'] },
    'c-first': { title: 'Первый вход', text: 'Демо приглашения с вымышленными данными. Настоящие вход и проверка доступа не подключены.', rules: ['Иллюстрация не является фотографией тренера.', 'Истёкшая и отозванная ссылка не имитируют отправку запроса.', 'Переключатели сверху показывают демосостояния.'] },
    'c-program': { title: 'Программа', text: 'План ближайшего занятия; по нажатию — прошлый результат выбранного упражнения.', rules: ['Если программа не назначена, чужая не подставляется.', 'Редактирование результатов клиентом пока недоступно.'] },
    'c-history': { title: 'История', text: 'Занятия и движение занятий раздельно.', rules: ['Неявки и штрафные списания не считаются посещениями.'] },
    'c-progress': { title: 'Прогресс', text: 'Только факты. Одна тренировка — одна запись без тренда.', rules: ['Незаписанное не равно нулю.', 'Рабочий вес сравнивается с повторами.', 'Чужих результатов и рейтинга нет.'] },
    'c-profile': { title: 'Профиль клиента', text: 'Личные данные и пакет для чтения. Настройки и оплата пока не подключены.', rules: [] },
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */

  function renderRail(st) {
    const groups = SCREENS[st.role];
    const pending = Store.reschedule.awaiting('trainer').length;
    return `<aside class="rail" id="rail">
      <div class="rail__brand">${Mascot.face('smile', 44, 'rail__logo')}<div><b>Кабинет тренера</b><span>Fresh · красная панда</span></div></div>
      ${groups.map(g => `<div class="rail__group"><h3>${esc(g.group)}</h3>${g.items.map(([id, label, icon, badge]) => {
        const on = st.screen === id;
        const n = badge === 'pending' ? pending : 0;
        return `<button class="rail__item" ${on ? 'aria-current="true"' : ''} ${act('nav.go', { id })}>
          ${Icon.get(icon, { size: 18, sw: on ? 2.2 : 1.9 })}<span>${esc(label)}</span>${n ? `<span class="badge">${n}</span>` : ''}
        </button>`;
      }).join('')}</div>`).join('')}
      <div class="divider"></div>
      <button class="rail__item" ${act('reset')}>${Icon.get('refresh', { size: 18 })}<span>На главный экран</span></button>
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
        <li>Активных запросов: ${Object.values(st.requests).filter(r => ['pending', 'counter'].includes(r.state)).length}</li>
        <li>Списаний с открытия страницы: ${saved}</li>
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
      <div class="toolbar" role="group" aria-label="Оформление">
        <button class="tool" data-visual-choice="current" aria-pressed="${document.documentElement.dataset.visual !== 'firm'}">Текущий</button>
        <button class="tool" data-visual-choice="firm" aria-pressed="${document.documentElement.dataset.visual === 'firm'}">Строгий</button>
      </div>
      <div class="toolbar" role="group" aria-label="Палитра">
        ${[['ink', 'Чернила'], ['teal', 'Бирюза'], ['panda', 'Панда']].map(([id, label]) => `<button class="tool" data-palette-choice="${id}" aria-pressed="${(document.documentElement.dataset.palette || 'panda') === id}">${label}</button>`).join('')}
      </div>
      <div class="toolbar" role="group" aria-label="Ширина">
        ${[320, 375, 390, 430].map(w => `<button class="tool" ${act('width', { w })} aria-pressed="${st.deviceW === w}">${w}</button>`).join('')}
        ${st.role === 'trainer' ? `<button class="tool" ${act('wide')} aria-pressed="${st.wide}">Широкий</button>` : ''}
      </div>
    </div>`;
  }

  function renderScreen(st) {
    const useWide = st.role === 'trainer' && st.wide && st.screen === 't-today' && !window.matchMedia('(max-width: 600px)').matches;
    if (useWide) return { html: Trainer.wide(), wide: true };
    const fn = RENDER[st.screen] || RENDER[st.role === 'trainer' ? 't-today' : 'c-home'];
    return { html: fn(), wide: false };
  }

  const journalScroll = new Map();
  let lastFrame = null;
  let lastScreenKey = null;
  let lastToastAt = null;
  let keyboardAction = false;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches) document.querySelector('.sheet')?.getAnimations().forEach(animation => animation.cancel());
  });
  function render() {
    const st = Store.get();
    document.documentElement.dataset.calm = String(Store.preferences.calm());
    const journalKey = st.screen === 't-session' ? `${st.logging.sessionId}:${st.logging.active}` : null;
    const justFinished = journalKey && lastFrame?.journalKey && lastFrame.sessionId === st.logging.sessionId && !lastFrame.finished && st.logging.finished;
    const focused = document.activeElement;
    const previousFocus = focusKey(focused);
    const inputFocus = focused?.matches('[data-log-field], [data-reschedule-field]') ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
    if (lastFrame?.journalKey) journalScroll.set(lastFrame.journalKey, document.querySelector('.session-journal .screen__body')?.scrollTop || 0);
    const stripScroll = lastFrame?.sessionId === st.logging.sessionId ? document.querySelector('.pstrip')?.scrollLeft || 0 : 0;
    const sheetScroll = (document.querySelector('.log-editor-fields') || document.querySelector('.sheet__body'))?.scrollTop || 0;
    const nextSheetKey = st.sheet ? `${st.sheet.id}:${JSON.stringify(st.sheet.data)}` : null;
    const sameSheet = nextSheetKey && lastFrame?.sheetKey === nextSheetKey;
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

    const screenKey = `${st.role}:${st.screen}:${st.scenario}:${wide}`;
    const entering = screenKey !== lastScreenKey;
    lastScreenKey = screenKey;
    const screenEl = document.getElementById('screen');
    screenEl.innerHTML = `
      ${html}
      ${wide ? '' : UI.StatusBar()}
      <span class="device__home"></span>
      ${UI.Sheet(!!st.sheet, sheetInner, st.sheet?.id)}
      ${UI.Toast(st.toast)}
    `;

    const dock = UI.WorkoutDock();
    if (dock) {
      const tabbar = screenEl.querySelector('.screen > .tabbar');
      if (tabbar) tabbar.insertAdjacentHTML('beforebegin', dock);
      else if (wide) screenEl.querySelector('.wide__main')?.insertAdjacentHTML('afterbegin', dock);
      else screenEl.querySelector('.screen')?.insertAdjacentHTML('beforeend', dock);
    }

    if (entering && !motionPreference.matches) screenEl.querySelector('.screen, .wide')?.classList.add('is-entering');
    if (st.toast && st.toast.at !== lastToastAt) screenEl.querySelector('.toast')?.classList.add('is-fresh');
    lastToastAt = st.toast?.at ?? null;

    const body = screenEl.querySelector('.session-journal .screen__body');
    if (body) body.scrollTop = justFinished ? 0 : journalScroll.get(journalKey) || 0;
    const strip = screenEl.querySelector('.pstrip');
    if (strip) strip.scrollLeft = stripScroll;
    const reduceMotion = motionPreference.matches;
    // Repetitive set entry and keyboard actions are immediate. An occasional sheet
    // may enter spatially; edits and close never wait for decorative movement.
    if (!reduceMotion && !keyboardAction && st.sheet && st.sheet.id !== 'setlog' && !sameSheet) {
      const sheet = screenEl.querySelector('.sheet');
      const motion = getComputedStyle(sheet);
      sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], {
        duration: parseFloat(motion.getPropertyValue('--dur-sheet')),
        easing: motion.getPropertyValue('--ease-sheet').trim(),
      });
    }

    const rail = document.getElementById('rail');
    rail.outerHTML = renderRail(st);

    const insp = document.getElementById('inspector');
    if (insp) insp.outerHTML = renderInspector(st);

    document.getElementById('toolbar').innerHTML = renderToolbar(st);

    // Modal focus stays inside the sheet, including after stepper re-renders.
    for (const el of [screenEl.querySelector('.screen'), document.getElementById('rail'), document.getElementById('inspector'), document.getElementById('toolbar')]) {
      if (el) el.inert = Boolean(st.sheet);
    }
    if (st.sheet) {
      const sheet = screenEl.querySelector('.sheet');
      const title = sheet.querySelector('.sheet__title')?.textContent || (st.sheet.id === 'setlog' ? `Запись подхода: ${DB.client(st.sheet.data.cid)?.name}` : 'Действия');
      sheet.setAttribute('aria-label', title);
      if (sameSheet) (sheet.querySelector('.log-editor-fields') || sheet.querySelector('.sheet__body')).scrollTop = sheetScroll;
      const field = inputFocus && sameSheet ? document.getElementById(inputFocus.id) : null;
      const target = field || (sameSheet && findFocusKey(previousFocus)) || sheet;
      target.focus({ preventScroll: true });
      if (field && inputFocus.start != null) field.setSelectionRange(inputFocus.start, inputFocus.end);
    } else if (lastFrame?.journalKey && journalKey && previousFocus) {
      findFocusKey(previousFocus)?.focus({ preventScroll: true });
    }

    if (!st.sheet && sheetReturnFocus) {
      const target = findFocusKey(sheetReturnFocus);
      sheetReturnFocus = null;
      if (target) target.focus({ preventScroll: true });
    }
    if (!st.sheet && journalKey && (justFinished || !lastFrame?.journalKey || lastFrame.sessionId !== st.logging.sessionId)) {
      screenEl.querySelector('.session-journal h1')?.focus({ preventScroll: true });
    }
    if (body) {
      const journal = screenEl.querySelector('.session-journal');
      const title = journal.querySelector('h1');
      const syncContext = () => journal.classList.toggle('is-scrolled', title.getBoundingClientRect().top < body.getBoundingClientRect().top);
      body.addEventListener('scroll', syncContext, { passive: true });
      syncContext();
    }
    lastFrame = { journalKey, sessionId: st.logging.sessionId, finished: st.logging.finished, sheetKey: nextSheetKey };
  }

  /* ── Event delegation ────────────────────────────────────────────────────── */

  /* Return focus to whatever opened a sheet — the shell re-renders, so the
     original node is gone and we match it again by its action + data. */
  const focusKey = (el) => (el && el.dataset && el.dataset.act ? { act: el.dataset.act, data: { ...el.dataset } } : null);
  const findFocusKey = (key) => {
    if (!key) return null;
    return [...document.querySelectorAll(`[data-act="${key.act}"]`)]
      .find(el => Object.keys(el.dataset).length === Object.keys(key.data).length
        && Object.keys(key.data).every(k => el.dataset[k] === key.data[k])) || null;
  };
  let sheetReturnFocus = null;

  function handle(el) {
    const name = el.getAttribute('data-act');
    if (!name || !Actions[name]) return;
    if ((name === 'sheet.open' || name === 'log.finish') && !Store.get().sheet) sheetReturnFocus = focusKey(el);
    const d = {};
    for (const key of Object.keys(el.dataset)) d[key] = el.dataset[key];
    const before = Store.get();
    Actions[name](d, el);
    window.Fx?.afterAction(name, before, Store.get());
    if (name === 'log.minimize') document.querySelector('[data-act="log.resume"]')?.focus({ preventScroll: true });
    if (name === 'setlog.quick' || name === 'setlog.undoQuick') {
      // The row changes shape after confirmation; keep focus on the same set.
      const targetAct = name === 'setlog.quick' ? 'sheet.open' : 'setlog.quick';
      const target = [...document.querySelectorAll(`.session-journal [data-act="${targetAct}"]`)]
        .find(node => node.dataset.cid === d.cid && node.dataset.ex === d.ex && node.dataset.si === d.si);
      target?.focus({ preventScroll: true });
    }
    if (name === 'sheet.open') {
      const sheet = document.querySelector('.sheet');
      if (sheet) sheet.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el) {
      e.preventDefault();
      keyboardAction = e.detail === 0;
      try { handle(el); } finally { keyboardAction = false; }
      return;
    }
    // clicking the scrim closes the sheet
    if (e.target.classList.contains('sheet__scrim')) Store.ui.closeSheet();
  });

  document.addEventListener('keydown', (e) => {
    // Typing/keyboard navigation settles any in-flight drawer immediately.
    document.querySelector('.sheet')?.getAnimations().forEach(animation => animation.cancel());
    if (e.key === 'Escape') { if (Store.get().sheet) Store.ui.closeSheet(); return; }
    if (e.key === 'Enter' && e.target.matches('[data-log-field]') && !e.isComposing) {
      e.preventDefault();
      if (e.target.dataset.logField === 'kg') document.getElementById('log-reps')?.focus();
      else Store.logging.saveSet();
      return;
    }
    if (e.key === 'Tab' && Store.get().sheet) {
      const sheet = document.querySelector('.sheet');
      const items = [...sheet.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]')];
      const first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); sheet.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-act][role="button"]');
    if (el) {
      e.preventDefault(); keyboardAction = true;
      try { handle(el); } finally { keyboardAction = false; }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.closest?.('.sheet')) document.querySelector('.sheet')?.getAnimations().forEach(animation => animation.cancel());
    if (e.target.matches('[data-reschedule-field]')) {
      Store.silent({ reschedulePick: { ...Store.get().reschedulePick, [e.target.dataset.rescheduleField]: e.target.value } });
      return;
    }
    if (e.target.matches('[data-log-field]')) {
      Store.logging.input({ [e.target.dataset.logField]: e.target.value });
      return;
    }
    if (e.target.matches('[data-client-name]')) e.target.setCustomValidity('');
    if (!e.target.matches('[data-directory-search]') || e.isComposing) return;
    const value = e.target.value;
    const start = e.target.selectionStart, end = e.target.selectionEnd;
    Store.set({ clientQuery: value });
    const field = document.querySelector('[data-directory-search]');
    field?.focus({ preventScroll: true });
    if (start != null) field?.setSelectionRange(start, end);
  });
  document.addEventListener('compositionend', (e) => {
    if (e.target.matches('[data-directory-search]')) e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Keep the mobile app inside the visible viewport without re-rendering inputs.
  // Pinch zoom stays available: do not resize the layout to a zoomed-in viewport.
  let viewportFrame = 0;
  function updateViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const view = window.visualViewport;
      if (view && Math.abs(view.scale - 1) > 0.01) return;
      document.documentElement.classList.toggle('is-compact-viewport', (view?.height || window.innerHeight) < 500);
      document.documentElement.style.setProperty('--app-viewport-height', `${view?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty('--app-viewport-top', `${view?.offsetTop || 0}px`);
    });
  }
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  window.matchMedia('(max-width: 600px)').addEventListener('change', render);
  updateViewport();
  Store.subscribe(render);
  render();
})();
