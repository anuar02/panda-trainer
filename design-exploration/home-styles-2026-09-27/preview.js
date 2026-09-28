const paths = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  dumbbell: '<path d="M7 10h10v4H7M3 9v6m18-6v6"/><rect x="4" y="6" width="3" height="12" rx="1"/><rect x="17" y="6" width="3" height="12" rx="1"/>',
  ticket: '<path d="M3 8V5h18v3a4 4 0 0 0 0 8v3H3v-3a4 4 0 0 0 0-8ZM15 5v2m0 3v4m0 3v2"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h1m4 0h1"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  trend: '<path d="M4 4v16h16M7 14l5-5 3 3 6-7m-5 0h5v5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`; }
function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); }); }
const poses = {
  welcome: { x: 14, y: 636, width: 220, height: 340 },
  approved: { x: 240, y: 636, width: 202, height: 340 },
  reading: { x: 892, y: 636, width: 202, height: 340 },
};
document.querySelectorAll('[data-pose]').forEach(el => {
  const p = poses[el.dataset.pose];
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="panda-crop" style="aspect-ratio:${p.width}/${p.height};width:auto"><img src="../../prototype/assets/mascot/red-panda-dark-headband.png" width="1536" height="1024" style="width:${1536 / p.width * 100}%;height:${1024 / p.height * 100}%;left:${-p.x / p.width * 100}%;top:${-p.y / p.height * 100}%" alt="" draggable="false"></span>`;
});
document.querySelectorAll('.session-dots').forEach(el => { el.innerHTML = Array.from({ length: 12 }, (_, i) => `<span class="${i < 5 ? 'used' : ''}" style="--n:${i}" aria-hidden="true"></span>`).join(''); });
document.querySelectorAll('.app-nav').forEach(el => {
  el.innerHTML = [['home', 'Главная', 'home'], ['dumbbell', 'Программа', 'program'], ['trend', 'Прогресс', 'progress'], ['user', 'Профиль', 'profile']].map(([i, label, action]) => `<button data-action="${action}" ${action === 'home' ? 'aria-current="page"' : ''}>${icon(i)}<span>${label}</span></button>`).join('');
});
paintIcons();

const motionButton = document.querySelector('#motion');
const replayButton = document.querySelector('#replay');
function replay() {
  document.body.classList.remove('motion-on');
  void document.body.offsetWidth;
  document.body.classList.add('motion-on');
}
motionButton.addEventListener('click', () => {
  const enabled = motionButton.getAttribute('aria-pressed') !== 'true';
  motionButton.setAttribute('aria-pressed', String(enabled));
  replayButton.disabled = !enabled;
  if (enabled) replay(); else document.body.classList.remove('motion-on');
});
replayButton.addEventListener('click', replay);
function selectVariant(id) {
  if (!document.querySelector(`[data-direction="${id}"]`)) id = 'companion';
  document.querySelectorAll('[data-select]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.select === id)));
  document.querySelectorAll('[data-direction]').forEach(el => el.classList.toggle('is-selected', el.dataset.direction === id));
  history.replaceState(null, '', `#${id}`);
  if (motionButton.getAttribute('aria-pressed') === 'true') replay();
}
document.querySelectorAll('[data-select]').forEach(el => el.addEventListener('click', () => selectVariant(el.dataset.select)));
if (location.hash) selectVariant(location.hash.slice(1));

const dialog = document.querySelector('#detail');
const title = document.querySelector('#detail-title');
const body = document.querySelector('#detail-body');
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function showDetail(action) {
  if (action === 'home') return;
  const workouts = typeof DB !== 'undefined' ? DB.programFor('Низ А') : [];
  const content = {
    program: ['Низ А', `<p class="dialog-copy">Программа ближайшей тренировки · 18:00–19:00</p><ul class="exercise-list">${workouts.map(e => `<li>${escapeText(e.name)}<span>${escapeText(e.sets)} × ${escapeText(e.reps)}</span></li>`).join('')}</ul>`],
    booking: ['Твоя запись', '<p class="dialog-copy">14 сентября, 18:00–19:00</p><div class="dialog-summary">Низ А<br>Индивидуальная тренировка<br>Участие подтверждено</div><p class="dialog-copy">Перенос и отмена доступны в основном прототипе.</p><a class="dialog-link" href="../../prototype/index.html">Перейти в прототип</a>'],
    billing: ['Твой абонемент', '<p class="dialog-copy">Пакет 12 занятий</p><div class="dialog-summary">Осталось: 7 занятий<br>Стоимость: 60 000 ₸<br>Оплачено: 20 000 ₸<br>К оплате: 40 000 ₸</div>'],
    next: ['Следующее занятие', '<div class="dialog-summary">14 сентября · 21:15–22:00<br>Индивидуальная тренировка</div><p class="dialog-copy">Программа появится позже.</p>'],
    notifications: ['Уведомления', '<p class="dialog-copy">Перенос занятия 17 сентября на 18 сентября, 19:00–20:00, ожидает ответа тренера.</p>'],
    progress: ['Твой прогресс', '<p class="dialog-copy">В пакете использовано 5 из 12 занятий. История тренировок и показатели доступны в основном прототипе.</p><a class="dialog-link" href="../../prototype/index.html">Перейти в прототип</a>'],
    profile: ['Айгерим Бекова', '<p class="dialog-copy">Ваш тренер — Данияр. Текущая программа — «Низ А».</p><div class="dialog-summary">Пакет 12 занятий<br>Осталось 7 занятий</div>'],
  };
  if (!content[action]) return;
  [title.textContent, body.innerHTML] = content[action];
  dialog.showModal();
}
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) showDetail(action.dataset.action);
});
document.querySelector('#close-detail').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
