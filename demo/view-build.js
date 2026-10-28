'use strict';

// The Data screen: sources, joins between them, conditions on the sources' raw fields
// -- what comes after FROM/WHERE in SQL (where the data comes from and how it's
// narrowed BEFORE fields are computed). The result columns and the second conditions
// pass (by field) are a separate screen, Fields -- see view-entities.js. DOM-dependent
// code -- not covered by node:test. Depends on util.js, store.js, dataset.js
// (JOIN_TYPES), entities.js (presetColumns), view-common.js (conditionsBlock).
// References to main.js (buildDataset/store) resolve lazily through window.DS_APP at
// click time -- main.js loads last, but by the time the user can click anything, every
// script has already run.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./util.js'), require('./store.js'), require('./dataset.js'),
      require('./entities.js'), require('./view-common.js')
    );
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util, Store, Dataset, Entities, ViewCommon) {

  var el = Util.el, uniq = Util.uniq, fmtDate = Util.fmtDate;
  var selectedNames = Store.selectedNames, isStale = Store.isStale, basePreset = Store.basePreset,
      savePreset = Store.savePreset, loadPresetFile = Store.loadPresetFile;
  var JOIN_TYPES = Dataset.JOIN_TYPES;
  var presetColumns = Entities.presetColumns;
  var conditionsBlock = ViewCommon.conditionsBlock, fieldSelect = ViewCommon.fieldSelect;

  var badge = function (ms) {
    return isStale(ms)
      ? el('span', { class: 'badge stale', title: 'db_max_cnt ' + ms.db_max_cnt + ' > gen_max_cnt ' + ms.gen_max_cnt },
          'rebuild')
      : el('span', { class: 'badge fresh' }, 'fresh');
  };

  var viewBuild = function (state, d) {
    var preset = state.preset;
    var mSources = (state.manifest && state.manifest.sources) || [];
    var chosen = selectedNames(preset);

    var sourceRow = function (ms) {
      var picked = !!preset.query.sources[ms.name];
      var fields = [ms.key].concat(ms.labels);            // the key is a regular selectable field
      var wanted = picked ? (preset.query.sources[ms.name].labels || fields) : [];
      var open = picked && !!state.srcOpen[ms.name];      // the field list is expanded
      var fieldBox = function (name, isKey) {
        return el('label', { class: 'field-item' + (isKey ? ' key' : '') },
          el('input', {
            type: 'checkbox', checked: wanted.indexOf(name) !== -1,
            onchange: function () { d({ type: 'preset/toggleLabel', source: ms.name, label: name }); }
          }),
          el('span', { class: 'field-name' }, name),
          isKey ? el('span', { class: 'tag' }, 'key') : null
        );
      };
      return el('div', { class: 'src' + (picked ? ' picked' : '') },
        ms.description ? el('div', { class: 'src-description' }, ms.description) : null,
        el('div', { class: 'src-head' },
          el('button', {
            type: 'button', class: 'src-fold', disabled: !picked,
            title: !picked ? 'check the source first'
                 : (open ? 'collapse fields' : 'expand fields'),
            onclick: function () { if (picked) d({ type: 'ui/toggleSrc', name: ms.name }); }
          }, open ? '−' : '+'),
          el('label', { class: 'src-pick' },
            el('input', {
              type: 'checkbox', checked: picked,
              onchange: function () { d({ type: 'preset/toggleSource', name: ms.name }); }
            }),
            el('span', { class: 'src-name' }, ms.name)
          ),
          el('span', { class: 'muted' }, ms.rows + ' rows · as of ' + fmtDate(ms.as_of)),
          picked ? el('span', { class: 'muted src-fields-n' },
            '· fields: ' + wanted.length + ' of ' + fields.length) : null,
          badge(ms)
        ),
        open ? el('div', { class: 'field-list' },
          fieldBox(ms.key, true),
          ms.labels.map(function (lb) { return fieldBox(lb, false); })
        ) : null
      );
    };

    // fields available for a join on a source: the key + all its fields
    var fieldsOf = function (name) {
      var ms = mSources.find(function (s) { return s.name === name; });
      return ms ? uniq([ms.key].concat(ms.labels)) : [];
    };

    // A join onto source chosen[i+1] (i is its index in preset.view.joins) -- as in
    // SQL: the "left" side can only be a source already accumulated by this step
    // (earlier); the "right" side is this source itself, fixed (not chosen, hence not a
    // select). The row appears/disappears on its own when a source is checked/unchecked
    // (see preset/toggleSource -> reconcileJoins); only the fields are edited manually
    // here.
    var joinRow = function (j, rightName, i, earlier) {
      var pick = function (value, options, onchange) { return fieldSelect(value, options, onchange, '—'); };
      var typeSelect = el('select', {
        class: 'join-type', title: 'join type',
        onchange: function (e) { d({ type: 'preset/updateJoin', index: i, patch: { type: e.target.value } }); }
      }, JOIN_TYPES.map(function (t) {
        return el('option', { value: t[0], selected: t[0] === (j.type || 'left') }, t[1]);
      }));
      return el('div', { class: 'join' },
        typeSelect,
        pick(j.left, earlier, function (v) { d({ type: 'preset/updateJoin', index: i, patch: { left: v, left_field: '' } }); }),
        el('span', { class: 'dot' }, '.'),
        pick(j.left_field, fieldsOf(j.left), function (v) { d({ type: 'preset/updateJoin', index: i, patch: { left_field: v } }); }),
        el('span', { class: 'eq' }, '='),
        el('span', { class: 'src-name' }, rightName),
        el('span', { class: 'dot' }, '.'),
        pick(j.right_field, fieldsOf(rightName), function (v) { d({ type: 'preset/updateJoin', index: i, patch: { right_field: v } }); })
      );
    };

    // all selected (source, label) pairs, for the base filters
    var pickedColumns = presetColumns(preset, mSources);

    // Data's conditions -- the first filtering pass, right after the JOIN, on the
    // sources' raw fields (before fields are computed -- they aren't yet, on Data). The
    // second pass, by field name, is on the Fields screen (view.entityConditions,
    // applied after resolveEntities in main.js).
    var settingsConditions = conditionsBlock({
      d: d,
      title: 'Conditions (narrow the selection when building)',
      hint: 'applied in order (AND) when building, right after the joins -- before fields are '
        + 'computed; filtering by field is on the Fields screen',
      fields: pickedColumns,
      conditions: preset.view.conditions,
      actions: { add: 'preset/addCondition', update: 'preset/updateCondition', remove: 'preset/removeCondition' }
    });

    // The data-directory path + manifest refresh. An uncontrolled field (its value
    // doesn't follow state.dataDir on every render) -- read directly from the DOM on
    // click, like the other "once, at action time" inputs on this screen (compare the
    // window.prompt under "Download preset" below); there's no sample-data fallback
    // when the path changes -- that's a deliberate user action, not an auto-run.
    var dataDirBlock = el('div', { class: 'row' },
      el('label', { class: 'field small' }, 'Data directory (relative to index.html)',
        el('input', { type: 'text', id: 'data-dir-input', value: state.dataDir || '' })
      ),
      el('button', {
        title: 'Re-read manifest.js (+ manifest.imports.js, if present) at the given path -- pick up '
          + 'new sources without reloading the page, or switch to a different directory',
        onclick: function () {
          var input = document.getElementById('data-dir-input');
          var dir = (input && input.value || '').trim() || state.dataDir;
          window.DS_APP.refreshManifest(window.DS_APP.store, dir);
        }
      }, 'Refresh manifest'),
      // "Import" only appears if the optional JoinSheetsImport submodule is wired in
      // (index.html optionally loads import/vendor/xlsx.full.min.js + import/import.js;
      // without it, window.DS_APP.importXlsx is undefined, there's no button at all --
      // no dependency and no entry point in the lite build).
      // A visible <input type="file">, NOT a hidden one triggered via .click() --
      // cancelling the native file picker then simply does nothing (same as "Load
      // preset" below), no separate handling needed.
      window.DS_APP.importXlsx ? el('label', { class: 'file-btn' }, 'Import from Excel',
        el('input', {
          type: 'file', accept: '.xlsx',
          onchange: function (e) {
            window.DS_APP.importXlsx(e.target.files[0]);
            e.target.value = '';
          }
        })
      ) : null
    );

    return el('section', { class: 'page build' },
      el('h1', {}, 'Data'),

      dataDirBlock,
      state.manifestError ? el('p', { class: 'error' }, state.manifestError) : null,

      el('h2', {}, 'Sources and fields'),
      mSources.length
        ? el('div', { class: 'src-list' }, mSources.map(sourceRow))
        : el('p', { class: 'muted' }, 'The manifest is empty -- generate or publish data for this directory.'),

      chosen.length > 1 ? el('div', {},
        el('h2', {}, 'Joins between sources'),
        el('div', { class: 'joins' }, chosen.slice(1).map(function (name, i) {
          return joinRow(preset.view.joins[i], name, i, chosen.slice(0, i + 1));
        })),
        el('p', { class: 'muted', style: 'margin:.3rem 0 0' },
          'each following source joins onto the set accumulated so far (as in SQL) -- the left '
          + 'side can be any previously included source; the join type determines which unmatched '
          + 'rows remain: left keeps all rows of the left source, right keeps all rows of the right '
          + 'source, inner keeps only matches, full keeps all')
      ) : null,

      settingsConditions,

      state.buildError ? el('p', { class: 'error' }, state.buildError) : null,

      el('div', { class: 'row' },
        el('label', { class: 'field small' }, 'Preset name',
          el('input', {
            type: 'text', value: preset.name || '',
            onchange: function (e) { d({ type: 'preset/setName', value: e.target.value }); }
          })
        ),
        el('span', { class: 'muted' },
          'changes save automatically as this tab\'s default preset (sessionStorage); '
          + '"Download preset" is a separate file')
      ),

      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', disabled: state.building || !chosen.length,
          onclick: function () { window.DS_APP.buildDataset(window.DS_APP.store); }
        }, state.building ? 'Building…' : 'Apply and open table'),
        el('button', {
          onclick: function () {
            // "Save As": file name -> description (defaults to the name just entered;
            // opening the saved .json in a text editor and editing it is the normal way
            // to give a longer description separate from the name). Cancelling the
            // first prompt means not saving at all; cancelling the second leaves the
            // description equal to the name, and saving still happens.
            var defaultName = preset.name || 'preset';
            var name = window.prompt('Preset file name:', defaultName);
            if (name == null) return;
            name = name.trim() || defaultName;
            var description = window.prompt(
              'Preset description (shown as the title on the Table screen):', name
            );
            if (description == null) description = name;
            d({ type: 'preset/setName', value: name });
            d({ type: 'preset/setDescription', value: description });
            savePreset(Object.assign({}, preset, { name: name, description: description }));
          }
        }, 'Download preset'),
        el('label', { class: 'file-btn' }, 'Load preset',
          el('input', {
            type: 'file', accept: '.json,application/json',
            onchange: function (e) { loadPresetFile(e.target.files[0], d); e.target.value = ''; }
          })
        ),
        el('button', { onclick: function () { d({ type: 'preset/set', preset: basePreset() }); } }, 'Reset to base')
      )
    );
  };

  return { viewBuild: viewBuild };
});
