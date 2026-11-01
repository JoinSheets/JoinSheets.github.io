'use strict';

// The Table screen: viewTableShell (the grid: quick filters, click-to-sort, grouping,
// manual column width) + two panels hidden by default above it, each opened/closed by
// its own nav button (the table's data stays visible while you work with it):
// renderAdvFilter (conditions + sort/group -- transient, not part of the preset) and
// renderExportPanel (format choice + running the export). Both are imperative, like
// renderGrid: they clear and rebuild their own persistent div on every render(),
// regardless of whether the whole page shell was rebuilt. DOM-dependent code -- not
// covered by node:test. Depends on util.js, dataset.js, entities.js (colWidthPx/
// MIN_COL_W), view-common.js. References to main.js (store/exportXls/exportCsv)
// resolve lazily through window.DS_APP at click time -- main.js loads last, but every
// script has already run by the time a click is possible.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./util.js'), require('./dataset.js'), require('./entities.js'),
      require('./view-common.js')
    );
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util, Dataset, Entities, ViewCommon) {

  var el = Util.el, clear = Util.clear, groupBy = Util.groupBy;
  var visibleColumns = Dataset.visibleColumns, applyAdvanced = Dataset.applyAdvanced,
      applySort = Dataset.applySort, findNextMatch = Dataset.findNextMatch,
      uniqueValues = Dataset.uniqueValues;
  var colWidthPx = Entities.colWidthPx, MIN_COL_W = Entities.MIN_COL_W;
  var AGG_FUNCS_BY_TYPE = Entities.AGG_FUNCS_BY_TYPE, AGG_FUNC_LABELS = Entities.AGG_FUNC_LABELS,
      aggregateGroup = Entities.aggregateGroup;
  var quickValueInput = ViewCommon.quickValueInput, fieldSelect = ViewCommon.fieldSelect,
      moveRemoveButtons = ViewCommon.moveRemoveButtons, conditionRow = ViewCommon.conditionRow;
  var FUNNEL_SVG = ViewCommon.FUNNEL_SVG, SEARCH_SVG = ViewCommon.SEARCH_SVG, SORT_SVG = ViewCommon.SORT_SVG,
      SORT_ASC_SVG = ViewCommon.SORT_ASC_SVG, SORT_DESC_SVG = ViewCommon.SORT_DESC_SVG;

  var cellNode = function (v, entity, unparsed) {
    var st = '';
    var fmt = entity && entity.format;
    if (fmt) {
      if (fmt.align) st += 'text-align:' + fmt.align + ';';
      if (fmt.font_size) st += 'font-size:' + Number(fmt.font_size) + 'px;';
    }
    var attrs = st ? { style: st } : {};
    if (v === null) { attrs.class = 'del'; attrs.title = 'deleted (DELETE)'; return el('td', attrs, '∅'); }
    if (v === undefined || v === '') { attrs.class = 'empty'; return el('td', attrs, ''); }
    if (unparsed) {
      attrs.class = 'unparsed';
      attrs.title = 'not recognized as "' + ((entity && entity.type) || 'text') + '"';
    }
    if (!attrs.title) attrs.title = String(v);   // fixed-width columns -- the full value shows on hover
    return el('td', attrs, String(v));
  };

  var viewTableShell = function (state, d) {
    return el('section', { class: 'page table' },
      el('div', { class: 'table-headbar' },
        el('div', { class: 'advfilter', id: 'export-panel' }),
        el('div', { class: 'advfilter', id: 'advfilter' })
      ),
      el('div', { class: 'grid-wrap', id: 'grid' })
    );
  };

  // ---- Advanced filter -- a panel hidden by default ABOVE the table (conditions +
  // sort), opened/closed by a nav button; transient, on top of the preset, not saved
  // (not in the preset, not in localStorage). The table's data stays visible while you
  // filter it -- unlike a separate page, where the table wouldn't be visible at all.

  var renderAdvFilter = function (state, d) {
    var node = document.getElementById('advfilter');
    if (!node) return;
    clear(node);
    if (!state.advOpen || !state.dataset) return;

    var cols = visibleColumns(state.dataset, false);   // hidden fields aren't offered here
    var advRow = function (row, i) {
      var leading = i === 0
        ? el('span', { class: 'adv-conj-spacer' })
        : el('select', {
            class: 'adv-conj',
            onchange: function (e) { d({ type: 'adv/update', index: i, patch: { conj: e.target.value } }); }
          },
            el('option', { value: 'and', selected: row.conj !== 'or' }, 'AND'),
            el('option', { value: 'or', selected: row.conj === 'or' }, 'OR'));
      return conditionRow(row, cols,
        function (p) { d({ type: 'adv/update', index: i, patch: p }); },
        function () { d({ type: 'adv/remove', index: i }); },
        leading);
    };

    var entMapForAgg = {};
    (state.dataset.entities || []).forEach(function (e) { entMapForAgg[e.name] = e; });
    var groupedColumns = state.groupBy.map(function (g) { return g.column; }).filter(Boolean);

    // Columns already taken by an aggregator at ANY level, except the selection
    // currently being edited (exceptLevel/exceptAggIdx) -- we don't aggregate one
    // column differently in several places at once (store.js::groupAgg/* doesn't
    // validate this, the UI just doesn't offer the choice).
    var usedAggColumns = function (exceptLevel, exceptAggIdx) {
      var out = [];
      state.groupBy.forEach(function (g, gi) {
        (g.agg || []).forEach(function (a, ai) {
          if (gi === exceptLevel && ai === exceptAggIdx) return;
          if (a.column) out.push(a.column);
        });
      });
      return out;
    };

    // Columns that have at least one aggregator at all (number/date/boolean --
    // AGG_FUNCS_BY_TYPE), minus ones already taken by grouping or another aggregator;
    // curColumn always stays in the list, even if "taken" (it's its own current value).
    var aggColumnOptions = function (exceptLevel, exceptAggIdx, curColumn) {
      var used = groupedColumns.concat(usedAggColumns(exceptLevel, exceptAggIdx));
      return cols.filter(function (c) {
        if (c === curColumn) return true;
        if (used.indexOf(c) !== -1) return false;
        var t = (entMapForAgg[c] && entMapForAgg[c].type) || 'text';
        return (AGG_FUNCS_BY_TYPE[t] || []).length > 0;
      });
    };

    var aggRow = function (levelIdx, agg, ai) {
      var patch = function (p) { d({ type: 'groupAgg/update', index: levelIdx, aggIndex: ai, patch: p }); };
      var options = aggColumnOptions(levelIdx, ai, agg.column);
      var type = (entMapForAgg[agg.column] && entMapForAgg[agg.column].type) || 'text';
      var fns = AGG_FUNCS_BY_TYPE[type] || [];
      return el('div', { class: 'condition agg-row' },
        fieldSelect(agg.column, options, function (newCol) {
          var newType = (entMapForAgg[newCol] && entMapForAgg[newCol].type) || 'text';
          var newFns = AGG_FUNCS_BY_TYPE[newType] || [];
          patch({ column: newCol, fn: newFns.indexOf(agg.fn) !== -1 ? agg.fn : (newFns[0] || '') });
        }, 'field…'),
        el('select', { disabled: !fns.length, onchange: function (e) { patch({ fn: e.target.value }); } },
          fns.map(function (f) {
            return el('option', { value: f, selected: f === agg.fn }, AGG_FUNC_LABELS[f] || f);
          })),
        el('button', { class: 'link', onclick: function () { d({ type: 'groupAgg/remove', index: levelIdx, aggIndex: ai }); } }, '✕')
      );
    };

    // A grouping level + (below it) its aggregators for the summary row -- see
    // store.js (groupBy is [{column, agg}], not just a plain string).
    var groupRow = function (g, i) {
      var colOptions = cols.filter(function (c) { return c === g.column || groupedColumns.indexOf(c) === -1; });
      var addDisabled = !aggColumnOptions(i, -1, '').length;
      return el('div', { class: 'condition-block' },
        el('div', { class: 'condition' },
          fieldSelect(g.column, colOptions, function (v) { d({ type: 'group/update', index: i, patch: { column: v } }); }, 'field…'),
          moveRemoveButtons({
            upTitle: 'up', downTitle: 'down',
            upDisabled: i === 0, downDisabled: i === state.groupBy.length - 1,
            onUp: function () { d({ type: 'group/move', index: i, dir: -1 }); },
            onDown: function () { d({ type: 'group/move', index: i, dir: 1 }); },
            onRemove: function () { d({ type: 'group/remove', index: i }); }
          })
        ),
        (g.agg || []).length
          ? el('div', { class: 'agg-list' }, g.agg.map(function (a, ai) { return aggRow(i, a, ai); }))
          : null,
        el('div', { class: 'advfilter-foot agg-foot' },
          el('button', {
            class: 'link', disabled: addDisabled,
            title: addDisabled ? 'no free number/date/boolean fields left to aggregate' : '',
            onclick: function () {
              var opts = aggColumnOptions(i, -1, '');
              if (!opts.length) return;
              var c0 = opts[0];
              var t0 = (entMapForAgg[c0] && entMapForAgg[c0].type) || 'text';
              var fns0 = AGG_FUNCS_BY_TYPE[t0] || [];
              d({ type: 'groupAgg/add', index: i, column: c0, fn: fns0[0] || '' });
            }
          }, '+ aggregate in summary')
        )
      );
    };

    // Sort -- the same state (state.sortBy) that the table header icons read/write
    // (view-table.js::renderGrid, quick/sort): this section is a full multi-level
    // editor, row order = priority (col1, then col2, ...). Modeled on groupRow above.
    var sortRow = function (lvl, i) {
      var patch = function (p) { d({ type: 'sort/update', index: i, patch: p }); };
      return el('div', { class: 'condition' },
        fieldSelect(lvl.col, cols, function (v) { patch({ col: v }); }, 'field…'),
        el('select', { onchange: function (e) { patch({ dir: e.target.value }); } },
          el('option', { value: 'asc', selected: lvl.dir !== 'desc' }, 'ascending'),
          el('option', { value: 'desc', selected: lvl.dir === 'desc' }, 'descending')
        ),
        moveRemoveButtons({
          upTitle: 'up', downTitle: 'down',
          upDisabled: i === 0, downDisabled: i === state.sortBy.length - 1,
          onUp: function () { d({ type: 'sort/move', index: i, dir: -1 }); },
          onDown: function () { d({ type: 'sort/move', index: i, dir: 1 }); },
          onRemove: function () { d({ type: 'sort/remove', index: i }); }
        })
      );
    };

    node.appendChild(el('div', { class: 'advfilter-panel' },
      el('h2', { style: 'margin-top:0' }, 'Set filter'),
      state.adv.length ? el('div', { class: 'conditions' }, state.adv.map(advRow)) : null,
      el('div', { class: 'advfilter-foot' },
        el('button', { class: 'link', onclick: function () { d({ type: 'adv/add' }); } }, '+ condition')
      ),

      el('div', { class: 'divider' }),

      el('h2', {}, 'Group By'),
      state.groupBy.length ? el('div', { class: 'conditions' }, state.groupBy.map(groupRow)) : null,
      el('div', { class: 'advfilter-foot' },
        el('button', { class: 'link', onclick: function () { d({ type: 'group/add' }); } }, '+ grouping level')
      ),

      el('div', { class: 'divider' }),

      el('h2', {}, 'Order By'),
      state.sortBy.length ? el('div', { class: 'conditions' }, state.sortBy.map(sortRow)) : null,
      el('div', { class: 'advfilter-foot' },
        el('button', { class: 'link', onclick: function () { d({ type: 'sort/add' }); } }, '+ sorting level')
      ),

      el('div', { class: 'divider' }),

      el('label', { class: 'chk' },
        el('input', {
          type: 'checkbox', checked: state.hideEmpty,
          onchange: function () { d({ type: 'table/toggleHideEmpty' }); }
        }),
        'hide empty columns'
      ),

      el('div', { class: 'divider' }),

      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', disabled: !state.adv.length,
          onclick: function () { d({ type: 'adv/reset' }); }
        }, 'Show all')
      )
    ));
  };

  // ---- Export -- a panel hidden by default above the table: format choice + action;
  // the same scheme as the advanced filter.

  var renderExportPanel = function (state, d) {
    var node = document.getElementById('export-panel');
    if (!node) return;
    clear(node);
    if (!state.exportOpen || !state.dataset) return;

    node.appendChild(el('div', { class: 'advfilter-panel' },
      el('div', { class: 'row' },
        el('label', { class: 'chk' },
          el('input', {
            type: 'radio', name: 'export-format', checked: state.exportFormat !== 'csv',
            onchange: function () { d({ type: 'ui/setExportFormat', value: 'xls' }); }
          }),
          'Excel'
        ),
        el('label', { class: 'chk' },
          el('input', {
            type: 'radio', name: 'export-format', checked: state.exportFormat === 'csv',
            onchange: function () { d({ type: 'ui/setExportFormat', value: 'csv' }); }
          }),
          'CSV'
        )
      ),
      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', onclick: function () {
            var st = window.DS_APP.store.getState();
            if (st.exportFormat === 'csv') window.DS_APP.exportCsv(st); else window.DS_APP.exportXls(st);
          }
        }, 'Export')
      )
    ));
  };

  // --- column quick icons (search/filter): typing is a draft, applying is Enter/the
  // button. Draft key is "column:mode" -- for one column, search and filter are edited
  // independently of each other.
  var quickDraft = {};
  // The "find next" search cursor per column -- purely navigational, not in the store
  // (like quickDraft, ephemeral, lives only while the page is open).
  var searchCursor = {};
  // How many rows get materialized into the DOM right away, the rest load on scroll
  // (see renderGrid: rowDescriptors/materializeRow/renderMore). On tables of a few
  // thousand rows or more, creating DOM nodes is the expensive part; this threshold was
  // picked as a reasonable tradeoff without benchmarking.
  var ROW_RENDER_BATCH = 1000;
  // The "column:mode" of the panel that needs focus+cursor restored right after it
  // OPENS (not on every re-render -- otherwise any unrelated dispatch, e.g. editing
  // "Show N", would yank focus out from under the user). Set in toggleQuick right
  // before the dispatch that opens the panel; read and cleared once in quickPanel on
  // the next render() (see ViewCommon.quickValueInput opts.autofocus).
  var pendingFocus = null;

  // A click anywhere outside an open quick panel (and not on one of the three icons --
  // they have their own onclick, shouldn't be cancelled by this same click) closes
  // every open quick slot, as requested. The listener attaches to document once (the
  // #grid node survives every render -- clear() only wipes its contents),
  // currentState/currentDispatch update on every renderGrid.
  var docCloseListenerAttached = false;
  var currentState = null, currentDispatch = null;
  // Materialize (if needed) rows up through the one search is looking for (see
  // ROW_RENDER_BATCH above, renderMore/currentEnsureMemberRendered in renderGrid) -- a
  // found row can be past the already-rendered window. The same "currentX, updated on
  // every renderGrid" trick as currentState/currentDispatch just above.
  var currentEnsureMemberRendered = null;
  var attachDocCloseListener = function () {
    if (docCloseListenerAttached) return;
    docCloseListenerAttached = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && (t.closest('.quick-panel') || t.closest('.col-icon'))) return;
      var qo = currentState && currentState.quickOpen;
      if (!qo || !Object.keys(qo).some(function (k) { return qo[k]; })) return;
      if (currentDispatch) currentDispatch({ type: 'quick/closeAll' });
    }, true);
  };

  var renderGrid = function (state, d) {
    var node = document.getElementById('grid');
    if (!node) return;
    clear(node);
    currentState = state;
    currentDispatch = d;
    attachDocCloseListener();

    if (!state.dataset) {
      node.appendChild(el('p', { class: 'muted' }, 'First build the table on the Data screen.'));
      return;
    }

    var cols = visibleColumns(state.dataset, state.hideEmpty);
    var entMap = {};
    (state.dataset.entities || []).forEach(function (e) { entMap[e.name] = e; });
    // pipeline: built dataset -> advanced filter (conditions + whatever the "filter"
    // icon added -- same state, state.adv) -> sort (levels + whatever the "sort" icon
    // toggled -- also the same state, state.sortBy)
    var afterAdv = applyAdvanced(state.dataset, state.adv);
    var filtered = { columns: afterAdv.columns, rows: applySort(afterAdv.rows, state.sortBy) };

    // a row's index in filtered.rows, by reference -- needed to find the matching <tr>
    // in the DOM after a search (tagged with data-ridx below), including after
    // expanding collapsed groups along the way to the row
    var rowIndex = new Map();
    filtered.rows.forEach(function (r, i) { rowIndex.set(r, i); });

    // don't keep drafts for columns that disappeared
    Object.keys(quickDraft).forEach(function (k) {
      var col = k.split(':')[0];
      if (state.dataset.columns.indexOf(col) === -1) delete quickDraft[k];
    });

    // dragging the header's right edge -> column width (into the preset on mouseup)
    var startResize = function (ev, idx, c) {
      ev.preventDefault();
      ev.stopPropagation();
      var g = document.getElementById('grid');
      var tableEl = g && g.querySelector('table.data');
      var cg = tableEl && tableEl.querySelector('colgroup');
      var colEl = cg && cg.children[idx];
      var th = ev.target.parentNode;
      if (!colEl || !th) return;
      var startX = ev.clientX;
      var w0 = th.getBoundingClientRect().width;
      var total0 = tableEl.getBoundingClientRect().width;
      var widthAt = function (e) { return Math.max(MIN_COL_W, Math.round(w0 + (e.clientX - startX))); };
      var onMove = function (e) {
        var w = widthAt(e);
        colEl.style.width = w + 'px';
        tableEl.style.width = (total0 - w0 + w) + 'px';   // resize the table too -- otherwise the other columns shrink
      };
      var onUp = function (e) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('col-resizing');
        if (Math.abs(e.clientX - startX) >= 3) d({ type: 'preset/setColWidth', column: c, width: widthAt(e) });
      };
      document.body.classList.add('col-resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // Scroll to and highlight the row search found; expand every collapsed ancestor
    // group along the way (computed from activeGroups the same way as in renderLevel
    // below). Runs AFTER activeGroups is built -- declared here, called from the
    // search quick panel.
    var revealRow = function (idx) {
      if (currentEnsureMemberRendered) currentEnsureMemberRendered(idx);
      var g = document.getElementById('grid');
      var tr = g && g.querySelector('tr[data-ridx="' + idx + '"]');
      if (!tr) return;
      tr.scrollIntoView({ block: 'start' });
      tr.classList.add('found');
      setTimeout(function () { tr.classList.remove('found'); }, 1200);
    };

    var runSearch = function (c, needle) {
      var from = searchCursor[c] !== undefined ? searchCursor[c] : -1;
      var idx = findNextMatch(filtered.rows, c, needle, from);
      if (idx === -1) return;
      searchCursor[c] = idx;
      var row = filtered.rows[idx];
      var missing = [];
      if (activeGroups.length) {
        var path = [];
        activeGroups.forEach(function (lvl) {
          path.push(String(row[lvl] == null ? '∅' : row[lvl]));
          var key = JSON.stringify(path.slice());
          if (!state.expanded[key]) missing.push(key);
        });
      }
      if (missing.length) {
        missing.forEach(function (key) { d({ type: 'table/toggleGroup', key: key }); });
        // toggleGroup re-rendered the grid synchronously -- look for the <tr> in the new DOM
      }
      revealRow(idx);
    };

    // Open/toggle a column's quick panel. If this is an OPEN (not a repeat click on
    // the same icon, which would close it) -- remember which input needs focus on the
    // next render() (see pendingFocus above and ViewCommon.quickValueInput
    // opts.autofocus).
    var toggleQuick = function (c, mode) {
      if (state.quickOpen[c] !== mode) pendingFocus = c + ':' + mode;
      d({ type: 'quick/toggle', column: c, mode: mode });
    };

    // One shared quick panel under the icons: search and filter are the same visual
    // component (ViewCommon.quickValueInput), differing only in what Enter/the button
    // does (onApply, see the comment inside).
    var quickPanel = function (c) {
      var mode = state.quickOpen[c];
      if (!mode) return null;
      var advIdx = state.adv.findIndex(function (cond) { return cond.field === c && cond.op === 'contains'; });
      var appliedValue = advIdx !== -1 ? String(state.adv[advIdx].value || '') : '';
      var draftKey = c + ':' + mode;
      var draft = quickDraft[draftKey] !== undefined ? quickDraft[draftKey] : (mode === 'filter' ? appliedValue : '');
      var autofocus = pendingFocus === draftKey;
      if (autofocus) pendingFocus = null;
      var close = function () { delete quickDraft[draftKey]; d({ type: 'quick/toggle', column: c, mode: mode }); };
      return quickValueInput({
        value: draft,
        dirty: mode === 'filter' && draft !== appliedValue,
        autofocus: autofocus,
        placeholder: mode === 'search' ? 'search…' : 'filter…',
        title: mode === 'search'
          ? 'Text + Enter -- jump to the next row below and close; Esc -- close without searching'
          : 'Text + Enter (or the button on the right) -- apply and close; Esc -- cancel the input and close',
        applyIcon: mode === 'search' ? SEARCH_SVG : FUNNEL_SVG,
        applyTitle: mode === 'search' ? 'Find next' : 'Apply filter',
        values: uniqueValues(state.dataset.rows, c, state.quickValuesLimit),
        limit: state.quickValuesLimit,
        onInput: function (v) { quickDraft[draftKey] = v; },
        // Enter / the button on the right -- the target action + closing. We close
        // with the FIRST dispatch (renders the grid with the panel already closed),
        // and runSearch is the second step: revealRow looks for the <tr> in that new
        // DOM and highlights it there. If the order were reversed, the highlight
        // would land on a node the closing re-render would tear down that same tick,
        // and the effect would never be visible at all (that was the cause of search
        // looking like "nothing happens"). For filter the order doesn't matter
        // functionally -- kept the same, for one shared mechanic across both modes.
        onApply: function (v) {
          quickDraft[draftKey] = v;
          d({ type: 'quick/toggle', column: c, mode: mode });
          if (mode === 'search') runSearch(c, v); else d({ type: 'quick/applyFilter', column: c, value: v });
        },
        onEscape: close,
        onLimitChange: function (v) { d({ type: 'quick/setValuesLimit', value: v }); }
      });
    };

    var head = el('tr', {}, cols.map(function (c, idx) {
      var hasFilter = state.adv.some(function (cond) {
        return cond.field === c && cond.op === 'contains' && String(cond.value == null ? '' : cond.value).trim();
      });
      var sortEntry = state.sortBy.filter(function (s) { return s.col === c; })[0];
      var icons = el('div', { class: 'col-icons' },
        el('button', {
          type: 'button', class: 'col-icon' + (state.quickOpen[c] === 'search' ? ' active' : ''),
          title: 'Search this column', html: SEARCH_SVG,
          onclick: function () { toggleQuick(c, 'search'); }
        }),
        el('button', {
          type: 'button', class: 'col-icon' + (state.quickOpen[c] === 'filter' ? ' active' : '') + (hasFilter ? ' set' : ''),
          title: 'Quick filter (contains)', html: FUNNEL_SVG,
          onclick: function () { toggleQuick(c, 'filter'); }
        }),
        el('button', {
          type: 'button', class: 'col-icon' + (sortEntry ? ' set' : ''),
          title: 'Sort: ascending / descending / none',
          html: !sortEntry ? SORT_SVG : (sortEntry.dir === 'asc' ? SORT_ASC_SVG : SORT_DESC_SVG),
          onclick: function () { d({ type: 'quick/sort', column: c }); }
        })
      );
      return el('th', {},
        el('div', { class: 'col-name' + (sortEntry ? ' sorted' : '') },
          el('span', { class: 'col-name-txt' }, c),
          sortEntry ? el('span', { class: 'sort-ind' }, sortEntry.dir === 'asc' ? ' ▲' : ' ▼') : null),
        icons,
        quickPanel(c),
        el('div', {
          class: 'col-resizer',
          title: 'Drag -- column width; double-click -- reset',
          onmousedown: function (ev) { startResize(ev, idx, c); },
          ondblclick: function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            d({ type: 'preset/setColWidth', column: c, width: null });
          }
        })
      );
    }));

    // multi-level grouping -- levels (state.groupBy, [{column, agg}]) apply nested, in
    // order; a level whose field is no longer among the columns (a stale choice after
    // switching presets) is skipped, as is a level with no field chosen yet
    var activeGroups = (state.groupBy || []).filter(function (g) { return g.column && cols.indexOf(g.column) !== -1; });

    // Building rows is split into two steps: first, data ONLY (rowDescriptors, not a
    // single DOM node), then materializing into <tr> (materializeRow below), and only
    // for the visible window + loading more on scroll (see after the table is
    // assembled). On a table of a few thousand rows or more, creating DOM is the
    // expensive part; walking/grouping the data itself is cheap and done in full for
    // rowDescriptors, with no batching.
    var rowDescriptors = [];

    if (activeGroups.length) {
      var memberIndent = (.5 + activeGroups.length * 1.2) + 'rem';
      var allKeys = [];

      // a node's key is its path from the root (JSON, not just a value): values can
      // textually coincide across different levels/branches
      var collectDeepKeys = function (rows, path) {
        var lvl = activeGroups[path.length];
        if (lvl === undefined) return;
        var gs = groupBy(function (r) { return String(r[lvl.column] == null ? '∅' : r[lvl.column]); })(rows);
        Object.keys(gs).forEach(function (k) {
          var subPath = path.concat([k]);
          allKeys.push(JSON.stringify(subPath));
          collectDeepKeys(gs[k], subPath);
        });
      };

      var collectLevel = function (rows, path) {
        var lvl = activeGroups[path.length];
        if (lvl === undefined) {
          rows.forEach(function (r) {
            rowDescriptors.push({ kind: 'member', row: r, ridx: rowIndex.get(r), indent: memberIndent });
          });
          return;
        }
        var groups = groupBy(function (r) { return String(r[lvl.column] == null ? '∅' : r[lvl.column]); })(rows);
        var keys = Object.keys(groups).sort();
        // Aggregators visible in THIS level's summary row: its own + every DEEPER
        // level's (path.length and beyond) -- a deeper level's aggregator bubbles up
        // into every ancestor row, while a shallower level's aggregator stays only
        // there (as requested). Recomputed over the FULL set of the node's rows
        // (groups[k]), rather than summing the already-computed subtotals of deeper
        // nodes -- otherwise AVG/MIN/MAX would be "the average/min of averages", not
        // "the average/min over the node".
        var aggByColumn = {};
        for (var li = path.length; li < activeGroups.length; li++) {
          (activeGroups[li].agg || []).forEach(function (a) { if (a.column) aggByColumn[a.column] = a; });
        }
        keys.forEach(function (k) {
          var subPath = path.concat([k]);
          var pathKey = JSON.stringify(subPath);
          allKeys.push(pathKey);
          var open = !!state.expanded[pathKey];
          var groupRows = groups[k];
          rowDescriptors.push({
            kind: 'grp', path: subPath, pathKey: pathKey, open: open, k: k,
            groupRows: groupRows, lvl: lvl, aggByColumn: aggByColumn
          });
          if (open) collectLevel(groupRows, subPath);
          else collectDeepKeys(groupRows, subPath);
        });
      };

      collectLevel(filtered.rows, []);

      node.appendChild(el('div', { class: 'grp-actions' },
        el('button', { class: 'link', onclick: function () { d({ type: 'table/expandAll', keys: allKeys }); } }, 'expand all'),
        el('button', { class: 'link', onclick: function () { d({ type: 'table/collapseAll' }); } }, 'collapse all')
      ));
    } else {
      filtered.rows.forEach(function (r, i) {
        rowDescriptors.push({ kind: 'member', row: r, ridx: i });
      });
    }

    // The one place that creates a row's DOM node from a descriptor -- called only
    // for the current window (below), not for all of rowDescriptors.
    var materializeRow = function (rd) {
      if (rd.kind === 'member') {
        var r = rd.row;
        var attrs = { dataset: { ridx: String(rd.ridx) } };
        if (rd.indent) attrs.class = 'member';
        return el('tr', attrs, cols.map(function (c, i) {
          var cell = cellNode(r[c], entMap[c], r.__u && r.__u[c]);
          if (rd.indent && i === 0) cell.style.paddingLeft = rd.indent;
          return cell;
        }));
      }
      var open = rd.open, pathKey = rd.pathKey, groupRows = rd.groupRows, lvl = rd.lvl,
          aggByColumn = rd.aggByColumn, k = rd.k, path = rd.path;
      return el('tr', {
        class: 'grp' + (open ? ' open' : ''),
        onclick: function () { d({ type: 'table/toggleGroup', key: pathKey }); }
      }, cols.map(function (c) {
        if (c === lvl.column) {
          return el('td', { style: 'padding-left:' + (.5 + path.length * 1.2) + 'rem' },
            el('span', { class: 'caret' }, open ? '▾' : '▸'),
            ' ', el('strong', {}, k),
            el('span', { class: 'muted' }, '  (' + groupRows.length + ')')
          );
        }
        var a = aggByColumn[c];
        if (!a) return el('td', {}, '');
        var val = aggregateGroup(groupRows, c, entMap[c], a.fn);
        return el('td', { class: 'agg-cell', title: AGG_FUNC_LABELS[a.fn] || a.fn }, val == null ? '' : val);
      }));
    };

    // the summary (preset/slice/rows/columns) moved to the status line at the bottom
    // of the window (main.js, .statusbar) -- one place for the whole info line
    var gridColW = colWidthPx(state);
    var widths = cols.map(function (c) { return Number(gridColW(c)); });
    var colgroup = el('colgroup', {}, widths.map(function (w) {
      return el('col', { style: 'width:' + w + 'px' });
    }));
    // Explicit width = sum of the columns. Without it, table-layout:fixed with
    // width:max-content still measures the content -> a column can't shrink below its
    // header text.
    var totalW = widths.reduce(function (a, b) { return a + b; }, 0);

    // The first pass materializes only ROW_RENDER_BATCH rows (not all of
    // rowDescriptors) -- the rest load on scroll (renderMore), bypassing
    // store.dispatch: otherwise every scroll tick would re-run the whole pipeline
    // (applyAdvanced/applySort/grouping + a full DOM rebuild) and defeat the whole
    // point of batching.
    var renderedCount = Math.min(ROW_RENDER_BATCH, rowDescriptors.length);
    var bodyRows = [];
    for (var ri = 0; ri < renderedCount; ri++) bodyRows.push(materializeRow(rowDescriptors[ri]));

    node.appendChild(el('div', { class: 'scroll' },
      el('table', { class: 'data', style: 'width:' + totalW + 'px' },
        colgroup, el('thead', {}, head), el('tbody', {}, bodyRows))
    ));

    var scrollEl = node.querySelector('.scroll');
    var tbodyEl = scrollEl && scrollEl.querySelector('tbody');
    var renderMore = function (targetCount) {
      var target = Math.min(rowDescriptors.length, targetCount);
      if (target <= renderedCount || !tbodyEl) return;
      var frag = document.createDocumentFragment();
      for (var i = renderedCount; i < target; i++) frag.appendChild(materializeRow(rowDescriptors[i]));
      tbodyEl.appendChild(frag);
      renderedCount = target;
    };
    if (scrollEl && renderedCount < rowDescriptors.length) {
      // A "one screen from the bottom" threshold -- load ahead of time, so the user
      // never sees emptiness even on a sharp wheel-scroll or scrollbar drag.
      scrollEl.addEventListener('scroll', function () {
        if (renderedCount >= rowDescriptors.length) return;
        var remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
        if (remaining < scrollEl.clientHeight) renderMore(renderedCount + ROW_RENDER_BATCH);
      });
    }
    // currentEnsureMemberRendered -- the row search found (revealRow) can lie past
    // the already-rendered window; load ahead of it early.
    currentEnsureMemberRendered = function (ridx) {
      for (var i = renderedCount; i < rowDescriptors.length; i++) {
        if (rowDescriptors[i].kind === 'member' && rowDescriptors[i].ridx === ridx) { renderMore(i + 1); return; }
      }
    };

    // The icon row's real height -- space for it is reserved in .col-name
    // (padding-bottom: var(--filter-h)), so the row pinned to the cell's bottom
    // (position:absolute) doesn't overlap the header text or "wander" in height
    // between columns with headers of different lengths. An open quick panel
    // (search/filter) doesn't factor into this calculation -- it floats as a separate
    // overlay above the table rows rather than pushing the header apart (see
    // .quick-panel in styles.css).
    var oneIcons = node.querySelector('.col-icons');
    var docEl = document.documentElement;
    if (oneIcons && docEl && docEl.style && typeof docEl.style.setProperty === 'function') {
      docEl.style.setProperty('--filter-h', oneIcons.offsetHeight + 'px');
    }
  };

  return {
    viewTableShell: viewTableShell, renderAdvFilter: renderAdvFilter,
    renderExportPanel: renderExportPanel, renderGrid: renderGrid
  };
});
