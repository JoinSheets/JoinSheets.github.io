'use strict';

// Shared DOM controls used by both the Builder (Data/Fields) and the Table: the
// condition-operator select, the condition-value control (including pasting a list
// from the clipboard), the nav header (main menu -- Data/Advanced filter/Export) and
// the status-line wrapper at the bottom of the window. DOM-dependent code -- not
// covered by node:test. Depends on util.js (el), effects.js (pasteFromClipboard),
// dataset.js (OP_LIST/OP_NO_VALUE/OPERATORS/parseList).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./util.js'), require('./effects.js'), require('./dataset.js'));
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP, root.DS_APP, root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util, Effects, Dataset) {

  var el = Util.el, clear = Util.clear;
  var pasteFromClipboard = Effects.pasteFromClipboard;
  var OPERATORS = Dataset.OPERATORS, OP_LIST = Dataset.OP_LIST, OP_NO_VALUE = Dataset.OP_NO_VALUE,
      parseList = Dataset.parseList;

  // A <select> with a placeholder first option ("field…", "—", ...) -- the shared look
  // for every field/column select on Data, Fields, and the advanced filter
  // (conditions/grouping/sorting/aggregates).
  var fieldSelect = function (value, options, onChange, placeholderLabel) {
    return el('select', { onchange: function (e) { onChange(e.target.value); } },
      [el('option', { value: '' }, placeholderLabel)].concat(options.map(function (c) {
        return el('option', { value: c, selected: c === value }, c);
      })));
  };

  // Three ↑/↓/✕ buttons for a row in an editable list (conditions, grouping/sorting
  // levels, entity inputs/list) -- disabled+title at the list's edges for ↑/↓,
  // consistent everywhere. opts: {onUp, onDown, onRemove, upDisabled, downDisabled,
  // upTitle, downTitle, removeTitle} -- upTitle/downTitle/removeTitle are optional (not
  // every list's ✕ button needs an explanatory title).
  var moveRemoveButtons = function (opts) {
    var upAttrs = { class: 'link', disabled: !!opts.upDisabled, onclick: opts.onUp };
    if (opts.upTitle) upAttrs.title = opts.upTitle;
    var downAttrs = { class: 'link', disabled: !!opts.downDisabled, onclick: opts.onDown };
    if (opts.downTitle) downAttrs.title = opts.downTitle;
    var removeAttrs = { class: 'link', onclick: opts.onRemove };
    if (opts.removeTitle) removeAttrs.title = opts.removeTitle;
    return [el('button', upAttrs, '↑'), el('button', downAttrs, '↓'), el('button', removeAttrs, '✕')];
  };

  // --- condition row: shared controls for the Builder and the advanced filter ---
  var opSelect = function (curOp, onChange) {
    return el('select', { onchange: function (e) { onChange(e.target.value); } },
      OPERATORS.map(function (o) {
        return el('option', { value: o[0], selected: o[0] === curOp }, o[1]);
      }));
  };

  var valueControl = function (op, value, onValue) {
    if (OP_LIST[op]) {
      return el('div', { class: 'cond-list-wrap' },
        el('textarea', {
          class: 'cond-list', rows: 3,
          placeholder: 'values: one per line or comma-separated',
          onchange: function (e) { onValue(e.target.value); }
        }, value || ''),
        el('div', { class: 'cond-list-tools' },
          el('button', {
            class: 'link', type: 'button',
            onclick: function () {
              pasteFromClipboard(function (text) {
                var cur = value || '';
                onValue(cur.trim() ? cur.replace(/\s+$/, '') + '\n' + text : text);
              });
            }
          }, 'Paste from clipboard'),
          el('span', { class: 'muted' }, parseList(value).length + ' value(s)')
        )
      );
    }
    return el('input', {
      type: 'text', class: 'cond-value', value: value || '',
      placeholder: OP_NO_VALUE[op] ? '—' : 'value',
      disabled: !!OP_NO_VALUE[op],
      onchange: function (e) { onValue(e.target.value); }
    });
  };

  // A selection-condition row: [optional leading node] + field + operator + value + ✕.
  // Used both by conditionsBlock (no leading -- Data/Fields), and directly by
  // renderAdvFilter::advRow (view-table.js, leading -- the AND/OR selector between rows).
  var conditionRow = function (cond, fields, onPatch, onRemove, leading) {
    var patch = function (p) { onPatch(p); };
    return el('div', { class: 'condition' + (OP_LIST[cond.op] ? ' has-list' : '') },
      leading || null,
      fieldSelect(cond.field, fields, function (v) { patch({ field: v }); }, 'field…'),
      opSelect(cond.op, function (v) { patch({ op: v }); }),
      valueControl(cond.op, cond.value, function (v) { patch({ value: v }); }),
      el('button', { class: 'link', onclick: onRemove }, '✕')
    );
  };

  // A selection-conditions block -- shared by Data (raw source fields, before entities
  // are computed) and Fields (entity names, after the computation): same UI, different
  // field lists and different reducer actions, so each screen keeps its own condition
  // list in its own preset section. Renders nothing if fields is empty (nothing to
  // filter on) -- the caller itself decides this condition isn't needed.
  var conditionsBlock = function (opts) {
    if (!opts.fields.length) return null;
    var d = opts.d;
    var row = function (cond, i) {
      return conditionRow(cond, opts.fields,
        function (p) { d({ type: opts.actions.update, index: i, patch: p }); },
        function () { d({ type: opts.actions.remove, index: i }); });
    };
    return el('div', {},
      el('h2', {}, opts.title),
      el('div', { class: 'conditions' }, opts.conditions.map(row)),
      el('button', { class: 'link', onclick: function () { d({ type: opts.actions.add }); } }, '+ condition'),
      el('p', { class: 'muted', style: 'margin:.3rem 0 0' }, opts.hint)
    );
  };

  // The input field under the "search"/"filter" icons in a column header
  // (view-table.js): one visual component shared by both modes -- they differ only in
  // applyIcon/applyTitle/placeholder and what onApply does (search -- jump to the row,
  // filter -- a contains condition in state.adv). Two separate actions, both consistent
  // between search and filter:
  //  - clicking a value from the dropdown only FILLS the text into the field (a direct
  //    DOM mutation of the input, no dispatch) and puts the cursor at the end of the
  //    filled-in value; the panel does NOT close and nothing is applied -- the user can
  //    still edit/extend the text.
  //  - Enter (in the field) or clicking the button on the right -- opts.onApply: the
  //    target action (search/filter) + closing the panel (view-table.js::quickPanel).
  // opts.autofocus -- the panel was just opened (view-table.js::toggleQuick) -- focus it
  // and put the cursor at the end of the current value; needs a live DOM node, hence
  // requestAnimationFrame (right after opening, the input isn't synchronously in the
  // document yet). The dropdown of the first N unique column values (opts.values,
  // Dataset.uniqueValues) + a "Show N" setting below it. Opens on clicking the icon;
  // closes on Enter, a click outside the panel (document click, see
  // view-table.js::attachDocCloseListener), or clicking the icon again.
  var quickValueInput = function (opts) {
    var input = el('input', {
      type: 'text', class: 'quick-input', value: opts.value || '',
      placeholder: opts.placeholder, title: opts.title,
      oninput: function (e) { if (opts.onInput) opts.onInput(e.target.value); },
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); opts.onApply(e.target.value); }
        else if (e.key === 'Escape' && opts.onEscape) { e.preventDefault(); opts.onEscape(); }
      }
    });
    if (opts.autofocus && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        input.focus();
        var end = input.value.length;
        if (input.setSelectionRange) input.setSelectionRange(end, end);
      });
    }
    var field = el('div', { class: 'quick-input-field' + (opts.dirty ? ' dirty' : '') },
      input,
      el('button', {
        type: 'button', class: 'quick-input-apply', html: opts.applyIcon, title: opts.applyTitle,
        onclick: function () { opts.onApply(input.value); }
      })
    );
    var dropdown = (opts.limit > 0 && opts.values && opts.values.length)
      ? el('div', { class: 'quick-values' }, opts.values.map(function (v) {
          return el('button', {
            type: 'button', class: 'quick-values-item', title: v,
            onclick: function () {
              input.value = v;
              if (opts.onInput) opts.onInput(v);
              input.focus();
              if (input.setSelectionRange) input.setSelectionRange(v.length, v.length);
            }
          }, v);
        }))
      : null;
    var limitRow = el('div', { class: 'quick-values-limit' },
      'Show ',
      el('input', {
        type: 'number', min: '0', step: '1', class: 'quick-values-limit-input',
        value: String(opts.limit),
        onchange: function (e) { opts.onLimitChange(e.target.value); }
      })
    );
    return el('div', { class: 'quick-panel' }, field, dropdown, limitRow);
  };

  // Settings icon (a gear) -- the one icon left in the nav header after Export/
  // Advanced filter/Fields/Data lost theirs (see viewNav below); icon-only, no
  // label, so it needed one of its own rather than reusing the old "⚙ Data" text
  // prefix. A filled ring (two circles combined with fill-rule=evenodd) plus 8
  // teeth as rotated rects -- same monochrome currentColor treatment as the
  // other small icons here (FUNNEL_SVG etc.).
  var SETTINGS_SVG =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">'
    + '<path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M8 2.5A5.5 5.5 0 1 0 8 13.5A5.5 5.5 0 1 0 8 2.5Z'
    + 'M8 5A3 3 0 1 0 8 11A3 3 0 1 0 8 5Z"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(45 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(90 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(135 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(180 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(225 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(270 8 8)"/>'
    + '<rect x="6.9" y=".3" width="2.2" height="3" rx=".5" fill="currentColor" transform="rotate(315 8 8)"/></svg>';

  // The one source of truth for the running version is index.html's own
  // <meta name="version">, bumped by hand at every release -- read it from
  // there (Settings > About) rather than hardcoding the string a second
  // time in JS, where it would inevitably drift out of sync. Falls back to
  // "(unknown)" rather than throwing if the tag is ever missing.
  var appVersion = function () {
    var meta = document.querySelector('meta[name="version"]');
    return (meta && meta.content) || '(unknown)';
  };

  // The org mark (three overlapping rounded squares -- joinsheets.github.io's own
  // logo, kept in its own colors rather than currentColor like the other icons here,
  // so it reads as a brand mark rather than a UI control). Matches the site's actual
  // pick, logo-13-venn-p4-outline.svg (design/logos/ in the JoinSheets.github.io repo).
  var ORG_LOGO_SVG =
    '<svg viewBox="0 0 100 100" width="32" height="32" aria-hidden="true" focusable="false">'
    + '<rect x="16" y="14" width="50" height="50" rx="9" ry="9" fill="none" stroke="#2b2b2e" stroke-width="3.5"/>'
    + '<rect x="38" y="18" width="42" height="42" rx="9" ry="9" fill="none" stroke="#9a9a9e" stroke-width="3.5"/>'
    + '<rect x="26" y="42" width="38" height="38" rx="9" ry="9" fill="none" stroke="#d98f2b" stroke-width="3.5"/></svg>';

  // Funnel icon -- the same one used by the column quick-filter apply button in
  // view-table.js (reused from there via ViewCommon.FUNNEL_SVG -- one visual language
  // for "this is about filtering").
  var FUNNEL_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M1.7 2h12.6a.5.5 0 0 1 .4.8L10 9.2v3.5a.5.5 0 0 1-.7.46l-2.5-1.1'
    + 'A.5.5 0 0 1 6.3 11.6V9.2L1.3 2.8A.5.5 0 0 1 1.7 2Z"/></svg>';

  // Search icon -- a magnifying glass, under a column header (view-table.js), the same
  // monochrome treatment as the funnel/export/fields icons.
  var SEARCH_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">'
    + '<circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/>'
    + '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
    + 'd="M10.2 10.2 14 14"/></svg>';

  // Sort icon -- the unsorted state is three bars of different widths (a staircase)
  // left-aligned, a right triangle rather than a funnel (kept visually distinct from the
  // filled filter funnel next to it). Ascending -- wide at the bottom, narrow at the top
  // (triangle pointing up); descending -- mirrored, wide at the top. Same viewBox across
  // all three so the icon doesn't "jump" when the state toggles.
  var SORT_SVG =
    '<svg viewBox="0 0 16 14" width="13" height="12" aria-hidden="true" focusable="false">'
    + '<rect x="0" y="0" width="16" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="5.5" width="16" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="11" width="16" height="3" rx="1" fill="currentColor"/></svg>';
  var SORT_ASC_SVG =
    '<svg viewBox="0 0 16 14" width="13" height="12" aria-hidden="true" focusable="false">'
    + '<rect x="0" y="0" width="5" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="5.5" width="10" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="11" width="16" height="3" rx="1" fill="currentColor"/></svg>';
  var SORT_DESC_SVG =
    '<svg viewBox="0 0 16 14" width="13" height="12" aria-hidden="true" focusable="false">'
    + '<rect x="0" y="0" width="16" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="5.5" width="10" height="3" rx="1" fill="currentColor"/>'
    + '<rect x="0" y="11" width="5" height="3" rx="1" fill="currentColor"/></svg>';

  // Main nav menu. Data and Fields are real pages (they fully replace the screen, which
  // makes sense as separate screens): Data holds sources, joins, conditions (what comes
  // after FROM in SQL); Fields holds the entities, i.e. which columns to show and how to
  // compute them (what comes after SELECT). Export and Filter are toggles for a panel
  // hidden by default ABOVE the table (renderExportPanel / renderAdvFilter in
  // view-table.js): the data stays visible while you filter or export it. Text labels
  // only, no icons: these used to carry one (e.g. FUNNEL_SVG on Filter), but that same
  // icon is also what marks a column's own quick-filter trigger -- two different things
  // sharing one pictogram read as one, so the nav buttons dropped theirs. Settings (the
  // gear, below) is the one deliberate exception -- it has no label at all, so it needs
  // its icon to say what it is.
  //
  // Export/Filter/Settings open/close the same way (click toggles, opening one closes
  // the other two -- see store.js's reducer) and look the same way while open: filled
  // with the accent color (.gear.active, styles.css), not a ▸/▾ indicator in the label
  // -- that read as less noticeable than a fill, and dropping it frees up enough width
  // that all the nav buttons fit on one line on a narrow screen instead of wrapping.
  var viewNav = function (state, d) {
    var menu = state.route === 'table'
      ? [
          el('button', {
            class: 'gear' + (state.exportOpen ? ' active' : ''), disabled: !state.dataset,
            onclick: function () { d({ type: 'export/toggle' }); }
          }, 'Export'),
          el('button', {
            class: 'gear' + (state.advOpen ? ' active' : ''), disabled: !state.dataset,
            title: 'Advanced filter and sort: temporary, applied on top of the selection, not saved',
            onclick: function () { d({ type: 'adv/toggle' }); }
          }, 'Filter'),
          el('button', {
            class: 'gear',
            title: 'Fields: which columns to show and how to compute them',
            onclick: function () { d({ type: 'route/set', route: 'entities' }); }
          }, 'Fields'),
          el('button', {
            class: 'gear', title: 'Data: sources, joins, conditions',
            onclick: function () { d({ type: 'route/set', route: 'build' }); }
          }, 'Data')
        ]
      : state.route === 'build'
      // Data <-> Fields are adjacent builder pages (same level, it makes sense to
      // switch between them directly without going through Table each time); Table
      // is forward, to the result.
      ? [
          el('button', {
            class: 'gear', onclick: function () { d({ type: 'route/set', route: 'entities' }); }
          }, '← To Fields'),
          el('button', {
            class: 'gear', disabled: !state.dataset,
            onclick: function () { d({ type: 'route/set', route: 'table' }); }
          }, 'To Table →')
        ]
      : [
          el('button', {
            class: 'gear', disabled: !state.dataset,
            onclick: function () { d({ type: 'route/set', route: 'table' }); }
          }, '← To Table'),
          el('button', {
            class: 'gear', onclick: function () { d({ type: 'route/set', route: 'build' }); }
          }, 'To Data →')
        ];
    // Two rows: logo + "JoinSheets" + the route buttons + Settings on top (the
    // app's own chrome), the current preset's description below it (what you're
    // actually looking at right now -- a blank preset shows no second row at all,
    // not an empty one, see store.js::normalizePreset).
    //
    // The top row is itself two blocks -- .nav-brand (logo + name) and
    // .nav-actions (the buttons) -- rather than one flat row of items, so a
    // narrow screen wraps between the two blocks as a whole (brand on its own
    // line, actions on the next) instead of wrapping in the middle of the
    // button list wherever it happens to run out of width.
    return el('header', { class: 'nav' },
      el('div', { class: 'nav-row' },
        el('div', { class: 'nav-brand' },
          el('a', {
            class: 'org-logo', href: 'https://joinsheets.github.io/',
            target: '_blank', rel: 'noopener', title: 'JoinSheets documentation & site'
          }, el('span', { html: ORG_LOGO_SVG })),
          el('strong', {}, 'JoinSheets')
        ),
        el('div', { class: 'nav-actions' },
          menu,
          // Settings -- reachable from every screen (unlike the route-specific
          // buttons above), always the rightmost item.
          el('button', {
            class: 'gear settings-toggle' + (state.settingsOpen ? ' active' : ''),
            title: 'Settings', 'aria-label': 'Settings',
            onclick: function () { d({ type: 'settings/toggle' }); }
          }, el('span', { html: SETTINGS_SVG }))
        )
      ),
      (state.preset && state.preset.description)
        ? el('div', { class: 'nav-row' }, el('strong', {}, state.preset.description))
        : null
    );
  };

  // The settings panel (gear icon in viewNav) -- unlike Export/Advanced filter
  // above, reachable from every route, so main.js mounts its target div once,
  // outside the per-route content, and calls this on every render() regardless of
  // state.route. THEMES comes from theme.js, resolved lazily off window.DS_APP
  // (not a factory dependency of this file) -- same lazy-reference convention
  // view-table.js uses for main.js's store/exportXls/exportCsv: by the time any
  // render() actually runs, every script has already loaded.
  var renderSettingsPanel = function (state, d) {
    var node = document.getElementById('settings-panel');
    if (!node) return;
    clear(node);
    if (!state.settingsOpen) return;

    var THEMES = (window.DS_APP && window.DS_APP.THEMES) || [];
    node.appendChild(el('div', { class: 'advfilter-panel' },
      el('h2', {}, 'Theme'),
      el('div', { class: 'row' },
        THEMES.map(function (t) {
          return el('label', { class: 'chk' },
            el('input', {
              type: 'radio', name: 'theme', checked: state.theme === t.id,
              onchange: function () { d({ type: 'settings/setTheme', theme: t.id }); }
            }),
            t.name
          );
        })
      ),
      el('h2', {}, 'Language'),
      el('div', { class: 'row' },
        el('span', { class: 'muted' }, 'English -- more languages coming in a future release')
      ),
      el('h2', {}, 'About'),
      el('div', { class: 'row' },
        // The version has exactly one source of truth: index.html's own
        // <meta name="version">, bumped by hand at every release -- read it
        // from there instead of duplicating the string in JS.
        el('span', {}, 'JoinSheets ' + appVersion()),
        el('a', {
          class: 'about-link', href: 'https://joinsheets.github.io/',
          target: '_blank', rel: 'noopener'
        }, 'Documentation & site')
      ),
      el('div', { class: 'actions' },
        // The theme already applies as soon as it's picked above (and is saved/
        // synced across tabs, see main.js) -- Apply's only real job is closing the
        // panel, a second, explicit way to do what clicking the gear again also
        // does.
        el('button', {
          class: 'primary', onclick: function () { d({ type: 'settings/toggle' }); }
        }, 'Apply')
      )
    ));
  };

  // The status-line content at the bottom of the window (as in many desktop apps) --
  // the <footer> itself is created once in main.js and doesn't scroll with the page,
  // always visible. The text is assembled entirely by main.js (alongside the data
  // sources and the Table's filter pipeline) -- this is just the wrapper.
  var viewFooter = function (text, warn) {
    return el('span', { class: 'muted' + (warn ? ' warn' : '') }, text);
  };

  return {
    opSelect: opSelect, valueControl: valueControl, quickValueInput: quickValueInput,
    fieldSelect: fieldSelect, moveRemoveButtons: moveRemoveButtons,
    viewNav: viewNav, viewFooter: viewFooter, renderSettingsPanel: renderSettingsPanel,
    conditionsBlock: conditionsBlock, conditionRow: conditionRow,
    FUNNEL_SVG: FUNNEL_SVG, SEARCH_SVG: SEARCH_SVG,
    SORT_SVG: SORT_SVG, SORT_ASC_SVG: SORT_ASC_SVG, SORT_DESC_SVG: SORT_DESC_SVG
  };
});
