'use strict';

// Tests for preset normalization and the store's reducer. Run with: node --test.

const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../store.js');

test('normalizePreset: an empty object -> a valid default shape', () => {
  const p = App.normalizePreset({});
  assert.deepEqual(p.query.sources, {});
  assert.deepEqual(p.view.entities, []);
  assert.deepEqual(p.view.conditions, []);
  assert.deepEqual(p.view.entityConditions, []);
  assert.deepEqual(p.view.joins, []);
});

// description is the title on the Table screen (viewNav, view-common.js), separate
// from name (the download file name). A blank preset -> empty, not a placeholder.
test('normalizePreset: description defaults to an empty string', () => {
  assert.equal(App.normalizePreset({}).description, '');
});

test('normalizePreset: description is kept as-is when given a string', () => {
  const p = App.normalizePreset({ description: 'Client report for January' });
  assert.equal(p.description, 'Client report for January');
});

test('normalizePreset: a non-string description is ignored -> an empty string', () => {
  assert.equal(App.normalizePreset({ description: 42 }).description, '');
});

// entityConditions is the second filtering pass (by field, after computation), a list
// independent of conditions (on raw fields, before computation) -- see view-build.js/
// view-entities.js
test('normalizePreset: entityConditions normalizes independently of conditions', () => {
  const p = App.normalizePreset({ view: {
    conditions: [{ field: 'CRM.status', op: 'eq', value: 'active' }],
    entityConditions: [{ field: 'Revenue', op: 'gt', value: '0' }]
  } });
  assert.deepEqual(p.view.conditions, [{ field: 'CRM.status', op: 'eq', value: 'active' }]);
  assert.deepEqual(p.view.entityConditions, [{ field: 'Revenue', op: 'gt', value: '0' }]);
});

test('normalizePreset: migrates the old view.column_filters into view.conditions', () => {
  const p = App.normalizePreset({ view: { column_filters: { Foo: 'bar' } } });
  assert.deepEqual(p.view.conditions, [{ field: 'Foo', op: 'contains', value: 'bar' }]);
});

// query.sources also sets the accumulation order (CRM is the base, ERP is second): a
// join onto ERP is kept only if its left is among what's already accumulated (here, CRM)
const twoSources = { query: { sources: { CRM: { labels: ['id'] }, ERP: { labels: ['id'] } } } };

