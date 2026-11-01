'use strict';

// Tests for the entities layer: parsing numbers/dates/bools, typing, collision
// resolution. This is the riskiest logic in the app -- edge cases (Excel serial
// dates, ambiguous separators) are the easiest thing to break with an eyeballed
// edit. Run with: node --test (or ./run_tests.sh).

const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../entities.js');
const Formula = require('../formula.js');

test('parseNum: a period as the decimal separator', () => {
  assert.deepEqual(App.parseNum('99.00'), { ok: true, value: 99 });
});

test('parseNum: a space is the thousands separator, a comma is the decimal one', () => {
  assert.deepEqual(App.parseNum('1 234,56'), { ok: true, value: 1234.56 });
});

test('parseNum: a non-numeric string', () => {
  assert.equal(App.parseNum('n/a').ok, false);
});

test('parseDate: an ISO date', () => {
  const r = App.parseDate('2024-02-25');
  assert.equal(r.ok, true);
  assert.equal(App.formatDate(r.ms), '2024-02-25');
});

test('parseDate: DD.MM.YYYY', () => {
  const r = App.parseDate('25.02.2024');
  assert.equal(r.ok, true);
  assert.equal(App.formatDate(r.ms), '2024-02-25');
});

test('parseDate: an Excel serial date -- the epoch constant (25569 = 1970-01-01)', () => {
  const r = App.parseDate('25569', 'excel');
  assert.equal(r.ok, true);
  assert.equal(App.formatDate(r.ms), '1970-01-01');
});

test('parseDate: auto recognizes a 5-digit Excel serial date', () => {
  assert.equal(App.parseDate('44927').ok, true);
});

test('parseDate: auto does not mistake a unix timestamp (10 digits) for a serial date', () => {
  const r = App.parseDate('1706745600'); // 2024-02-01T00:00:00Z
  assert.equal(r.ok, true);
  assert.equal(App.formatDate(r.ms), '2024-02-01');
});

test('parseBool: the default true/false tokens', () => {
  assert.equal(App.parseBool('true').value, true);
  assert.equal(App.parseBool('yes').value, true);
  assert.equal(App.parseBool('false').value, false);
  assert.equal(App.parseBool('no').value, false);
  assert.equal(App.parseBool('nope').ok, false);
});

test('typeCell: a parse miss -> raw text, ok:false', () => {
  const t = App.typeCell('not a number', { type: 'number' });
  assert.equal(t.ok, false);
  assert.equal(t.display, 'not a number');
});

test('resolveCell: kind=resolve -- the higher weight among the present ones wins', () => {
  const from = {
    kind: 'resolve',
    inputs: [{ column: 'a', weight: 0.4 }, { column: 'b', weight: 0.9 }]
  };
  assert.equal(App.resolveCell(from, { a: 'from-a', b: 'from-b' }), 'from-b');
});

test('resolveCell: kind=resolve -- a tie in weight is broken by input order', () => {
  const from = {
    kind: 'resolve',
    inputs: [{ column: 'a', weight: 0.5 }, { column: 'b', weight: 0.5 }]
  };
  assert.equal(App.resolveCell(from, { a: 'from-a', b: 'from-b' }), 'from-a');
});

// kind=formula: parsing the AST (formula.js) happens separately and is passed to
// resolveCell as a third argument -- in the real pipeline, resolveEntities does this
// once per entity, not per row (see the test below). Arithmetic/functions are covered
// in detail by formula.test.js -- here, just the integration with entities.js (letters
// from inputs, lookupRaw from the raw row).
test('resolveCell: kind=formula -- input letters are filled from jrow in inputs order', () => {
  const from = { kind: 'formula', inputs: [{ column: 'a' }, { column: 'b' }], formula: 'A + B' };
  const parsed = Formula.parse(from.formula, App.lettersForInputs(from.inputs));
  assert.equal(App.resolveCell(from, { a: '2', b: '3' }, parsed), '5');
});

test('resolveCell: kind=formula -- [Source.Field] reads a raw field, bypassing inputs', () => {
  const from = { kind: 'formula', inputs: [{ column: 'a' }], formula: 'A + [ERP.price]' };
  const parsed = Formula.parse(from.formula, App.lettersForInputs(from.inputs));
  assert.equal(App.resolveCell(from, { a: '1', 'ERP.price': '99' }, parsed), '100');
});

test('resolveCell: kind=formula -- a parse error -> undefined, not an exception', () => {
  const from = { kind: 'formula', inputs: [{ column: 'a' }], formula: 'A +' };
  const parsed = Formula.parse(from.formula, App.lettersForInputs(from.inputs));
  assert.equal(parsed.ok, false);
  assert.equal(App.resolveCell(from, { a: '1' }, parsed), undefined);
});

