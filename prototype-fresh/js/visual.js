/* Viewer-only appearance selection. Runs before CSS to avoid a theme flash.
   The query string is the source of truth; workout data and routing are untouched. */
(() => {
  const root = document.documentElement;
  const apply = () => {
    const firm = new URLSearchParams(location.search).get('visual') === 'firm';
    if (firm) root.dataset.visual = 'firm';
    else root.removeAttribute('data-visual');
    document.querySelectorAll('[data-visual-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.visualChoice === 'firm') === firm));
    });
  };
  apply();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-visual-choice]');
    if (!button) return;
    const url = new URL(location.href);
    if (button.dataset.visualChoice === 'firm') url.searchParams.set('visual', 'firm');
    else url.searchParams.delete('visual');
    history.replaceState(history.state, '', url);
    apply();
  });
  window.addEventListener('popstate', apply);
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
