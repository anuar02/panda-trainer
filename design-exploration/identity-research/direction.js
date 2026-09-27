'use strict';
// Isolated research state. No requests, storage writes, original app data or accounts.
const names = ['Алия', 'Мади', 'Дана'];
const previous = [[8, 12], [12, 10], [6, 12]];
const workout = StudyModel.createWorkout(names);
const transferRequest = StudyModel.createTransfer();
let records = workout.records;
let currentPerson = 0;
let transfer = 'pending';
let finished = false;
const $ = selector => document.querySelector(selector);
const dialog = $('#decision-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let dialogTrigger;
let sheetMotion;
let closing = false;
let keyboardInput = false;
document.addEventListener('pointerdown', () => {keyboardInput = false;}, true);
document.addEventListener('keydown', () => {keyboardInput = true;}, true);
const skipMotion = () => reduced.matches || $('#reduce-motion').checked || keyboardInput;

function stopMotion() {
  sheetMotion?.cancel();
  sheetMotion = null;
}
function restoreDialog() {
  stopMotion();
  dialog.close();
  closing = false;
  if (dialogTrigger?.isConnected && !dialogTrigger.disabled) dialogTrigger.focus({preventScroll: true});
}

function openDialog(title, content, trigger) {
  const start = dialog.open ? getComputedStyle(dialog).transform : 'translateY(100%)';
  stopMotion();
  closing = false;
  dialogTrigger = trigger || document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = content;
  if (!dialog.open) dialog.showModal();
  if (!skipMotion()) sheetMotion = dialog.animate([{transform: start}, {transform: 'translateY(0)'}], {duration: 240, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'both'});
  $('#dialog-close').focus({preventScroll: true});
}
function closeDialog() {
  if (!dialog.open) return;
  if (skipMotion()) return restoreDialog();
  if (closing) return;
  const start = getComputedStyle(dialog).transform;
  stopMotion();
  closing = true;
  const exit = dialog.animate([{transform: start}, {transform: 'translateY(100%)'}], {duration: 180, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'both'});
  sheetMotion = exit;
  exit.finished.then(() => {if (sheetMotion === exit) restoreDialog();}).catch(() => {});
}
$('#dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('cancel', event => {event.preventDefault(); keyboardInput = true; closeDialog();});
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog();
});
function updateMotionPreference() {
  document.body.classList.toggle('reduce', $('#reduce-motion').checked);
  if (reduced.matches || $('#reduce-motion').checked) {
    if (closing) restoreDialog(); else stopMotion();
    document.querySelectorAll('video').forEach(video => video.pause());
  }
}
$('#reduce-motion').addEventListener('change', updateMotionPreference);
reduced.addEventListener('change', updateMotionPreference);