test('normalizePreset: an old join with no type -> left (backward compatible)', () => {
  const p = App.normalizePreset(Object.assign({}, twoSources,
    { view: { joins: [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id' }] } }));
  assert.equal(p.view.joins[0].type, 'left');
});

test('normalizePreset: an unrecognized join type -> left', () => {
  const p = App.normalizePreset(Object.assign({}, twoSources,
    { view: { joins: [{ left: 'CRM', right: 'ERP', type: 'outer-cross-nonsense' }] } }));
  assert.equal(p.view.joins[0].type, 'left');
});

test('normalizePreset: a valid join type is kept', () => {
  const p = App.normalizePreset(Object.assign({}, twoSources,
    { view: { joins: [{ left: 'CRM', right: 'ERP', type: 'full' }] } }));
  assert.equal(p.view.joins[0].type, 'full');
});

test('normalizePreset: a join whose sources are not in query.sources -> no joins', () => {
  const p = App.normalizePreset({ view: { joins: [{ left: 'CRM', right: 'ERP', type: 'full' }] } });
  assert.deepEqual(p.view.joins, []);
});

test('normalizePreset: a join whose left is not yet accumulated at this point is reset', () => {
  // ERP.left='XYZ' -- that source isn't in the selection at all -> reset to the default
  const p = App.normalizePreset({ query: { sources: { CRM: {}, ERP: {} } },
    view: { joins: [{ left: 'XYZ', right: 'ERP', type: 'full' }] } });
  assert.equal(p.view.joins[0].left, 'CRM');    // the only source available at this step
  assert.equal(p.view.joins[0].type, 'full');   // the join type is an independent field, kept as-is
});

test('reducer: preset/toggleSource on a second source creates a join onto the base one', () => {
  const state = Object.assign({}, App.initialState, {
    manifest: { sources: [{ name: 'CRM', key: 'id', labels: [] }, { name: 'ERP', key: 'id', labels: [] }] },
    preset: App.normalizePreset({ query: { sources: { CRM: { labels: ['id'] } } } })
  });
  const next = App.reducer(state, { type: 'preset/toggleSource', name: 'ERP' });
  assert.equal(next.preset.view.joins.length, 1);
  assert.equal(next.preset.view.joins[0].left, 'CRM');
  assert.equal(next.preset.view.joins[0].right, 'ERP');
  assert.equal(next.preset.view.joins[0].type, 'left');
});

test('reducer: preset/toggleSource on a third source does not pick left on its own (must be chosen manually)', () => {
  const state = Object.assign({}, App.initialState, {
    manifest: { sources: [
      { name: 'CRM', key: 'id', labels: [] }, { name: 'ERP', key: 'id', labels: [] }, { name: 'HR', key: 'id', labels: [] }
    ] },
    preset: App.normalizePreset({ query: { sources: { CRM: { labels: ['id'] }, ERP: { labels: ['id'] } } } })
  });
  const next = App.reducer(state, { type: 'preset/toggleSource', name: 'HR' });
  assert.equal(next.preset.view.joins.length, 2);
  assert.equal(next.preset.view.joins[1].right, 'HR');
  assert.equal(next.preset.view.joins[1].left, '');   // picking from {CRM, ERP} is ambiguous, leave it empty
});

test('reducer: preset/toggleSource turning off a middle source drops its join and resets joins that referenced it', () => {
  const state = Object.assign({}, App.initialState, {
    manifest: { sources: [
      { name: 'CRM', key: 'id', labels: [] }, { name: 'ERP', key: 'id', labels: [] }, { name: 'HR', key: 'id', labels: [] }
    ] },
    preset: App.normalizePreset({
      query: { sources: { CRM: { labels: ['id'] }, ERP: { labels: ['id'] }, HR: { labels: ['id'] } } },
      view: { joins: [{ left: 'CRM', right: 'ERP', type: 'left' }, { left: 'ERP', right: 'HR', type: 'inner' }] }
    })
  });
  const next = App.reducer(state, { type: 'preset/toggleSource', name: 'ERP' });
  assert.deepEqual(Object.keys(next.preset.query.sources), ['CRM', 'HR']);
  assert.equal(next.preset.view.joins.length, 1);
  assert.equal(next.preset.view.joins[0].right, 'HR');
  assert.equal(next.preset.view.joins[0].left, 'CRM');   // the reference to removed ERP resets to the only source left
  assert.equal(next.preset.view.joins[0].type, 'inner'); // the join type is an independent field, kept as-is
});

test('reducer: route/set changes the current route', () => {
  const next = App.reducer(App.initialState, { type: 'route/set', route: 'table' });
  assert.equal(next.route, 'table');
});

test('reducer: an unknown action type leaves the state unchanged', () => {
  const next = App.reducer(App.initialState, { type: 'unknown/whatever' });
  assert.equal(next, App.initialState);
});

test('reducer: preset/setName sets the preset name', () => {
  const state = Object.assign({}, App.initialState, { preset: App.normalizePreset({}) });
  const next = App.reducer(state, { type: 'preset/setName', value: 'january-2026' });
  assert.equal(next.preset.name, 'january-2026');
});

// description is Table's title (viewNav), independent of name (the file name) --
// "Download preset" (view-build.js) sets both via separate prompts.
test('reducer: preset/setDescription sets the description independently of name', () => {
  const state = Object.assign({}, App.initialState, {
    preset: Object.assign({}, App.normalizePreset({}), { name: 'jan-2026' }),
  });
  const next = App.reducer(state, { type: 'preset/setDescription', value: 'January report' });
  assert.equal(next.preset.description, 'January report');
  assert.equal(next.preset.name, 'jan-2026');   // untouched
});

test('reducer: preset/setDescription with null -> an empty string', () => {
  const state = Object.assign({}, App.initialState, { preset: App.normalizePreset({}) });
  const next = App.reducer(state, { type: 'preset/setDescription', value: null });
  assert.equal(next.preset.description, '');
});

// preset/toggleSource: enabling a source selects only its key by default (not every
// field) -- there can be a hundred of them, and manually unchecking the extras is annoying
test('reducer: preset/toggleSource enables only the source key by default', () => {
  const state = Object.assign({}, App.initialState, {
    manifest: { sources: [{ name: 'CRM', key: 'id', labels: ['name', 'email', 'phone'] }] },
    preset: App.normalizePreset({})
  });
  const next = App.reducer(state, { type: 'preset/toggleSource', name: 'CRM' });
  assert.deepEqual(next.preset.query.sources.CRM.labels, ['id']);
});

test('reducer: preset/toggleSource turns the source back off', () => {
  const state = Object.assign({}, App.initialState, {
    manifest: { sources: [{ name: 'CRM', key: 'id', labels: ['name'] }] },
    preset: App.normalizePreset({ query: { sources: { CRM: { labels: ['id'] } } } })
  });
  const next = App.reducer(state, { type: 'preset/toggleSource', name: 'CRM' });
  assert.equal(next.preset.query.sources.CRM, undefined);
});

// "+ source field" (view-entities.js): adds the field as-is, with no "already taken"
// check -- the same field may be added again
test('reducer: preset/addFieldEntity adds the field as-is', () => {
  const preset = App.normalizePreset({ query: { sources: { CRM: { labels: ['id'] } } } });
  const state = Object.assign({}, App.initialState, { preset: preset });
  const next = App.reducer(state, { type: 'preset/addFieldEntity', column: 'CRM.id' });
  assert.deepEqual(next.preset.view.entities[0],
    { name: 'CRM.id', type: 'text', hidden: false, from: { kind: 'field', column: 'CRM.id' } });
});

test('reducer: preset/addFieldEntity does not block re-adding the same field', () => {
  const preset = App.normalizePreset({ query: { sources: { CRM: { labels: ['id'] } } } });
  var state = Object.assign({}, App.initialState, { preset: preset });
  state = Object.assign({}, state, { preset: App.reducer(state, { type: 'preset/addFieldEntity', column: 'CRM.id' }).preset });
  const next = App.reducer(state, { type: 'preset/addFieldEntity', column: 'CRM.id' });
  assert.equal(next.preset.view.entities.length, 2);
  assert.equal(next.preset.view.entities[1].from.column, 'CRM.id');
});

// label_types from the manifest -> the default type for a new field (instead of a
// hardcoded "text"), at both creation points -- see entities.js::columnType.
test('reducer: preset/addFieldEntity takes the field\'s type from the manifest', () => {
  const preset = App.normalizePreset({ query: { sources: { CRM: { labels: ['revenue'] } } } });
  const state = Object.assign({}, App.initialState, {
    preset: preset,
    manifest: { sources: [{ name: 'CRM', key: 'id', labels: ['revenue'], label_types: { revenue: 'number' } }] }
  });
  const next = App.reducer(state, { type: 'preset/addFieldEntity', column: 'revenue' });
  assert.equal(next.preset.view.entities[0].type, 'number');
});

test('reducer: preset/addEntity takes the type of the first free field from the manifest', () => {
  const preset = App.normalizePreset({ query: { sources: { CRM: { labels: ['signed_at'] } } } });
  const state = Object.assign({}, App.initialState, {
    preset: preset,
    manifest: { sources: [{ name: 'CRM', key: 'id', labels: ['signed_at'], label_types: { signed_at: 'date' } }] }
  });
  const next = App.reducer(state, { type: 'preset/addEntity' });
  assert.equal(next.preset.view.entities[0].from.column, 'signed_at');
  assert.equal(next.preset.view.entities[0].type, 'date');
});

test('reducer: preset/addEntity with no manifest still defaults to "text" (does not throw)', () => {
  const preset = App.normalizePreset({ query: { sources: { CRM: { labels: ['revenue'] } } } });
  const state = Object.assign({}, App.initialState, { preset: preset });   // manifest: null
  const next = App.reducer(state, { type: 'preset/addEntity' });
  assert.equal(next.preset.view.entities[0].type, 'text');
});

// Fields' conditions -- its own independent list, its own actions
test('reducer: preset/addEntityCondition / updateEntityCondition / removeEntityCondition', () => {
  const preset = App.normalizePreset({});
  var state = Object.assign({}, App.initialState, { preset: preset });
  state = Object.assign({}, state, { preset: App.reducer(state, { type: 'preset/addEntityCondition' }).preset });
  assert.deepEqual(state.preset.view.entityConditions, [{ field: '', op: 'contains', value: '' }]);
  assert.deepEqual(state.preset.view.conditions, []);   // independent of Data's conditions

  state = Object.assign({}, state, {
    preset: App.reducer(state, { type: 'preset/updateEntityCondition', index: 0, patch: { field: 'Revenue', value: '100' } }).preset
  });
  assert.deepEqual(state.preset.view.entityConditions[0], { field: 'Revenue', op: 'contains', value: '100' });

  const next = App.reducer(state, { type: 'preset/removeEntityCondition', index: 0 });
  assert.deepEqual(next.preset.view.entityConditions, []);
});

// Export and Advanced filter are mutually exclusive panels above the table
test('export/toggle: opening export closes an already-open advanced filter', () => {
  const withFilter = App.reducer(App.initialState, { type: 'adv/toggle' });
  assert.equal(withFilter.advOpen, true);
  const next = App.reducer(withFilter, { type: 'export/toggle' });
  assert.equal(next.exportOpen, true);
  assert.equal(next.advOpen, false, 'opening export should close the filter');
});

test('adv/toggle: opening the advanced filter closes an already-open export', () => {
  const withExport = App.reducer(App.initialState, { type: 'export/toggle' });
  assert.equal(withExport.exportOpen, true);
  const next = App.reducer(withExport, { type: 'adv/toggle' });
  assert.equal(next.advOpen, true);
  assert.equal(next.exportOpen, false, 'opening the filter should close export');
});

test('export/toggle: closing export does not touch the (already closed) filter', () => {
  const opened = App.reducer(App.initialState, { type: 'export/toggle' });
  const closed = App.reducer(opened, { type: 'export/toggle' });
  assert.equal(closed.exportOpen, false);
  assert.equal(closed.advOpen, false);
});

// --- sort/* -- the advanced panel: a multi-level editor for state.sortBy, the same
// list the icons quickly add to (quick/sort below) ---

test('reducer: sort/add adds an empty sort level', () => {
  const next = App.reducer(App.initialState, { type: 'sort/add' });
  assert.deepEqual(next.sortBy, [{ col: '', dir: 'asc' }]);
});

test('reducer: sort/update changes a level\'s column/direction by index', () => {
  const s1 = App.reducer(App.initialState, { type: 'sort/add' });
  const s2 = App.reducer(s1, { type: 'sort/update', index: 0, patch: { col: 'a' } });
  const s3 = App.reducer(s2, { type: 'sort/update', index: 0, patch: { dir: 'desc' } });
  assert.deepEqual(s3.sortBy, [{ col: 'a', dir: 'desc' }]);
});

test('reducer: sort/remove drops a level by index', () => {
  const s1 = App.reducer(App.initialState, { type: 'sort/add' });
  const s2 = App.reducer(s1, { type: 'sort/add' });
  const s3 = App.reducer(s2, { type: 'sort/remove', index: 0 });
  assert.equal(s3.sortBy.length, 1);
});

test('reducer: sort/move swaps the order (priority) of two levels', () => {
  const s1 = App.reducer(App.initialState, { type: 'sort/add' });
  const s2 = App.reducer(s1, { type: 'sort/update', index: 0, patch: { col: 'a' } });
  const s3 = App.reducer(s2, { type: 'sort/add' });
  const s4 = App.reducer(s3, { type: 'sort/update', index: 1, patch: { col: 'b' } });
  const s5 = App.reducer(s4, { type: 'sort/move', index: 1, dir: -1 });
  assert.deepEqual(s5.sortBy.map((l) => l.col), ['b', 'a']);
});

// --- quick/* -- the icons in the table header: read/write the SAME state the
// advanced panel edits (sortBy/adv), plus their own UI state (quickOpen,
// quickValuesLimit) ---

test('reducer: quick/toggle opens a column\'s quick slot, a repeat click closes it', () => {
  const opened = App.reducer(App.initialState, { type: 'quick/toggle', column: 'a', mode: 'filter' });
  assert.equal(opened.quickOpen.a, 'filter');
  const closed = App.reducer(opened, { type: 'quick/toggle', column: 'a', mode: 'filter' });
  assert.equal(closed.quickOpen.a, null);
});

test('reducer: quick/toggle switches a column\'s mode (search -> filter)', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/toggle', column: 'a', mode: 'search' });
  const s2 = App.reducer(s1, { type: 'quick/toggle', column: 'a', mode: 'filter' });
  assert.equal(s2.quickOpen.a, 'filter');
});

// --- group/* -- grouping levels (view-table.js::renderAdvFilter); groupAgg/* --
// summary-row aggregators nested inside their level (store.js: groupBy is now
// [{column, agg: [{column, fn}]}], not just a column name) ---

test('reducer: group/add adds an empty level with an empty agg', () => {
  const s1 = App.reducer(App.initialState, { type: 'group/add' });
  assert.deepEqual(s1.groupBy, [{ column: '', agg: [] }]);
});

test('reducer: group/update changes a level\'s column without touching its agg', () => {
  const s0 = Object.assign({}, App.initialState, { groupBy: [{ column: 'a', agg: [{ column: 'price', fn: 'SUM' }] }] });
  const s1 = App.reducer(s0, { type: 'group/update', index: 0, patch: { column: 'b' } });
  assert.deepEqual(s1.groupBy, [{ column: 'b', agg: [{ column: 'price', fn: 'SUM' }] }]);
});

test('reducer: groupAgg/add adds an aggregator to the right level\'s agg, leaves other levels alone', () => {
  const s0 = Object.assign({}, App.initialState, {
    groupBy: [{ column: 'a', agg: [] }, { column: 'b', agg: [] }]
  });
  const s1 = App.reducer(s0, { type: 'groupAgg/add', index: 1, column: 'price', fn: 'SUM' });
  assert.deepEqual(s1.groupBy[0].agg, []);
  assert.deepEqual(s1.groupBy[1].agg, [{ column: 'price', fn: 'SUM' }]);
});

test('reducer: groupAgg/update patches one aggregator by (index, aggIndex)', () => {
  const s0 = Object.assign({}, App.initialState, {
    groupBy: [{ column: 'a', agg: [{ column: 'price', fn: 'SUM' }, { column: 'qty', fn: 'AVG' }] }]
  });
  const s1 = App.reducer(s0, { type: 'groupAgg/update', index: 0, aggIndex: 1, patch: { fn: 'MAX' } });
  assert.deepEqual(s1.groupBy[0].agg, [{ column: 'price', fn: 'SUM' }, { column: 'qty', fn: 'MAX' }]);
});

test('reducer: groupAgg/remove drops one aggregator by (index, aggIndex)', () => {
  const s0 = Object.assign({}, App.initialState, {
    groupBy: [{ column: 'a', agg: [{ column: 'price', fn: 'SUM' }, { column: 'qty', fn: 'AVG' }] }]
  });
  const s1 = App.reducer(s0, { type: 'groupAgg/remove', index: 0, aggIndex: 0 });
  assert.deepEqual(s1.groupBy[0].agg, [{ column: 'qty', fn: 'AVG' }]);
});

test('reducer: quick/closeAll closes every open quick slot at once', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/toggle', column: 'a', mode: 'search' });
  const s2 = App.reducer(s1, { type: 'quick/toggle', column: 'b', mode: 'filter' });
  const s3 = App.reducer(s2, { type: 'quick/closeAll' });
  assert.equal(s3.quickOpen.a, undefined);
  assert.equal(s3.quickOpen.b, undefined);
});

test('reducer: quick/sort -- cycles a column through: no entry -> asc -> desc -> removed', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/sort', column: 'a' });
  assert.deepEqual(s1.sortBy, [{ col: 'a', dir: 'asc' }]);
  const s2 = App.reducer(s1, { type: 'quick/sort', column: 'a' });
  assert.deepEqual(s2.sortBy, [{ col: 'a', dir: 'desc' }]);
  const s3 = App.reducer(s2, { type: 'quick/sort', column: 'a' });
  assert.deepEqual(s3.sortBy, []);
});

test('reducer: quick/sort appends a column at the end -- leaves existing levels alone', () => {
  const s1 = App.reducer(App.initialState, { type: 'sort/add' });
  const s2 = App.reducer(s1, { type: 'sort/update', index: 0, patch: { col: 'a' } });
  const s3 = App.reducer(s2, { type: 'quick/sort', column: 'b' });
  assert.deepEqual(s3.sortBy, [{ col: 'a', dir: 'asc' }, { col: 'b', dir: 'asc' }]);
});

test('reducer: quick/applyFilter adds a contains condition with conj="and" to state.adv', () => {
  const next = App.reducer(App.initialState, { type: 'quick/applyFilter', column: 'a', value: 'foo' });
  assert.deepEqual(next.adv, [{ field: 'a', op: 'contains', value: 'foo', conj: 'and' }]);
});

test('reducer: quick/applyFilter leaves existing advanced-filter conditions alone', () => {
  const s1 = App.reducer(App.initialState, { type: 'adv/add' });
  const s2 = App.reducer(s1, { type: 'adv/update', index: 0, patch: { field: 'x', op: 'eq', value: '1' } });
  const s3 = App.reducer(s2, { type: 'quick/applyFilter', column: 'a', value: 'foo' });
  assert.equal(s3.adv.length, 2);
  assert.deepEqual(s3.adv[0], { field: 'x', op: 'eq', value: '1', conj: 'and' });
});

test('reducer: quick/applyFilter again -- updates the same condition, does not duplicate it', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/applyFilter', column: 'a', value: 'foo' });
  const s2 = App.reducer(s1, { type: 'quick/applyFilter', column: 'a', value: 'bar' });
  assert.equal(s2.adv.length, 1);
  assert.equal(s2.adv[0].value, 'bar');
});

test('reducer: quick/applyFilter with an empty value removes the condition', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/applyFilter', column: 'a', value: 'foo' });
  const s2 = App.reducer(s1, { type: 'quick/applyFilter', column: 'a', value: '' });
  assert.deepEqual(s2.adv, []);
});

