+++
title = "Architecture"
weight = 1
description = "Zero-build, vanilla JS, a Redux-style store, a lazy data format."
+++

## Functional requirements

- Runs entirely client-side, including from `file://` — no server, no
  install, no build step.
- Loads data as plain `.js` files injected via `<script>` tags (not
  `fetch()`, which `file://` blocks), writing into a shared `window.DS`
  namespace.

## Key decisions

- **No bundler, no framework.** Each module is a small UMD-style IIFE
  attaching to `window.DS_APP` in the browser and exporting via
  `module.exports` under Node for tests — see `util.js`'s `el()` hyperscript
  helper for the lowest layer.
- **A single store + reducer** (`store.js`), split into one reducer per
  action-namespace domain (`preset/*`, `group/*`, `table/*`, ...), dispatched
  through a small pub/sub (`createStore`).
- **A lazy columnar source format**: each source file defines one function
  per field, returning that field's values for every row positionally — V8
  never materializes a field's function body unless it's actually called, so
  unused fields cost nothing to load.
- **Formulas, not `eval`.** Computed fields use a small hand-written
  tokenizer/parser/evaluator (`formula.js`), deliberately not `eval`/`new
  Function`, since presets are plain JSON files people exchange.

## Testing

Pure-function modules (`dataset.js`, `entities.js`, `formula.js`, `export.js`,
`store.js`) are covered by `node:test` unit tests. A separate smoke test
(`tests/smoke/dom-smoke.js`) runs the real `<script>` bootstrap sequence
against a minimal hand-rolled DOM stub, to catch wiring mistakes the unit
tests can't see (a missing export, the wrong script order).
