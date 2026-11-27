/* Gündüz / gece teması: Otomatik (cihaz ayarı) → Gündüz → Gece. Tercih bu cihazda saklanır. */
(function () {
  'use strict';
  const KEY = 'eslestirme-theme', MODES = ['auto', 'light', 'dark'];
  const LABEL = { auto: 'Tema: otomatik (cihaz ayarı)', light: 'Tema: gündüz', dark: 'Tema: gece' };
  const ICON = { auto: '◐', light: '☀', dark: '☾' };
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const get = () => { try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'auto'; } catch (e) { return 'auto'; } };
  function apply() {
    const m = get(), dark = m === 'dark' || (m === 'auto' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', dark ? '#0b2a18' : '#14532d');
    const b = document.getElementById('themeBtn');
    if (b) { b.textContent = ICON[m]; b.title = LABEL[m]; b.setAttribute('aria-label', LABEL[m]); b.dataset.tip = LABEL[m]; }
  }
  window.EsleTheme = { apply, get };
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    const b = document.getElementById('themeBtn');
    if (b) b.addEventListener('click', () => {
      const n = MODES[(MODES.indexOf(get()) + 1) % MODES.length];
      try { localStorage.setItem(KEY, n); } catch (e) { /* yok */ }
      apply();
      if (window.App && window.App.toast) window.App.toast(LABEL[n]);
    });
  });
})();
