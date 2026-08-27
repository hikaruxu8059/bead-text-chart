/* textchart.js — 把识别结果写成能照着穿的文字图纸 */
(function (global) {
  'use strict';

  function colOrder(cols, dir) {
    var a = [];
    for (var c = 0; c < cols; c++) a.push(c);
    if (dir === 'rtl') a.reverse();
    return a;
  }

  function rowOrder(rows, dir) {
    var a = [];
    if (dir === 'ttb') { for (var r = 0; r < rows; r++) a.push(r); }
    else { for (var r2 = rows - 1; r2 >= 0; r2--) a.push(r2); }
    return a;
  }

  function nameOf(palette, i) {
    var p = palette[i];
    return (p && p.name) || ('色' + (i + 1));
  }

  /**
   * model = { cols, rows, cells, palette }
   * opts  = { colDir, rowDir, perCol, swatch, bold }
   */
  function build(model, opts) {
    var cols = model.cols, rows = model.rows;
    var cells = model.cells, palette = model.palette;
    if (!cells || !cells.length || !palette.length) {
      return '上传图纸后，这里会生成每列的穿珠顺序与用量，照着就能穿。';
    }

    var b = opts.bold ? '**' : '';
    var order = colOrder(cols, opts.colDir);
    var rOrder = rowOrder(rows, opts.rowDir);
    var dirText = opts.rowDir === 'ttb' ? '从上往下' : '从下往上';
    var colText = opts.colDir === 'rtl' ? '第 1 列在最右' : '第 1 列在最左';

    var L = [];
    var totals = new Array(palette.length).fill(0);
    var perColCounts = [];

    // 先统计，后排版
    for (var k = 0; k < order.length; k++) {
      var c = order[k];
      var cnt = new Map();
      for (var r = 0; r < rows; r++) {
        var v = cells[r * cols + c];
        cnt.set(v, (cnt.get(v) || 0) + 1);
        totals[v]++;
      }
      perColCounts.push(cnt);
    }
    var grand = totals.reduce(function (a, x) { return a + x; }, 0);

    L.push('# 串珠文字图纸');
    L.push('');
    L.push('- 网格：**' + cols + ' 列 × ' + rows + ' 行**，共 ' + grand + ' 颗');
    L.push('- 颜色：**' + palette.length + ' 种**');
    L.push('- 列序：' + colText + '；每列穿珠顺序：' + dirText);
    L.push('');

    if (opts.swatch) {
      L.push('## 色卡');
      L.push('');
      L.push('| # | 颜色 | 色号 | 总用量 |');
      L.push('| --- | --- | --- | --- |');
      palette.forEach(function (p, i) {
        L.push('| ' + (i + 1) + ' | ' + nameOf(palette, i) + ' | `' + p.hex.toUpperCase() + '` | ' + totals[i] + ' 颗 |');
      });
      L.push('');
    }

    L.push('## 一、每列穿珠顺序（' + dirText + '）');
    L.push('');
    for (var k2 = 0; k2 < order.length; k2++) {
      var col = order[k2];
      var runs = [];
      for (var t = 0; t < rOrder.length; t++) {
        var v2 = cells[rOrder[t] * cols + col];
        var last = runs[runs.length - 1];
        if (last && last.v === v2) last.n++;
        else runs.push({ v: v2, n: 1 });
      }
      L.push(b + '第' + (k2 + 1) + '列' + b + '：' + runs.map(function (x) {
        return x.n + '个' + nameOf(palette, x.v);
      }).join('，'));
      L.push('');
    }

    if (opts.perCol) {
      L.push('## 二、每列各色用量');
      L.push('');
      for (var k3 = 0; k3 < perColCounts.length; k3++) {
        var parts = Array.from(perColCounts[k3].entries())
          .sort(function (a, x) { return x[1] - a[1] || a[0] - x[0]; })
          .map(function (e) { return nameOf(palette, e[0]) + ' ' + e[1] + '个'; });
        L.push(b + '第' + (k3 + 1) + '列' + b + '：' + parts.join('，'));
        L.push('');
      }
    }

    L.push('## ' + (opts.perCol ? '三' : '二') + '、全图各色总计');
    L.push('');
    totals.map(function (n, i) { return { n: n, i: i }; })
      .sort(function (a, x) { return x.n - a.n; })
      .forEach(function (t) {
        L.push('- ' + nameOf(palette, t.i) + '：**' + t.n + '** 个');
      });
    L.push('');
    L.push('合计 **' + grand + '** 颗　|　' + cols + ' 列 × ' + rows + ' 行　|　' + palette.length + ' 种颜色');

    return L.join('\n');
  }

  /** 网格矩阵导出（每格一个颜色名），方便贴进 Excel 核对 */
  function toCSV(model) {
    var cols = model.cols, rows = model.rows, cells = model.cells, palette = model.palette;
    var lines = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        var nm = nameOf(palette, cells[r * cols + c]);
        row.push(/[",\n]/.test(nm) ? '"' + nm.replace(/"/g, '""') + '"' : nm);
      }
      lines.push(row.join(','));
    }
    return '﻿' + lines.join('\r\n');
  }

  global.TextChart = { build: build, toCSV: toCSV };
})(window);
