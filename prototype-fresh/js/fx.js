const Fx = window.Fx = (() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const COLORS = ['#e0561b', '#ff7a1f', '#ffb23d', '#5b3a29', '#1f9d55', '#f6d9b8'];
  const BIG = { 'first.accept': 'jump', 'log.finish': 'jump' };
  const SMALL = new Set(['session.confirm', 'rs.accept', 'ns.save', 'pay.save', 'invite.connected', 'attendance.charge', 'attendance.markOnly', 'cres.send', 'voice.commit']);

  function celebrate(pose = 'jump') {
    if (reduce.matches) return;
    const device = document.getElementById('device');
    if (!device) return;
    device.querySelector('.fx-celebrate')?.remove();
    const layer = document.createElement('div');
    layer.className = 'fx-celebrate';
    layer.setAttribute('aria-hidden', 'true');
    const bits = Array.from({ length: 34 }, (_, i) => {
      const angle = (Math.random() * 140 + 200) * Math.PI / 180;
      const dist = 140 + Math.random() * 180;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const color = COLORS[i % COLORS.length];
      const shape = i % 3 === 0 ? 'round' : i % 3 === 1 ? 'strip' : 'square';
      return `<i class="fx-bit fx-bit--${shape}" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${color};--d:${Math.round(Math.random() * 120)}ms"></i>`;
    }).join('');
    layer.innerHTML = `<div class="fx-burst">${bits}</div><div class="fx-panda">${typeof Mascot !== 'undefined' ? Mascot.render(pose, 'inline') : ''}</div>`;
    device.appendChild(layer);
    setTimeout(() => layer.remove(), 2200);
  }

  function sparkle(el) {
    if (reduce.matches || !el) return;
    const rect = el.getBoundingClientRect();
    const device = document.getElementById('device');
    const base = device.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'fx-sparkle';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = `${rect.left - base.left + rect.width / 2}px`;
    layer.style.top = `${rect.top - base.top + rect.height / 2}px`;
    layer.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const a = i / 12 * Math.PI * 2;
      return `<i style="--dx:${Math.cos(a) * 46}px;--dy:${Math.sin(a) * 46}px;--c:${COLORS[i % 4]}"></i>`;
    }).join('');
    device.appendChild(layer);
    setTimeout(() => layer.remove(), 800);
  }

  function afterAction(name, before, after) {
    const freshToast = after.toast && after.toast.at !== before.toast?.at && !after.toast.kind;
    if (name === 'log.finish' && after.logging.finished && !before.logging.finished) return celebrate('jump');
    if (name === 'first.accept') return celebrate(BIG[name]);
    if (SMALL.has(name) && freshToast) return celebrate('thumbs');
    if (name === 'setlog.save' || name === 'setlog.quick') sparkle(document.activeElement);
  }

  document.addEventListener('click', (event) => {
    const panda = event.target.closest('.panda');
    if (!panda || reduce.matches) return;
    panda.classList.remove('is-poked');
    void panda.offsetWidth;
    panda.classList.add('is-poked');
    panda.addEventListener('animationend', () => panda.classList.remove('is-poked'), { once: true });
  });

  return { celebrate, sparkle, afterAction };
})();
