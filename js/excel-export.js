/* 本地生成 OOXML 工作簿；ZIP 使用 store，离线可用且无需第三方脚本。 */
(function (global) {
  'use strict';
  var ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  function xml(value) {
    return String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function column(n) {
    var name = '';
    for (n++; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
  }
  function textCell(ref, value, style) {
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
  }
  function numberCell(ref, value) { return '<c r="' + ref + '" s="1"><v>' + value + '</v></c>'; }
  function sheet(rows, columns, freeze) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + ns + '"><sheetViews><sheetView workbookViewId="0" showGridLines="0">' + (freeze ? '<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>' : '') + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="27"/><cols>' + columns + '</cols><sheetData>' + rows.join('') + '</sheetData></worksheet>';
  }
  function zip(files) {
    var encoder = new TextEncoder(), chunks = [], directory = [], offset = 0;
    function header(size) { var bytes = new Uint8Array(size); return { bytes: bytes, view: new DataView(bytes.buffer) }; }
    function crc(bytes) {
      var value = 0xffffffff;
      bytes.forEach(function (b) { value ^= b; for (var k = 0; k < 8; k++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); });
      return (value ^ 0xffffffff) >>> 0;
    }
    Object.keys(files).forEach(function (path) {
      var name = encoder.encode(path), data = encoder.encode(files[path]), checksum = crc(data);
      var local = header(30), central = header(46), v = local.view;
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(12, 33, true);
      v.setUint32(14, checksum, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
      v = central.view; v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(14, 33, true);
      v.setUint32(16, checksum, true); v.setUint32(20, data.length, true); v.setUint32(24, data.length, true); v.setUint16(28, name.length, true); v.setUint32(42, offset, true);
      chunks.push(local.bytes, name, data); directory.push(central.bytes, name); offset += 30 + name.length + data.length;
    });
    var size = directory.reduce(function (sum, part) { return sum + part.length; }, 0), end = header(22);
    end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length / 2, true); end.view.setUint16(10, directory.length / 2, true);
    end.view.setUint32(12, size, true); end.view.setUint32(16, offset, true);
    return new Blob(chunks.concat(directory, [end.bytes]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function build(model) {
    var cols = model.cols, rows = model.rows, cells = model.cells, palette = model.palette;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 600 || rows > 600 || !cells || cells.length !== cols * rows) throw new Error('图纸尺寸无效');
    var counts = new Array(palette.length).fill(0);
    Array.from(cells).forEach(function (index) { if (!Number.isInteger(index) || !palette[index]) throw new Error('图纸颜色无效'); counts[index]++; });
    var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'];
    palette.forEach(function (p, i) {
      if (!/^#[0-9a-f]{6}$/i.test(p.hex)) throw new Error('色卡颜色无效');
      var hex = p.hex.slice(1).toUpperCase(), rgb = [0, 2, 4].map(function (offset) { return parseInt(hex.slice(offset, offset + 2), 16); });
      var light = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 145;
      fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FF' + hex + '"/><bgColor indexed="64"/></patternFill></fill>');
      xfs.push('<xf numFmtId="0" fontId="' + (light ? 0 : 1) + '" fillId="' + (i + 2) + '" borderId="1" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>');
    });
    var grid = [], first = textCell('A1', '行 / 列', 1);
    for (var c = 0; c < cols; c++) first += numberCell(column(c + 1) + '1', c + 1);
    grid.push('<row r="1">' + first + '</row>');
    for (var r = 0; r < rows; r++) {
      var line = numberCell('A' + (r + 2), r + 1);
      for (c = 0; c < cols; c++) {
        var index = cells[r * cols + c], p = palette[index];
        line += textCell(column(c + 1) + (r + 2), p.code || p.name || p.hex, index + 2);
      }
      grid.push('<row r="' + (r + 2) + '" ht="27" customHeight="1">' + line + '</row>');
    }
    var legend = ['<row r="1">' + ['颜色', '色号 / 名称', 'HEX', '数量（颗）'].map(function (label, i) { return textCell(column(i) + '1', label, 1); }).join('') + '</row>'];
    palette.map(function (_, i) { return i; }).filter(function (i) { return counts[i] > 0; }).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (i) {
      var n = legend.length + 1, p = palette[i];
      legend.push('<row r="' + n + '">' + textCell('A' + n, '', i + 2) + textCell('B' + n, p.code || p.name || p.hex, 1) + textCell('C' + n, p.hex.toUpperCase(), 1) + numberCell('D' + n, counts[i]) + '</row>');
    });
    var total = legend.length + 1;
    legend.push('<row r="' + total + '">' + textCell('B' + total, '合计', 1) + numberCell('D' + total, cells.length) + '</row>');
    var files = {};
    files['[Content_Types].xml'] = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    files['_rels/.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = '<workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="彩色图纸" sheetId="1" r:id="rId1"/><sheet name="色卡用量" sheetId="2" r:id="rId2"/></sheets></workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + [1, 2].map(function (i) { return '<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>'; }).join('') + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    files['xl/styles.xml'] = '<styleSheet xmlns="' + ns + '"><fonts count="2"><font><sz val="9"/><color rgb="FF222222"/><name val="Arial"/></font><font><sz val="9"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="2"><border/><border><left style="hair"><color rgb="FFAAAAAA"/></left><right style="hair"><color rgb="FFAAAAAA"/></right><top style="hair"><color rgb="FFAAAAAA"/></top><bottom style="hair"><color rgb="FFAAAAAA"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files['xl/worksheets/sheet1.xml'] = sheet(grid, '<col min="1" max="1" width="8" customWidth="1"/><col min="2" max="' + (cols + 1) + '" width="4.5" customWidth="1"/>', true);
    files['xl/worksheets/sheet2.xml'] = sheet(legend, '<col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="4" width="16" customWidth="1"/>', false);
    return zip(files);
  }
  global.ExcelExport = { build: build };
})(window);
