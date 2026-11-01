'use strict';

// The theme registry + the (DOM-dependent, not covered by node:test) code that
// actually applies a theme. A theme is nothing but a CSS file defining the app's
// ~15 custom properties (--bg, --accent, --border, ...) under :root -- styles.css
// itself carries no colors anymore, every rule in it reads a var(--...). Adding a
// theme later is exactly "drop a new themes/*.css file + one entry in THEMES
// below" -- no other code changes.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory());
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // "compose" first -- the default (index.html's initial <link>, store.js's initial
  // state, and findTheme's own fallback below all agree: THEMES[0] is the default),
  // matching joinsheets.github.io's own look out of the box. Also listed first in
  // the settings panel, for the same reason.
  var THEMES = [
    { id: 'compose', name: 'Compose', file: 'themes/compose.css' },
    { id: 'auto', name: 'Auto (system)', file: 'themes/auto.css' },
    { id: 'light', name: 'Light', file: 'themes/light.css' },
    { id: 'dark', name: 'Dark', file: 'themes/dark.css' }
  ];

  var findTheme = function (id) {
    return THEMES.find(function (t) { return t.id === id; }) || THEMES[0];
  };

  // Swaps the <link id="theme-style"> href -- the one DOM touch point. Falls back to
  // THEMES[0] (today, "compose") for an id that doesn't match anything (e.g. a stale
  // localStorage value from before a theme was renamed/removed).
  var applyTheme = function (id) {
    var link = document.getElementById('theme-style');
    if (link) link.href = findTheme(id).file;
  };

  return { THEMES: THEMES, findTheme: findTheme, applyTheme: applyTheme };
});
