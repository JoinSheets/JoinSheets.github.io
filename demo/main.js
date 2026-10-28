'use strict';

// The assembly point: buildDataset (loads sources, joins, resolves entities), export
// triggers, creating the store and the render loop, bootstrap. Browser-only -- uses
// document/window directly, not needed and not exported under Node. Must load last
// (after every other <script>).
//
// window.DS_APP.store / .buildDataset / .exportXls / .exportCsv are published
// explicitly -- view-build.js/view-table.js hold lazy back-references to them, and
// they themselves load before main.js.
(function () {

  var App = window.DS_APP;
  var el = App.el, clear = App.clear, fmtDate = App.fmtDate;
  var selectedNames = App.selectedNames, manifestSource = App.manifestSource,
      createStore = App.createStore, reducer = App.reducer, initialState = App.initialState,
      basePreset = App.basePreset, normalizePreset = App.normalizePreset,
      mergeManifests = App.mergeManifests;
  var loadSourceScript = App.loadSourceScript, download = App.download, storage = App.storage,
      loadGlobal = App.loadGlobal, loadManifest = App.loadManifest,
      loadManifestFragments = App.loadManifestFragments;
  var joinSources = App.joinSources, applyConditions = App.applyConditions,
      visibleColumns = App.visibleColumns, applyAdvanced = App.applyAdvanced,
      applySort = App.applySort;
  var implicitEntities = App.implicitEntities, resolveEntities = App.resolveEntities,
      parseTypes = App.parseTypes, colWidthPx = App.colWidthPx, columnTypesFor = App.columnTypesFor;
  var toCsv = App.toCsv, toXlsWorkbook = App.toXlsWorkbook, exportFilename = App.exportFilename;
  var viewNav = App.viewNav, viewFooter = App.viewFooter, viewBuild = App.viewBuild,
      viewEntities = App.viewEntities, viewTableShell = App.viewTableShell,
      renderAdvFilter = App.renderAdvFilter, renderExportPanel = App.renderExportPanel,
      renderGrid = App.renderGrid;

  // ---------------------------------------------------------------------------
  // The dataset-build effect (loads sources, joins)
  // ---------------------------------------------------------------------------

  var buildDataset = function (store) {
    // Crash watchdog: set here, before any heavy work (loading sources,
    // JOIN/resolveEntities/parseTypes on a potentially huge dataset -- memory can run
    // out even before any DOM render) and before the first dispatch, so it arms even
    // the "nothing selected" path (cleared a bit further down by render() itself, see
    // there). Cleared only after Table confirms it rendered (render(), below) or
    // after an explicit build error -- both are terminal branches for this attempt.
    storage.set('renderWatchdog', true);
    var state = store.getState();
    var names = selectedNames(state.preset);
    if (!names.length) {
      store.dispatch({ type: 'build/error', message: 'No source selected' });
      return;
    }
    if (!state.dataDir) {
      store.dispatch({ type: 'build/error', message: 'No data directory (data/ or sample-data/)' });
      return;
    }
    store.dispatch({ type: 'build/start' });

    Promise.allSettled(names.map(function (n) {
      var ms = manifestSource(state, n);
      return ms ? loadSourceScript(state.dataDir, ms.file, n) : Promise.reject(new Error(n));
    })).then(function (results) {
      var failed = results
        .map(function (r, i) { return r.status === 'rejected' ? names[i] : null; })
        .filter(Boolean);
      if (failed.length) {
        store.dispatch({ type: 'build/error', message: 'Failed to load sources: ' + failed.join(', ') });
        return;
      }
      // The lazy columnar format: box.columns[label] is a function returning an array
      // of values for every row (positionally, by index). We call ONLY the getters of
      // the columns actually needed (key + selected fields) -- V8 never materializes
      // the rest (lazy function compilation), which is the whole reason this format
      // exists. An explicit undefined at a row's position means that field was absent
      // for it (like a missing key in the old row-based format); null means the field
      // was explicitly deleted (DELETE). We assemble the same row-shaped form
      // { [label]: value, ... } that the rest of the pipeline
      // (joinSources/applyConditions/...) expects -- it knows nothing about columns
      // at all.
      var selected = names.map(function (n) {
        var box = window.DS.sources[n];
        var key = box.meta.key || 'id';
        var allow = [key].concat(box.meta.labels);           // the key is a selectable field too
        var wanted = state.preset.query.sources[n].labels || allow;
        var labels = wanted.filter(function (l) { return allow.indexOf(l) !== -1; });
        var cols = [key].concat(labels.filter(function (l) { return l !== key; }));
        var colValues = {};
        cols.forEach(function (c) { colValues[c] = box.columns[c] ? box.columns[c]() : []; });
        var rowCount = colValues[key] ? colValues[key].length : 0;
        var data = [];
        for (var i = 0; i < rowCount; i++) {
          var row = {};
          cols.forEach(function (c) {
            if (colValues[c][i] !== undefined) row[c] = colValues[c][i];
          });
          data.push(row);
        }
        return { name: n, key: key, labels: labels, data: data };
      });
      var joined = joinSources(selected, state.preset.view.joins || []);
      if (!joined.columns.length) {
        store.dispatch({ type: 'build/error', message: 'No field selected to display' });
        return;
      }
      // first pass: Data's conditions -- on the sources' raw fields, right after the
      // JOIN, before fields are computed (see view-build.js)
      var sliced = applyConditions(joined, state.preset.view.conditions || []);
      var sourceLabels = {};
      selected.forEach(function (s) { sourceLabels[s.name] = s.labels; });
      var columnTypes = columnTypesFor(sourceLabels, state.manifest.sources);
      var ents = state.preset.view.entities.length
        ? state.preset.view.entities
        : implicitEntities(sliced.columns, columnTypes);
      var re = resolveEntities(sliced, ents);
      var typed = parseTypes(re, ents, re.columns);
      // second pass: Fields' conditions -- by field name, after computation (see
      // view-entities.js); fields hidden from the table are still visible here
      var dataset = applyConditions(typed, state.preset.view.entityConditions || []);
      // entities with their final (deduplicated) names -- for renderGrid / applySort
      dataset.entities = ents.map(function (e, i) { return Object.assign({}, e, { name: re.columns[i] }); });
      // hidden fields -- computed and available to the conditions above, but not
      // shown in the table/export (see visibleColumns in dataset.js)
      dataset.hiddenColumns = dataset.entities.filter(function (e) { return e.hidden; })
        .map(function (e) { return e.name; });
      // the slice THIS specific build was made with -- not state.preset.query.as_of
      // directly: that can be changed on Data and you can return to Table without
      // rebuilding
      dataset.as_of = state.preset.query.as_of;
      store.dispatch({ type: 'build/success', dataset: dataset });
      store.dispatch({ type: 'route/set', route: 'table' });
    });
  };

  // ---------------------------------------------------------------------------
  // Export to CSV/Excel -- accounts for every filtering layer and the sort
  // ---------------------------------------------------------------------------

  var exportDataset = function (state) {
    var cols = visibleColumns(state.dataset, state.hideEmpty);
    var afterAdv = applyAdvanced(state.dataset, state.adv);
    return {
      dataset: { columns: afterAdv.columns, rows: applySort(afterAdv.rows, state.sortBy) },
      columns: cols
    };
  };

  var exportXls = function (state) {
    if (!state.dataset) return;
    var e = exportDataset(state);
    var W = colWidthPx(state);
    // px -> points (1px @96dpi = 0.75pt): proportions are kept, values clamped to a sane range
    var widthsPt = e.columns.map(function (c) {
      return Math.max(24, Math.min(720, Math.round(W(c) * 0.75)));
    });
    download(exportFilename(null, 'xls'),
      toXlsWorkbook(e.dataset, e.columns, widthsPt), 'application/vnd.ms-excel');
  };

  var exportCsv = function (state) {
    if (!state.dataset) return;
    var e = exportDataset(state);
    download(exportFilename(null, 'csv'), toCsv(e.dataset, e.columns), 'text/csv');
  };

  // ---------------------------------------------------------------------------
  // Mounting and rendering
  // ---------------------------------------------------------------------------

  var store = createStore(reducer, initialState);
  var root = document.getElementById('app');
  var footerNode = document.body.appendChild(el('footer', { class: 'statusbar' }));
  var lastRoute = null;
  var lastDataset = null;   // a reference, not a signature -- build/success always creates a new object
  var lastAdvOpen = null;
  var lastExportOpen = null;

  // one info line at the bottom of the window: the data source + (on Table, once the
  // dataset is built) preset/slice/rows-after-filters/columns
  var footerText = function (state) {
    var parts = [state.dataDir ? ('Path: ' + state.dataDir) : 'Path: not found (neither data nor sample-data)'];
    if (state.route === 'table' && state.dataset) {
      var cols = visibleColumns(state.dataset, state.hideEmpty);
      var shownRows = applyAdvanced(state.dataset, state.adv).rows.length;
      parts.push(
        'Preset: ' + state.preset.name,
        'Sources: ' + selectedNames(state.preset).join(' + '),
        'As of: ' + (state.dataset.as_of != null ? fmtDate(state.dataset.as_of) : 'now'),
        'Rows: ' + shownRows + ' of ' + state.dataset.rows.length,
        'Columns: ' + cols.length
      );
    }
    return parts.join(' · ');
  };

  var render = function (state) {
    var d = store.dispatch;

    // only Table is pinned to 100vh (see body.route-table in styles.css) -- .scroll
    // inside it needs to actually be constrained for its own internal scroll to kick
    // in (and with it, the sticky header). Other screens don't need this, they grow
    // naturally and scroll the whole page when there's a lot of content.
    document.body.classList.toggle('route-table', state.route === 'table');

    clear(footerNode).appendChild(viewFooter(footerText(state), !state.dataDir));

    if (!state.manifest || !state.preset) {
      clear(root).appendChild(el('p', { class: 'muted', style: 'padding:1rem' }, 'Initializing…'));
      return;
    }

    // the first build (default preset) -- without a Data-screen flash
    if (state.building && !state.dataset) {
      clear(root);
      root.appendChild(viewNav(state, d));
      root.appendChild(el('section', { class: 'page' },
        el('p', { class: 'muted' }, 'Opening the table with the default preset…')));
      lastRoute = null;
      lastDataset = null;
      return;
    }

    // Rebuild the page's header/body only when it's actually needed: the route
    // changed, a NEW build happened (build/success always makes a new dataset
    // reference, even if its shape matches the previous one: e.g. only as_of or the
    // preset name changed, while columns/row count stayed the same), or the
    // export/advanced-filter panel above the table opened/closed (that also drives
    // the ▸/▾ indicator in the nav itself, not just the page body). This used to
    // compare a "columns+rows.length" signature instead of the reference -- it
    // matched for two DIFFERENT builds of the same shape, and the header (which also
    // carries the preset name and the as_of slice) stayed stuck on the old build.
    var shellChanged = state.route !== lastRoute || state.dataset !== lastDataset
      || state.advOpen !== lastAdvOpen || state.exportOpen !== lastExportOpen;

    if (shellChanged || root.children.length < 2) {
      clear(root);
      root.appendChild(viewNav(state, d));
      root.appendChild(
        state.route === 'build' ? viewBuild(state, d)
          : state.route === 'entities' ? viewEntities(state, d)
          : viewTableShell(state, d)
      );
      lastRoute = state.route;
      lastDataset = state.dataset;
      lastAdvOpen = state.advOpen;
      lastExportOpen = state.exportOpen;
    } else if (state.route === 'build') {
      // the Data screen: replace it wholesale (inputs use onchange, focus isn't lost)
      root.replaceChild(viewBuild(state, d), root.children[1]);
    } else if (state.route === 'entities') {
      root.replaceChild(viewEntities(state, d), root.children[1]);
    }

    if (state.route === 'table') {
      // Crash watchdog (also armed in buildDataset above): column/filter/sort/
      // grouping also rebuild the table's DOM wholesale on every call (see the
      // renderGrid comment in view-table.js) -- the same out-of-memory risk as the
      // first build, so we re-arm it here on every visit to Table, not just once at
      // startup.
      storage.set('renderWatchdog', true);
      renderExportPanel(state, d);
      renderAdvFilter(state, d);
      renderGrid(state, d);
      // Cleared only after the browser confirms a layout/paint pass (double
      // requestAnimationFrame -- the actual out-of-memory crash usually happens not
      // while this JS runs, but during the subsequent layout/paint of a huge DOM,
      // after render() has already returned). If the flag is still set on this same
      // tab's next load (see bootstrap below), the previous attempt never reached a
      // confirmed frame.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { storage.set('renderWatchdog', false); });
      });
    } else if (state.buildError) {
      // An explicit build error (unrelated to running out of memory) -- there won't
      // be a heavy render, the attempt is over, clear the watchdog right away.
      storage.set('renderWatchdog', false);
    }
    if (state.preset) storage.set('preset', state.preset);
  };

  store.subscribe(render);

  // ---------------------------------------------------------------------------
  // Loading the manifest: manifest.js (produced by an external pipeline) + any
  // number of fragments from manifest.imports.js (reserved for a separate
  // converter). The merge happens only on read, here. bootstrapManifest itself
  // doesn't decide whether a sample-data fallback is needed (that's only for the
  // very first start, see initialBoot) -- it just resolves what it found for a
  // specific dir, plus rawManifest (null if manifest.js specifically failed to load)
  // for callers that need to know.
  // ---------------------------------------------------------------------------

  var bootstrapManifest = function (dir) {
    return Promise.all([loadManifest(dir), loadManifestFragments(dir)]).then(function (res) {
      var merged = mergeManifests(res[0], res[1]);
      return { manifest: merged.manifest, dataDir: dir, conflicts: merged.conflicts, rawManifest: res[0] };
    });
  };

  // The "Refresh manifest" button / changing the path on Data (view-build.js). No
  // sample-data fallback here -- this is a deliberate user action, not an auto-run;
  // if nothing is found at the given path, sources just end up an empty list
  // (viewBuild already shows that as-is, no separate error needed).
  var refreshManifest = function (store, dir) {
    bootstrapManifest(dir).then(function (r) {
      store.dispatch({ type: 'manifest/loaded', manifest: r.manifest, dataDir: r.dataDir, conflicts: r.conflicts });
    });
  };

  // The page's very first, automatic start: data/ -> sample-data/ (a fallback, only
  // if "data/manifest.js" specifically wasn't found at all -- rawManifest===null, not
  // "it was found but is empty" -- that's not an error, don't swap in demo data for
  // real-but-currently-empty data), then data/base.js (the default preset, also an
  // optional file, see index.html's comment on "default preset").
  var initialBoot = function () {
    return bootstrapManifest('data').then(function (r) {
      if (r.rawManifest !== null) return r;
      return bootstrapManifest('sample-data').then(function (r2) {
        return r2.rawManifest !== null ? r2 : Object.assign({}, r2, { dataDir: null });
      });
    }).then(function (r) {
      if (!r.dataDir) return r;
      return loadGlobal(r.dataDir, 'base.js', 'DS_BASE_PRESET').then(function () { return r; });
    });
  };

  // published for the lazy references from view-build.js / view-table.js (onclick)
  App.store = store;
  App.buildDataset = buildDataset;
  App.exportXls = exportXls;
  App.exportCsv = exportCsv;
  App.refreshManifest = refreshManifest;

  initialBoot().then(function (boot) {
    // read the saved value BEFORE the first full render -- otherwise it would
    // overwrite the keys with the current (still default) state
    var saved = storage.get('preset');
    var manifest = boot.manifest;

    store.dispatch({
      type: 'manifest/loaded',
      manifest: manifest,
      dataDir: boot.dataDir,
      conflicts: boot.conflicts
    });

    // Crash watchdog (see render() above): if the flag is still set at this same
    // tab's startup, the tab's previous render() never reached a confirmed frame (the
    // typical cause: the browser ran out of memory on a large dataset and the tab
    // restarted). Without this check, the saved preset would get reapplied and could
    // trigger the same crash -- a loop with no way out. Instead, a guaranteed-empty
    // preset (not basePreset(): data/base.js could itself turn out to be that same
    // large set), the saved preset is left untouched in sessionStorage, and it can be
    // opened manually on Data.
    if (storage.get('renderWatchdog')) {
      storage.set('renderWatchdog', false);
      store.dispatch({ type: 'preset/set', preset: normalizePreset({}) });
      store.dispatch({
        type: 'build/error',
        message: 'The previous attempt to build the table in this tab did not finish -- it looks '
          + 'like the browser ran out of memory for the selected preset and the tab restarted. To '
          + 'avoid a restart loop, an empty preset was applied. The saved preset is untouched -- you '
          + 'can open it manually on the Data screen (e.g. to narrow the selected sources/fields '
          + 'before trying again).'
      });
      // render(), triggered by both dispatches above, unconditionally re-saves
      // state.preset (see "if (state.preset) storage.set('preset', ...)" in render()
      // itself) -- meaning it just overwrote the saved preset with the empty one.
      // Restore the original: a decision to "not apply automatically" shouldn't mean
      // "forget", or the whole point of "can be opened manually on Data" is lost.
      if (saved) storage.set('preset', saved);
      return;
    }

    // sessionStorage is tied to this tab, not to the whole file:// origin -- but the
    // saved preset can still be from a different data set within THIS SAME tab (the
    // demo/directory was switched during its lifetime) and reference sources that
    // aren't here -- in that case, instead of a "sources failed to load" error on the
    // first build, we silently fall back to the directory's preset (data/base.js) or
    // an empty one.
    var savedFitsManifest = saved && Object.keys((saved.query && saved.query.sources) || {})
      .every(function (n) { return manifestSource({ manifest: manifest }, n); });
    store.dispatch({ type: 'preset/set', preset: savedFitsManifest ? saved : basePreset() });
    // apply the default preset and open the table right away; on error (no data / no
    // source) buildDataset will leave the user on Data
    buildDataset(store);
  });

})();
