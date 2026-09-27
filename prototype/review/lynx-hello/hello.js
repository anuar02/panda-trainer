/* Isolated motion study: no app state, storage, or production Mascot changes. */
(() => {
  'use strict';
  const duration = 2600;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stages = [...document.querySelectorAll('[data-hello]')];
  const seek = document.querySelector('#seek');
  const time = document.querySelector('#time');
  const status = document.querySelector('#status');
  const pause = document.querySelector('#pause');
  const animations = [];
  let raf = 0;
  let generation = 0;
  const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-in-out').trim();
  const keys = (entries) => entries.map(([offset, transform]) => ({offset, transform, easing:ease}));

  for (const stage of stages) {
    stage.innerHTML = '<div class="rig"><div class="piece arm"></div><div class="piece body"></div><div class="head"><div class="piece ear ear--left"></div><div class="piece ear ear--right"></div><div class="piece face"></div><div class="piece face--blink"></div></div></div>';
  }

  function build() {
    if (animations.length) return;
    for (const stage of stages) {
      const add = (selector, frames) => {
        const animation = stage.querySelector(selector).animate(frames, {duration, fill:'both', iterations:1});
        animation.pause();
        animation.currentTime = 0;
        animations.push(animation);
      };
      add('.rig', keys([[0,'none'],[.09,'translateY(1%) scale(1.018,.975) rotate(-1deg)'],[.24,'translateY(-.7%) scale(.99,1.015) rotate(3deg)'],[.45,'translateY(-.4%) rotate(2deg)'],[.68,'translateY(-.4%) rotate(2deg)'],[.83,'translateY(.3%) rotate(-.8deg)'],[1,'none']]));
      add('.arm', keys([[0,'rotate(-105deg)'],[.1,'rotate(-115deg)'],[.28,'rotate(10deg)'],[.39,'rotate(-9deg)'],[.5,'rotate(14deg)'],[.61,'rotate(-8deg)'],[.71,'rotate(8deg)'],[.9,'rotate(-110deg)'],[1,'rotate(-105deg)']]));
      add('.head', keys([[0,'none'],[.12,'rotate(2deg) translateY(1%)'],[.3,'rotate(-6deg) translateY(-1%)'],[.68,'rotate(-4deg)'],[.88,'rotate(2deg)'],[1,'none']]));
      add('.ear--left', keys([[0,'none'],[.16,'rotate(-2deg)'],[.33,'rotate(3deg)'],[.45,'none'],[.78,'rotate(-2deg)'],[.94,'rotate(1deg)'],[1,'none']]));
      add('.ear--right', keys([[0,'none'],[.18,'rotate(2deg)'],[.35,'rotate(-3deg)'],[.47,'none'],[.8,'rotate(2deg)'],[.95,'rotate(-1deg)'],[1,'none']]));
      add('.face--blink', [{opacity:0,offset:0},{opacity:0,offset:.305},{opacity:1,offset:.325},{opacity:1,offset:.355},{opacity:0,offset:.38},{opacity:0,offset:.76},{opacity:1,offset:.78},{opacity:1,offset:.805},{opacity:0,offset:.83},{opacity:0,offset:1}]);
    }
  }

  function display(value) {
    seek.value = String(Math.round(value));
    time.value = `${(value / 1000).toFixed(2).replace('.', ',')} с`;
  }
  function stop(reset = false) {
    generation++;
    cancelAnimationFrame(raf);
    animations.forEach(a => { a.pause(); if (reset) a.currentTime = 0; });
    if (reset) display(0);
    pause.textContent = 'Продолжить';
  }
  function tick() {
    const value = Math.min(duration, Number(animations[0]?.currentTime || 0));
    display(value);
    if (animations[0]?.playState === 'running') raf = requestAnimationFrame(tick);
    else { pause.textContent = 'Продолжить'; status.textContent = 'Готово · повтор — по нажатию'; }
  }
  async function play(rate = 1, resume = false) {
    stop();
    if (reduced.matches) { stop(true); status.textContent = 'Уменьшение движения включено · статичная поза'; return; }
    const token = generation;
    const asset = new Image();
    asset.src = '../../assets/mascot/lynx-hello-parts-v1.png';
    try { await asset.decode(); } catch { status.textContent = 'Не удалось загрузить рисунок'; return; }
    if (token !== generation || document.hidden || reduced.matches) return;
    build();
    animations.forEach(a => { a.playbackRate = rate; if (!resume || Number(a.currentTime) >= duration) a.currentTime = 0; a.play(); });
    pause.textContent = 'Пауза';
    status.textContent = rate === .5 ? 'Замедленный просмотр · 5,2 секунды' : 'Один цикл · 2,6 секунды';
    tick();
  }
  function seekTo(value) {
    stop();
    if (reduced.matches) { display(0); return; }
    build();
    animations.forEach(a => { a.currentTime = value; });
    display(value);
    status.textContent = 'Просмотр выбранного момента';
  }
  document.querySelector('#play').addEventListener('click', e => { if (e.detail) play(); else seekTo(880); });
  document.querySelector('#slow').addEventListener('click', e => { if (e.detail) play(.5); else seekTo(880); });
  document.querySelector('#context-play').addEventListener('click', e => { if (e.detail) play(); else seekTo(880); });
  pause.addEventListener('click', e => {
    if (!e.detail) return;
    if (animations[0]?.playState === 'running') {stop();status.textContent='На паузе';}
    else play(animations[0]?.playbackRate || 1, true);
  });
  seek.addEventListener('input', () => seekTo(Number(seek.value)));
  document.addEventListener('keydown', e => {
    stop();
    if (e.target !== seek) status.textContent = 'Статичный просмотр с клавиатуры · ползунок выбирает кадр';
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) {stop(true);status.textContent='Остановлено при уходе со страницы';} });
  reduced.addEventListener('change', () => {stop(true);status.textContent = reduced.matches ? 'Уменьшение движения включено · статичная поза' : 'Повтор — по нажатию';});
  play();
})();
