/* GPT Image four-frame poses. One finite reaction per screen/pose per page session.
   Only the sprite moves; layout, controls, and application state stay untouched. */
const Mascot = window.Mascot = (() => {
  const seen = new Set();
  const running = new Set();
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let generation = 0;
  // Registration measured at the opaque feet in each generated 512×768 cell.
  // Translate the full 1024×1536 sheet; no image resampling or altered source PNGs.
  const frames = {
    welcome: [[0, 0], [-49.414, 0], [0, -50], [-49.414, -50]],
    reading: [[0, 0], [-46.143, 0], [0, -49.935], [-46.143, -49.935]],
    approved: [[0, 0], [-46.094, 0], [0, -48.893], [-46.143, -48.893]],
  };
  function stop() {
    generation++;
    running.forEach(animation => animation.cancel());
    running.clear();
  }
  preference.addEventListener('change', () => { if (preference.matches) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  document.addEventListener('keydown', stop, { capture: true });

  function render(pose = 'rest', context = 'empty') {
    if (!Object.hasOwn(frames, pose)) pose = 'rest';
    const sprite = pose !== 'rest';
    const box = context === 'onboarding' ? 'onboarding-art' : 'client-empty__mascot';
    const art = context === 'onboarding' ? '' : 'client-empty__art';
    return `<span class="mascot ${box}${sprite ? ' mascot--sprite' : ''}" data-mascot="${pose}" aria-hidden="true"><img class="mascot-art ${art}" src="assets/mascot/lynx${sprite ? '-' + pose + '-sheet' : ''}.png" width="1024" height="1536" alt="" decoding="async" draggable="false"></span>`;
  }

  function sync(root, { key = '', still = false, replay = false } = {}) {
    stop();
    const current = generation;
    root.querySelectorAll('.mascot--sprite').forEach(node => {
      const pose = node.dataset.mascot;
      const id = `${key}:${pose}`;
      if (!frames[pose]) return;
      const played = seen.has(id);
      seen.add(id);
      if (still || preference.matches || document.hidden || (played && !replay)) return;
      const img = node.querySelector('img');
      img.decode().then(() => {
        if (!node.isConnected || current !== generation || preference.matches || document.hidden) return;
        // Held cels: no interpolation across neighboring characters in the sheet.
        const order = [0, 1, 2, 1, 3, 0];
        const offsets = [0, .22, .44, .54, .76, 1];
        const animation = img.animate(order.map((index, i) => ({
          transform: `translate(${frames[pose][index][0]}%, ${frames[pose][index][1]}%)`,
          offset: offsets[i], easing: 'steps(1, end)',
        })), { duration: 1200, iterations: 1 });
        running.add(animation);
        animation.finished.then(() => running.delete(animation), () => running.delete(animation));
      }).catch(() => { /* Static image/fallback; decorative failure never blocks a task. */ });
    });
  }
  return { render, sync, stop };
})();
