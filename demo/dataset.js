'use strict';

// Dataset: JOIN of sources (left/right/inner/full), selection conditions, advanced
// filter, quick filters, sorting. Single dependency -- util.js (omit).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, factory(root.DS_APP));
  }
})(typeof window !== 'undefined' ? window : this, function (Util) {

  var omit = Util.omit;

  // Join kind between sources; order = order in the dropdown.
  var JOIN_TYPES = [
    ['left', 'LEFT'],
    ['right', 'RIGHT'],
    ['inner', 'INNER'],
    ['full', 'FULL']
  ];
  var JOIN_TYPE_IDS = JOIN_TYPES.map(function (t) { return t[0]; });

  // JOIN of multiple sources (LEFT/RIGHT/INNER/FULL -- j.type, defaults to 'left' for
  // backward compatibility with presets that lack this field).
  // selected: [{name, key, labels, data}]. joins: [{left, left_field, right,
  // right_field, type}]. The base (selected[0]) enters whole as the first step; each
  // following source joins onto the rows accumulated SO FAR -- j.left may name any
  // source that entered the selection earlier (not necessarily the immediately
  // preceding one). With >1 source, columns are qualified as "<Source>.<label>". A
  // source's key field is a regular selectable field: it only becomes a column if it's
  // present in s.labels (otherwise it's only used for matching during the JOIN).
  //
  // Because matching is key-based (a Map keyed by the field's string value, ignoring
  // duplicates), this is not a full relational JOIN with a cartesian product on
  // duplicate right-side keys -- as before, the last row with a given key wins.
  // RIGHT/FULL add "unmatched" right-side rows in a separate pass, with undefined in
  // every other column (except the source's own fields).
  var joinSources = function (selected, joins) {
    if (!selected.length) return { columns: [], rows: [] };
    var qualify = selected.length > 1;
    var col = function (src, label) { return qualify ? src + '.' + label : label; };

    var base = selected[0];
    var rest = selected.slice(1);

    var columns = base.labels.map(function (l) { return col(base.name, l); })
      .concat(rest.reduce(function (acc, s) {
        return acc.concat(s.labels.map(function (l) { return col(s.name, l); }));
      }, []));

    var rows = base.data.map(function (r) {
      var o = { __match: {} };
      o.__match[base.name] = r;
      base.labels.forEach(function (l) { o[col(base.name, l)] = l in r ? r[l] : undefined; });
      return o;
    });

    rest.forEach(function (s) {
      var j = joins.find(function (x) { return x.right === s.name; })
        || { left: base.name, left_field: base.key, right: s.name, right_field: s.key };
      var type = JOIN_TYPE_IDS.indexOf(j.type) !== -1 ? j.type : 'left';
      var idx = new Map();
      s.data.forEach(function (r) {
        var k = r[j.right_field];
        if (k != null) idx.set(String(k), r);
      });
      var usedKeys = new Set();

      var merged = [];
      rows.forEach(function (o) {
        var leftRow = o.__match[j.left];
        var key = leftRow ? leftRow[j.left_field] : undefined;
        var m = key != null ? idx.get(String(key)) : undefined;
        if (m) usedKeys.add(String(key));
        if (!m && (type === 'inner' || type === 'right')) return;   // no right-side match -- drop
        var next = Object.assign({}, o);
        s.labels.forEach(function (l) { next[col(s.name, l)] = m && l in m ? m[l] : undefined; });
        next.__match = Object.assign({}, o.__match);
        next.__match[s.name] = m;
        merged.push(next);
      });

      if (type === 'right' || type === 'full') {
        s.data.forEach(function (r) {
          var k = r[j.right_field];
          if (k != null && usedKeys.has(String(k))) return;   // already given to a left-side row
          var o = { __match: {} };
          o.__match[s.name] = r;
          s.labels.forEach(function (l) { o[col(s.name, l)] = l in r ? r[l] : undefined; });
          merged.push(o);
        });
      }

      rows = merged;
    });

    return { columns: columns, rows: rows.map(function (r) { return omit(r, '__match'); }) };
  };

  // Shared "contains" predicate -- used both for the legacy text filter (now just a
  // contains condition in state.adv, see store.js::quick/applyFilter) and for the
  // per-column search (findNextMatch below).
  var matchesFilter = function (value, needle) {
    return String(value == null ? '' : value).toLowerCase().indexOf(needle.trim().toLowerCase()) !== -1;
  };

  // "Search" icon in a column header (view-table.js): the next row below afterIndex
  // whose value in column contains needle; wraps to the start if nothing is found
  // further down. -1 if there's no match at all.
  var findNextMatch = function (rows, column, needle, afterIndex) {
    if (!needle || !needle.trim() || !rows.length) return -1;
    var n = rows.length;
    for (var step = 1; step <= n; step++) {
      var i = (afterIndex + step) % n;
      if (matchesFilter(rows[i][column], needle)) return i;
    }
    return -1;
  };

  // Dropdown under the search/filter field (view-common.js::quickValueInput): the
  // first limit UNIQUE values of a column in row order (not top-by-frequency, not
  // sorted) -- exits early so it doesn't scan the whole column on datasets where that
  // would be pointless (almost every value distinct). limit<=0 -> [].
  var uniqueValues = function (rows, column, limit) {
    var out = [];
    if (!limit || limit <= 0) return out;
    var seen = Object.create(null);
    for (var i = 0; i < rows.length && out.length < limit; i++) {
      var v = rows[i][column];
      if (v == null || v === '') continue;
      var s = String(v);
      if (seen[s]) continue;
      seen[s] = true;
      out.push(s);
    }
    return out;
  };

  // --- selection conditions (set in the builder, narrow the dataset at build time) ---
  // Operator -> label; order = order in the dropdown.
  var OPERATORS = [
    ['contains', 'contains'],
    ['not_contains', 'does not contain'],
    ['eq', 'equals'],
    ['ne', 'not equals'],
    ['in', 'in list'],
    ['not_in', 'not in list'],
    ['starts', 'starts with'],
    ['ends', 'ends with'],
    ['gt', '> (number)'],
    ['gte', '≥ (number)'],
    ['lt', '< (number)'],
    ['lte', '≤ (number)'],
    ['empty', 'empty'],
    ['not_empty', 'not empty']
  ];
  var OP_IDS = OPERATORS.map(function (o) { return o[0]; });
  var OP_NO_VALUE = { empty: 1, not_empty: 1 };
  var OP_LIST = { in: 1, not_in: 1 };            // value is a list (one per line / comma-separated)

  // "id1, id2\n id3 ; id4" -> ["id1","id2","id3","id4"] (trimmed, lowercased, no blanks)
  var parseList = function (raw) {
    return String(raw == null ? '' : raw)
      .split(/[\n,;\t]+/)
      .map(function (x) { return x.trim().toLowerCase(); })
      .filter(Boolean);
  };

  var matchCondition = function (cell, cond) {
    var op = cond.op;
    var isEmpty = cell == null || cell === '';
    if (op === 'empty') return isEmpty;
    if (op === 'not_empty') return !isEmpty;
    var s = String(cell == null ? '' : cell).toLowerCase();
    var n = String(cond.value == null ? '' : cond.value).trim().toLowerCase();
    switch (op) {
      case 'contains': return s.indexOf(n) !== -1;
      case 'not_contains': return s.indexOf(n) === -1;
      case 'eq': return s === n;
      case 'ne': return s !== n;
      case 'in': case 'not_in': {
        var list = parseList(cond.value);
        if (!list.length) return op === 'not_in';       // empty list: in matches nothing, not_in matches all
        var hit = list.indexOf(s) !== -1;
        return op === 'in' ? hit : !hit;
      }
      case 'starts': return s.indexOf(n) === 0;
      case 'ends': return n === '' || s.slice(-n.length) === n;
      case 'gt': case 'gte': case 'lt': case 'lte': {
        if (isEmpty) return false;                 // an empty cell is not a number
        var a = Number(cell), b = Number(cond.value);
        if (isNaN(a) || isNaN(b)) return false;
        return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
      }
      default: return true;
    }
  };

  var conditionActive = function (c) {
    if (!c || !c.field) return false;
    if (OP_NO_VALUE[c.op]) return true;
    if (OP_LIST[c.op]) return parseList(c.value).length > 0;
    return String(c.value == null ? '' : c.value).trim() !== '';
  };

  // Conditions apply sequentially (AND): a row passes if it satisfies all of them. A
  // condition on a nonexistent column (a stale preset / a renamed entity) is skipped --
  // otherwise it would silently zero out the whole selection.
  var applyConditions = function (dataset, conditions) {
    var have = {};
    dataset.columns.forEach(function (c) { have[c] = 1; });
    var active = (conditions || []).filter(function (c) {
      return conditionActive(c) && have[c.field];
    });
    if (!active.length) return dataset;
    var rows = dataset.rows.filter(function (r) {
      return active.every(function (c) { return matchCondition(r[c.field], c); });
    });
    return { columns: dataset.columns, rows: rows };
  };

  // --- advanced filter (a transient layer on the Table screen, not part of the preset) ---
  // Rows: { field, op, value, conj }. conj ('and'|'or') is the connector with the previous
  // active row; ignored for the first active one. AND outranks OR: active rows split into
  // OR groups at conj==='or'; AND within a group, OR between groups.
  var evalRowGroups = function (activeRows, row) {
    var groups = [[]];
    activeRows.forEach(function (c, i) {
      if (i > 0 && c.conj === 'or') groups.push([]);
      groups[groups.length - 1].push(c);
    });
    return groups.some(function (g) {
      return g.every(function (c) { return matchCondition(row[c.field], c); });
    });
  };

  var applyAdvanced = function (dataset, rows) {
    var active = (rows || []).filter(conditionActive);
    if (!active.length) return dataset;
    return {
      columns: dataset.columns,
      rows: dataset.rows.filter(function (r) { return evalRowGroups(active, r); })
    };
  };

  // --- column sorting (transient, multi-level) ---
  var compareValues = function (a, b) {
    var na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && isFinite(na) && isFinite(nb)) {
      return na < nb ? -1 : na > nb ? 1 : 0;
    }
    return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
  };

  // One comparison level -- 0 if equal (fall through to the next level), otherwise
  // already multiplied by direction. Shared by the (former) single-level applySort.
  var compareLevel = function (x, y, level) {
    // sort key: typed (row.__k) -- a number for number/date, a string for text
    var kx = x.__k ? x.__k[level.col] : undefined;
    var ky = y.__k ? y.__k[level.col] : undefined;
    var av = kx !== undefined ? kx : x[level.col];
    var bv = ky !== undefined ? ky : y[level.col];
    var ae = av == null || av === '', be = bv == null || bv === '';
    if (ae || be) return ae && be ? 0 : (ae ? 1 : -1);   // empty/unparseable sort to the end
    var c = (typeof av === 'number' && typeof bv === 'number')
      ? (av < bv ? -1 : av > bv ? 1 : 0) : compareValues(av, bv);
    return c * (level.dir === 'desc' ? -1 : 1);
  };

  // sortBy: [{col,dir}] -- level order = priority (ORDER BY col1, col2, ...). Levels
  // without a chosen column are skipped. One pass, stable (a tie at every level falls
  // back to the original index) -- matters not just as a sort invariant on its own, but
  // for grouping too (renderGrid sorts BEFORE groupBy, and groupBy is a stable
  // partition, so the order within each group is inherited from this sort with no
  // extra logic).
  var applySort = function (rows, sortBy) {
    var levels = (sortBy || []).filter(function (l) { return l && l.col; });
    if (!levels.length) return rows;
    return rows.map(function (r, i) { return [r, i]; }).sort(function (x, y) {
      for (var i = 0; i < levels.length; i++) {
        var c = compareLevel(x[0], y[0], levels[i]);
        if (c !== 0) return c;
      }
      return x[1] - y[1];   // stability
    }).map(function (p) { return p[0]; });
  };

  // Fields marked hidden (see view-entities.js) are computed and available to
  // conditions (applyConditions sees them in dataset.columns), but not shown in the
  // table/export/advanced filter -- filtered out here, before hideEmpty.
  var visibleColumns = function (dataset, hideEmpty) {
    var hidden = dataset.hiddenColumns;
    var cols = hidden && hidden.length
      ? dataset.columns.filter(function (c) { return hidden.indexOf(c) === -1; })
      : dataset.columns;
    if (!hideEmpty) return cols;
    return cols.filter(function (c) {
      return dataset.rows.some(function (r) { return r[c] != null && r[c] !== ''; });
    });
  };

  return {
    joinSources: joinSources, JOIN_TYPES: JOIN_TYPES, JOIN_TYPE_IDS: JOIN_TYPE_IDS,
    matchesFilter: matchesFilter, findNextMatch: findNextMatch, uniqueValues: uniqueValues,
    OPERATORS: OPERATORS, OP_IDS: OP_IDS, OP_NO_VALUE: OP_NO_VALUE, OP_LIST: OP_LIST,
    parseList: parseList, matchCondition: matchCondition, conditionActive: conditionActive,
    applyConditions: applyConditions, evalRowGroups: evalRowGroups, applyAdvanced: applyAdvanced,
    compareValues: compareValues, applySort: applySort, visibleColumns: visibleColumns
  };
});
