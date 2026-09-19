/* ============================================================================
   data.js — deterministic demo data
   Source of truth: `trainer-design-handoff-v2.md` §11 «Данные для первых макетов».
   All names, prices and numbers are fictional. Do not treat them as approved
   pricing or real clients.

   Timezone note: the product displays Asia/Almaty, 24-hour time, week starts
   Monday. The prototype pins a fixed "today" so screens are deterministic.
   ========================================================================== */

const DB = (() => {
  const TODAY = '2026-09-14'; // Monday
  const WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
  const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  const trainer = {
    id: 'tr1',
    name: 'Данияр',
    full: 'Данияр Сериков',
    clientCount: 24,
    initials: 'ДС',
  };

  const clients = [
    {
      id: 'c1', name: 'Айгерим Бекова', short: 'Айгерим', initials: 'АБ',
      phone: '+7 701 214 88 03', since: 'март 2025',
      program: 'Низ А',
      plan: { title: 'Пакет 12 занятий', bought: 12, remaining: 7, price: 60000, paid: 20000, due: 40000 },
      nextSessionId: 's4',
      goal: 'Похудение · 3 раза в неделю',
      note: 'Правое колено — не больше 90°, следить за разминкой.',
      clientComment: 'Прошу писать время переноса минимум за 12 часов.',
      status: 'ok',
      sessionsDone: 31,
      joined: '2025-03-11',
    },
    {
      id: 'c2', name: 'Арман Оспанов', short: 'Арман', initials: 'АО',
      phone: '+7 702 550 11 47', since: 'январь 2026',
      program: 'Сила 5×5',
      plan: { title: 'Пакет 8 занятий', bought: 8, remaining: 2, price: 44000, paid: 44000, due: 0 },
      nextSessionId: 's5',
      goal: 'Сила · жим и присед',
      note: 'Поясница — не добавлять вес без страховки.',
      clientComment: '',
      status: 'attention',
      sessionsDone: 14,
      joined: '2026-01-20',
    },
    {
      id: 'c3', name: 'Алия Нурлановa', short: 'Алия', initials: 'АН',
      phone: '+7 705 380 92 16', since: 'май 2026',
      program: 'Низ А',
      plan: { title: 'Пакет 12 занятий', bought: 12, remaining: 9, price: 60000, paid: 60000, due: 0 },
      nextSessionId: 's6',
      goal: 'Тонус · 2 раза в неделю',
      note: '',
      clientComment: 'Удобно после 19:00.',
      status: 'ok',
      sessionsDone: 8,
      joined: '2026-05-04',
    },
    {
      id: 'c4', name: 'Мади Касымов', short: 'Мади', initials: 'МК',
      phone: '+7 747 102 34 90', since: 'апрель 2026',
      program: 'Верх Б',
      plan: { title: 'Разовые занятия', bought: 4, remaining: 1, price: 24000, paid: 18000, due: 6000 },
      nextSessionId: 's6',
      goal: 'Набор массы · 3 раза в неделю',
      note: 'Хочет жим — следить за техникой плеча.',
      clientComment: '',
      status: 'attention',
      sessionsDone: 19,
      joined: '2026-04-02',
    },
    {
      id: 'c5', name: 'Дана Ержанова', short: 'Дана', initials: 'ДЕ',
      phone: '+7 700 918 77 25', since: 'февраль 2026',
      program: 'Full Body',
      plan: { title: 'Пакет 12 занятий', bought: 12, remaining: 5, price: 60000, paid: 60000, due: 0 },
      nextSessionId: 's6',
      goal: 'Общая форма · 2–3 раза в неделю',
      note: '',
      clientComment: '',
      status: 'ok',
      sessionsDone: 21,
      joined: '2026-02-17',
    },
    {
      id: 'c6', name: 'Тимур Ахметов', short: 'Тимур', initials: 'ТА',
      phone: '+7 708 441 60 38', since: 'сентябрь 2026',
      program: null,
      plan: null,
      nextSessionId: null,
      goal: null,
      note: '',
      clientComment: '',
      status: 'new',
      sessionsDone: 0,
      joined: '2026-09-12',
      invite: { state: 'link_created', expires: '2026-09-21', link: 'trn.app/i/TM-8F3KQ' },
    },
    {
      id: 'c7', name: 'Новый клиент', short: 'Без имени', initials: '?',
      phone: null, since: 'сентябрь 2026',
      program: null, plan: null, nextSessionId: null, goal: null,
      note: '', clientComment: '', status: 'new',
      sessionsDone: 0, joined: '2026-09-18',
      invite: { state: 'not_connected', expires: null, link: null },
    },
  ];

  /* ── Sessions ────────────────────────────────────────────────────────────
     `kind`: 'personal' | 'group'. A mini-group is ONE session with many
     participants. Overlapping personal sessions stay separate rows, grouped
     visually only inside the overlap frame. */

  const sessions = [
    {
      id: 's1', date: '2026-09-14', start: '09:00', end: '10:00', kind: 'personal',
      title: 'Утренняя сессия', program: 'Full Body', clientId: 'c5',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c5', reply: 'confirmed' }],
    },
    {
      id: 's2', date: '2026-09-14', start: '11:30', end: '12:30', kind: 'personal',
      title: 'Индивидуальная', program: 'Верх Б', clientId: 'c4',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c4', reply: 'confirmed' }],
    },
    {
      id: 's3', date: '2026-09-14', start: '14:00', end: '15:00', kind: 'personal',
      title: 'Индивидуальная', program: 'Сила 5×5', clientId: 'c2',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c2', reply: 'confirmed' }],
    },
    {
      id: 's4', date: '2026-09-14', start: '18:00', end: '19:00', kind: 'personal',
      title: 'Индивидуальная', program: 'Низ А', clientId: 'c1',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c1', reply: 'confirmed' }],
      overlapGroup: 'ov1',
    },
    {
      id: 's5', date: '2026-09-14', start: '18:30', end: '19:30', kind: 'personal',
      title: 'Индивидуальная', program: 'Сила 5×5', clientId: 'c2',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c2', reply: 'confirmed' }],
      overlapGroup: 'ov1',
    },
    {
      id: 's6', date: '2026-09-14', start: '20:00', end: '21:00', kind: 'group',
      title: 'Мини-группа', program: 'Разные программы', clientId: null,
      status: 'confirmed', attendance: null,
      participants: [
        { clientId: 'c3', reply: 'confirmed' },
        { clientId: 'c4', reply: 'cancelled' },
        { clientId: 'c5', reply: 'pending' },
      ],
    },
    {
      id: 's7', date: '2026-09-14', start: '21:15', end: '22:00', kind: 'personal',
      title: 'Растяжка', program: null, clientId: 'c1',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c1', reply: 'confirmed' }],
    },
    // Upcoming sessions that carry the two pending reschedule requests.
    // Айгерим: Thu 18:00 → client proposes Fri 19:00 (handoff §11).
    {
      id: 's8', date: '2026-09-17', start: '18:00', end: '19:00', kind: 'personal',
      title: 'Индивидуальная', program: 'Низ А', clientId: 'c1',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c1', reply: 'confirmed' }],
      request: { id: 'r1', sessionId: 's8', clientId: 'c1', type: 'reschedule', from: { date: '2026-09-17', start: '18:00', end: '19:00' }, to: { date: '2026-09-18', start: '19:00', end: '20:00' }, state: 'pending', awaiting: 'trainer', author: 'client' },
    },
    {
      id: 's9', date: '2026-09-15', start: '14:00', end: '15:00', kind: 'personal',
      title: 'Индивидуальная', program: 'Сила 5×5', clientId: 'c2',
      status: 'confirmed', attendance: null, participants: [{ clientId: 'c2', reply: 'confirmed' }],
      request: { id: 'r2', sessionId: 's9', clientId: 'c2', type: 'reschedule', from: { date: '2026-09-15', start: '14:00', end: '15:00' }, to: { date: '2026-09-16', start: '11:30', end: '12:30' }, state: 'pending', awaiting: 'trainer', author: 'client' },
    },
  ];

  /* ── Active session demo (Мади · Жим лёжа) ─────────────────────────────────
     prev 40×10 · today 40×10 and 40×8 · third set deliberately unwritten. */

  const programs = {
    'Низ А': [
      { id: 'e1', name: 'Приседания со штангой', sets: 4, reps: '8', target: 80, prev: { kg: 80, reps: 8 }, pr: 100 },
      { id: 'e2', name: 'Румынская тяга', sets: 3, reps: '10', target: 60, prev: { kg: 60, reps: 10 }, pr: 75 },
      { id: 'e3', name: 'Жим ногами', sets: 3, reps: '12', target: 120, prev: { kg: 120, reps: 12 }, pr: 150 },
      { id: 'e4', name: 'Выпады с гантелями', sets: 3, reps: '12', target: 16, prev: { kg: 16, reps: 12 }, pr: 20 },
      { id: 'e5', name: 'Планка', sets: 3, reps: '45 сек', target: 0, prev: { kg: 0, reps: 45 }, pr: 0 },
    ],
    'Верх Б': [
      { id: 'e1', name: 'Жим лёжа', sets: 4, reps: '8', target: 40, prev: { kg: 40, reps: 10 }, pr: 72.5 },
      { id: 'e2', name: 'Жим гантелей под углом', sets: 3, reps: '10', target: 22, prev: { kg: 22, reps: 10 }, pr: 26 },
      { id: 'e3', name: 'Тяга блока к поясу', sets: 3, reps: '12', target: 45, prev: { kg: 45, reps: 12 }, pr: 55 },
      { id: 'e4', name: 'Махи в стороны', sets: 3, reps: '15', target: 10, prev: { kg: 10, reps: 15 }, pr: 12 },
    ],
    'Full Body': [
      { id: 'e1', name: 'Приседания со штангой', sets: 3, reps: '10', target: 50, prev: { kg: 50, reps: 10 }, pr: 70 },
      { id: 'e2', name: 'Отжимания', sets: 3, reps: '12', target: 0, prev: { kg: 0, reps: 12 }, pr: 0 },
      { id: 'e3', name: 'Тяга в наклоне', sets: 3, reps: '12', target: 30, prev: { kg: 30, reps: 12 }, pr: 40 },
      { id: 'e4', name: 'Планка', sets: 3, reps: '40 сек', target: 0, prev: { kg: 0, reps: 40 }, pr: 0 },
    ],
    'Сила 5×5': [
      { id: 'e1', name: 'Приседания со штангой', sets: 5, reps: '5', target: 100, prev: { kg: 100, reps: 5 }, pr: 120 },
      { id: 'e2', name: 'Жим лёжа', sets: 5, reps: '5', target: 70, prev: { kg: 70, reps: 5 }, pr: 85 },
      { id: 'e3', name: 'Становая тяга', sets: 1, reps: '5', target: 120, prev: { kg: 120, reps: 5 }, pr: 140 },
    ],
  };

  // Today's confirmed values for the demo logging screen (session s6 / Мади)
  const loggedDemo = {
    c4: {
      e1: [{ kg: 40, reps: 10 }, { kg: 40, reps: 8 }], // third set intentionally missing
    },
  };

  /* ── Templates library ──────────────────────────────────────────────────── */

  const templates = [
    { id: 't1', name: 'Низ А', meta: '5 упражнений · средний', uses: 14, program: 'Низ А' },
    { id: 't2', name: 'Верх Б', meta: '4 упражнения · средний', uses: 11, program: 'Верх Б' },
    { id: 't3', name: 'Full Body', meta: '4 упражнения · новичок', uses: 22, program: 'Full Body' },
    { id: 't4', name: 'Сила 5×5', meta: '3 упражнения · продвинутый', uses: 7, program: 'Сила 5×5' },
  ];

  /* ── Payments (two independent histories) ───────────────────────────────── */

  const purchases = [
    { id: 'p1', clientId: 'c1', title: 'Пакет 12 занятий', price: 60000, paid: 20000, due: 40000, date: '2026-08-28', expires: '2026-11-28', units: 12, used: 5 },
    { id: 'p2', clientId: 'c2', title: 'Пакет 8 занятий', price: 44000, paid: 44000, due: 0, date: '2026-07-14', expires: '2026-10-14', units: 8, used: 6 },
    { id: 'p3', clientId: 'c4', title: 'Разовые занятия', price: 24000, paid: 18000, due: 6000, date: '2026-09-01', expires: null, units: 4, used: 3 },
    { id: 'p4', clientId: 'c5', title: 'Пакет 12 занятий', price: 60000, paid: 60000, due: 0, date: '2026-06-10', expires: '2026-10-10', units: 12, used: 7 },
  ];

  const payments = [
    { id: 'pay1', clientId: 'c1', amount: 20000, date: '2026-08-28', method: 'Kaspi', note: 'Первая часть' },
    { id: 'pay2', clientId: 'c2', amount: 44000, date: '2026-07-14', method: 'Перевод', note: '' },
    { id: 'pay3', clientId: 'c4', amount: 18000, date: '2026-09-01', method: 'Наличные', note: 'Остаток 6 000' },
    { id: 'pay4', clientId: 'c5', amount: 60000, date: '2026-06-10', method: 'Kaspi', note: '' },
  ];

  // Unit movements (visits charged / corrections). Separate from payments.
  const unitTx = [
    { id: 'u1', clientId: 'c1', delta: -1, date: '2026-09-09', reason: 'Проведённое занятие', source: 'p1' },
    { id: 'u2', clientId: 'c2', delta: -1, date: '2026-09-07', reason: 'Проведённое занятие', source: 'p2' },
    { id: 'u3', clientId: 'c2', delta: -1, date: '2026-09-11', reason: 'Неявка', source: 'p2' },
    { id: 'u4', clientId: 'c2', delta: +1, date: '2026-09-12', reason: 'Исправление: неявка снята', source: 'p2' },
    { id: 'u5', clientId: 'c4', delta: -1, date: '2026-09-08', reason: 'Проведённое занятие', source: 'p3' },
    { id: 'u6', clientId: 'c1', delta: -1, date: '2026-09-02', reason: 'Проведённое занятие', source: 'p1' },
  ];

  /* ── Client history (Прогресс) ──────────────────────────────────────────── */

  const history = (() => {
    const make = (clientId, exercise, entries) => entries.map((e, i) => ({
      id: clientId + '-h' + i, clientId, exercise,
      date: e[0], sets: e[1], top: e[2], volume: e[3],
    }));
    return {
      c1: [
        ...make('c1', 'Приседания со штангой', [
          ['2026-08-19', 4, 75, 7200], ['2026-08-26', 4, 80, 7680], ['2026-09-02', 4, 80, 7680], ['2026-09-09', 4, 82.5, 7920],
        ]),
        ...make('c1', 'Румынская тяга', [
          ['2026-08-19', 3, 55, 4950], ['2026-08-26', 3, 57.5, 5175], ['2026-09-02', 3, 60, 5400], ['2026-09-09', 3, 60, 5400],
        ]),
      ],
      c4: [
        ...make('c4', 'Жим лёжа', [
          ['2026-08-21', 4, 65, 1820], ['2026-08-28', 4, 67.5, 1890], ['2026-09-04', 4, 70, 1960], ['2026-09-11', 4, 70, 1960],
        ]),
      ],
      c2: [
        ...make('c2', 'Приседания со штангой', [
          ['2026-08-20', 5, 95, 4750], ['2026-08-27', 5, 97.5, 4875], ['2026-09-03', 5, 100, 5000], ['2026-09-10', 5, 100, 5000],
        ]),
      ],
    };
  })();

  /* ── Visual states used by the prototype toolbar ────────────────────────── */

  const SCENARIOS = {
    normal: { label: 'Обычный день', desc: '7 занятий, 2 требуют ответа, пересечение 18:00/18:30.' },
    empty: { label: 'Пустой день', desc: 'Нет занятий — объяснение и «Добавить занятие».' },
    loading: { label: 'Загрузка', desc: 'Скелетоны вместо ленты.' },
    offline: { label: 'Нет связи', desc: 'Ошибка сохранения сохраняет ввод.' },
  };

  return {
    TODAY, WEEK, DOW, MONTHS, MONTHS_SHORT,
    trainer, clients, sessions, programs, templates,
    purchases, payments, unitTx, history, loggedDemo, SCENARIOS,

    /* helpers */
    client(id) { return this.clients.find(c => c.id === id) || null; },
    byDate(date) { return this.sessions.filter(s => s.date === date); },
    pendingRequests() { return this.sessions.filter(s => s.request && s.request.state === 'pending'); },
    programFor(name) { return name ? (this.programs[name] || []) : []; },
    fmtMoney(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + ' ₸'; },
    addMinutes(t, m) {
      const [h, mm] = t.split(':').map(Number);
      const total = (h * 60 + mm + m + 1440) % 1440;
      return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    },
    /** Russian plural: plural(5, ['занятие','занятия','занятий']) → 'занятий' */
    plural(n, forms) {
      const a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) return forms[2];
      if (b > 1 && b < 5) return forms[1];
      if (b === 1) return forms[0];
      return forms[2];
    },
    fmtDate(iso) {
      const [y, m, dd] = iso.split('-').map(Number);
      return `${dd} ${MONTHS_SHORT[m - 1]}`;
    },
    fmtDateLong(iso) {
      const [y, m, dd] = iso.split('-').map(Number);
      const dow = DOW[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7];
      return `${dow}, ${dd} ${MONTHS_SHORT[m - 1]}`;
    },
    todayLabel() { return this.fmtDateLong(this.TODAY); },
    isToday(iso) { return iso === this.TODAY; },
    overlapGroups(date) {
      const list = this.byDate(date).filter(s => s.overlapGroup);
      const ids = [...new Set(list.map(s => s.overlapGroup))];
      return ids.map(id => ({ id, sessions: list.filter(s => s.overlapGroup === id) }));
    },
    ungrouped(date) { return this.byDate(date).filter(s => !s.overlapGroup); },
  };
})();
