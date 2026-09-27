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

  function render(pose = 'front', context = 'empty') {
    pose = LEGACY[pose] || pose;
    if (!Object.hasOwn(POSES, pose)) pose = 'front';
    const p = POSES[pose];
    const box = context === 'onboarding' ? 'onboarding-art' : context === 'hero' ? 'panda-hero' : context === 'inline' ? 'panda-inline' : 'client-empty__mascot';
    const z = pose === 'sleep' ? '<span class="panda__z" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>' : '';
    return `<span class="mascot panda ${box}" data-mascot="${pose}" data-motion="${p.motion}" aria-hidden="true">
      <span class="panda__glow"></span>
      <span class="panda__shadow"></span>
      <span class="panda__body"><img class="panda__img" src="${DIR}${pose}.png" width="${p.w}" height="${p.h}" alt="" decoding="async" draggable="false"></span>${z}
    </span>`;
  }

  function face(mood = 'smile', size = 40, cls = '') {
    if (!FACES.includes(mood)) mood = 'smile';
    return `<img class="panda-face${cls ? ' ' + cls : ''}" src="${DIR}face-${mood}.png" width="${size}" height="${Math.round(size * 0.87)}" alt="" aria-hidden="true" decoding="async" draggable="false">`;
  }

  return { render, face, POSES, FACES };
})();
