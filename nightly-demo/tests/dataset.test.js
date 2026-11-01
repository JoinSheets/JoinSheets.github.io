'use strict';

// Tests for the dataset layer: LEFT JOIN of sources, selection conditions, advanced
// filter, sorting. Run with: node --test (or ./run_tests.sh).

const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../dataset.js');

test('joinSources: LEFT JOIN of two sources by key, columns are qualified', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id', 'email'], data: [{ id: '1', email: 'a@x' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['id', 'price'], data: [{ id: '1', price: '10' }] };
  const joins = [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id' }];

  const out = App.joinSources([crm, erp], joins);

  assert.deepEqual(out.columns, ['CRM.id', 'CRM.email', 'ERP.id', 'ERP.price']);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0]['CRM.email'], 'a@x');
  assert.equal(out.rows[0]['ERP.price'], '10');
});

test('joinSources: an unmatched LEFT JOIN leaves undefined, does not drop the row', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id'], data: [{ id: '1' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['price'], data: [{ id: '2', price: '10' }] };
  const out = App.joinSources([crm, erp], [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id' }]);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0]['ERP.price'], undefined);
});

test('joinSources: no type on the join -- behaves as before (LEFT by default)', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id'], data: [{ id: '1' }, { id: '2' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['price'], data: [{ id: '1', price: '10' }] };
  const out = App.joinSources([crm, erp], [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id' }]);
  assert.equal(out.rows.length, 2);
});

test('joinSources: INNER -- only matched rows', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id'], data: [{ id: '1' }, { id: '2' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['price'], data: [{ id: '1', price: '10' }] };
  const joins = [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id', type: 'inner' }];
  const out = App.joinSources([crm, erp], joins);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0]['CRM.id'], '1');
});

test('joinSources: RIGHT -- all rows of the right source, unmatched left rows are dropped', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id'], data: [{ id: '1' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['id', 'price'], data: [{ id: '1', price: '10' }, { id: '2', price: '20' }] };
  const joins = [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id', type: 'right' }];
  const out = App.joinSources([crm, erp], joins);
  assert.equal(out.rows.length, 2);
  const unmatched = out.rows.find((r) => r['ERP.id'] === '2');
  assert.ok(unmatched, 'the row ERP.id=2 should be present');
  assert.equal(unmatched['CRM.id'], undefined);
});

