'use strict';

// Store: the createStore factory (reducer + dispatch + subscribe), state selectors,
// preset normalization, the reducer, preset (de)serialization to a file. Depends on
// util.js (omit/setIn/_swap), dataset.js (OP_IDS/JOIN_TYPE_IDS), entities.js
// (normalizeEntities/mergeEntity/entityColumns), effects.js (download/readFile).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./util.js'), require('./dataset.js'), require('./entities.js'), require('./effects.js')
    );
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util, Dataset, Entities, Effects) {

  var omit = Util.omit, setIn = Util.setIn, _swap = Util._swap;
  var OP_IDS = Dataset.OP_IDS, JOIN_TYPE_IDS = Dataset.JOIN_TYPE_IDS;
  var normalizeEntities = Entities.normalizeEntities, mergeEntity = Entities.mergeEntity,
      entityColumns = Entities.entityColumns, columnType = Entities.columnType;
  var download = Effects.download, readFile = Effects.readFile, storage = Effects.storage;

  var isStale = function (ms) { return ms.db_max_cnt > ms.gen_max_cnt; };

  var manifestSource = function (state, name) {
    return (state.manifest.sources || []).find(function (s) { return s.name === name; });
  };

  var selectedNames = function (preset) { return Object.keys(preset.query.sources); };

  // Merges the main manifest.js (produced by an external pipeline) with any number of
  // fragments from manifest.imports.js (nothing produces such files yet -- reserved
  // for a separate converter). The merge happens ONLY on read, here; no producer edits
  // another's file. A source name colliding between manifest.js and a fragment (or
  // between two fragments) is a hard error (conflicts), not one silently winning.
  var mergeManifests = function (manifest, fragments) {
    var base = manifest || { generated_at: null, db_max_cnt: 0, sources: [] };
    var sources = base.sources.slice();
    var seen = {};
    sources.forEach(function (s) { seen[s.name] = true; });
    var conflicts = [];
    (fragments || []).forEach(function (frag) {
      (frag.sources || []).forEach(function (s) {
        if (seen[s.name]) { conflicts.push(s.name); return; }
        seen[s.name] = true;
        sources.push(s);
      });
    });
    return { manifest: Object.assign({}, base, { sources: sources }), conflicts: conflicts };
  };

  var createStore = function (reducer, initial) {
    var state = initial;
    var listeners = new Set();
    return {
      getState: function () { return state; },
      dispatch: function (action) {
        state = reducer(state, action);
        listeners.forEach(function (l) { l(state, action); });
      },
      subscribe: function (l) { listeners.add(l); return function () { listeners.delete(l); }; }
    };
  };

  // Data, not code: window.DS_BASE_PRESET loads via a <script> injection from
  // sample-data/base.js or data/base.js (see index.html). Neither present -> an empty
  // preset.
  var basePreset = function () {
    return JSON.parse(JSON.stringify(window.DS_BASE_PRESET || {
      name: 'base', query: { as_of: null, sources: {} },
      view: { joins: [], conditions: [], entities: [], column_widths: {} }
    }));
  };

  // Joins aren't a free-form list, but one per selected source except the first (the
  // base): a source enters the selection in the order it was chosen (the key order of
  // query.sources), and each following one joins onto the set accumulated so far (as
  // in SQL: table JOIN t2 JOIN t3 ...), not some arbitrary pair. order -- source names
  // in selection order; for order[i] (i>=1), a valid "left" is only what's already
  // accumulated by this step, i.e. order[0..i-1]. An existing join is kept only if its
  // left is still in this set (otherwise the source it referenced was removed/
  // reordered -- reset it to an unselected state).
  var reconcileJoins = function (order, joins) {
    var byRight = {};
    (joins || []).forEach(function (j) { if (j && j.right) byRight[j.right] = j; });
    return order.slice(1).map(function (name, i) {
      var earlier = order.slice(0, i + 1);
      var existing = byRight[name];
      var validLeft = existing && earlier.indexOf(existing.left) !== -1;
      return {
        left: validLeft ? existing.left : (earlier.length === 1 ? earlier[0] : ''),
        left_field: validLeft ? (existing.left_field || '') : '',
        right: name,
        right_field: (existing && existing.right_field) || '',
        // old presets without type -- it used to always be a LEFT JOIN
        type: existing && JOIN_TYPE_IDS.indexOf(existing.type) !== -1 ? existing.type : 'left'
      };
    });
  };

  // A preset from an arbitrary object -> its normalized form
  var normalizePreset = function (raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var query = raw.query || {};
    var view = raw.view || {};
    var sources = query.sources || {};
    var normSources = {};
    Object.keys(sources).forEach(function (name) {
      var spec = sources[name];
      normSources[name] = { labels: Array.isArray(spec && spec.labels) ? spec.labels.slice() : null };
    });
    return {
      name: typeof raw.name === 'string' ? raw.name : 'preset',
      // The human-readable title for the Table screen (viewNav, view-common.js).
      // Separate from `name` (which becomes the file name on download) -- it can be
      // fixed directly in the saved .json with a text editor, without touching the
      // file name. Empty by default (not "preset" and not the file name) -- a blank
      // preset with no source selected shouldn't show any title at all.
      description: typeof raw.description === 'string' ? raw.description : '',
      query: {
        as_of: query.as_of == null ? null : Number(query.as_of),
        sources: normSources
      },
      view: {
        joins: reconcileJoins(Object.keys(normSources), Array.isArray(view.joins) ? view.joins : []),
        conditions: normalizeConditions(view, 'conditions'),
        entityConditions: normalizeConditions(view, 'entityConditions'),
        entities: normalizeEntities(view),
        column_widths: normalizeColWidths(view)
      }
    };
  };

  // view.column_widths { "<column>": px } -- manual column widths on the Table screen
  var normalizeColWidths = function (view) {
    var cw = view && typeof view.column_widths === 'object' && view.column_widths ? view.column_widths : {};
    var out = {};
    Object.keys(cw).forEach(function (k) {
      var n = Number(cw[k]);
      if (isFinite(n) && n > 0) out[k] = Math.round(n);
    });
    return out;
  };

  // view[key] [{field, op, value}] -- a list of conditions; for key='conditions'
  // (Data's conditions, on raw source fields) this also migrates the old
  // view.column_filters ({column: substring} -> a contains operator).
  // key='entityConditions' -- Fields' conditions, by entity name, computed as the
  // second pass after resolution.
  var normalizeConditions = function (view, key) {
    key = key || 'conditions';
    var raw = Array.isArray(view[key]) ? view[key] : [];
    var out = raw.map(function (c) {
      c = c && typeof c === 'object' ? c : {};
      return {
        field: typeof c.field === 'string' ? c.field : '',
        op: OP_IDS.indexOf(c.op) !== -1 ? c.op : 'contains',
        value: c.value == null ? '' : String(c.value)
      };
    }).filter(function (c) { return c.field !== '' || c.value !== ''; });
    if (key === 'conditions' && view.column_filters && typeof view.column_filters === 'object') {
      Object.keys(view.column_filters).forEach(function (col) {
        var v = view.column_filters[col];
        if (v != null && String(v).trim() !== '') {
          out.push({ field: col, op: 'contains', value: String(v) });
        }
      });
    }
    return out;
  };

  var initialState = {
    route: 'build',
    manifest: null,
    manifestError: null,
    dataDir: null,
    preset: null,
    building: false,
    buildError: null,
    dataset: null,
    // the list of grouping levels -- applied in sequence (nested). Each level:
    // { column, agg: [{column, fn}] } -- agg is the fields aggregated in THIS level's
    // summary row (see view-table.js::renderLevel: a deeper level's aggregator is
    // visible in the summary of every level ABOVE it, while a shallower level's
    // aggregator stays only there).
    groupBy: [],
    hideEmpty: false,
    expanded: {},
    srcOpen: {},              // Data screen: which sources have their field list expanded
    // the advanced filter and the quick icons in the table header read/write the SAME
    // state (adv/sortBy) -- the icons just quickly add to what's fully edited in the
    // "Advanced filter" panel; not part of the preset.
    adv: [],                 // selection conditions: {field, op, value, conj} -- AND/OR between rows
    advOpen: false,          // the advanced-filter panel above the table is expanded
    sortBy: [],              // [{ col, dir: 'asc'|'desc' }] -- level order = priority
    quickOpen: {},           // { [column]: 'search'|'filter'|null } -- which quick slot is open
    // "Show N" in the unique-values dropdown; 0 is a valid value (turns the list off),
    // so this is an explicit number check, not "|| 10".
    quickValuesLimit: (function () {
      var saved = storage.get('quickValuesLimit');
      return typeof saved === 'number' && isFinite(saved) && saved >= 0 ? saved : 10;
    })(),
    exportFormat: 'xls',     // the chosen format in the export panel ('xls' | 'csv')
    exportOpen: false        // the export panel above the table is expanded
  };

  // ===========================================================================
  // The reducer is split by action domain (each is the same switch over its own slice
  // of cases, a faithful extraction with no change to the logic inside each case). The
  // top-level reducer() itself handles a few actions not tied to any domain (bootstrap:
  // manifest/route; export/filter panel visibility), and tries the rest by domain in
  // turn -- "state didn't change" means "this domain didn't recognize the action, try
  // the next one" (no case in any domain returns state as-is for an action it DOES
  // recognize -- setIn/Object.assign always create a new object, so this signal is
  // reliable).
  // ===========================================================================

  // --- preset/* (except the entity list -- that's in entityListReducer below) +
  // ui/toggleSrc (also about the Data screen's state -- which sources are expanded) ---
  var presetReducer = function (state, a) {
    switch (a.type) {

      case 'preset/set':
        return Object.assign({}, state, { preset: normalizePreset(a.preset), buildError: null });

      case 'preset/setName':
        return setIn(state, ['preset', 'name'], String(a.value == null ? '' : a.value));

      case 'preset/setDescription':
        return setIn(state, ['preset', 'description'], String(a.value == null ? '' : a.value));

      case 'preset/toggleSource': {
        var sources = state.preset.query.sources;
        var next;
        if (sources[a.name]) {
          next = omit(sources, a.name);
        } else {
          var ms = manifestSource(state, a.name);
          next = Object.assign({}, sources);
          // by default: just the key (needed for the JOIN between sources) -- sources
          // can have a hundred fields, and selecting all of them and making the user
          // manually uncheck the extras would be annoying
          next[a.name] = { labels: ms ? [ms.key] : null };
        }
        var withSources = setIn(state, ['preset', 'query', 'sources'], next);
        return setIn(withSources, ['preset', 'view', 'joins'],
          reconcileJoins(Object.keys(next), state.preset.view.joins));
      }

      case 'ui/toggleSrc': {
        var so = Object.assign({}, state.srcOpen);
        so[a.name] = !so[a.name];
        return Object.assign({}, state, { srcOpen: so });
      }

      case 'preset/toggleLabel': {
        var ms2 = manifestSource(state, a.source);
        var all = ms2 ? [ms2.key].concat(ms2.labels) : [];
        var cur = state.preset.query.sources[a.source].labels || all.slice();
        var labels = cur.indexOf(a.label) === -1
          ? all.filter(function (l) { return cur.indexOf(l) !== -1 || l === a.label; })
          : cur.filter(function (l) { return l !== a.label; });
        return setIn(state, ['preset', 'query', 'sources', a.source, 'labels'], labels);
      }

      case 'preset/setColWidth': {
        var cw = Object.assign({}, state.preset.view.column_widths || {});
        var wv = Number(a.width);
        if (a.width == null || !isFinite(wv) || wv <= 0) delete cw[a.column];
        else cw[a.column] = Math.round(wv);
        return setIn(state, ['preset', 'view', 'column_widths'], cw);
      }

      // a join is tied to its source positionally (see reconcileJoins) -- it's added/
      // removed automatically together with preset/toggleSource; only its fields
      // (left/left_field/right_field/type) can be edited manually
      case 'preset/updateJoin':
        return setIn(state, ['preset', 'view', 'joins'], state.preset.view.joins.map(function (j, i) {
          return i === a.index ? Object.assign({}, j, a.patch) : j;
        }));

      case 'preset/addCondition':
        return setIn(state, ['preset', 'view', 'conditions'],
          state.preset.view.conditions.concat([{ field: '', op: 'contains', value: '' }]));

      case 'preset/updateCondition':
        return setIn(state, ['preset', 'view', 'conditions'],
          state.preset.view.conditions.map(function (c, i) {
            return i === a.index ? Object.assign({}, c, a.patch) : c;
          }));

      case 'preset/removeCondition':
        return setIn(state, ['preset', 'view', 'conditions'],
          state.preset.view.conditions.filter(function (_, i) { return i !== a.index; }));

      // Fields' conditions -- the second filtering pass, after entities are computed
      // (see buildDataset in main.js); the field is an entity name, not a raw column
      case 'preset/addEntityCondition':
        return setIn(state, ['preset', 'view', 'entityConditions'],
          state.preset.view.entityConditions.concat([{ field: '', op: 'contains', value: '' }]));

      case 'preset/updateEntityCondition':
        return setIn(state, ['preset', 'view', 'entityConditions'],
          state.preset.view.entityConditions.map(function (c, i) {
            return i === a.index ? Object.assign({}, c, a.patch) : c;
          }));

      case 'preset/removeEntityCondition':
        return setIn(state, ['preset', 'view', 'entityConditions'],
          state.preset.view.entityConditions.filter(function (_, i) { return i !== a.index; }));

      default:
        return state;
    }
  };

  // --- preset/view.entities -- the Fields screen's entity list (except conditions on
  // them -- those are above, in presetReducer, with the other conditions) ---
  var entityListReducer = function (state, a) {
    switch (a.type) {

      case 'preset/addEntity': {
        var ec = entityColumns(state.preset, state.manifest && state.manifest.sources);
        var free = ec.all.filter(function (c) { return !ec.used[c]; })[0] || '';
        var freeType = free ? columnType(state.preset, state.manifest && state.manifest.sources, free) : 'text';
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.concat([
          { name: free, type: freeType, hidden: false, from: { kind: 'field', column: free } }
        ]));
      }

      // "+ source field" on Fields: add the field as-is (no renaming, but with a
      // default type from the manifest -- label_types, see entities.js::columnType).
      // Deliberately no "already taken" check -- the same field can be added again,
      // or alongside a field built from it (e.g.: the raw field for display + a
      // derived field for filtering/calculation)
      case 'preset/addFieldEntity': {
        var fieldType = columnType(state.preset, state.manifest && state.manifest.sources, a.column);
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.concat([
          { name: a.column, type: fieldType, hidden: false, from: { kind: 'field', column: a.column } }
        ]));
      }

      case 'preset/updateEntity':
        return setIn(state, ['preset', 'view', 'entities'],
          state.preset.view.entities.map(function (e, i) { return i === a.index ? mergeEntity(e, a.patch) : e; }));

      case 'preset/removeEntity':
        return setIn(state, ['preset', 'view', 'entities'],
          state.preset.view.entities.filter(function (_, i) { return i !== a.index; }));

      case 'preset/moveEntity':
        return setIn(state, ['preset', 'view', 'entities'],
          _swap(state.preset.view.entities, a.index, a.index + a.dir));

      case 'preset/addEntityInput':
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.map(function (e, i) {
          return i === a.index ? mergeEntity(e, { from: { inputs: (e.from.inputs || []).concat([{ column: '', weight: 0.5 }]) } }) : e;
        }));

      case 'preset/updateEntityInput':
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.map(function (e, i) {
          if (i !== a.index) return e;
          var ins = (e.from.inputs || []).map(function (inp, ii) {
            return ii === a.inputIndex ? Object.assign({}, inp, a.patch) : inp;
          });
          return mergeEntity(e, { from: { inputs: ins } });
        }));

      case 'preset/removeEntityInput':
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.map(function (e, i) {
          return i === a.index
            ? mergeEntity(e, { from: { inputs: (e.from.inputs || []).filter(function (_, ii) { return ii !== a.inputIndex; }) } })
            : e;
        }));

      case 'preset/moveEntityInput':
        return setIn(state, ['preset', 'view', 'entities'], state.preset.view.entities.map(function (e, i) {
          return i === a.index
            ? mergeEntity(e, { from: { inputs: _swap(e.from.inputs || [], a.inputIndex, a.inputIndex + a.dir) } })
            : e;
        }));

      default:
        return state;
    }
  };

  // --- build/* -- rebuilding the dataset (view-build.js/view-entities.js "Apply and
  // open table", main.js::buildDataset) ---
  var buildReducer = function (state, a) {
    switch (a.type) {

      case 'build/start':
        return Object.assign({}, state, { building: true, buildError: null });

      case 'build/error':
        return Object.assign({}, state, { building: false, buildError: a.message });

      case 'build/success':
        return Object.assign({}, state, {
          building: false, buildError: null, dataset: a.dataset,
          groupBy: [], hideEmpty: false, expanded: {}, quickOpen: {},
          adv: [], sortBy: []             // transient layers reset on rebuild
          // quickValuesLimit is NOT reset -- it's a UI setting, not part of the dataset
        });

      default:
        return state;
    }
  };

  // --- group/* + groupAgg/* -- Table's grouping levels and each level's summary-row
  // aggregators (view-table.js::renderAdvFilter/renderGrid) ---
  var groupReducer = function (state, a) {
    switch (a.type) {

      case 'group/add':
        return Object.assign({}, state, { groupBy: state.groupBy.concat([{ column: '', agg: [] }]) });

      case 'group/update':
        return Object.assign({}, state, {
          groupBy: state.groupBy.map(function (g, i) { return i === a.index ? Object.assign({}, g, a.patch) : g; }),
          expanded: {}
        });

      case 'group/remove':
        return Object.assign({}, state, {
          groupBy: state.groupBy.filter(function (_, i) { return i !== a.index; }),
          expanded: {}
        });

      case 'group/move':
        return Object.assign({}, state, {
          groupBy: _swap(state.groupBy, a.index, a.index + a.dir),
          expanded: {}
        });

      // {column, fn} -- column is which column to aggregate, fn is a function name
      // from Entities.AGG_FUNCS_BY_TYPE[that column's type] (the UI already picked a
      // valid combination, the reducer doesn't validate types -- that's
      // view-table.js's job).
      case 'groupAgg/add':
        return Object.assign({}, state, {
          groupBy: state.groupBy.map(function (g, i) {
            return i === a.index ? Object.assign({}, g, { agg: g.agg.concat([{ column: a.column, fn: a.fn }]) }) : g;
          })
        });

      case 'groupAgg/update':
        return Object.assign({}, state, {
          groupBy: state.groupBy.map(function (g, i) {
            if (i !== a.index) return g;
            return Object.assign({}, g, {
              agg: g.agg.map(function (x, j) { return j === a.aggIndex ? Object.assign({}, x, a.patch) : x; })
            });
          })
        });

      case 'groupAgg/remove':
        return Object.assign({}, state, {
          groupBy: state.groupBy.map(function (g, i) {
            if (i !== a.index) return g;
            return Object.assign({}, g, { agg: g.agg.filter(function (_, j) { return j !== a.aggIndex; }) });
          })
        });

      default:
        return state;
    }
  };

  // --- table/* -- rendering Table's grid: empty columns, expanded/collapsed grouping
  // nodes ---
  var tableReducer = function (state, a) {
    switch (a.type) {

      case 'table/toggleHideEmpty':
        return Object.assign({}, state, { hideEmpty: !state.hideEmpty });

      case 'table/toggleGroup': {
        var ex = Object.assign({}, state.expanded);
        if (ex[a.key]) delete ex[a.key]; else ex[a.key] = true;
        return Object.assign({}, state, { expanded: ex });
      }

      case 'table/expandAll': {
        var all2 = {};
        (a.keys || []).forEach(function (k) { all2[k] = true; });
        return Object.assign({}, state, { expanded: all2 });
      }

      case 'table/collapseAll':
        return Object.assign({}, state, { expanded: {} });

      default:
        return state;
    }
  };

  // --- sort/* -- the advanced sort panel (a multi-level editor), modeled on
  // group/add|update|remove|move above ---
  var sortReducer = function (state, a) {
    switch (a.type) {

      case 'sort/add':
        return Object.assign({}, state, { sortBy: state.sortBy.concat([{ col: '', dir: 'asc' }]) });

      case 'sort/update':
        return Object.assign({}, state, {
          sortBy: state.sortBy.map(function (s, i) { return i === a.index ? Object.assign({}, s, a.patch) : s; })
        });

      case 'sort/remove':
        return Object.assign({}, state, {
          sortBy: state.sortBy.filter(function (_, i) { return i !== a.index; })
        });

      case 'sort/move':
        return Object.assign({}, state, { sortBy: _swap(state.sortBy, a.index, a.index + a.dir) });

      default:
        return state;
    }
  };

  // --- quick/* -- the icons in the table header: quick access to the SAME state the
  // advanced panel edits (adv/sortBy), plus opening/closing their own input quick slot
  // (search/filter) ---
  var quickReducer = function (state, a) {
    switch (a.type) {

      case 'quick/toggle': {
        var qo = Object.assign({}, state.quickOpen);
        qo[a.column] = qo[a.column] === a.mode ? null : a.mode;
        return Object.assign({}, state, { quickOpen: qo });
      }

      // A click outside any open quick panel (or a repeat click on the icon, already
      // handled by quick/toggle above) -- close every open slot at once (only one can
      // be open on a column, but it's simpler to close all than to find which one).
      // See view-table.js -- the shared document click handler.
      case 'quick/closeAll':
        return Object.assign({}, state, { quickOpen: {} });

      case 'quick/sort': {
        var idx = state.sortBy.findIndex(function (s) { return s.col === a.column; });
        var sb;
        if (idx === -1) sb = state.sortBy.concat([{ col: a.column, dir: 'asc' }]);
        else if (state.sortBy[idx].dir === 'asc') {
          sb = state.sortBy.map(function (s, i) { return i === idx ? Object.assign({}, s, { dir: 'desc' }) : s; });
        } else {
          sb = state.sortBy.filter(function (_, i) { return i !== idx; });
        }
        return Object.assign({}, state, { sortBy: sb });
      }

      case 'quick/applyFilter': {
        var i2 = state.adv.findIndex(function (c) { return c.field === a.column && c.op === 'contains'; });
        var value = a.value == null ? '' : String(a.value);
        var adv;
        if (!value.trim()) {
          adv = i2 === -1 ? state.adv : state.adv.filter(function (_, i) { return i !== i2; });
        } else if (i2 === -1) {
          adv = state.adv.concat([{ field: a.column, op: 'contains', value: value, conj: 'and' }]);
        } else {
          adv = state.adv.map(function (c, i) { return i === i2 ? Object.assign({}, c, { value: value }) : c; });
        }
        return Object.assign({}, state, { adv: adv });
      }

      case 'quick/setValuesLimit': {
        var limit = Math.max(0, Math.floor(Number(a.value) || 0));
        storage.set('quickValuesLimit', limit);
        return Object.assign({}, state, { quickValuesLimit: limit });
      }

      default:
        return state;
    }
  };

  // --- adv/add|update|remove|reset -- advanced-filter conditions (not the panel's own
  // visibility -- that's in reducer() below, together with export/toggle) ---
  var advReducer = function (state, a) {
    switch (a.type) {

      case 'adv/add':
        return Object.assign({}, state, {
          adv: state.adv.concat([{ field: '', op: 'contains', value: '', conj: 'and' }])
        });

      case 'adv/update':
        return Object.assign({}, state, {
          adv: state.adv.map(function (c, i) { return i === a.index ? Object.assign({}, c, a.patch) : c; })
        });

      case 'adv/remove':
        return Object.assign({}, state, {
          adv: state.adv.filter(function (_, i) { return i !== a.index; })
        });

      case 'adv/reset':
        return Object.assign({}, state, { adv: [] });

      default:
        return state;
    }
  };

  var reducer = function (state, a) {
    switch (a.type) {

      case 'manifest/loaded':
        return Object.assign({}, state, {
          manifest: a.manifest,
          dataDir: a.dataDir,
          manifestError: (a.conflicts && a.conflicts.length)
            ? 'Source(s) with this name already exist in another manifest file: ' + a.conflicts.join(', ')
              + ' -- rename the source, or make sure it is not described in two files at once.'
            : null
        });

      case 'route/set':
        return Object.assign({}, state, { route: a.route });

      case 'ui/setExportFormat':
        return Object.assign({}, state, { exportFormat: a.value });

      // Export and Advanced filter are mutually exclusive panels above the table:
      // opening one closes the other (closing one, by itself, doesn't touch the
      // other -- it's already closed by that invariant).
      case 'export/toggle': {
        var openingExport = !state.exportOpen;
        return Object.assign({}, state, {
          exportOpen: openingExport,
          advOpen: openingExport ? false : state.advOpen
        });
      }

      case 'adv/toggle': {
        var openingAdv = !state.advOpen;
        return Object.assign({}, state, {
          advOpen: openingAdv,
          exportOpen: openingAdv ? false : state.exportOpen
        });
      }

      default:
        break;
    }

    // None of the cases listed above matched -- try the domain reducers in turn;
    // "returned a new state object" means "this domain recognized the action" (see
    // the comment before presetReducer above).
    var domains = [
      presetReducer, entityListReducer, buildReducer,
      groupReducer, tableReducer, sortReducer, quickReducer, advReducer
    ];
    for (var i = 0; i < domains.length; i++) {
      var next = domains[i](state, a);
      if (next !== state) return next;
    }
    return state;
  };

  // ---------------------------------------------------------------------------
  // Presets: download / load
  // ---------------------------------------------------------------------------

  var savePreset = function (preset) {
    var name = (preset.name || 'preset').replace(/[^\w.-]+/g, '_');
    download('joinsheets-preset-' + name + '.json', JSON.stringify(preset, null, 2), 'application/json');
  };

  var loadPresetFile = function (file, d) {
    if (!file) return;
    readFile(file).then(function (text) {
      var raw = JSON.parse(text);
      d({ type: 'preset/set', preset: raw });
    }).catch(function () {
      d({ type: 'build/error', message: 'Could not read the preset: ' + file.name });
    });
  };

  return {
    isStale: isStale, manifestSource: manifestSource, selectedNames: selectedNames,
    mergeManifests: mergeManifests,
    createStore: createStore, basePreset: basePreset, normalizePreset: normalizePreset,
    normalizeColWidths: normalizeColWidths, normalizeConditions: normalizeConditions,
    initialState: initialState, reducer: reducer,
    savePreset: savePreset, loadPresetFile: loadPresetFile
  };
});
