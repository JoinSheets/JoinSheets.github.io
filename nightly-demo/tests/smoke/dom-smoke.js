'use strict';

// A smoke test for the app's bootstrap: actually runs the <script> sequence from
// index.html in a minimal homemade DOM stub (no jsdom, no npm dependencies), with
// real sample-data/. Catches module-wiring errors (a forgotten export, the wrong
// <script> order, a broken lazy reference to window.DS_APP) that the tests in
// tests/*.test.js don't see -- those only check pure functions, with no
// document/window.
//
// Not run automatically by `node --test` / ./run_tests.sh -- the file lives in
// tests/smoke/ and doesn't match the auto-discovery pattern (checked: it looks for
// *.test.js / *-test.js / *_test.js, not "any file under tests/").
// Run manually with: node tests/smoke/dom-smoke.js
//
// The stub covers only what's needed for one bootstrap pass -- don't treat it as a
// substitute for a real browser. If you add functionality that touches a DOM API
// that isn't here (querySelector with a real match, CSSOM, getBoundingClientRect,
// etc.), this test won't catch it.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');

function makeNode(tag) {
  const node = {
    tagName: tag,
    attrs: {},
    children: [],
    parentNode: null,
    dataset: {},
    nodeType: 1,
    _listeners: {},
    className: '',
    innerHTML: '',
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') idRegistry[v] = this;
    },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(evt, fn) { this._listeners[evt] = fn; },
    removeEventListener() {},
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) this.children.splice(i, 1);
      return child;
    },
    replaceChild(newChild, oldChild) {
      const i = this.children.indexOf(oldChild);
      if (i !== -1) { this.children[i] = newChild; newChild.parentNode = this; }
      return oldChild;
    },
    get firstChild() { return this.children[0] || null; },
    querySelector() { return null; },   // not needed outside drag-resize / applyColFilter (not invoked here)
    querySelectorAll() { return []; },
    classList: null
  };
  node.classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(c) { this._set.delete(c); },
    toggle(c, force) {
      const on = force === undefined ? !this._set.has(c) : !!force;
      if (on) this._set.add(c); else this._set.delete(c);
      return on;
    },
    contains(c) { return this._set.has(c); }
  };
  return node;
}

const idRegistry = {};

function loadFileSync(relPath) {
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

const context = {};
context.window = context;
context.console = console;
context.Set = Set; context.Map = Map; context.Promise = Promise;
context.Blob = function (parts, opts) { this.parts = parts; this.opts = opts; };
context.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
context.FileReader = function () {};
context.alert = (msg) => { console.log('[alert]', msg); };
context.setTimeout = setTimeout;
context.navigator = {};
// window.addEventListener('storage', ...) -- main.js's cross-tab theme sync. Never
// actually fires here (nothing in this stub emulates another tab writing
// localStorage), just needs to exist so main.js's setup call doesn't throw.
context.addEventListener = () => {};
context.removeEventListener = () => {};

const localStorageStore = {};
context.localStorage = {
  getItem: (k) => (k in localStorageStore ? localStorageStore[k] : null),
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; }
};

// sessionStorage -- effects.js::storage reads/writes this one specifically (per-tab,
// not localStorage). A separate store, the same interface.
const sessionStorageStore = {};
context.sessionStorage = {
  getItem: (k) => (k in sessionStorageStore ? sessionStorageStore[k] : null),
  setItem: (k, v) => { sessionStorageStore[k] = String(v); },
  removeItem: (k) => { delete sessionStorageStore[k]; }
};

// --simulate-crash: simulates a tab whose previous render() never reached a
// confirmed frame (renderWatchdog stayed true) -- the same scenario as a real
// browser crash from running out of memory, followed by the tab restarting. Also
// seeds a "saved preset" from the previous attempt, to separately verify it isn't
// overwritten during recovery.
const SIMULATE_CRASH = process.argv.includes('--simulate-crash');
const POISONED_PRESET = { name: 'big', query: { as_of: null, sources: { CRM: { labels: null } } },
  view: { joins: [], conditions: [], entities: [], column_widths: {} } };
if (SIMULATE_CRASH) {
  sessionStorageStore['joinsheets:renderWatchdog'] = 'true';
  sessionStorageStore['joinsheets:preset'] = JSON.stringify(POISONED_PRESET);
}

// main.js::render calls requestAnimationFrame (twice, nested) around the crash-
// protection watchdog flag -- there's no real layout/paint here, so just run the
// callback synchronously right away.
context.requestAnimationFrame = (cb) => { cb(); return 0; };

const appDiv = makeNode('div');
appDiv.setAttribute('id', 'app');
const bodyEl = makeNode('body');
const headEl = makeNode('head');
bodyEl.appendChild(appDiv);

context.document = {
  createElement(tag) { return makeNode(tag); },
  createTextNode(text) { return { nodeType: 3, text: text }; },
  getElementById(id) { return idRegistry[id] || null; },
  // view-common.js::appVersion looks up <meta name="version"> -- this stub
  // never parses a real index.html (no actual meta tags ever exist here), so
  // always null; appVersion already falls back to "(unknown)" for that.
  querySelector() { return null; },
  // view-table.js::attachDocCloseListener attaches ONE document-level click
  // listener (closes the quick panel on a click outside it) -- the stub just needs
  // to accept the call, this smoke test doesn't check it actually firing (no real
  // clicks here).
  addEventListener() {},
  removeEventListener() {},
  head: headEl,
  body: bodyEl
};

