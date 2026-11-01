# tests/smoke/

Manual check, separate from `node --test` / `./run_tests.sh`.

`dom-smoke.js` actually runs the `<script>` sequence from `index.html` -- including
the real bootstrap (`window.DS` / `window.__ds`, the `data/` -> `sample-data/`
fallback) and real `sample-data/` -- in a minimal homemade DOM stub (no jsdom, no npm
dependencies: `document`/`window`/`sessionStorage`/`requestAnimationFrame`, about a
dozen methods, exactly what the code uses). Catches what pure-function tests don't
see: a forgotten export on `window.DS_APP`, the wrong `<script>` order in
`index.html`, a broken lazy reference (`view-build.js`/`view-table.js` ->
`window.DS_APP.store`/`buildDataset`/`exportXls`/`exportCsv` from `main.js`).

Not run automatically -- the file doesn't match `node --test`'s auto-discovery
pattern (it looks for `*.test.js`/`*-test.js`/`*_test.js`, not any file under
`tests/`). Run with:

```bash
node tests/smoke/dom-smoke.js                  # a regular boot -> Table
node tests/smoke/dom-smoke.js --simulate-crash  # recovery from the crash watchdog
```

`--simulate-crash` pre-seeds `sessionStorage` as if this tab's previous `render()`
never reached a confirmed frame (`renderWatchdog` stayed `true` -- the real symptom
of a browser crashing from an out-of-memory condition, followed by the tab
restarting), plus a "saved" problem preset from the previous attempt. Checks: an
empty preset is applied (not the saved one), the explanation shows up on Data, the
watchdog is cleared, and the saved preset stays untouched in `sessionStorage` (not
deleted, available to load manually).

The stub covers exactly what's needed for one bootstrap pass (loading the manifest
and sources, the JOIN, moving to Table, rendering the grid) -- not a substitute for a
real browser. If a feature touches a DOM API that isn't here (a real `querySelector`,
CSSOM, `getBoundingClientRect`, user clicks on export/column-resize buttons), this
test won't catch it.