test('resolveEntities: kind=formula -- parsed once per entity, applied to every row', () => {
  const entities = App.normalizeEntities({ entities: [
    { name: 'Total', from: { kind: 'formula', inputs: [{ column: 'a' }, { column: 'b' }], formula: 'A + B' } }
  ] }).map(function (e) { return e; });
  const joined = { columns: ['a', 'b'], rows: [{ a: '1', b: '2' }, { a: '10', b: '20' }] };
  const out = App.resolveEntities(joined, entities);
  assert.deepEqual(out.rows.map(function (r) { return r['Total']; }), ['3', '30']);
});

test('normalizeEntities: drops an entity with no value source', () => {
  const view = { entities: [{ name: 'x', from: { kind: 'field', column: '' } }] };
  assert.deepEqual(App.normalizeEntities(view), []);
});

// hidden: a hidden field is computed and filtered, but not shown in the table (see
// dataset.js::visibleColumns) -- defaults to false unless set explicitly
test('normalizeEntities: hidden is kept when set to true', () => {
  const view = { entities: [{ name: 'x', hidden: true, from: { kind: 'field', column: 'a' } }] };
  assert.equal(App.normalizeEntities(view)[0].hidden, true);
});

test('normalizeEntities: hidden defaults to false', () => {
  const view = { entities: [{ name: 'x', from: { kind: 'field', column: 'a' } }] };
  assert.equal(App.normalizeEntities(view)[0].hidden, false);
});

// the same raw field can be added as an entity more than once (as-is + as a derived
// field's input, or just twice) -- normalizeEntities doesn't block that
test('normalizeEntities: the same field in multiple entities is allowed', () => {
  const view = { entities: [
    { name: 'a raw', from: { kind: 'field', column: 'a' } },
    { name: 'a again', from: { kind: 'field', column: 'a' } }
  ] };
  const out = App.normalizeEntities(view);
  assert.equal(out.length, 2);
  assert.equal(out[0].from.column, 'a');
  assert.equal(out[1].from.column, 'a');
});

test('entityOutNames: deduplicates identical names (a, a (2))', () => {
  const entities = [{ name: 'a' }, { name: 'a' }, { name: 'a' }];
  assert.deepEqual(App.entityOutNames(entities), ['a', 'a (2)', 'a (3)']);
});

// implicitEntities: default fields for an empty preset (main.js::buildDataset). The
// type comes from the manifest (label_types), not always "text".
test('implicitEntities: without columnTypes everything is "text" (backward compatible)', () => {
  assert.deepEqual(App.implicitEntities(['a', 'b']), [
    { name: 'a', type: 'text', from: { kind: 'field', column: 'a' } },
    { name: 'b', type: 'text', from: { kind: 'field', column: 'b' } }
  ]);
});

test('implicitEntities: takes the type from columnTypes, an unknown column -> "text"', () => {
  const ents = App.implicitEntities(['revenue', 'note'], { revenue: 'number' });
  assert.equal(ents[0].type, 'number');
  assert.equal(ents[1].type, 'text');
});

// columnTypesFor: {source: [field]} + manifest.sources -> {column: type}. The name
// qualification ("Source.field") must match joinSources/presetColumns.
test('columnTypesFor: a single source -> bare column names', () => {
  const types = App.columnTypesFor(
    { CRM: ['revenue', 'signed_at'] },
    [{ name: 'CRM', label_types: { revenue: 'number', signed_at: 'date' } }]
  );
  assert.deepEqual(types, { revenue: 'number', signed_at: 'date' });
});

test('columnTypesFor: several sources -> "Source.field"', () => {
  const types = App.columnTypesFor(
    { CRM: ['revenue'], ERP: ['price'] },
    [
      { name: 'CRM', label_types: { revenue: 'number' } },
      { name: 'ERP', label_types: { price: 'number' } }
    ]
  );
  assert.deepEqual(types, { 'CRM.revenue': 'number', 'ERP.price': 'number' });
});

test('columnTypesFor: a field with no manifest entry (a key, not published) -> "text"', () => {
  const types = App.columnTypesFor(
    { CRM: ['customer_id', 'revenue'] },
    [{ name: 'CRM', label_types: { revenue: 'number' } }]
  );
  assert.deepEqual(types, { customer_id: 'text', revenue: 'number' });
});

test('columnTypesFor: manifest not loaded yet (null/undefined) -> everything "text"', () => {
  assert.deepEqual(App.columnTypesFor({ CRM: ['revenue'] }, null), { revenue: 'text' });
});

