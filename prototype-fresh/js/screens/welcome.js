const Welcome = (() => {
  const { esc, act, Btn, Card, Row, Lead, Notice } = UI;

  const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00'];
  const ENDS = ['18:00', '19:00', '20:00', '21:00', '22:00'];
  const LENGTHS = [45, 60, 90];
  const FOCUS = ['Силовые', 'Функциональные', 'Похудение', 'Реабилитация', 'Бокс', 'Йога'];
  const STEPS = ['Профиль', 'Время', 'Клиент'];

  const initial = () => ({ step: 0, name: DB.trainer.name, focus: ['Силовые'], days: [0, 1, 2, 3, 4, 5], from: '07:00', to: '21:00', length: 60, clientName: '', clientPhone: '', clientSkipped: false, error: '' });
  const state = () => Store.get().welcome || initial();

  const daysLabel = (days) => {
    const sorted = days.slice().sort((a, b) => a - b);
    if (!sorted.length) return 'дни не выбраны';
    const run = sorted.every((d, i) => !i || d === sorted[i - 1] + 1);
    return run && sorted.length > 2 ? `${DAYS[sorted[0]]}–${DAYS[sorted[sorted.length - 1]]}` : sorted.map(d => DAYS[d]).join(', ');
  };

  const chip = (label, on, action, args, extra = '') =>
    `<button type="button" class="chip welcome-chip ${on ? 'is-on' : ''}" ${act(action, args)} aria-pressed="${on}"${extra}>${esc(label)}</button>`;

  const field = (id, label, value, attrs) => `<label class="welcome-field" for="welcome-${id}">
      <span>${esc(label)}</span>
      <input id="welcome-${id}" data-welcome-field="${id}" value="${esc(value)}" ${attrs}>
    </label>`;

  const progress = (step) => `<ol class="welcome-progress" aria-label="Шаги настройки">
      ${STEPS.map((label, i) => `<li class="${i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}"${i + 1 === step ? ' aria-current="step"' : ''}><span class="sr-only">${i + 1}. ${label}</span></li>`).join('')}
    </ol>`;

  const top = (w) => `<header class="welcome-top">
      <button type="button" class="topbar__btn welcome-top__back" ${act('welcome.prev')} aria-label="Назад">${Icon.get('chevL', { size: 22, sw: 2.2 })}</button>
      ${progress(w.step)}
      <button type="button" class="welcome-top__skip" ${act('welcome.skip')}>Пропустить</button>
    </header>`;

  function intro() {
    return `<div class="welcome-intro">
      ${Mascot.render('welcome', 'onboarding')}
      <p class="welcome-kicker">Привет!</p>
      <h1 class="welcome-title">Клиенты, расписание и тренировки — в одном месте</h1>
      <p class="welcome-text">Настроим всё за минуту: как вас зовут, когда вы работаете и кто ваш первый клиент.</p>
    </div>
    <div class="welcome-footer">
      ${Btn('Я тренер — начать', { a: 'welcome.next' })}
      ${Btn('У меня приглашение от тренера', { kind: 'ghost', a: 'welcome.client' })}
    </div>`;
  }

  function profile(w) {
    return `<div class="welcome-body">
      <h1 class="welcome-title">Как к вам обращаться?</h1>
      <p class="welcome-text">Имя увидят клиенты в приглашении и расписании.</p>
      ${field('name', 'Имя', w.name, `autocomplete="given-name" enterkeyhint="next" required${w.error ? ' aria-invalid="true" aria-describedby="welcome-error"' : ''}`)}
      ${w.error ? `<p class="welcome-error" id="welcome-error" role="alert">${esc(w.error)}</p>` : ''}
      <h2 class="welcome-label" id="welcome-focus">Чем занимаетесь</h2>
      <div class="chips welcome-chips" role="group" aria-labelledby="welcome-focus">${FOCUS.map(f => chip(f, w.focus.includes(f), 'welcome.focus', { value: f })).join('')}</div>
      <p class="welcome-hint">Можно выбрать несколько. Подберём упражнения в библиотеке под ваш профиль.</p>
    </div>
    <div class="welcome-footer">${Btn('Продолжить', { a: 'welcome.next' })}</div>`;
  }

  function hours(w) {
    return `<div class="welcome-body">
      <h1 class="welcome-title">Когда вы работаете?</h1>
      <p class="welcome-text">По этому времени покажем свободные окна. Изменить можно в профиле.</p>
      <h2 class="welcome-label" id="welcome-days">Дни</h2>
      <div class="welcome-days" role="group" aria-labelledby="welcome-days">${DAYS.map((d, i) => chip(d, w.days.includes(i), 'welcome.day', { value: i })).join('')}</div>
      <h2 class="welcome-label" id="welcome-from">Начало дня</h2>
      <div class="welcome-times" role="group" aria-labelledby="welcome-from">${HOURS.map(h => chip(h, w.from === h, 'welcome.patch', { key: 'from', value: h })).join('')}</div>
      <h2 class="welcome-label" id="welcome-to">Конец дня</h2>
      <div class="welcome-times" role="group" aria-labelledby="welcome-to">${ENDS.map(h => chip(h, w.to === h, 'welcome.patch', { key: 'to', value: h })).join('')}</div>
      <h2 class="welcome-label" id="welcome-length">Обычное занятие</h2>
      <div class="chips welcome-chips" role="group" aria-labelledby="welcome-length">${LENGTHS.map(l => chip(`${l} мин`, w.length === l, 'welcome.patch', { key: 'length', value: l })).join('')}</div>
      <p class="welcome-summary">${Icon.get('clock', { size: 18 })}<span>${esc(daysLabel(w.days))} · ${w.from}–${w.to} · по ${w.length} мин</span></p>
    </div>
    <div class="welcome-footer">${Btn('Продолжить', { a: 'welcome.next', disabled: !w.days.length })}</div>`;
  }

  function firstClient(w) {
    return `<div class="welcome-body">
      <h1 class="welcome-title">Добавим первого клиента</h1>
      <p class="welcome-text">Карточку можно вести сразу. Клиент подключится по ссылке, когда будет готов.</p>
      ${field('clientName', 'Имя и фамилия', w.clientName, 'autocomplete="off" enterkeyhint="next" placeholder="Например, Айгерим Бекова"')}
      ${field('clientPhone', 'Телефон', w.clientPhone, 'type="tel" inputmode="tel" autocomplete="off" placeholder="+7 700 000 00 00"')}
      <div style="margin-top:16px">${Notice('Номер нужен только для ссылки-приглашения. Клиент сам решает, подключаться ли.', { tone: 'info', icon: 'lock' })}</div>
    </div>
    <div class="welcome-footer">
      ${Btn('Добавить клиента', { a: 'welcome.next' })}
      ${Btn('Добавлю позже', { kind: 'ghost', a: 'welcome.later' })}
    </div>`;
  }

  function done(w) {
    const client = w.clientName.trim();
    const items = [
      ['user', 'Профиль', esc(w.name) + (w.focus.length ? ` · ${esc(w.focus.join(', ').toLowerCase())}` : ''), true],
      ['clock', 'Рабочее время', `${esc(daysLabel(w.days))} · ${w.from}–${w.to}`, true],
      ['users', 'Первый клиент', client ? `${esc(client)} · ссылка готова` : 'Можно добавить в «Клиентах»', Boolean(client)],
    ];
    return `<div class="welcome-intro welcome-intro--done">
      ${Mascot.render('approved', 'onboarding')}
      <h1 class="welcome-title">Всё готово, ${esc(w.name)}!</h1>
      <p class="welcome-text">Осталось запланировать первое занятие — остальное подскажем по ходу.</p>
    </div>
    <div class="welcome-body welcome-body--list">
      ${Card(items.map(([icon, title, meta, ok], i) => Row({
        lead: Lead(ok ? 'check' : icon, { size: 'sm', icon: true, tone: ok ? 'mint' : '' }),
        title, meta, last: i === items.length - 1,
      })).join(''), { rows: true })}
    </div>
    <div class="welcome-footer">
      ${Btn('Запланировать первое занятие', { a: 'welcome.finish', args: { to: 't-new' } })}
      ${Btn('Перейти на главную', { kind: 'ghost', a: 'welcome.finish', args: { to: 't-today' } })}
    </div>`;
  }

  function render() {
    const w = state();
    const body = w.step === 0 ? intro() : w.step === 1 ? profile(w) : w.step === 2 ? hours(w) : w.step === 3 ? firstClient(w) : done(w);
    return `<div class="screen welcome${w.step === 0 || w.step === 4 ? " onboarding" : ""} welcome--step-${w.step}">
      ${w.step > 0 && w.step < 4 ? top(w) : ''}
      ${body}
    </div>`;
  }

  function patch(p) { Store.set({ welcome: { ...state(), ...p } }); }

  const actions = {
    'welcome.next': () => {
      const w = state();
      if (w.step === 1 && !String(w.name || '').trim()) { patch({ error: 'Введите имя — так вас увидят клиенты' }); document.getElementById?.('welcome-name')?.focus(); return; }
      patch({ step: Math.min(4, w.step + 1), error: '', clientSkipped: w.step === 3 && !w.clientName.trim() ? true : w.clientSkipped });
    },
    'welcome.prev': () => patch({ step: Math.max(0, state().step - 1), error: '' }),
    'welcome.skip': () => patch({ step: 4, error: '' }),
    'welcome.later': () => patch({ step: 4, clientName: '', clientPhone: '', clientSkipped: true }),
    'welcome.client': () => { Store.set({ welcome: initial() }); Store.nav.role('client'); Store.nav.tab('c-first'); },
    'welcome.focus': (d) => { const w = state(); patch({ focus: w.focus.includes(d.value) ? w.focus.filter(f => f !== d.value) : [...w.focus, d.value] }); },
    'welcome.day': (d) => { const w = state(); const day = Number(d.value); patch({ days: w.days.includes(day) ? w.days.filter(x => x !== day) : [...w.days, day] }); },
    'welcome.patch': (d) => patch({ [d.key]: d.key === 'length' ? Number(d.value) : d.value }),
    'welcome.finish': (d) => { Store.set({ welcome: initial() }); Store.nav.tab(d.to); Store.ui.toast('', 'Настройка сохранена'); },
  };

  function input(e) {
    if (!e.target.matches('[data-welcome-field]')) return false;
    const w = state();
    const key = e.target.dataset.welcomeField;
    Store.silent({ welcome: { ...w, [key]: e.target.value, error: key === 'name' ? '' : w.error } });
    if (key === 'name' && w.error) {
      e.target.removeAttribute?.('aria-invalid');
      document.getElementById?.('welcome-error')?.remove();
    }
    return true;
  }

  return { render, actions, input, initial, daysLabel };
})();