test('reducer: quick/setValuesLimit stores a non-negative integer (0 is a valid value)', () => {
  const s1 = App.reducer(App.initialState, { type: 'quick/setValuesLimit', value: '5' });
  assert.equal(s1.quickValuesLimit, 5);
  const s2 = App.reducer(s1, { type: 'quick/setValuesLimit', value: '0' });
  assert.equal(s2.quickValuesLimit, 0);
  const s3 = App.reducer(s2, { type: 'quick/setValuesLimit', value: '-3' });
  assert.equal(s3.quickValuesLimit, 0);
});

test('reducer: build/success resets adv/sortBy/quickOpen, but not quickValuesLimit', () => {
  const withLimit = App.reducer(App.initialState, { type: 'quick/setValuesLimit', value: '3' });
  const withStuff = App.reducer(withLimit, { type: 'sort/add' });
  const next = App.reducer(withStuff, { type: 'build/success', dataset: { columns: [], rows: [] } });
  assert.deepEqual(next.sortBy, []);
  assert.deepEqual(next.adv, []);
  assert.deepEqual(next.quickOpen, {});
  assert.equal(next.quickValuesLimit, 3);
});

// --- mergeManifests: merging manifest.js + manifest.imports.js fragments -------
// (the merge happens only on read, here; neither manifest.js nor the fragments are
// edited by one another)

