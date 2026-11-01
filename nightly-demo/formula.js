'use strict';

// Formula support for kind === 'formula' on the Fields screen (entities.js::resolveCell).
// Own tokenizer/parser/evaluator -- not eval/new Function: presets are plain JSON/JS files
// people share with each other, and a formula as real executable JS would let a shared
// preset run arbitrary code.
//
// Letter variables (A, B, ... Z, AA, AB, ...) are positional input names (letterFor); the
// caller (entities.js) supplies their per-row values. [Source.Field] is a direct reference
// to a raw joined field, bypassing letters. Functions live in FUNCTIONS below, an easily
// extensible table (arithmetic only for now).
//
// Depends on nothing but itself -- entities.js depends on this module, so the reverse
// dependency would create a cycle. Hence its own minimal toNumber/compare, not shared with
// entities.js::parseNum / dataset.js::compareValues, which need a different level of
// strictness.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory());
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // 0-based index -> "A".."Z", "AA".."AZ", "BA"... (like spreadsheet column numbering).
  var letterFor = function (index) {
    var n = index + 1;
    var s = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  var toNumber = function (v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  };

  var compare = function (a, b, op) {
    if (a === undefined || b === undefined) return false;
    var na = toNumber(a), nb = toNumber(b);
    var cmp;
    if (na !== null && nb !== null) {
      cmp = na < nb ? -1 : na > nb ? 1 : 0;
    } else {
      var sa = String(a).toLowerCase(), sb = String(b).toLowerCase();
      cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    if (op === '==') return cmp === 0;
    if (op === '!=') return cmp !== 0;
    if (op === '<') return cmp < 0;
    if (op === '<=') return cmp <= 0;
    if (op === '>') return cmp > 0;
    if (op === '>=') return cmp >= 0;
    return false;
  };

  // Aggregate functions skip non-numeric/missing arguments (except CONCAT/
  // FIRST_NONEMPTY/COUNT_NONEMPTY, which don't need to).
  var numericArgs = function (args) {
    return args.map(toNumber).filter(function (v) { return v !== null; });
  };
  var present = function (v) { return v !== undefined && v !== null && v !== ''; };

  var FUNCTIONS = {
    SUM: function (args) {
      var ns = numericArgs(args);
      return ns.length ? ns.reduce(function (a, b) { return a + b; }, 0) : undefined;
    },
    AVG: function (args) {
      var ns = numericArgs(args);
      return ns.length ? ns.reduce(function (a, b) { return a + b; }, 0) / ns.length : undefined;
    },
    MIN: function (args) {
      var ns = numericArgs(args);
      return ns.length ? Math.min.apply(null, ns) : undefined;
    },
    MAX: function (args) {
      var ns = numericArgs(args);
      return ns.length ? Math.max.apply(null, ns) : undefined;
    },
    CONCAT: function (args) {
      return args.filter(present).map(String).join('');
    },
    FIRST_NONEMPTY: function (args) {
      for (var i = 0; i < args.length; i++) { if (present(args[i])) return args[i]; }
      return undefined;
    },
    COUNT_NONEMPTY: function (args) {
      return String(args.filter(present).length);
    }
  };

  // --- tokenizer ---------------------------------------------------------------

  var isDigit = function (c) { return c >= '0' && c <= '9'; };
  var isUpper = function (c) { return c >= 'A' && c <= 'Z'; };

  var tokenize = function (text) {
    var tokens = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      var start = i;

      if (c === '"' || c === "'") {
        var quote = c; i++;
        var buf = '';
        while (i < n && text[i] !== quote) {
          if (text[i] === '\\' && i + 1 < n) { buf += text[i + 1]; i += 2; }
          else { buf += text[i]; i++; }
        }
        if (i >= n) return { error: 'unterminated string', pos: start };
        i++;
        tokens.push({ type: 'string', value: buf, pos: start });
        continue;
      }

      if (c === '[') {
        i++;
        var b = '';
        while (i < n && text[i] !== ']') { b += text[i]; i++; }
        if (i >= n) return { error: 'unterminated "[" bracket', pos: start };
        i++;
        tokens.push({ type: 'bracket', value: b, pos: start });
        continue;
      }

      if (isDigit(c)) {
        var num = '';
        while (i < n && (isDigit(text[i]) || text[i] === '.')) { num += text[i]; i++; }
        tokens.push({ type: 'number', value: Number(num), pos: start });
        continue;
      }

      if (isUpper(c)) {
        var id = '';
        // "_" is allowed inside an identifier (function names like FIRST_NONEMPTY), but
        // not as the first character -- we only get here when isUpper(c) is true.
        while (i < n && (isUpper(text[i]) || text[i] === '_')) { id += text[i]; i++; }
        tokens.push({ type: 'ident', value: id, pos: start });
        continue;
      }

      var two = text.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        tokens.push({ type: 'op', value: two, pos: start });
        i += 2;
        continue;
      }
      if ('+-*/(),?:<>'.indexOf(c) !== -1) {
        tokens.push({ type: 'op', value: c, pos: start });
        i++;
        continue;
      }

      return { error: 'unexpected character ' + JSON.stringify(c), pos: start };
    }
    return { tokens: tokens };
  };

  // --- parser (recursive descent by operator precedence) -----------------------

  var CMP_OPS = { '==': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1 };

  var makeParser = function (tokens, knownLetters) {
    var pos = 0;
    var peek = function () { return tokens[pos]; };
    var fail = function (msg, tok) {
      var p = tok ? tok.pos : (tokens.length ? tokens[tokens.length - 1].pos : 0);
      throw new Error(msg + ' (position ' + p + ')');
    };
    var expectOp = function (op) {
      var t = peek();
      if (!t || t.type !== 'op' || t.value !== op) fail('expected "' + op + '"', t);
      pos++;
    };

    var parseArgs = function () {
      var args = [];
      var t = peek();
      if (t && t.type === 'op' && t.value === ')') return args;
      args.push(parseTernary());
      while (true) {
        t = peek();
        if (t && t.type === 'op' && t.value === ',') { pos++; args.push(parseTernary()); }
        else break;
      }
      return args;
    };

    var parsePrimary = function () {
      var t = peek();
      if (!t) fail('unexpected end of formula', null);
      if (t.type === 'number') { pos++; return { type: 'num', value: t.value }; }
      if (t.type === 'string') { pos++; return { type: 'str', value: t.value }; }
      if (t.type === 'bracket') { pos++; return { type: 'raw', path: t.value }; }
      if (t.type === 'ident') {
        pos++;
        var nextT = peek();
        if (nextT && nextT.type === 'op' && nextT.value === '(') {
          pos++;
          var args = parseArgs();
          expectOp(')');
          if (t.value === 'IF') {
            if (args.length !== 3) fail('IF expects exactly 3 arguments: condition, "then", "else"', t);
            return { type: 'if', cond: args[0], then: args[1], else: args[2] };
          }
          if (!FUNCTIONS[t.value]) fail('unknown function: ' + t.value, t);
          return { type: 'call', name: t.value, args: args };
        }
        if (knownLetters.indexOf(t.value) === -1) fail('unknown variable: ' + t.value, t);
        return { type: 'var', name: t.value };
      }
      if (t.type === 'op' && t.value === '(') {
        pos++;
        var inner = parseTernary();
        expectOp(')');
        return inner;
      }
      fail('unexpected token', t);
    };

    var parseUnary = function () {
      var t = peek();
      if (t && t.type === 'op' && t.value === '-') { pos++; return { type: 'neg', arg: parseUnary() }; }
      return parsePrimary();
    };

    var parseMultiplicative = function () {
      var left = parseUnary();
      while (true) {
        var t = peek();
        if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
          pos++;
          left = { type: 'binop', op: t.value, left: left, right: parseUnary() };
        } else break;
      }
      return left;
    };

    var parseAdditive = function () {
      var left = parseMultiplicative();
      while (true) {
        var t = peek();
        if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
          pos++;
          left = { type: 'binop', op: t.value, left: left, right: parseMultiplicative() };
        } else break;
      }
      return left;
    };

    var parseComparison = function () {
      var left = parseAdditive();
      var t = peek();
      if (t && t.type === 'op' && CMP_OPS[t.value]) {
        pos++;
        return { type: 'cmp', op: t.value, left: left, right: parseAdditive() };
      }
      return left;
    };

    function parseTernary() {
      var cond = parseComparison();
      var t = peek();
      if (t && t.type === 'op' && t.value === '?') {
        pos++;
        var a = parseTernary();
        expectOp(':');
        var b = parseTernary();
        return { type: 'if', cond: cond, then: a, else: b };
      }
      return cond;
    }

    return {
      parse: function () {
        var ast = parseTernary();
        if (pos < tokens.length) fail('trailing characters after the end of the expression', peek());
        return ast;
      }
    };
  };

  // text: the formula string. knownLetters: array of letters available as variables (entity
  // inputs, in letterFor order). Result: {ok:true, ast} | {ok:false, error}.
  var parse = function (text, knownLetters) {
    text = text == null ? '' : String(text);
    if (!text.trim()) return { ok: false, error: 'empty formula' };
    var scan = tokenize(text);
    if (scan.error) return { ok: false, error: scan.error + ' (position ' + scan.pos + ')' };
    try {
      var ast = makeParser(scan.tokens, knownLetters || []).parse();
      return { ok: true, ast: ast };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // --- evaluator -----------------------------------------------------------------

  // ast: from parse(...).ast. ctx.letters: {[letter]: string value}. ctx.lookupRaw(path):
  // raw field value for [path] references. Result: a string | undefined (values are always
  // strings; undefined means the evaluation missed, not a silent 0/"").
  var evaluate = function (ast, ctx) {
    var letters = (ctx && ctx.letters) || {};
    var lookupRaw = (ctx && ctx.lookupRaw) || function () { return undefined; };

    var evalNode = function (node) {
      switch (node.type) {
        case 'num': return node.value;
        case 'str': return node.value;
        case 'raw': return lookupRaw(node.path);
        case 'var': return letters[node.name];
        case 'neg': {
          var v = toNumber(evalNode(node.arg));
          return v === null ? undefined : -v;
        }
        case 'binop': {
          var a = toNumber(evalNode(node.left));
          var b = toNumber(evalNode(node.right));
          if (a === null || b === null) return undefined;
          if (node.op === '+') return a + b;
          if (node.op === '-') return a - b;
          if (node.op === '*') return a * b;
          return b === 0 ? undefined : a / b;   // '/'
        }
        case 'cmp':
          return compare(evalNode(node.left), evalNode(node.right), node.op);
        case 'if':
          return evalNode(node.cond) === true ? evalNode(node.then) : evalNode(node.else);
        case 'call':
          return FUNCTIONS[node.name](node.args.map(evalNode));
        default: return undefined;
      }
    };

    var result = evalNode(ast);
    return result === undefined || result === null ? undefined : String(result);
  };

  return {
    letterFor: letterFor,
    FUNCTIONS: FUNCTIONS,
    parse: parse,
    evaluate: evaluate
  };
});
