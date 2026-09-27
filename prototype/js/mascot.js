/* Static crops of the approved red-panda master sheet (26 September 2026).
   Keep the source artwork intact: coordinates only select an existing pose. */
const Mascot = window.Mascot = (() => {
  const sheet = { width: 1536, height: 1024, file: 'red-panda-dark-headband.png' };
  const poses = {
    welcome: { x: 14, y: 636, width: 220, height: 340 },
    approved: { x: 240, y: 636, width: 202, height: 340 },
    reading: { x: 892, y: 636, width: 202, height: 340 },
    waiting: { x: 664, y: 706, width: 220, height: 270 },
    rest: { x: 98, y: 24, width: 320, height: 380 },
  };

  function render(pose = 'rest', context = 'empty') {
    if (!Object.hasOwn(poses, pose)) pose = 'rest';
    const crop = poses[pose];
    const box = context === 'onboarding' ? 'onboarding-art' : 'client-empty__mascot';
    const art = context === 'onboarding' ? '' : 'client-empty__art';
    const frameStyle = `width:${crop.width / crop.height * 100}%`;
    const imageStyle = `width:${sheet.width / crop.width * 100}%;height:${sheet.height / crop.height * 100}%;left:${-crop.x / crop.width * 100}%;top:${-crop.y / crop.height * 100}%`;
    return `<span class="mascot ${box}" data-mascot="${pose}" aria-hidden="true"><span class="mascot__crop" style="${frameStyle}"><img class="mascot-art ${art}" src="assets/mascot/${sheet.file}" width="${sheet.width}" height="${sheet.height}" style="${imageStyle}" alt="" decoding="async" draggable="false"></span></span>`;
  }

  return { render };
})();
