'use strict';

// Export to CSV / SpreadsheetML (Excel .xls) and export filename construction.
// Depends on nothing else -- just string transforms.
(function (root) {

  var toCsv = function (dataset, columns) {
    var cell = function (v) {
      var s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [columns.map(cell).join(',')]
      .concat(dataset.rows.map(function (r) {
        return columns.map(function (c) { return cell(r[c]); }).join(',');
      }))
      .join('\r\n');
  };

  var xmlEsc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // One SpreadsheetML <Row>. An empty cell is <Cell/> (it keeps its own column position,
  // no ss:Index needed). Type is always String: office suites won't coerce "007" /
  // "99.00" into a number on open. styleId is the row's shared cell style (word wrap,
  // top vertical alignment; the header also gets bold).
  var xlsRow = function (values, styleId) {
    var sid = styleId ? ' ss:StyleID="' + styleId + '"' : '';
    return '    <Row>' + values.map(function (v) {
      return (v == null || v === '')
        ? '<Cell' + sid + '/>'
        : '<Cell' + sid + '><Data ss:Type="String">' + xmlEsc(v) + '</Data></Cell>';
    }).join('') + '</Row>';
  };

  // One real SpreadsheetML sheet: tab name = name, header + data rows. opts:
  // {selected, hidden, protect}. widthsPt -- column widths in points (proportions --
  // same as on the Table screen); AutoFitWidth=0 keeps Excel from recalculating them.
  var xlsWorksheet = function (name, dataset, columns, opts, widthsPt) {
    var cols = (widthsPt || []).map(function (w) {
      return '    <Column ss:AutoFitWidth="0" ss:Width="' + Number(w) + '"/>';
    });
    var rows = [xlsRow(columns, 'hdr')].concat(dataset.rows.map(function (r) {
      return xlsRow(columns.map(function (c) { return r[c]; }), 'cell');
    }));
    var wo = [];
    if (opts.selected) { wo.push('     <Selected/>'); }
    if (opts.hidden) { wo.push('     <Visible>SheetHidden</Visible>'); }
    if (opts.protect) {
      // Empty password: protection is on, lifted without a password.
      wo.push('     <ProtectContents>True</ProtectContents>');
      wo.push('     <ProtectObjects>True</ProtectObjects>');
      wo.push('     <ProtectScenarios>True</ProtectScenarios>');
    }
    var table = ['   <Table>']
      .concat(cols.length ? cols : [])
      .concat([rows.join('\n'), '   </Table>']);
    return [
      '  <Worksheet ss:Name="' + xmlEsc(name) + '"' + (opts.protect ? ' ss:Protected="1"' : '') + '>'
    ].concat(table).concat([
      '   <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">',
      wo.join('\n'),
      '   </WorksheetOptions>',
      '  </Worksheet>'
    ]).join('\n');
  };

  // A SpreadsheetML 2003 (Excel XML, .xls extension) workbook -- one sheet with the
  // data. Opens in desktop Microsoft Excel and LibreOffice/AlterOffice, no libraries
  // needed. widthsPt -- column widths in points (proportions -- same as on the Table
  // screen).
  var toXlsWorkbook = function (dataset, columns, widthsPt) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?mso-application progid="Excel.Sheet"?>',
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
      '          xmlns:o="urn:schemas-microsoft-com:office:office"',
      '          xmlns:x="urn:schemas-microsoft-com:office:excel"',
      '          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
      ' <Styles>',
      '  <Style ss:ID="cell"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>',
      '  <Style ss:ID="hdr"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:Bold="1"/></Style>',
      ' </Styles>',
      xlsWorksheet('Table', dataset, columns, { selected: true }, widthsPt),
      '</Workbook>'
    ].join('\n');
  };

  // Export filename: <source>_YYYY-MM-DD_HH-MM-SS_<micros>.<ext>. <source> is the
  // neutral "export" (a custom-name field used to be in the UI, removed -- the browser
  // can't hand over the OS user's name anyway). Time is local; microseconds are
  // milliseconds zero-padded.
  var pad = function (n, width) {
    var s = String(n);
    while (s.length < (width || 2)) { s = '0' + s; }
    return s;
  };

  var sanitizeAuthor = function (name) {
    var s = String(name == null ? '' : name).trim()
      .replace(/[_\s\/\\:*?"<>|]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || 'export';
  };

  var exportFilename = function (author, ext, when) {
    var d = when || new Date();
    var ts = pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds())
      + '_' + pad(d.getMilliseconds() * 1000, 6);
    return sanitizeAuthor(author) + '_' + ts + '.' + ext;
  };

  var api = {
    toCsv: toCsv, xmlEsc: xmlEsc, xlsRow: xlsRow, xlsWorksheet: xlsWorksheet,
    toXlsWorkbook: toXlsWorkbook, pad: pad, sanitizeAuthor: sanitizeAuthor,
    exportFilename: exportFilename
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DS_APP = root.DS_APP || {};
    Object.assign(root.DS_APP, api);
  }
})(typeof window !== 'undefined' ? window : this);
