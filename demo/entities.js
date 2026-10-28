'use strict';

// Entities: builds table columns from selected fields -- typing, parsing numbers/dates/
// bools, collision resolution, formula fields (kind: 'formula', formula.js). The riskiest
// logic in the app -- edge cases (Excel serial dates, ambiguous separators) are the
// easiest thing to break with an eyeballed edit, see tests/entities.test.js. Depends on
// formula.js (must load first, see index.html) -- formula.js itself does not depend on
// entities.js, or it would be a cycle.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./formula.js'));
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Formula) {

  // Manual column width (px) on the Table screen; the same scale carries into the Excel export.
  var DEFAULT_COL_W = 150;   // px, if nothing is set for the column
  var MIN_COL_W = 48;        // px, the minimum when resizing by drag

  // Chosen/default width of column c in px: user override -> entity format -> default
  var colWidthPx = function (state) {
    var cw = (state.preset && state.preset.view && state.preset.view.column_widths) || {};
    var em = {};
    ((state.dataset && state.dataset.entities) || []).forEach(function (e) { em[e.name] = e; });
    return function (c) {
      return cw[c] || (em[c] && em[c].format && em[c].format.width) || DEFAULT_COL_W;
    };
  };

  var ENTITY_TYPES = [['text', 'text'], ['number', 'number'], ['date', 'date'], ['bool', 'boolean']];
  var ENTITY_KINDS = [['field', 'field'], ['resolve', 'coalesce'], ['formula', 'formula']];
  var _ENT_TYPE = { text: 1, number: 1, date: 1, bool: 1 };
  var _ENT_KIND = { field: 1, resolve: 1, formula: 1 };
  var _DATE_TOKENS = /YYYY|MM|DD|HH|mm|ss/g;

  var _pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  // "1 234,56" / "1,234.56" / "99.00" -> a number. The thousands separator is dropped; the
  // decimal separator is the last of . or , (or an explicit opts.decimal).
  var parseNum = function (raw, opts) {
    if (raw == null) return { ok: false, value: null };
    var s = String(raw).replace(/[\s  ]/g, '').replace(/[^0-9.,eE+-]/g, '');
    if (!/\d/.test(s)) return { ok: false, value: null };
    var dec = (opts && opts.decimal) || 'auto';
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    var sep = dec === ',' ? ',' : dec === '.' ? '.' : (lc > ld ? ',' : (ld > -1 ? '.' : ''));
    var i = sep ? s.lastIndexOf(sep) : -1;
    if (i !== -1) {
      s = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, '');
    } else {
      s = s.replace(/[.,]/g, '');
    }
    var n = Number(s);
    return isFinite(n) ? { ok: true, value: n } : { ok: false, value: null };
  };

  var _mkDate = function (Y, M, D, h, m, s) {
    Y = +Y; M = +M; D = +D;
    var ms = Date.UTC(Y, M - 1, D, +(h || 0), +(m || 0), +(s || 0));
    var d = new Date(ms);
    if (isNaN(ms) || d.getUTCFullYear() !== Y || d.getUTCMonth() !== M - 1 || d.getUTCDate() !== D) {
      return { ok: false, ms: null };
    }
    return { ok: true, ms: ms };
  };

  // Excel/1900 serial date (days since 1899-12-30, with the historical "1900 is a leap
  // year" bug). The constant 25569 = days from that epoch to 1970-01-01. The fractional
  // part is a fraction of a day. Range 1..2958465 = 1900-01-01 .. 9999-12-31.
  var _excelSerialToMs = function (n) {
    if (!isFinite(n) || n < 1 || n > 2958465) return null;
    return Math.round((n - 25569) * 86400000);
  };

  // fmt === 'auto' tries common forms (including a 5-7 digit Excel serial date); 'excel' /
  // 'serial' means only a serial date; otherwise a token pattern (YYYY MM DD HH mm ss with
  // any separators). Everything in UTC -- deterministic.
  var parseDate = function (raw, fmt) {
    if (raw == null) return { ok: false, ms: null };
    var s = String(raw).trim();
    if (s === '') return { ok: false, ms: null };
    fmt = fmt || 'auto';
    if (fmt === 'excel' || fmt === 'serial') {
      var ems = _excelSerialToMs(Number(s.replace(',', '.')));
      return ems == null ? { ok: false, ms: null } : { ok: true, ms: ems };
    }
    if (fmt !== 'auto') {
      var toks = [];
      var reStr = fmt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(_DATE_TOKENS, function (t) {
        toks.push(t); return t === 'YYYY' ? '(\\d{4})' : '(\\d{1,2})';
      });
      var mm = s.match(new RegExp('^' + reStr));
      if (!mm) return { ok: false, ms: null };
      var v = { YYYY: 1970, MM: 1, DD: 1, HH: 0, mm: 0, ss: 0 };
      toks.forEach(function (t, i) { v[t] = +mm[i + 1]; });
      return _mkDate(v.YYYY, v.MM, v.DD, v.HH, v.mm, v.ss);
    }
    if (/^\d{9,13}$/.test(s)) {
      var num = Number(s);
      return isFinite(num) ? { ok: true, ms: s.length <= 10 ? num * 1000 : num } : { ok: false, ms: null };
    }
    // Excel serial date: 5-7 digits (roughly 1927 onward), optionally a fractional day.
    // Shorter than a unix timestamp (9+ digits) -- no overlap.
    if (/^\d{5,7}(?:[.,]\d+)?$/.test(s)) {
      var esm = _excelSerialToMs(Number(s.replace(',', '.')));
      if (esm != null) return { ok: true, ms: esm };
    }
    var m;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return _mkDate(m[1], m[2], m[3], m[4], m[5], m[6]);
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return _mkDate(m[3], m[2], m[1], m[4], m[5], m[6]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      var a = +m[1], b = +m[2];
      return _mkDate(m[3], a > 12 ? b : a, a > 12 ? a : b, m[4], m[5], m[6]);
    }
    var p = Date.parse(s);
    return isFinite(p) ? { ok: true, ms: p } : { ok: false, ms: null };
  };

  var formatDate = function (ms, out) {
    if (ms == null) return '';
    var d = new Date(ms);
    var map = {
      YYYY: d.getUTCFullYear(), MM: _pad2(d.getUTCMonth() + 1), DD: _pad2(d.getUTCDate()),
      HH: _pad2(d.getUTCHours()), mm: _pad2(d.getUTCMinutes()), ss: _pad2(d.getUTCSeconds())
    };
    return String(out || 'YYYY-MM-DD').replace(_DATE_TOKENS, function (t) { return map[t]; });
  };

  var parseBool = function (raw, trueTokens) {
    if (raw == null) return { ok: false, value: null };
    var s = String(raw).trim().toLowerCase();
    if (s === '') return { ok: false, value: null };
    var T = String(trueTokens || 'true,1,yes,y,+').toLowerCase().split(/[,\s]+/).filter(Boolean);
    var F = ['false', '0', 'no', 'n', '-'];
    if (T.indexOf(s) !== -1) return { ok: true, value: true };
    if (F.indexOf(s) !== -1) return { ok: true, value: false };
    return { ok: false, value: null };
  };

  var _numStr = function (n) {
    if (!isFinite(n)) return String(n);
    return (Math.abs(n) >= 1e15 || (n !== 0 && Math.abs(n) < 1e-6))
      ? String(n) : String(Number(n.toPrecision(15)));
  };

  // A raw value -> {display, key, ok}; a parse miss -> ok:false, key:null, raw text
  var typeCell = function (raw, entity) {
    var t = (entity && entity.type) || 'text';
    if (raw == null) return { display: null, key: null, ok: true };
    var p = (entity && entity.parse) || {};
    if (t === 'number') {
      var rn = parseNum(raw, p);
      return rn.ok ? { display: _numStr(rn.value), key: rn.value, ok: true }
                   : { display: String(raw), key: null, ok: false };
    }
    if (t === 'date') {
      var rd = parseDate(raw, p.date_in);
      return rd.ok ? { display: formatDate(rd.ms, p.date_out || 'YYYY-MM-DD'), key: rd.ms, ok: true }
                   : { display: String(raw), key: null, ok: false };
    }
    if (t === 'bool') {
      var rb = parseBool(raw, p['true']);
      return rb.ok ? { display: rb.value ? 'true' : 'false', key: rb.value ? 1 : 0, ok: true }
                   : { display: String(raw), key: null, ok: false };
    }
    return { display: String(raw), key: String(raw).toLowerCase(), ok: true };
  };

  var _present = function (v, nullWins) {
    if (v === undefined || v === '') return false;
    if (v === null) return !!nullWins;
    return true;
  };

  // Aggregators for group summary rows (view-table.js), by field type -- which functions to
  // offer in the UI. Reuses Formula.FUNCTIONS wholesale, computing nothing new: SUM/AVG/MIN/
  // MAX already skip non-numeric/missing values, and __k for bool already stores true/false
  // as 1/0 (typeCell above) -- a plain SUM over __k is already "a sum where true counts as
  // 1", no separate function needed. To add an aggregator for a new type (e.g. text), just
  // add an entry here (and, if a function formula.js::FUNCTIONS lacks is needed, add it
  // there); aggregateGroup below knows nothing about specific types/functions directly.
  var AGG_FUNCS_BY_TYPE = {
    number: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT_NONEMPTY'],
    date: ['MIN', 'MAX', 'COUNT_NONEMPTY'],
    bool: ['SUM', 'COUNT_NONEMPTY'],
    text: []
  };
  var AGG_FUNC_LABELS = { SUM: 'sum', AVG: 'average', MIN: 'min', MAX: 'max', COUNT_NONEMPTY: 'count' };

  // rows -- a group's rows AFTER parseTypes (row.__k[column] is the numeric/epoch-ms/0-1
  // key), column -- the field column's name, entity -- its entity (type + date format), fn
  // -- a function name from AGG_FUNCS_BY_TYPE[entity.type]. undefined if the function
  // doesn't suit the type, or there's no result (every value is empty/non-numeric) -- shown
  // as an empty cell, not 0/an error.
  var aggregateGroup = function (rows, column, entity, fn) {
    var type = (entity && entity.type) || 'text';
    if (!AGG_FUNCS_BY_TYPE[type] || AGG_FUNCS_BY_TYPE[type].indexOf(fn) === -1) return undefined;
    var fnImpl = Formula.FUNCTIONS[fn];
    if (!fnImpl) return undefined;
    var args = rows.map(function (r) { return r.__k ? r.__k[column] : undefined; });
    var result = fnImpl(args);
    if (result === undefined) return undefined;
    if (fn === 'COUNT_NONEMPTY') return String(result);
    if (type === 'date') {
      var outFmt = (entity.parse && entity.parse.date_out) || 'YYYY-MM-DD';
      return formatDate(Number(result), outFmt);
    }
    return _numStr(Number(result));
  };

  // Input letters in order (A, B, ..., Z, AA, ...) -- the same numbering as in the UI
  // (view-entities.js), formula.js::letterFor.
  var lettersForInputs = function (inputs) {
    return (inputs || []).map(function (_, i) { return Formula.letterFor(i); });
  };

  // One entity cell from a joined row -> a string | null | undefined. parsed is, for kind
  // === 'formula', the result of Formula.parse(...) for this entity (see resolveEntities: a
  // formula is parsed ONCE per entity, not per row).
  var resolveCell = function (from, jrow, parsed) {
    from = from || {};
    if (from.kind === 'resolve') {
      var ins = (from.inputs || [])
        .map(function (x, i) { return { c: x.column, w: Number(x.weight) || 0, i: i }; })
        .filter(function (x) { return x.c; });
      ins.sort(function (a, b) { return b.w - a.w || a.i - b.i; });   // weight desc, then input order
      for (var k = 0; k < ins.length; k++) {
        if (_present(jrow[ins[k].c], from.null_wins)) return jrow[ins[k].c];
      }
      return undefined;
    }
    if (from.kind === 'formula') {
      if (!parsed || !parsed.ok) return undefined;   // a parse error -- already shown in the UI
      var letters = {};
      var names = lettersForInputs(from.inputs);
      (from.inputs || []).forEach(function (inp, i) { letters[names[i]] = jrow[inp.column]; });
      return Formula.evaluate(parsed.ast, {
        letters: letters,
        lookupRaw: function (path) { return jrow[path]; }
      });
    }
    return jrow[from.column];   // kind === 'field'
  };

  var implicitEntities = function (columns, columnTypes) {
    var types = columnTypes || {};
    return columns.map(function (c) {
      return { name: c, type: types[c] || 'text', from: { kind: 'field', column: c } };
    });
  };

  var _uniqName = function (want, taken, idx) {
    var base = (want == null || String(want).trim() === '') ? 'column ' + (idx + 1) : String(want);
    var n = base, k = 2;
    while (taken[n] !== undefined) { n = base + ' (' + k + ')'; k++; }
    taken[n] = true;
    return n;
  };

  // Final (deduplicated) column names for a set of entities -- exactly what the row keys
  // will be after resolveEntities/parseTypes
  var entityOutNames = function (entities) {
    var taken = {};
    return (entities || []).map(function (e, i) { return _uniqName(e.name, taken, i); });
  };

  // joined {columns, rows} + [entity] -> {columns: entity names, rows}
  var resolveEntities = function (joined, entities) {
    var names = entityOutNames(entities);
    // A formula is parsed ONCE per entity, not per row -- parsing a short string is cheap
    // on its own, but doing it N_rows times per formula entity is pointless when the AST
    // doesn't change across rows within one build.
    var parsedByEntity = entities.map(function (e) {
      return e.from.kind === 'formula'
        ? Formula.parse(e.from.formula, lettersForInputs(e.from.inputs))
        : null;
    });
    var rows = joined.rows.map(function (jr) {
      var out = {};
      entities.forEach(function (e, i) { out[names[i]] = resolveCell(e.from, jr, parsedByEntity[i]); });
      return out;
    });
    return { columns: names, rows: rows };
  };

  // typing: row[name] -> display; row.__k[name] -> sort key; row.__u[name] -> a miss
  var parseTypes = function (ds, entities, names) {
    var rows = ds.rows.map(function (r) {
      var out = { __k: {}, __u: {} };
      entities.forEach(function (e, i) {
        var nm = names[i];
        var tc = typeCell(r[nm], e);
        out[nm] = tc.display;
        out.__k[nm] = tc.key;
        if (!tc.ok) out.__u[nm] = true;
      });
      return out;
    });
    return { columns: ds.columns, rows: rows };
  };

  // The one implementation of "list of a preset's selected fields" (name qualification --
  // "Source.field" when >1 source, otherwise the bare name). manifestSources is optional
  // (store.js calls this before the manifest is even loaded, e.g. in preset/addEntity when
  // state.manifest is still empty) -- without it, a source whose selection hasn't narrowed
  // yet (labels: null, an old/loaded preset meaning "all fields selected") would otherwise
  // give an empty list instead of the full one.
  var presetColumns = function (preset, manifestSources) {
    var names = Object.keys(preset.query.sources);
    var multi = names.length > 1;
    var sources = manifestSources || [];
    var out = [];
    names.forEach(function (n) {
      var explicit = preset.query.sources[n].labels;
      var labels = explicit;
      if (!labels) {
        var ms = sources.find(function (s) { return s.name === n; });
        labels = ms ? [ms.key].concat(ms.labels) : [];
      }
      labels.forEach(function (l) { out.push(multi ? n + '.' + l : l); });
    });
    return out;
  };

  // {source: [field,...]} + manifest.sources -> {column: type}. Same name-qualification
  // scheme as presetColumns/joinSources ("Source.field" when >1 source, otherwise the bare
  // name) -- otherwise types wouldn't line up with columns. A key column, or a field not
  // yet in the manifest (not published by the source, or the manifest isn't loaded) ->
  // defaults to "text".
  var columnTypesFor = function (sourceLabels, manifestSources) {
    var names = Object.keys(sourceLabels);
    var multi = names.length > 1;
    var sources = manifestSources || [];
    var out = {};
    names.forEach(function (n) {
      var ms = sources.find(function (s) { return s.name === n; });
      var types = (ms && ms.label_types) || {};
      (sourceLabels[n] || []).forEach(function (l) {
        out[multi ? n + '.' + l : l] = types[l] || 'text';
      });
    });
    return out;
  };

  // The type of a single column from the preset (no JOIN/live data) -- used for defaults in
  // store.js's reducer when adding a field (the type analogue of presetColumns).
  var columnType = function (preset, manifestSources, column) {
    var sourceLabels = {};
    Object.keys(preset.query.sources).forEach(function (n) {
      sourceLabels[n] = preset.query.sources[n].labels || [];
    });
    return columnTypesFor(sourceLabels, manifestSources)[column] || 'text';
  };

  var entityColumns = function (preset, manifestSources) {
    var used = {};
    preset.view.entities.forEach(function (e) {
      if (e.from && e.from.kind === 'field' && e.from.column) used[e.from.column] = 1;
    });
    return { all: presetColumns(preset, manifestSources), used: used };
  };

  var mergeEntity = function (cur, patch) {
    var out = Object.assign({}, cur, patch);
    if (patch.from) out.from = Object.assign({}, cur.from || {}, patch.from);
    if (patch.parse) out.parse = Object.assign({}, cur.parse || {}, patch.parse);
    if (patch.format) out.format = Object.assign({}, cur.format || {}, patch.format);
    return out;
  };

  // view.entities [{name, type, parse, format, from}] -> normalized form
  var normalizeEntities = function (view) {
    var raw = Array.isArray(view.entities) ? view.entities : [];
    return raw.map(function (e) {
      e = e && typeof e === 'object' ? e : {};
      var f = e.from && typeof e.from === 'object' ? e.from : {};
      var kind = _ENT_KIND[f.kind] ? f.kind : 'field';
      var inputs = (Array.isArray(f.inputs) ? f.inputs : []).map(function (x) {
        x = x && typeof x === 'object' ? x : {};
        return {
          column: typeof x.column === 'string' ? x.column : '',
          weight: x.weight == null || x.weight === '' ? 0.5 : Number(x.weight)
        };
      }).filter(function (x) { return x.column; });
      var from = { kind: kind };
      if (kind === 'field') {
        from.column = typeof f.column === 'string' ? f.column : '';
      } else if (kind === 'resolve') {
        from.inputs = inputs;
        from.null_wins = f.null_wins !== false;
      } else {
        from.inputs = inputs;
        from.formula = typeof f.formula === 'string' ? f.formula : '';
      }
      var out = {
        name: typeof e.name === 'string' ? e.name : '',
        type: _ENT_TYPE[e.type] ? e.type : 'text',
        hidden: !!e.hidden,
        from: from
      };
      var p = e.parse && typeof e.parse === 'object' ? e.parse : null;
      if (p) {
        out.parse = {};
        if (p.date_in != null) out.parse.date_in = String(p.date_in);
        if (p.date_out != null) out.parse.date_out = String(p.date_out);
        if (p['true'] != null) out.parse['true'] = String(p['true']);
        if (p.decimal != null) out.parse.decimal = String(p.decimal);
      }
      var fm = e.format && typeof e.format === 'object' ? e.format : null;
      if (fm) {
        out.format = {};
        if (fm.width != null && fm.width !== '') out.format.width = Number(fm.width);
        if (['left', 'center', 'right'].indexOf(fm.align) !== -1) out.format.align = fm.align;
        if (fm.font_size != null && fm.font_size !== '') out.format.font_size = Number(fm.font_size);
      }
      return out;
    }).filter(function (e) {
      return e.from.kind === 'field' ? e.from.column !== '' : e.from.inputs.length > 0;
    });
  };

  var api = {
    MIN_COL_W: MIN_COL_W, colWidthPx: colWidthPx,
    ENTITY_TYPES: ENTITY_TYPES, ENTITY_KINDS: ENTITY_KINDS,
    parseNum: parseNum, parseDate: parseDate, formatDate: formatDate, parseBool: parseBool,
    typeCell: typeCell, resolveCell: resolveCell, implicitEntities: implicitEntities,
    entityOutNames: entityOutNames, resolveEntities: resolveEntities, parseTypes: parseTypes,
    presetColumns: presetColumns, entityColumns: entityColumns, mergeEntity: mergeEntity,
    normalizeEntities: normalizeEntities, columnTypesFor: columnTypesFor, columnType: columnType,
    lettersForInputs: lettersForInputs,
    AGG_FUNCS_BY_TYPE: AGG_FUNCS_BY_TYPE, AGG_FUNC_LABELS: AGG_FUNC_LABELS, aggregateGroup: aggregateGroup
  };

  return api;
});
