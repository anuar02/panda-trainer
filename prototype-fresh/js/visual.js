/* Viewer-only appearance selection. Runs before CSS to avoid a theme flash.
   The query string is the source of truth; workout data and routing are untouched. */
(() => {
  const root = document.documentElement;
  const apply = () => {
    const params = new URLSearchParams(location.search);
    const visual = params.get('visual');
    if (['firm', 'instrument'].includes(visual)) root.dataset.visual = visual;
    else root.removeAttribute('data-visual');
    root.toggleAttribute('data-present', params.has('present'));
    let choice = params.get('theme');
    if (!['dark', 'light', 'auto'].includes(choice)) {
      try { choice = localStorage.getItem('trainer.instrument.theme'); } catch (_) { }
    }
    root.dataset.themeChoice = ['dark', 'light'].includes(choice) ? choice : 'auto';
    root.dataset.theme = root.dataset.screen === 't-session' ? 'dark' : root.dataset.themeChoice === 'auto' ? (root.dataset.role === 'client' ? 'light' : 'dark') : root.dataset.themeChoice;
    document.querySelectorAll('[data-visual-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.visualChoice === (visual || 'current')));
    });
  };
  window.Appearance = { sync: apply };
  apply();
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-visual-choice], button[data-theme-choice]');
    if (!button) return;
    const url = new URL(location.href);
    if (button.dataset.themeChoice) {
      url.searchParams.set('theme', button.dataset.themeChoice);
      try { localStorage.setItem('trainer.instrument.theme', button.dataset.themeChoice); } catch (_) { }
    } else if (['firm', 'instrument'].includes(button.dataset.visualChoice)) url.searchParams.set('visual', button.dataset.visualChoice);
    else url.searchParams.delete('visual');
    history.replaceState(history.state, '', url);
    apply();
    document.dispatchEvent(new Event('appearancechange'));
  });
  window.addEventListener('popstate', () => { apply(); document.dispatchEvent(new Event('appearancechange')); });
})();
(() => {
  const root = document.documentElement;
  const PALETTES = ['panda', 'teal', 'ink'];
  const apply = () => {
    const value = new URLSearchParams(location.search).get('palette');
    const palette = PALETTES.includes(value) ? value : 'ink';
    if (palette === 'panda') root.removeAttribute('data-palette');
    else root.dataset.palette = palette;
    document.querySelectorAll('[data-palette-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.paletteChoice === palette));
    });
  };
  apply();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-palette-choice]');
    if (!button) return;
    const url = new URL(location.href);
    if (button.dataset.paletteChoice === 'ink') url.searchParams.delete('palette');
    else url.searchParams.set('palette', button.dataset.paletteChoice);
    history.replaceState(history.state, '', url);
    apply();
  });
  window.addEventListener('popstate', apply);
})();
