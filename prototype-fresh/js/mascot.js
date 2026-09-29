const Mascot = (() => {
  const DIR = 'assets/mascot/';
  const POSES = {
    front: { w: 311, h: 363, motion: 'idle' },
    wave: { w: 221, h: 303, motion: 'wave' },
    thumbs: { w: 200, h: 303, motion: 'nod' },
    jump: { w: 227, h: 303, motion: 'hop' },
    sit: { w: 229, h: 244, motion: 'breathe' },
    clipboard: { w: 199, h: 308, motion: 'idle' },
    stretch: { w: 211, h: 302, motion: 'sway' },
    sleep: { w: 227, h: 148, motion: 'sleep' },
    side: { w: 287, h: 371, motion: 'idle' },
    'three-quarter': { w: 308, h: 376, motion: 'idle' },
  };
  const FACES = ['neutral', 'laugh', 'excited', 'smile', 'calm', 'worried', 'surprised', 'sad'];
  const LEGACY = { welcome: 'wave', approved: 'thumbs', reading: 'clipboard', waiting: 'sit', rest: 'front' };
  const CLIPS = { wave: [60, 35, 207, 254], thumbs: [66, 35, 194, 254], jump: [53, 37, 230, 278] };
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
  const mounted = new WeakMap();

  function render(pose = 'front', context = 'empty', options = {}) {
    const calm = typeof Store !== 'undefined' && Store.preferences.calm();
    if (calm && !['empty', 'onboarding'].includes(context)) return '';
    pose = LEGACY[pose] || pose;
    if (!Object.hasOwn(POSES, pose)) pose = 'front';
    const p = POSES[pose];
    const clip = options.video && CLIPS[pose] && !calm && !reduce.matches;
    if (typeof UI !== 'undefined' && UI.isInstrument() && !['onboarding', 'celebration'].includes(context)) return face(pose === 'sleep' ? 'calm' : 'smile', context === 'hero' ? 32 : 40);
    const box = context === 'onboarding' ? 'onboarding-art' : context === 'hero' ? 'panda-hero' : context === 'inline' ? 'panda-inline' : 'client-empty__mascot';
    const z = pose === 'sleep' ? '<span class="panda__z" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>' : '';
    let body = `<img class="panda__img" src="${DIR}${pose}.png" width="${p.w}" height="${p.h}" alt="" decoding="async" draggable="false">`;
    if (clip) {
      const [x, y, w, h] = CLIPS[pose];
      body = `<span class="panda__clip" style="aspect-ratio:${w}/${h};--clip-width:${320 / w * 100}%;--clip-height:${320 / h * 100}%;--clip-left:${-x / w * 100}%;--clip-top:${-y / h * 100}%"><img class="panda__poster" src="${DIR}video/${pose}-poster.png" width="512" height="512" alt="" draggable="false"></span>`;
    }
    return `<span class="mascot panda ${box}${clip ? ' panda--clip' : ''}" data-mascot="${pose}" data-motion="${calm || reduce.matches || clip ? 'none' : p.motion}"${clip ? ` data-clip="${context}-${pose}"` : ''} aria-hidden="true">
      <span class="panda__glow"></span>
      <span class="panda__shadow"></span>
      <span class="panda__body">${body}</span>${z}
    </span>`;
  }

  function mount(root) {
    if (typeof Store !== 'undefined' && Store.preferences.calm()) document.querySelectorAll('.panda__media').forEach(media => media.dispatchEvent(new Event('error')));
    const previous = mounted.get(root) || new Map();
    const current = new Map();
    root.querySelectorAll('[data-clip]').forEach(node => {
      const key = node.dataset.clip;
      if (previous.has(key)) {
        const saved = previous.get(key);
        node.replaceWith(saved.node);
        const video = saved.node.querySelector('video');
        if (video?.paused && !video.ended) video.play()?.catch(saved.stop);
        current.set(key, saved);
        previous.delete(key);
        return;
      }
      const pose = node.dataset.mascot;
      const stage = node.querySelector('.panda__clip');
      const probe = document.createElement('video');
      const webkit = /AppleWebKit/i.test(navigator.userAgent) && !/(Chrome|Chromium|Edg|OPR)\//i.test(navigator.userAgent);
      const useImage = webkit || /iP(hone|ad|od)/i.test(navigator.userAgent) || !probe.canPlayType('video/webm; codecs="vp9"');
      const media = useImage ? document.createElement('img') : probe;
      let timer;
      let done = false;
      const stop = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!useImage) media.pause();
        media.removeAttribute('src');
        if (!useImage) media.load();
        media.remove();
        node.dataset.playback = 'finished';
      };
      const started = () => {
        if (done) return;
        media.style.visibility = 'visible';
        node.dataset.playback = 'playing';
        clearTimeout(timer);
        timer = setTimeout(stop, useImage ? 5166 : 6500);
      };
      media.className = 'panda__media';
      media.style.visibility = 'hidden';
      media.setAttribute('aria-hidden', 'true');
      media.addEventListener('error', stop, { once: true });
      if (useImage) {
        media.alt = '';
        media.draggable = false;
        media.addEventListener('load', started, { once: true });
      } else {
        media.muted = true;
        media.playsInline = true;
        media.preload = 'auto';
        media.addEventListener('playing', started, { once: true });
        media.addEventListener('ended', stop, { once: true });
      }
      node.dataset.playback = 'loading';
      stage.appendChild(media);
      timer = setTimeout(stop, 8000);
      media.src = `${DIR}video/${pose}.${useImage ? 'webp' : 'webm'}`;
      if (!useImage) media.play()?.catch(stop);
      current.set(key, { node, stop });
    });
    previous.forEach(entry => entry.stop());
    mounted.set(root, current);
  }

  function unmount(root) {
    mounted.get(root)?.forEach(entry => entry.stop());
    mounted.delete(root);
  }

  reduce.addEventListener?.('change', () => {
    if (reduce.matches) document.querySelectorAll('.panda__media').forEach(media => media.dispatchEvent(new Event('error')));
  });

  function face(mood = 'smile', size = 40, cls = '') {
    if (typeof Store !== 'undefined' && Store.preferences.calm()) return Icon.get('clock', { size: Math.min(size, 32) });
    if (!FACES.includes(mood)) mood = 'smile';
    return `<img class="panda-face${cls ? ' ' + cls : ''}" src="${DIR}face-${mood}.png" width="${size}" height="${Math.round(size * 0.87)}" alt="" aria-hidden="true" decoding="async" draggable="false">`;
  }

  return { render, face, mount, unmount, POSES, FACES };
})();
