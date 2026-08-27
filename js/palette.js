/* palette.js — 把逐格采样到的颜色聚成有限个「珠子颜色」
   距离在 CIE Lab 空间计算，滑杆量纲就是 ΔE。 */
(function (global, C) {
  'use strict';

  var MAX_COLORS = 64;

  /* 把原始格子颜色粗量化成候选中心，按出现次数排序 */
  function candidates(raw) {
    var map = new Map();
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i];
      var k = ((Math.round(p[0]) >> 3) << 10) | ((Math.round(p[1]) >> 3) << 5) | (Math.round(p[2]) >> 3);
      var e = map.get(k);
      if (!e) { e = [0, 0, 0, 0]; map.set(k, e); }
      e[0] += p[0]; e[1] += p[1]; e[2] += p[2]; e[3]++;
    }
    var out = [];
    map.forEach(function (e) {
      var rgb = [e[0] / e[3], e[1] / e[3], e[2] / e[3]];
      out.push({ rgb: rgb, lab: C.rgbToLab(rgb), n: e[3] });
    });
    out.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

  /* 贪心：按出现频次挑中心，彼此 ΔE 不小于 thresh */
  function greedy(cands, thresh, cap) {
    var centers = [];
    for (var i = 0; i < cands.length; i++) {
      var ok = true;
      for (var j = 0; j < centers.length; j++) {
        if (C.deltaE(cands[i].lab, centers[j].lab) < thresh) { ok = false; break; }
      }
      if (ok) centers.push({ rgb: cands[i].rgb.slice(), lab: cands[i].lab.slice() });
      if (centers.length >= cap) break;
    }
    return centers;
  }

  /* 固定色数：二分找到刚好还能产出 k 个中心的阈值 */
  function greedyK(cands, k) {
    var lo = 0.5, hi = 120, sel = greedy(cands, lo, k);
    for (var it = 0; it < 26; it++) {
      var mid = (lo + hi) / 2;
      var s = greedy(cands, mid, k + 1);
      if (s.length >= k) { lo = mid; sel = s; } else { hi = mid; }
    }
    if (sel.length < k) sel = greedy(cands, lo, k);
    return sel.slice(0, k);
  }

  function assign(raw, labs, centers) {
    var cells = new Int16Array(raw.length);
    var sums = centers.map(function () { return [0, 0, 0, 0]; });
    for (var i = 0; i < raw.length; i++) {
      var bi = 0, bd = Infinity;
      for (var j = 0; j < centers.length; j++) {
        var d = C.deltaE(labs[i], centers[j].lab);
        if (d < bd) { bd = d; bi = j; }
      }
      cells[i] = bi;
      var s = sums[bi];
      s[0] += raw[i][0]; s[1] += raw[i][1]; s[2] += raw[i][2]; s[3]++;
    }
    return { cells: cells, sums: sums };
  }

  /**
   * raw: [[r,g,b], ...]（按 row-major）
   * opts: { mode: 'thresh' | 'k', thresh, k }
   */
  function build(raw, opts) {
    if (!raw || !raw.length) return { palette: [], cells: new Int16Array(0) };

    var cands = candidates(raw);
    var centers = opts.mode === 'k'
      ? greedyK(cands, Math.max(2, Math.min(MAX_COLORS, opts.k | 0)))
      : greedy(cands, opts.thresh, MAX_COLORS);
    if (!centers.length) centers = [{ rgb: [0, 0, 0], lab: C.rgbToLab([0, 0, 0]) }];

    var labs = raw.map(C.rgbToLab);

    // 两轮 Lloyd 迭代，让中心落到实际簇心上
    var res = assign(raw, labs, centers);
    for (var round = 0; round < 2; round++) {
      for (var j = 0; j < centers.length; j++) {
        var s = res.sums[j];
        if (s[3]) {
          centers[j].rgb = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
          centers[j].lab = C.rgbToLab(centers[j].rgb);
        }
      }
      res = assign(raw, labs, centers);
    }

    // 丢掉空簇，按用量从多到少重排
    var order = centers
      .map(function (c, j) { return { c: c, j: j, n: res.sums[j][3] }; })
      .filter(function (o) { return o.n > 0; })
      .sort(function (a, b) { return b.n - a.n; });

    var remap = new Int16Array(centers.length);
    order.forEach(function (o, k) { remap[o.j] = k; });

    var cells = new Int16Array(res.cells.length);
    for (var i = 0; i < cells.length; i++) cells[i] = remap[res.cells[i]];

    var palette = order.map(function (o) {
      var rgb = o.c.rgb.map(function (v) { return Math.round(v); });
      return { rgb: rgb, lab: o.c.lab.slice(), hex: C.hex(rgb), count: o.n, name: '' };
    });

    if (opts.minCount > 1) {
      prune(palette, cells, opts.minCount);
      palette = resort(palette, cells);
    }
    return { palette: palette, cells: cells };
  }

  /** 合并会改变用量，重新按用量从多到少排序并同步 cells */
  function resort(palette, cells) {
    var idx = palette.map(function (p, i) { return i; });
    idx.sort(function (a, b) { return palette[b].count - palette[a].count; });
    var remap = new Int16Array(palette.length);
    idx.forEach(function (old, now) { remap[old] = now; });
    for (var t = 0; t < cells.length; t++) cells[t] = remap[cells[t]];
    return idx.map(function (old) { return palette[old]; });
  }

  /**
   * 把只出现几格的杂色并进最接近的颜色。
   * 这类簇几乎都来自图案边缘的过渡格，留着只会让清单难读。
   * palette / cells 就地修改。
   */
  function prune(palette, cells, minCount) {
    while (palette.length > 2) {
      var worst = -1;
      for (var i = 0; i < palette.length; i++) {
        if (palette[i].count < minCount && (worst < 0 || palette[i].count < palette[worst].count)) worst = i;
      }
      if (worst < 0) return;

      var bi = -1, bd = Infinity;
      for (var j = 0; j < palette.length; j++) {
        if (j === worst) continue;
        var d = C.deltaE(palette[worst].lab, palette[j].lab);
        if (d < bd) { bd = d; bi = j; }
      }
      if (bi < 0) return;

      var a = palette[bi], b = palette[worst];
      var tot = a.count + b.count;
      a.rgb = [
        Math.round((a.rgb[0] * a.count + b.rgb[0] * b.count) / tot),
        Math.round((a.rgb[1] * a.count + b.rgb[1] * b.count) / tot),
        Math.round((a.rgb[2] * a.count + b.rgb[2] * b.count) / tot)
      ];
      a.lab = C.rgbToLab(a.rgb);
      a.hex = C.hex(a.rgb);
      a.count = tot;
      palette.splice(worst, 1);

      // 删掉一项后，worst 之后的下标整体前移
      for (var t = 0; t < cells.length; t++) {
        var v = cells[t];
        if (v === worst) cells[t] = bi > worst ? bi - 1 : bi;
        else if (v > worst) cells[t] = v - 1;
      }
    }
  }

  /* --- 用户自定义：手动合并 + 自定义命名 --- */

  function nearest(lab, list, tol) {
    var bi = -1, bd = tol;
    for (var i = 0; i < list.length; i++) {
      var d = C.deltaE(lab, list[i].lab);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  /**
   * custom = { merges: [ { labs: [lab, ...] }, ... ], names: [ { lab, name }, ... ] }
   * 合并组按颜色就近匹配，所以调阈值后手动合并依然有效。
   */
  function applyCustom(palette, cells, custom) {
    if (!custom) return { palette: palette, cells: cells };

    var n = palette.length;
    var parent = new Array(n);
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }

    (custom.merges || []).forEach(function (g) {
      var members = [];
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < g.labs.length; j++) {
          if (C.deltaE(palette[i].lab, g.labs[j]) < 10) { members.push(i); break; }
        }
      }
      for (var m = 1; m < members.length; m++) union(members[0], members[m]);
    });

    // 归组
    var groups = new Map();
    for (var i2 = 0; i2 < n; i2++) {
      var root = find(i2);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(i2);
    }
    if (groups.size === n && !(custom.names || []).length) return { palette: palette, cells: cells };

    var merged = [];
    var remap = new Int16Array(n);
    groups.forEach(function (idxs) {
      var sum = [0, 0, 0], count = 0;
      idxs.forEach(function (i) {
        sum[0] += palette[i].rgb[0] * palette[i].count;
        sum[1] += palette[i].rgb[1] * palette[i].count;
        sum[2] += palette[i].rgb[2] * palette[i].count;
        count += palette[i].count;
      });
      var rgb = [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)];
      merged.push({ rgb: rgb, lab: C.rgbToLab(rgb), hex: C.hex(rgb), count: count, name: '', _src: idxs });
    });

    merged.sort(function (a, b) { return b.count - a.count; });
    merged.forEach(function (m, k) { m._src.forEach(function (i) { remap[i] = k; }); delete m._src; });

    var out = new Int16Array(cells.length);
    for (var t = 0; t < cells.length; t++) out[t] = remap[cells[t]];

    // 套用自定义名字
    var names = custom.names || [];
    merged.forEach(function (m) {
      var k = nearest(m.lab, names, 12);
      if (k >= 0) m.name = names[k].name;
    });

    return { palette: merged, cells: out };
  }

  global.Palette = { build: build, applyCustom: applyCustom, MAX_COLORS: MAX_COLORS };
})(window, window.Color);