const datePair = '<dl class="date-pair"><div><dt>Действует</dt><dd>Чт, 17 сентября<br><b>18:00–19:00</b></dd></div><div><dt>Предложено</dt><dd>Пт, 18 сентября<br><b>19:00–20:00</b></dd></div></dl>';
function openTransfer(event, actor = 'trainer') {
  if (transfer !== 'pending') {
    openDialog('Решение по переносу', `<p class="dialog-note">${transfer === 'accepted' ? 'Перенос принят. Тренировка пройдёт в пятницу, 18 сентября, с 19:00 до 20:00.' : 'Перенос отклонён. Тренировка остаётся в четверг, 17 сентября, с 18:00 до 19:00.'}</p><p class="dialog-note">Сегодняшняя тренировка в 21:15 не меняется.</p>`, event.currentTarget);
    return;
  }
  if (actor === 'client') {
    openDialog('Ваш запрос на перенос', `${datePair}<p>Данияр ещё не ответил. Прежнее время остаётся в силе.</p><p class="dialog-note">Для проверки ответа откройте входящие на экране тренера. Этот клиентский экран не может принять собственный запрос.</p>`, event.currentTarget);
    return;
  }
  openDialog('Айгерим просит перенос', `<p class="dialog-note">Входящие тренера · другая тренировка</p>${datePair}<p>Пока вы не согласились, прежнее время остаётся в силе.</p><div class="dialog-actions"><button id="accept-transfer" class="primary">Принять новое время</button><button id="decline-transfer">Оставить прежнее время</button></div>`, event.currentTarget);
  $('#accept-transfer').addEventListener('click', () => decideTransfer('accepted'));
  $('#decline-transfer').addEventListener('click', () => decideTransfer('declined'));
}
function decideTransfer(next) {
  if (!transferRequest.decide('trainer', next)) return;
  transfer = transferRequest.status;
  updateTransfer(); closeDialog();
}
function updateTransfer() {
  const pending = transfer === 'pending';
  $('#transfer-card-title').textContent = pending ? 'Запрос на перенос' : transfer === 'accepted' ? 'Перенос принят' : 'Прежнее время';
  $('#transfer-summary').innerHTML = pending ? `<p class="small muted">Для другой тренировки</p>${datePair}<p class="small">Ждём ответа тренера.<br>Прежнее время остаётся в силе.</p>` : `<p class="small muted">Для другой тренировки</p><p style="margin-top:14px"><strong>${transfer === 'accepted' ? 'Пт, 18 сентября<br>19:00–20:00' : 'Чт, 17 сентября<br>18:00–19:00'}</strong></p><p class="small">${transfer === 'accepted' ? 'Тренер подтвердил новое время.' : 'Тренер не подтвердил перенос. Занятие не отменено.'}</p>`;
  $('#inbox').setAttribute('aria-label', pending ? 'Входящие: один запрос на перенос' : 'Посмотреть решение по переносу');
  $('#inbox .count').hidden = !pending;
  $('#view-transfer').textContent = pending ? 'Открыть запрос' : 'Посмотреть решение';
}
['#inbox', '#motion-open'].forEach(selector => $(selector).addEventListener('click', event => openTransfer(event, 'trainer')));
$('#view-transfer').addEventListener('click', event => openTransfer(event, 'client'));
$('#reset-scenario').addEventListener('click', () => {
  transferRequest.reset(); transfer = transferRequest.status; updateTransfer();
  $('#scenario-status').textContent = 'Запрос снова ожидает ответа. Записи подходов не изменены.';
});
$('#view-program').addEventListener('click', event => openDialog('Низ А · Сегодня', '<p class="dialog-note">Демонстрационная программа Айгерим, не рекомендация по нагрузке.</p><div class="program-row"><strong>Приседания с гантелью</strong><span>3 подхода × 10 повторов</span></div><div class="program-row"><strong>Румынская тяга</strong><span>3 подхода × 12 повторов</span></div><div class="program-row"><strong>Сгибание ног</strong><span>2 подхода × 12 повторов</span></div><p class="dialog-note">Вес и технику уточните у своего тренера.</p>', event.currentTarget));

