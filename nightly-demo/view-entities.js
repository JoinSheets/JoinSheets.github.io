'use strict';

// The Fields screen: entities -- the result table's columns. What comes after SELECT
// in SQL (which fields to show and how to compute them), as opposed to Data
// (sources/joins/conditions -- what comes after FROM). From the fields selected on
// Data, you build the result columns: a field as-is ("+ source field" -- no typing/
// renaming), collision resolution by weight, a formula (letter variables A, B, ... +
// an expression, see formula.js), or a renamed/typed field ("+ field").
// The conditions at the bottom of the page are the second filtering pass (after Data's
// conditions on raw fields), now by entity name, applied in main.js after
// resolveEntities. DOM-dependent code -- not covered by node:test. Depends on util.js,
// store.js (selectedNames), entities.js (ENTITY_KINDS/ENTITY_TYPES/entityOutNames/
// lettersForInputs), formula.js (letterFor/parse/FUNCTIONS), view-common.js
// (conditionsBlock), i18n.js (t).
// The reference to main.js (buildDataset/store) resolves lazily through window.DS_APP
// at click time -- main.js loads last.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./util.js'), require('./store.js'), require('./entities.js'),
      require('./view-common.js'), require('./formula.js'), require('./i18n.js')
    );
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP, root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util, Store, Entities, ViewCommon, Formula, I18N) {

  var el = Util.el;
  var selectedNames = Store.selectedNames;
  var ENTITY_KINDS = Entities.ENTITY_KINDS, ENTITY_TYPES = Entities.ENTITY_TYPES,
      entityOutNames = Entities.entityOutNames, lettersForInputs = Entities.lettersForInputs,
      presetColumns = Entities.presetColumns;
  var conditionsBlock = ViewCommon.conditionsBlock, fieldSelect = ViewCommon.fieldSelect,
      moveRemoveButtons = ViewCommon.moveRemoveButtons;
  var t = I18N.t;

  var viewEntities = function (state, d) {
    var preset = state.preset;
    var mSources = (state.manifest && state.manifest.sources) || [];
    var chosen = selectedNames(preset);

    // the same fields selectable on Data for conditions -- the source of entities: any
    // selected field of any selected source
    var pickedColumns = presetColumns(preset, mSources);

    // exclude -- columns not to offer in the list (except cur -- the current one is
    // always visible in its own select, even if formally "taken"). Needed for formula
    // inputs: the same raw field can't be picked for two different inputs of the same
    // entity.
    var colSelect = function (cur, onChange, exclude) {
      var hide = exclude || [];
      var options = pickedColumns.filter(function (c) { return c === cur || hide.indexOf(c) === -1; });
      return fieldSelect(cur, options, onChange, t('common.fieldPlaceholder'));
    };

    // an entity row's "label · control"; block -- for a multi-line control
    var entField = function (lbl, control, block) {
      return el('div', { class: 'entity-field' + (block ? ' block' : '') },
        el('span', { class: 'entity-field-lbl' }, lbl),
        el('div', { class: 'entity-field-ctl' }, control)
      );
    };

    // withLetters -- show the letter (A, B, ...) before the field pick (formula inputs);
    // the same letter is the variable name in the formula field below. Positional, not
    // stored separately -- recomputed from the index on every render (like spreadsheet
    // column numbering): reorder/remove an input and the others' letters shift, the
    // formula may need a manual fix.
    var entityInputs = function (e, i, withWeight, withLetters) {
      var inputs = e.from.inputs || [];
      return el('div', { class: 'entity-inputs' },
        inputs.map(function (inp, ii) {
          // the same raw field can't be picked for two inputs of the SAME entity --
          // not formally blocked, but pointless (it already has a letter); each
          // input's list excludes what's taken by this entity's other inputs.
          var usedByOthers = inputs
            .filter(function (_, jj) { return jj !== ii; })
            .map(function (x) { return x.column; });
          return el('div', { class: 'entity-input' },
            withLetters ? el('span', { class: 'entity-letter' }, Formula.letterFor(ii)) : null,
            colSelect(inp.column, function (v) {
              d({ type: 'preset/updateEntityInput', index: i, inputIndex: ii, patch: { column: v } });
            }, usedByOthers),
            withWeight ? el('input', {
              type: 'number', class: 'ent-weight', step: '0.05', min: '0', max: '1',
              value: inp.weight == null ? '' : String(inp.weight), placeholder: t('entities.weightPlaceholder'),
              onchange: function (ev) {
                d({ type: 'preset/updateEntityInput', index: i, inputIndex: ii,
                    patch: { weight: ev.target.value === '' ? 0 : Number(ev.target.value) } });
              }
            }) : null,
            moveRemoveButtons({
              upTitle: t('common.up'), downTitle: t('common.down'),
              upDisabled: ii === 0, downDisabled: ii === inputs.length - 1,
              onUp: function () { d({ type: 'preset/moveEntityInput', index: i, inputIndex: ii, dir: -1 }); },
              onDown: function () { d({ type: 'preset/moveEntityInput', index: i, inputIndex: ii, dir: 1 }); },
              onRemove: function () { d({ type: 'preset/removeEntityInput', index: i, inputIndex: ii }); }
            })
          );
        }),
        el('button', { class: 'link', onclick: function () { d({ type: 'preset/addEntityInput', index: i }); } }, t('entities.addInput'))
      );
    };

    var entityRow = function (e, i) {
      var up = function (patch) { d({ type: 'preset/updateEntity', index: i, patch: patch }); };
      var kind = (e.from && e.from.kind) || 'field';
      var pp = e.parse || {};

      var body;
      if (kind === 'resolve') {
        body = el('div', {},
          entityInputs(e, i, true),
          el('label', { class: 'chk' },
            el('input', {
              type: 'checkbox', checked: e.from.null_wins !== false,
              onchange: function (ev) { up({ from: { null_wins: ev.target.checked } }); }
            }),
            t('entities.nullWins')),
          el('p', { class: 'muted', style: 'margin:.2rem 0 0' }, t('entities.weightTieHint'))
        );
      } else if (kind === 'formula') {
        var letters = lettersForInputs(e.from.inputs || []);
        var formulaText = e.from.formula || '';
        var parsed = formulaText.trim() ? Formula.parse(formulaText, letters) : null;
        // parsed.error -- a formula parse failure -- is {errorKey, errorParams, pos}, not
        // a ready English string (see formula.js): translate the message itself, then
        // append the position, in its own translated wrapper, only when pos is known
        // (the empty-formula case has none).
        var parsedError = parsed && !parsed.ok
          ? t(parsed.errorKey, parsed.errorParams) + (parsed.pos != null ? t('formulaError.atPosition', { pos: parsed.pos }) : '')
          : null;
        body = el('div', {},
          entityInputs(e, i, false, true),
          el('label', { class: 'field small', style: 'display:block;margin-top:.5rem' }, t('entities.formulaLabel'),
            el('input', {
              type: 'text', class: 'ent-formula', value: formulaText,
              placeholder: letters.length ? letters.join(' + ') : t('entities.formulaPlaceholderEmpty'),
              onchange: function (ev) { up({ from: { formula: ev.target.value } }); }
            })
          ),
          parsedError ? el('p', { class: 'error', style: 'margin:.2rem 0 0' }, parsedError) : null,
          el('p', { class: 'muted', style: 'margin:.2rem 0 0' },
            t('entities.formulaHint', { functions: Object.keys(Formula.FUNCTIONS).concat(['IF']).join(', ') }))
        );
      } else {
        body = colSelect(e.from.column, function (v) { up({ from: { column: v } }); });
      }

      var typeExtra = null;
      if (e.type === 'date') {
        typeExtra = el('div', {},
          el('div', { class: 'entity-format' },
            el('label', { class: 'field small' }, t('entities.dateInputFormatLabel'),
              el('input', { type: 'text', value: pp.date_in || 'auto',
                placeholder: t('entities.dateInputFormatPlaceholder'),
                onchange: function (ev) { up({ parse: { date_in: ev.target.value } }); } })),
            el('label', { class: 'field small' }, t('entities.dateOutputFormatLabel'),
              el('input', { type: 'text', value: pp.date_out || 'YYYY-MM-DD',
                onchange: function (ev) { up({ parse: { date_out: ev.target.value } }); } }))),
          el('p', { class: 'muted', style: 'margin:.2rem 0 0' }, t('entities.dateFormatHint'))
        );
      } else if (e.type === 'bool') {
        typeExtra = el('div', { class: 'entity-format' },
          el('label', { class: 'field small' }, t('entities.trueTokensLabel'),
            el('input', { type: 'text', value: pp['true'] || 'true,1,yes,y,+',
              onchange: function (ev) { up({ parse: { 'true': ev.target.value } }); } })));
      } else if (e.type === 'number') {
        typeExtra = el('div', { class: 'entity-format' },
          el('label', { class: 'field small' }, t('entities.decimalSeparatorLabel'),
            el('select', { onchange: function (ev) { up({ parse: { decimal: ev.target.value } }); } },
              [['auto', 'numberDecimal.auto'], ['.', 'numberDecimal.period'], [',', 'numberDecimal.comma']].map(function (o) {
                return el('option', { value: o[0], selected: o[0] === (pp.decimal || 'auto') }, t(o[1]));
              }))));
      }

      var kindSelect = el('select', { onchange: function (ev) { up({ from: { kind: ev.target.value } }); } },
        ENTITY_KINDS.map(function (o) { return el('option', { value: o[0], selected: o[0] === kind }, t('entityKind.' + o[0])); }));
      var typeSelect = el('select', { onchange: function (ev) { up({ type: ev.target.value }); } },
        ENTITY_TYPES.map(function (o) { return el('option', { value: o[0], selected: o[0] === (e.type || 'text') }, t('entityType.' + o[0])); }));

      return el('div', { class: 'entity' + (e.hidden ? ' hidden-ent' : '') },
        el('div', { class: 'entity-head' },
          entField(t('entities.nameLabel'), el('input', {
            type: 'text', class: 'ent-alias', value: e.name || '', placeholder: t('entities.columnNamePlaceholder'),
            onchange: function (ev) { up({ name: ev.target.value }); }
          })),
          el('div', { class: 'entity-tools' },
            el('label', { class: 'chk', title: t('entities.hideInTableTitle') },
              el('input', {
                type: 'checkbox', checked: !!e.hidden,
                onchange: function (ev) { up({ hidden: ev.target.checked }); }
              }),
              t('entities.hideInTable')),
            moveRemoveButtons({
              upTitle: t('entities.moveUp'), downTitle: t('entities.moveDown'), removeTitle: t('entities.removeField'),
              upDisabled: i === 0, downDisabled: i === preset.view.entities.length - 1,
              onUp: function () { d({ type: 'preset/moveEntity', index: i, dir: -1 }); },
              onDown: function () { d({ type: 'preset/moveEntity', index: i, dir: 1 }); },
              onRemove: function () { d({ type: 'preset/removeEntity', index: i }); }
            })
          )
        ),
        el('div', { class: 'entity-rows' },
          entField(t('entities.calculationMethod'), kindSelect),
          entField(t('entities.dataType'), typeSelect),
          entField(t('entities.calculationSource'), body, kind !== 'field')
        ),
        typeExtra
      );
    };

    // "+ source field" -- one button per selected field, with no "already taken"
    // filtering: the same field can be added as-is again, or alongside a field built
    // from it (e.g.: the field as-is + a derived field computed/conditioned on it)
    var addFieldRow = pickedColumns.length ? el('div', { class: 'row', style: 'gap:.3rem;flex-wrap:wrap' },
      pickedColumns.map(function (c) {
        return el('button', {
          class: 'link', title: t('entities.addSourceFieldTitle', { column: c }),
          onclick: function () { d({ type: 'preset/addFieldEntity', column: c }); }
        }, '+ ' + c);
      })
    ) : null;

    var entityConditions = conditionsBlock({
      d: d,
      title: t('entities.conditionsTitle'),
      hint: t('entities.conditionsHint'),
      fields: entityOutNames(preset.view.entities),
      conditions: preset.view.entityConditions,
      actions: { add: 'preset/addEntityCondition', update: 'preset/updateEntityCondition', remove: 'preset/removeEntityCondition' }
    });

    return el('section', { class: 'page entities' },
      el('h1', {}, t('entities.pageTitle')),

      pickedColumns.length
        ? el('div', {},
            preset.view.entities.length
              ? el('div', { class: 'entities' }, preset.view.entities.map(entityRow))
              : el('p', { class: 'muted' }, t('entities.noFieldsYet')),
            el('h2', { style: 'margin-top:.6rem' }, t('entities.sourceFieldsAsIs')),
            addFieldRow,
            el('div', { class: 'row', style: 'gap:.5rem;margin:.4rem 0 0' },
              el('button', { class: 'link', onclick: function () { d({ type: 'preset/addEntity' }); } }, t('entities.addField'))
            ),
            el('p', { class: 'muted', style: 'margin:.3rem 0 0' }, t('entities.fieldsHint')),
            entityConditions
          )
        : el('p', { class: 'muted' }, t('entities.chooseSourcesFirst')),

      state.buildError ? el('p', { class: 'error' }, t(state.buildError.key, state.buildError.params)) : null,

      el('div', { class: 'actions' },
        el('button', {
          class: 'primary', disabled: state.building || !chosen.length,
          onclick: function () { window.DS_APP.buildDataset(window.DS_APP.store); }
        }, state.building ? t('common.building') : t('common.applyAndOpenTable'))
      )
    );
  };

  return { viewEntities: viewEntities };
});