test('joinSources: FULL -- union (matches + unmatched rows on both sides)', () => {
  const crm = { name: 'CRM', key: 'id', labels: ['id'], data: [{ id: '1' }, { id: '2' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['id', 'price'], data: [{ id: '1', price: '10' }, { id: '3', price: '30' }] };
  const joins = [{ left: 'CRM', left_field: 'id', right: 'ERP', right_field: 'id', type: 'full' }];
  const out = App.joinSources([crm, erp], joins);
  assert.equal(out.rows.length, 3);   // (1,1) + (2,∅) + (∅,3)
  assert.ok(out.rows.some((r) => r['CRM.id'] === '2' && r['ERP.id'] === undefined));
  assert.ok(out.rows.some((r) => r['ERP.id'] === '3' && r['CRM.id'] === undefined));
});

test('joinSources: FULL -- a right row already matched to one left row is not duplicated', () => {
  const crm = { name: 'CRM', key: 'fk', labels: ['id', 'fk'], data: [{ id: 'a', fk: '1' }, { id: 'b', fk: '1' }] };
  const erp = { name: 'ERP', key: 'id', labels: ['id'], data: [{ id: '1' }] };
  const joins = [{ left: 'CRM', left_field: 'fk', right: 'ERP', right_field: 'id', type: 'full' }];
  const out = App.joinSources([crm, erp], joins);
  assert.equal(out.rows.length, 2);   // both CRM rows matched the single ERP row, no extra copy
});

test('matchCondition: contains is case-insensitive', () => {
  assert.equal(App.matchCondition('Hello World', { op: 'contains', value: 'WOR' }), true);
});

test('matchCondition: empty/not_empty', () => {
  assert.equal(App.matchCondition('', { op: 'empty' }), true);
  assert.equal(App.matchCondition(null, { op: 'empty' }), true);
  assert.equal(App.matchCondition('x', { op: 'not_empty' }), true);
});

test('matchCondition: numeric operators, an empty cell never matches', () => {
  assert.equal(App.matchCondition('10', { op: 'gt', value: '5' }), true);
  assert.equal(App.matchCondition('', { op: 'gt', value: '5' }), false);
});

test('applyConditions: narrows the selection (AND)', () => {
  const ds = { columns: ['a'], rows: [{ a: 'foo' }, { a: 'bar' }] };
  const out = App.applyConditions(ds, [{ field: 'a', op: 'eq', value: 'foo' }]);
  assert.equal(out.rows.length, 1);
});

test('applyConditions: a condition on a nonexistent column does not zero out the selection', () => {
  const ds = { columns: ['a'], rows: [{ a: 'foo' }, { a: 'bar' }] };
  const out = App.applyConditions(ds, [{ field: 'missing', op: 'eq', value: 'x' }]);
  assert.equal(out.rows.length, 2);
});

test('applySort: numbers compare as numbers, empties go last', () => {
  const rows = [{ v: '10' }, { v: '2' }, { v: '' }];
  const out = App.applySort(rows, [{ col: 'v', dir: 'asc' }]);
  assert.deepEqual(out.map((r) => r.v), ['2', '10', '']);
});

test('applySort: no levels -- leaves the rows untouched (same order)', () => {
  const rows = [{ v: '10' }, { v: '2' }];
  assert.deepEqual(App.applySort(rows, []), rows);
  assert.deepEqual(App.applySort(rows, null), rows);
});

test('applySort: multi-level -- the second level breaks a tie on the first', () => {
  const rows = [
    { a: 'x', b: '2' }, { a: 'y', b: '1' }, { a: 'x', b: '1' }
  ];
  const out = App.applySort(rows, [{ col: 'a', dir: 'asc' }, { col: 'b', dir: 'asc' }]);
  assert.deepEqual(out, [{ a: 'x', b: '1' }, { a: 'x', b: '2' }, { a: 'y', b: '1' }]);
});

test('applySort: the second level can sort descending independently of the first', () => {
  const rows = [
    { a: 'x', b: '1' }, { a: 'x', b: '3' }, { a: 'x', b: '2' }
  ];
  const out = App.applySort(rows, [{ col: 'a', dir: 'asc' }, { col: 'b', dir: 'desc' }]);
  assert.deepEqual(out.map((r) => r.b), ['3', '2', '1']);
});

test('findNextMatch: finds the next row below the cursor', () => {
  const rows = [{ v: 'foo' }, { v: 'bar' }, { v: 'foobar' }];
  assert.equal(App.findNextMatch(rows, 'v', 'foo', -1), 0);
  assert.equal(App.findNextMatch(rows, 'v', 'foo', 0), 2);
});

test('findNextMatch: wraps to the start if nothing is found further down', () => {
  const rows = [{ v: 'foo' }, { v: 'bar' }];
  assert.equal(App.findNextMatch(rows, 'v', 'foo', 0), 0);
});

test('findNextMatch: no match at all -> -1', () => {
  const rows = [{ v: 'foo' }, { v: 'bar' }];
  assert.equal(App.findNextMatch(rows, 'v', 'zzz', -1), -1);
});

test('uniqueValues: the first N unique values in row order (not by frequency)', () => {
  const rows = [{ v: 'b' }, { v: 'a' }, { v: 'b' }, { v: 'a' }, { v: 'a' }, { v: 'c' }];
  assert.deepEqual(App.uniqueValues(rows, 'v', 2), ['b', 'a']);
});

test('uniqueValues: limit<=0 -> an empty list, no scanning', () => {
  const rows = [{ v: 'a' }];
  assert.deepEqual(App.uniqueValues(rows, 'v', 0), []);
  assert.deepEqual(App.uniqueValues(rows, 'v', -5), []);
});

test('uniqueValues: empty/null values are skipped', () => {
  const rows = [{ v: '' }, { v: null }, { v: 'a' }];
  assert.deepEqual(App.uniqueValues(rows, 'v', 10), ['a']);
});

// visibleColumns: fields hidden (dataset.hiddenColumns, see main.js/view-entities.js
// "hide in table") are shown in neither the table nor the export -- regardless of hideEmpty
test('visibleColumns: with no hiddenColumns returns every column as-is', () => {
  const ds = { columns: ['a', 'b'], rows: [{ a: '1', b: '2' }] };
  assert.deepEqual(App.visibleColumns(ds, false), ['a', 'b']);
});

test('visibleColumns: columns in hiddenColumns are excluded', () => {
  const ds = { columns: ['a', 'b', 'c'], rows: [{ a: '1', b: '2', c: '3' }], hiddenColumns: ['b'] };
  assert.deepEqual(App.visibleColumns(ds, false), ['a', 'c']);
});

test('visibleColumns: hiddenColumns and hideEmpty apply together', () => {
  const ds = { columns: ['a', 'b', 'c'], rows: [{ a: '', b: '2', c: '' }], hiddenColumns: ['b'] };
  // b is explicitly hidden, a and c are hidden as empty -> nothing is left
  assert.deepEqual(App.visibleColumns(ds, true), []);
});