test('mergeManifests: with no fragments -- the manifest as-is', () => {
  const manifest = { generated_at: 1, db_max_cnt: 5, sources: [{ name: 'CRM' }] };
  const r = App.mergeManifests(manifest, []);
  assert.deepEqual(r.manifest.sources, [{ name: 'CRM' }]);
  assert.deepEqual(r.conflicts, []);
});

test('mergeManifests: manifest.js === null -- the fragments are still picked up', () => {
  const r = App.mergeManifests(null, [{ sources: [{ name: 'Imported' }] }]);
  assert.deepEqual(r.manifest.sources, [{ name: 'Imported' }]);
  assert.deepEqual(r.conflicts, []);
});

test('mergeManifests: distinct sources from several fragments are merged together', () => {
  const manifest = { sources: [{ name: 'CRM' }] };
  const r = App.mergeManifests(manifest, [
    { sources: [{ name: 'Imported1' }] },
    { sources: [{ name: 'Imported2' }] }
  ]);
  assert.deepEqual(r.manifest.sources.map((s) => s.name), ['CRM', 'Imported1', 'Imported2']);
  assert.deepEqual(r.conflicts, []);
});

test('mergeManifests: a name colliding with manifest.js -- a conflict, the manifest\'s source is untouched', () => {
  const manifest = { sources: [{ name: 'CRM' }] };
  const r = App.mergeManifests(manifest, [{ sources: [{ name: 'CRM' }] }]);
  assert.deepEqual(r.manifest.sources, [{ name: 'CRM' }]);
  assert.deepEqual(r.conflicts, ['CRM']);
});

test('mergeManifests: a name colliding between two fragments -- also a conflict', () => {
  const r = App.mergeManifests(null, [
    { sources: [{ name: 'Imported' }] },
    { sources: [{ name: 'Imported' }] }
  ]);
  assert.deepEqual(r.manifest.sources.map((s) => s.name), ['Imported']);
  assert.deepEqual(r.conflicts, ['Imported']);
});

test("reducer: manifest/loaded with no conflicts -- manifestError isn't set", () => {
  const s = App.reducer(App.initialState, {
    type: 'manifest/loaded', manifest: { sources: [] }, dataDir: 'data', conflicts: []
  });
  assert.equal(s.manifestError, null);
});

test('reducer: manifest/loaded with conflicts -- manifestError names the conflicting sources', () => {
  const s = App.reducer(App.initialState, {
    type: 'manifest/loaded', manifest: { sources: [] }, dataDir: 'data', conflicts: ['CRM', 'ERP']
  });
  assert.match(s.manifestError, /CRM/);
  assert.match(s.manifestError, /ERP/);
});