// columnType: the same logic, but straight from the preset (store.js's "+ field" /
// "+ source field" reducers haven't run the JOIN yet).
test('columnType: finds the type via preset.query.sources + manifest.sources', () => {
  const preset = { query: { sources: { CRM: { labels: ['revenue'] } } } };
  const type = App.columnType(preset, [{ name: 'CRM', label_types: { revenue: 'number' } }], 'revenue');
  assert.equal(type, 'number');
});

// aggregateGroup: group summary rows (view-table.js) -- reuses Formula.FUNCTIONS over
// row.__k (the key after parseTypes), not re-parsing the string. AGG_FUNCS_BY_TYPE --
// which functions are even valid for a type (view-table.js's UI uses the same table so
// it doesn't offer incompatible ones).

const krows = (vals) => vals.map((v) => ({ __k: { x: v } }));

test('AGG_FUNCS_BY_TYPE: number/date/boolean have aggregators, text does not yet', () => {
  assert.ok(App.AGG_FUNCS_BY_TYPE.number.length > 0);
  assert.ok(App.AGG_FUNCS_BY_TYPE.date.length > 0);
  assert.ok(App.AGG_FUNCS_BY_TYPE.bool.length > 0);
  assert.deepEqual(App.AGG_FUNCS_BY_TYPE.text, []);
});

test('aggregateGroup: number -- SUM/AVG/MIN/MAX', () => {
  const rows = krows([10, 20, 30]);
  const e = { name: 'x', type: 'number' };
  assert.equal(App.aggregateGroup(rows, 'x', e, 'SUM'), '60');
  assert.equal(App.aggregateGroup(rows, 'x', e, 'AVG'), '20');
  assert.equal(App.aggregateGroup(rows, 'x', e, 'MIN'), '10');
  assert.equal(App.aggregateGroup(rows, 'x', e, 'MAX'), '30');
});

test('aggregateGroup: number -- non-numeric/missing __k are skipped (as in formula.js)', () => {
  const rows = krows([10, null, undefined, 20]);
  assert.equal(App.aggregateGroup(rows, 'x', { name: 'x', type: 'number' }, 'SUM'), '30');
});

test('aggregateGroup: number -- every value is empty -> undefined (not "0")', () => {
  const rows = krows([null, undefined]);
  assert.equal(App.aggregateGroup(rows, 'x', { name: 'x', type: 'number' }, 'SUM'), undefined);
});

test('aggregateGroup: COUNT_NONEMPTY counts the non-empty ones regardless of type', () => {
  const rows = krows([10, null, 20, undefined]);
  assert.equal(App.aggregateGroup(rows, 'x', { name: 'x', type: 'number' }, 'COUNT_NONEMPTY'), '2');
});

test('aggregateGroup: date -- MIN/MAX are formatted as a date, not a number', () => {
  const d1 = App.parseDate('2024-01-10').ms;
  const d2 = App.parseDate('2024-03-01').ms;
  const rows = krows([d1, d2]);
  const e = { name: 'x', type: 'date' };
  assert.equal(App.aggregateGroup(rows, 'x', e, 'MIN'), '2024-01-10');
  assert.equal(App.aggregateGroup(rows, 'x', e, 'MAX'), '2024-03-01');
});

test('aggregateGroup: date -- honors entity.parse.date_out', () => {
  const ms = App.parseDate('2024-01-10').ms;
  const e = { name: 'x', type: 'date', parse: { date_out: 'DD.MM.YYYY' } };
  assert.equal(App.aggregateGroup(krows([ms]), 'x', e, 'MIN'), '10.01.2024');
});

test('aggregateGroup: boolean -- SUM counts true as 1, with no new function (via __k=0/1)', () => {
  // typeCell already encodes bool as __k: 1/0 -- a plain SUM over that is already
  // "a sum where true counts as 1", see the comment in entities.js.
  const rows = krows([1, 0, 1, 1]);
  assert.equal(App.aggregateGroup(rows, 'x', { name: 'x', type: 'bool' }, 'SUM'), '3');
});

test('aggregateGroup: a function not in the list for this type -> undefined', () => {
  // AVG isn't in AGG_FUNCS_BY_TYPE.bool -- guards against UI/data getting out of
  // sync (e.g. a stale state.groupBy after a field's type changed).
  assert.equal(App.aggregateGroup(krows([1, 0]), 'x', { name: 'x', type: 'bool' }, 'AVG'), undefined);
});

test('aggregateGroup: an unknown type (text, no aggregators yet) -> undefined for any function', () => {
  assert.equal(App.aggregateGroup(krows(['a', 'b']), 'x', { name: 'x', type: 'text' }, 'COUNT_NONEMPTY'), undefined);
});
