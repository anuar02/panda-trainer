/* ============================================================================
   icons.js — stroke icon set
   Adapted from the gymGO reference (`gymGO (2)/src/src_ui.jsx` → `I`).
   Rules from the design system: 2px stroke, round caps/joins, 24×24 grid,
   no icon font, no emoji. Icons return SVG strings so they can be composed
   with template literals.
   ========================================================================== */

const Icon = (() => {
  const wrap = (paths, { size = 24, sw = 2, fill = 'none', style = '' } = {}) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor"
      stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style ? ` style="${style}"` : ''}>${paths}</svg>`;

  const d = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5h12V10"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>',
    calendarPlus: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3M12 12.5v5M9.5 15h5"/>',
    users: '<circle cx="9" cy="8.4" r="3.2"/><path d="M3.5 19.5c1-3.2 3.2-4.6 5.5-4.6s4.5 1.4 5.5 4.6"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.1M17.5 19.5c-.3-1.6-.9-2.9-1.7-3.8 2 .2 3.7 1.5 4.7 3.8"/>',
    user: '<circle cx="12" cy="8.2" r="3.4"/><path d="M5.5 20c1.2-3.6 3.8-5 6.5-5s5.3 1.4 6.5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    chevD: '<path d="M5 9l7 7 7-7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.2 4.5L19 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
    play: '<path d="M7 4.5 19 12 7 19.5z"/>',
    pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.6-3.6"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0"/>',
    edit: '<path d="M14.5 5.5l4 4M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/>',
    trash: '<path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l1 12.5A2 2 0 0 0 9.5 21h5a2 2 0 0 0 2-1.5L17.5 7"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
    share: '<path d="M12 15V3.5M8.5 7 12 3.5 15.5 7"/><path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>',
    send: '<path d="M21 3 3 10.5l7 3 3 7L21 3Z"/><path d="M10 13.5 21 3"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16.5 14.5h1.5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9.5h18M6.5 14h5"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5v1a3 3 0 0 0 3 3M16 5h3v1a3 3 0 0 1-3 3M10 13.5h4M12 12v2M9 20h6M10 17.5h4v2.5h-4z"/>',
    trend: '<path d="M4 15l4.5-5 3.5 3 6-7"/><path d="M18 6h-3.2M18 6v3.2"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.4h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8h.01"/>',
    wifioff: '<path d="M4 4l16 16"/><path d="M5 10.5a13 13 0 0 1 3.9-2.5M12 5.5c3.6 0 6.9 1.4 9.3 3.7"/><path d="M8.6 14a8 8 0 0 1 2.2-1.2M12 10c2.4 0 4.6.9 6.3 2.4"/><path d="M12 18.2h.01"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.5h-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4"/>',
    flame: '<path d="M12 3c.6 3-1.8 4.2-2.8 5.6C7.8 10.3 7 12 7 14a5 5 0 0 0 10 0c0-1.8-.8-3.2-1.6-4.4-.7 1-1.6 1.7-2.4 1.2C14 11 14.6 9 13.7 7 13.2 5.7 12 4.5 12 3Z"/>',
    sparkles: '<path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z"/><path d="M18.5 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
    pin: '<path d="M12 21c4-4.5 6-7.6 6-10.5A6 6 0 0 0 6 10.5C6 13.4 8 16.5 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/>',
    grip: '<path d="M9 7h.01M15 7h.01M9 12h.01M15 12h.01M9 17h.01M15 17h.01"/>',
    book: '<path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2V5.5Z"/><path d="M4 20.5a2 2 0 0 1 2-2h13"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
    more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    swap: '<path d="M7 5 4 8l3 3"/><path d="M4 8h11a4 4 0 0 1 0 8h-1"/><path d="M17 19l3-3-3-3"/><path d="M20 16H9"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
    download: '<path d="M12 3.5V15M8.5 11.5 12 15l3.5-3.5"/><path d="M5 19.5h14"/>',
    scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>',
    qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.5"/><path d="M14.5 14.5h3v3M20.5 14.5v3M14.5 20.5h6"/>',
    wifi: '<path d="M5 10.5a13 13 0 0 1 14 0M8.6 14a8 8 0 0 1 6.8 0M12 18.2h.01"/>',
    battery: '<rect x="2.5" y="8" width="17" height="8" rx="2.5"/><path d="M21.5 11v2"/><rect x="4.5" y="10" width="11" height="4" rx="1" fill="currentColor" stroke="none"/>',
  };

  return {
    /** Render an icon by name. */
    get(name, opts) {
      const p = d[name];
      if (!p) return '';
      return wrap(p, opts);
    },
    has(name) { return Boolean(d[name]); },
    names: Object.keys(d),
    /** Full-body flame mascot «Искра» — ember only, never in the trainer core UI. */
    flameMascot(size = 64) {
      const g = 'fm' + size;
      return `<svg width="${size}" height="${size * 1.18}" viewBox="0 0 120 142" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="${g}" x1="60" y1="8" x2="60" y2="138" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="var(--ember-1)"/><stop offset="0.45" stop-color="var(--ember-2)"/><stop offset="1" stop-color="var(--ember-3)"/>
          </linearGradient>
        </defs>
        <path d="M60 8 C 66 36 90 44 90 80 C 90 108 78 132 60 132 C 42 132 30 108 30 80 C 30 60 42 54 49 42 C 53 54 62 54 64 46 C 68 34 62 20 60 8 Z" fill="url(#${g})"/>
        <ellipse cx="52" cy="96" rx="5.4" ry="7" fill="#3a1402"/>
        <ellipse cx="68" cy="96" rx="5.4" ry="7" fill="#3a1402"/>
        <circle cx="53.6" cy="93.5" r="1.8" fill="#fff"/>
        <circle cx="69.6" cy="93.5" r="1.8" fill="#fff"/>
        <path d="M55 108 Q60 113 65 108" stroke="#3a1402" stroke-width="3" stroke-linecap="round" fill="none"/>
      </svg>`;
    },
  };
})();