function renderRows() {
  records = workout.records;
  finished = workout.finished;
  $('#previous').textContent = `В прошлый раз: ${previous[currentPerson][0]} кг × ${previous[currentPerson][1]}`;
  // Values enter the DOM via input.value, never by interpolating user input into HTML.
  $('#set-rows').innerHTML = records[currentPerson].map((row, i) => `<div class="set-row${row.saved ? ' saved' : ''}" data-row="${i}"><span class="set-index">${i + 1}<small>${row.saved ? 'Записан' : 'Черновик'}</small></span><label><span class="sr-only">${names[currentPerson]}, подход ${i + 1}, вес одной гантели в килограммах</span><input data-field="kg" inputmode="decimal" autocomplete="off" placeholder="${previous[currentPerson][0]}" ${finished ? 'disabled' : ''}></label><label><span class="sr-only">${names[currentPerson]}, подход ${i + 1}, повторения</span><input data-field="reps" inputmode="numeric" autocomplete="off" placeholder="${previous[currentPerson][1]}" ${finished ? 'disabled' : ''}></label><button type="button" data-save="${i}" aria-label="${row.saved ? 'Подход ' + (i + 1) + ' записан' : 'Записать подход ' + (i + 1)}" ${row.saved || finished ? 'disabled' : ''}>${row.saved ? '✓' : '+'}</button></div>`).join('');
  records[currentPerson].forEach((row, i) => ['kg', 'reps'].forEach(field => $(`[data-row="${i}"] [data-field="${field}"]`).value = row[field]));
  updateCounts();
}
function updateCounts() {
  document.querySelectorAll('[data-person]').forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === currentPerson));
    button.querySelector('span').textContent = records[i].filter(row => row.saved).length + '/2';
  });
  const count = records.flat().filter(row => row.saved).length;
  $('#total-recorded').textContent = `Записано ${count} из 6 подходов`;
  $('#record-progress').style.width = `${count / 6 * 100}%`;
  $('#finish').disabled = finished;
  $('#finish').textContent = finished ? 'Завершено в демо' : 'Проверить и завершить';
}
document.querySelectorAll('[data-person]').forEach(button => button.addEventListener('click', () => {
  currentPerson = Number(button.dataset.person);
  renderRows();
  $('#record-status').textContent = `${names[currentPerson]}: ${records[currentPerson].filter(row => row.saved).length} из 2 подходов записано.`;
}));
$('#set-form').addEventListener('submit', event => event.preventDefault());
$('#set-form').addEventListener('input', event => {
  const field = event.target.dataset.field;
  if (!field || finished) return;
  const container = event.target.closest('[data-row]');
  workout.setInput(currentPerson, Number(container.dataset.row), field, event.target.value);
  records = workout.records;
  container.classList.remove('saved');
  container.querySelector('.set-index small').textContent = 'Черновик';
  const save = container.querySelector('[data-save]');
  save.disabled = false;
  save.textContent = '+';
  save.setAttribute('aria-label', `Записать подход ${Number(container.dataset.row) + 1}`);
  event.target.removeAttribute('aria-invalid');
  $('#record-status').textContent = 'Изменение ещё не записано. Нажмите плюс у подхода.';
  updateCounts();
});
$('#set-form').addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button || finished) return;
  const index = Number(button.dataset.save);
  const result = workout.saveSet(currentPerson, index);
  if (!result.ok) {
    const field = result.field;
    const input = $(`[data-row="${index}"] [data-field="${field}"]`);
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    $('#record-status').textContent = field === 'kg' ? 'Введите вес больше нуля, например 8 или 8,5 кг.' : 'Введите целое число повторов больше нуля.';
    return;
  }
  renderRows();
  $('#record-status').textContent = `${names[currentPerson]}: подход ${index + 1} записан в демо.`;
  const next = records[currentPerson].findIndex(record => !record.saved);
  if (next !== -1) $(`[data-row="${next}"] [data-field="kg"]`).focus({preventScroll: true});
  else $('#finish').focus({preventScroll: true});
});
$('#finish').addEventListener('click', event => {
  const missing = workout.missing();
  if (missing.length) {
    openDialog('Есть незаписанные подходы', `<p class="dialog-note">Проверены все участники, не только открытый сейчас.</p><ul>${missing.map(item => `<li>${item.name}: осталось ${item.count} из 2</li>`).join('')}</ul><p class="dialog-note">В этом фрагменте можно завершить только полностью записанную тренировку. Пропуск упражнения и отсутствие участника пока не моделируются.</p>`, event.currentTarget);
    return;
  }
  openDialog('Все подходы записаны', '<p class="dialog-note">3 участника, по 2 подхода. Значения останутся доступны в этом демо до обновления страницы. Списаний и сообщений не будет.</p><div class="dialog-actions"><button class="primary" id="confirm-finish">Завершить в демо</button></div>', event.currentTarget);
  $('#confirm-finish').addEventListener('click', () => {
    if (!workout.finish().ok) return;
    renderRows();
    $('#record-status').textContent = 'Демо завершено. Записи сохранены в памяти страницы.';
    dialogTrigger = $('#reset-record');
    closeDialog();
  });
});
$('#reset-record').addEventListener('click', () => {
  workout.reset(); currentPerson = 0; renderRows();
  $('#record-status').textContent = 'Демонстрационные записи сброшены.';
});
$('#go-record').addEventListener('click', () => {
  $('#record-phone').scrollIntoView({behavior: skipMotion() ? 'instant' : 'smooth', block: 'center'});
  document.querySelector(`[data-person="${currentPerson}"]`).focus({preventScroll: true});
});
$('#join').addEventListener('click', event => {
  const joined = event.currentTarget.dataset.joined === 'true';
  event.currentTarget.dataset.joined = String(!joined);
  event.currentTarget.textContent = joined ? 'Подключиться к тренеру' : 'Повторить приглашение';
  $('#join-note').textContent = joined ? 'Для клиентов бесплатно · Демо' : 'Подключение показано в демо. Аккаунт не создан.';
});
renderRows();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelectorAll('video').forEach(video => video.pause());
});
