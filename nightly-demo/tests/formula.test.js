'use strict';

// Tests for formula.js: the tokenizer/parser/evaluator for kind === 'formula' on the
// Fields screen. Run with: node --test.

const test = require('node:test');
const assert = require('node:assert/strict');
const Formula = require('../formula.js');

var evalStr = function (text, letters, lookupRaw) {
  const r = Formula.parse(text, Object.keys(letters || {}));
  assert.ok(r.ok, 'expected a successful parse: ' + (r.error || ''));
  return Formula.evaluate(r.ast, { letters: letters || {}, lookupRaw: lookupRaw });
};

// --- letterFor ----------------------------------------------------------

test('letterFor: 0..25 -> A..Z', () => {
  assert.equal(Formula.letterFor(0), 'A');
  assert.equal(Formula.letterFor(25), 'Z');
});

test('letterFor: 26 -> AA, crossing the boundary', () => {
  assert.equal(Formula.letterFor(26), 'AA');
  assert.equal(Formula.letterFor(27), 'AB');
});

test('letterFor: 51 -> AZ, 52 -> BA', () => {
  assert.equal(Formula.letterFor(51), 'AZ');
  assert.equal(Formula.letterFor(52), 'BA');
});

// --- arithmetic and operator precedence -----------------------------------

test('arithmetic: * outranks +', () => {
  assert.equal(evalStr('A + B*C', { A: '1', B: '2', C: '3' }), '7');
});

test('arithmetic: parentheses change the order', () => {
  assert.equal(evalStr('(A + B)*C', { A: '1', B: '2', C: '3' }), '9');
});

test('arithmetic: unary minus', () => {
  assert.equal(evalStr('-A + B', { A: '5', B: '1' }), '-4');
});

test('arithmetic: division by zero -> undefined', () => {
  assert.equal(evalStr('A / B', { A: '1', B: '0' }), undefined);
});

test('arithmetic: a missing operand -> the whole formula is undefined (not 0)', () => {
  assert.equal(evalStr('A + B', { A: '1', B: undefined }), undefined);
});

// --- strings, comparison, the ternary operator, IF --------------------------

test('ternary operator: cond ? a : b', () => {
  assert.equal(evalStr('A > 10 ? "many" : "few"', { A: '20' }), 'many');
  assert.equal(evalStr('A > 10 ? "many" : "few"', { A: '5' }), 'few');
});

test('IF as a function -- the same as the ternary operator', () => {
  assert.equal(evalStr('IF(A > 10, "many", "few")', { A: '20' }), 'many');
});

test('IF requires exactly 3 arguments', () => {
  const r = Formula.parse('IF(A > 10, "x")', ['A']);
  assert.equal(r.ok, false);
  assert.match(r.error, /3 arguments/);
});

test('comparison: numeric when both sides look like numbers', () => {
  assert.equal(evalStr('A == B', { A: '5', B: '5.0' }), 'true');
  assert.equal(evalStr('A >= B', { A: '3', B: '10' }), 'false');
});

test('comparison: comparing against a missing value -> false (IF takes the else branch)', () => {
  assert.equal(evalStr('IF(A > 10, "yes", "no")', { A: undefined }), 'no');
});

// --- aggregate functions ------------------------------------------------------

test('SUM/AVG/MIN/MAX: skip non-numeric/missing arguments', () => {
  assert.equal(evalStr('SUM(A, B, C)', { A: '1', B: undefined, C: '3' }), '4');
  assert.equal(evalStr('AVG(A, B)', { A: '2', B: '4' }), '3');
  assert.equal(evalStr('MIN(A, B)', { A: '2', B: '4' }), '2');
  assert.equal(evalStr('MAX(A, B)', { A: '2', B: '4' }), '4');
});

test('SUM: every argument non-numeric -> undefined, not 0', () => {
  assert.equal(evalStr('SUM(A)', { A: undefined }), undefined);
});

test('CONCAT: joins non-empty values with no separator', () => {
  assert.equal(evalStr('CONCAT(A, B)', { A: 'x', B: 'y' }), 'xy');
});

test('FIRST_NONEMPTY: the first non-empty value', () => {
  assert.equal(evalStr('FIRST_NONEMPTY(A, B)', { A: '', B: 'y' }), 'y');
});

test('COUNT_NONEMPTY: counts the non-empty ones', () => {
  assert.equal(evalStr('COUNT_NONEMPTY(A, B, C)', { A: '1', B: '', C: '3' }), '2');
});

test('functions combine with arithmetic: A + MAX(B, C)', () => {
  assert.equal(evalStr('A + MAX(B, C)', { A: '1', B: '2', C: '5' }), '6');
});

// --- [Source.Field] -- a direct reference to a raw field --------------------

test('[Source.Field]: reads the value via lookupRaw, bypassing letters', () => {
  const lookup = function (path) { return path === 'ERP.price' ? '99' : undefined; };
  assert.equal(evalStr('A + [ERP.price]', { A: '1' }, lookup), '100');
});

// --- parse errors -------------------------------------------------------------

test('parse: an unknown letter -> a clear error', () => {
  const r = Formula.parse('A + B', ['A']);
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown variable: B/);
});

test('parse: an unknown function -> a clear error', () => {
  const r = Formula.parse('NOPE(A)', ['A']);
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown function/);
});

test('parse: an unclosed parenthesis -> an error', () => {
  const r = Formula.parse('(A + B', ['A', 'B']);
  assert.equal(r.ok, false);
});

test('parse: an unclosed [ -> an error', () => {
  const r = Formula.parse('A + [ERP.price', ['A']);
  assert.equal(r.ok, false);
  assert.match(r.error, /\[/);
});

test('parse: an unterminated string -> an error', () => {
  const r = Formula.parse('IF(A > 1, "x, "y")', ['A']);
  assert.equal(r.ok, false);
});

test('parse: an empty formula -> an error', () => {
  assert.equal(Formula.parse('', ['A']).ok, false);
  assert.equal(Formula.parse('   ', ['A']).ok, false);
});

test('parse: trailing characters after the end of the expression -> an error', () => {
  const r = Formula.parse('A + B)', ['A', 'B']);
  assert.equal(r.ok, false);
});