// appendChild on a <script> with .src (an IDL property -- the real code sets it
// this way, NOT via setAttribute) synchronously "fetches" and runs the file in the
// same context, then calls onload/onerror. This is how index.html loads the
// manifest/sources, including the real data/ -> sample-data/ fallback (simply via
// ENOENT).
function wireScriptLoading(node) {
  const origAppend = node.appendChild.bind(node);
  node.appendChild = function (child) {
    const r = origAppend(child);
    if (child.tagName === 'script' && child.src) {
      const src = loadFileSync(child.src);
      if (src == null) {
        if (child.onerror) child.onerror();
      } else {
        vm.runInContext(src, vmContext, { filename: child.src });
        if (child.onload) child.onload();
      }
    }
    return r;
  };
}

process.on('unhandledRejection', (err) => {
  console.error('FAIL: unhandled rejection during bootstrap:', err);
  process.exitCode = 1;
});

const vmContext = vm.createContext(context);
wireScriptLoading(context.document.head);
wireScriptLoading(context.document.body);

function run(relPath) {
  const src = loadFileSync(relPath);
  if (src == null) {
    // import/ -- an optional git submodule (JoinSheetsImport), not required in a
    // "lite" checkout (without `git submodule update --init`); its absence is not
    // an error, same as in a real browser (a 404 on a <script src> just doesn't
    // execute that tag, the other tags keep loading in order as usual).
    if (relPath.indexOf('import/') === 0) return;
    throw new Error('missing ' + relPath);
  }
  vm.runInContext(src, vmContext, { filename: relPath });
}

// 1) the inline bootstrap script from index.html (window.DS / window.__ds),
//    extracted from the file itself -- so it can't drift from the real index.html.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const scriptTags = [...html.matchAll(/<script(?:\s+src="([^"]+)")?>([\s\S]*?)<\/script>/g)];
const inlineScript = scriptTags.find((m) => !m[1] && m[2].trim());
assert.ok(inlineScript, 'inline bootstrap <script> not found in index.html');
vm.runInContext(inlineScript[2], vmContext, { filename: 'index.html#inline' });

// 2) external <script src> tags, in index.html's order -- that order is exactly what we're checking
const srcScripts = scriptTags.filter((m) => m[1]).map((m) => m[1]);
console.log('script order:', srcScripts.join(', '));
srcScripts.forEach(run);

// 3) let the microtasks (the bootstrap's Promise chain: manifest -> preset -> buildDataset) run to completion
setTimeout(() => {
  try {
    const DS_APP = context.DS_APP;
    const expectedExports = [
      'el', 'joinSources', 'matchCondition', 'parseNum', 'parseDate', 'toCsv',
      'createStore', 'reducer', 'normalizePreset', 'opSelect', 'viewNav', 'viewBuild',
      'viewTableShell', 'renderGrid', 'store', 'buildDataset', 'exportXls', 'exportCsv',
      'renderSettingsPanel', 'applyTheme', 'THEMES', 'prefs'
    ];
    const missing = expectedExports.filter((k) => typeof DS_APP[k] === 'undefined');
    assert.deepEqual(missing, [], 'missing exports on window.DS_APP: ' + missing.join(', '));

    const state = DS_APP.store.getState();

    if (SIMULATE_CRASH) {
      assert.equal(state.route, 'build', 'expected the Data screen after recovering from a crash');
      assert.ok(state.buildError && /ran out of memory/.test(state.buildError),
        'expected an explanation about the crash, got: ' + state.buildError);
      // not assert.deepEqual(..., {}) -- state.preset was created inside the vm
      // context, its Object.prototype is from a different "realm" than {} in this
      // file; deepStrictEqual (node:assert/strict) also compares the prototype, so
      // a cross-realm literal won't match structurally, even with the same shape
      assert.equal(Object.keys(state.preset.query.sources).length, 0,
        'expected an empty preset after a crash, not the saved one: ' + JSON.stringify(state.preset.query.sources));
      assert.equal(sessionStorageStore['joinsheets:renderWatchdog'], 'false', 'the watchdog should be cleared');
      assert.deepEqual(JSON.parse(sessionStorageStore['joinsheets:preset']), POISONED_PRESET,
        'the saved (poisoned) preset should not be overwritten during recovery');
      console.log('OK: the watchdog found an unfinished render -> an empty preset, the saved one untouched');
      console.log('SMOKE TEST (--simulate-crash) PASSED');
    } else {
      assert.equal(state.buildError, null, 'buildError after auto-building the default preset: ' + state.buildError);
      assert.equal(state.route, 'table', 'expected to land on Table after boot');
      assert.ok(state.dataset && state.dataset.rows.length > 0, 'the dataset is empty after boot');

      const gridNode = idRegistry['grid'];
      assert.ok(gridNode && gridNode.children.length > 0, 'the grid did not render into #grid');

      console.log('OK: bootstrap -> manifest -> preset -> join(CRM,ERP) -> route=table -> renderGrid');
      console.log('    dataset:', state.dataset.rows.length, 'rows,', state.dataset.columns.length, 'columns');
      console.log('SMOKE TEST PASSED');
    }
  } catch (err) {
    console.error('SMOKE TEST FAILED:', err.message);
    process.exitCode = 1;
  }
}, 50);
