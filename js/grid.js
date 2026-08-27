/* grid.js — 网格周期自动检测 + 逐格取色
   全部基于 Canvas 像素，纯本地运算。 */
(function (global) {
  'use strict';

  var MIN_PERIOD = 5;
  var MAX_PERIOD = 120;

  /* ------------------------------------------------------------------
     1. 边缘能量曲线

     先按列（行）求 RGB 均值，再做一阶差分。
     图纸的每一格列在整列上颜色构成相同，所以「列均值」在一格之内是常数，
     只在格线处跳变 —— 差分后就是干净的周期脉冲。
     逐像素求差再累加的做法会把 JPEG 噪声一起累积，信噪比差很多。
     ------------------------------------------------------------------ */
  function meanProfiles(data, W, H) {
    var mx = new Float64Array(W * 3);
    var my = new Float64Array(H * 3);
    var x, y, i;

    for (y = 0; y < H; y++) {
      var row = y * W * 4;
      var ry = y * 3;
      for (x = 0; x < W; x++) {
        i = row + x * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var rx = x * 3;
        mx[rx] += r; mx[rx + 1] += g; mx[rx + 2] += b;
        my[ry] += r; my[ry + 1] += g; my[ry + 2] += b;
      }
    }

    var ex = new Float64Array(W);
    var ey = new Float64Array(H);
    for (x = 1; x < W; x++) {
      ex[x] = (Math.abs(mx[x * 3] - mx[(x - 1) * 3]) +
               Math.abs(mx[x * 3 + 1] - mx[(x - 1) * 3 + 1]) +
               Math.abs(mx[x * 3 + 2] - mx[(x - 1) * 3 + 2])) / H;
    }
    for (y = 1; y < H; y++) {
      ey[y] = (Math.abs(my[y * 3] - my[(y - 1) * 3]) +
               Math.abs(my[y * 3 + 1] - my[(y - 1) * 3 + 1]) +
               Math.abs(my[y * 3 + 2] - my[(y - 1) * 3 + 2])) / W;
    }
    return { ex: ex, ey: ey };
  }

  /* ------------------------------------------------------------------
     2. 周期检测

     把能量按候选周期折叠，看「峰比均值高多少」。
     注意：折叠对相位漂移极其敏感 —— 候选周期偏差 Δp 在 n 个采样点上会
     累积 Δp·n/p 的漂移，超过 1px 峰就糊了。所以先在短窗口上粗扫（容忍
     大步长），再在全信号上细扫。
     ------------------------------------------------------------------ */

  var _bins = new Float64Array(MAX_PERIOD + 4);
  var _cnt = new Float64Array(MAX_PERIOD + 4);

  function fold(E, p, n) {
    var nb = Math.max(6, Math.round(p));
    var bins = _bins, cnt = _cnt;
    var b;
    for (b = 0; b < nb; b++) { bins[b] = 0; cnt[b] = 0; }

    for (var i = 1; i < n; i++) {
      var ph = (i % p) / p * nb;
      var b0 = Math.floor(ph);
      var f = ph - b0;
      if (b0 >= nb) { b0 = nb - 1; f = 0; }
      var b1 = (b0 + 1) % nb;
      var e = E[i];
      bins[b0] += e * (1 - f); cnt[b0] += (1 - f);
      bins[b1] += e * f;       cnt[b1] += f;
    }

    var mean = 0, max = -Infinity;
    for (b = 0; b < nb; b++) {
      var v = cnt[b] > 0 ? bins[b] / cnt[b] : 0;
      bins[b] = v;
      mean += v;
      if (v > max) max = v;
    }
    mean /= nb;
    if (mean <= 1e-9) return { score: 0, phase: 0 };

    // 相位取「超出均值部分」的圆形质心：格线常跨 2 个像素，
    // 质心比 argmax 更接近线的中心，也不容易被零散内容边缘带偏。
    var sx = 0, sy = 0;
    for (b = 0; b < nb; b++) {
      var w = bins[b] - mean;
      if (w <= 0) continue;
      var a = 2 * Math.PI * b / nb;
      sx += w * Math.cos(a);
      sy += w * Math.sin(a);
    }
    var ang = Math.atan2(sy, sx);
    if (ang < 0) ang += 2 * Math.PI;

    return { score: (max - mean) / mean, phase: ang / (2 * Math.PI) * p };
  }

  function detectPeriod(E) {
    var n = E.length;
    var maxP = Math.min(MAX_PERIOD, Math.floor(n / 6));
    if (maxP < MIN_PERIOD) return null;

    // --- 粗扫：等比步长，窗口只取 ~30 个周期，容忍较大步长 ---
    var coarse = [];
    var best = 0;
    for (var p = MIN_PERIOD; p <= maxP; p *= 1 + 1 / 60) {
      var win = Math.min(n, Math.round(30 * p));
      var r = fold(E, p, win);
      coarse.push({ p: p, score: r.score });
      if (r.score > best) best = r.score;
    }
    if (best <= 0.35) return null;          // 没有可信的周期结构

    // 真实周期的整数倍同样得高分，所以在高分区间里取最小的 p
    var pick = null;
    for (var i = 0; i < coarse.length; i++) {
      if (coarse[i].score >= best * 0.75) { pick = coarse[i].p; break; }
    }
    if (pick == null) return null;

    // --- 细扫：全信号，步长细到漂移小于 1/3 像素 ---
    var lo = Math.max(MIN_PERIOD, pick * (1 - 1 / 30));
    var hi = Math.min(maxP, pick * (1 + 1 / 30));
    var step = Math.max(1e-4, pick / (3 * n));
    var out = null;
    for (var q = lo; q <= hi; q += step) {
      var f = fold(E, q, n);
      if (!out || f.score > out.score) out = { period: q, phase: f.phase, score: f.score };
    }
    return out;
  }

  /**
   * 由周期与相位推出格子起点和格数。
   * 相位是格线的位置，格线即格子边界；起点取第一条落在图内(或刚好在左侧)的边界。
   */
  function geometry(len, r) {
    var p = r.period;
    var origin = r.phase % p;
    if (origin > 0) origin -= p;            // 落到 (-p, 0]
    if (origin < -0.65 * p) origin += p;    // 首格残缺过多就整格丢掉

    var span = (len - origin) / p;
    var whole = Math.floor(span);
    var count = whole + (span - whole >= 0.35 ? 1 : 0);
    count = Math.max(1, Math.min(600, count));

    return { origin: origin, size: p, count: count };
  }

  function detect(data, W, H) {
    var prof = meanProfiles(data, W, H);
    var px = detectPeriod(prof.ex);
    var py = detectPeriod(prof.ey);
    if (!px || !py) return null;

    var gx = geometry(W, px);
    var gy = geometry(H, py);
    return {
      cols: gx.count, rows: gy.count,
      originX: gx.origin, originY: gy.origin,
      cellW: gx.size, cellH: gy.size,
      confidence: Math.min(px.score, py.score)
    };
  }

  /* ------------------------------------------------------------------
     3. 逐格取色

     只看格子中央区域，把颜色粗量化后取「出现最多的一桶」的均值：
     格线、抗锯齿边缘和 JPEG 杂色都不会把结果拉偏。
     ------------------------------------------------------------------ */
  function sample(data, W, H, geom, inset) {
    inset = inset == null ? 0.30 : inset;
    var cols = geom.cols, rows = geom.rows;
    var ox = geom.originX || 0, oy = geom.originY || 0;
    var cw = geom.cellW, ch = geom.cellH;
    var out = new Array(rows * cols);
    var buckets = new Map();

    for (var r = 0; r < rows; r++) {
      var ry0 = oy + r * ch, ry1 = ry0 + ch;
      for (var c = 0; c < cols; c++) {
        var rx0 = ox + c * cw, rx1 = rx0 + cw;

        var x0 = Math.floor(rx0 + cw * inset);
        var x1 = Math.ceil(rx1 - cw * inset);
        var y0 = Math.floor(ry0 + ch * inset);
        var y1 = Math.ceil(ry1 - ch * inset);

        x0 = Math.max(0, x0); y0 = Math.max(0, y0);
        x1 = Math.min(W, x1); y1 = Math.min(H, y1);

        if (x1 <= x0) { x0 = Math.max(0, Math.min(W - 1, Math.round((rx0 + rx1) / 2))); x1 = x0 + 1; }
        if (y1 <= y0) { y0 = Math.max(0, Math.min(H - 1, Math.round((ry0 + ry1) / 2))); y1 = y0 + 1; }

        buckets.clear();
        var bestB = null;

        for (var y = y0; y < y1; y++) {
          var row = y * W * 4;
          for (var x = x0; x < x1; x++) {
            var i = row + x * 4;
            var key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
            var b = buckets.get(key);
            if (!b) { b = [0, 0, 0, 0]; buckets.set(key, b); }
            b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3]++;
            if (!bestB || b[3] > bestB[3]) bestB = b;
          }
        }

        out[r * cols + c] = bestB
          ? [bestB[0] / bestB[3], bestB[1] / bestB[3], bestB[2] / bestB[3]]
          : [0, 0, 0];
      }
    }
    return out;
  }

  global.Grid = {
    detect: detect,
    sample: sample,
    geometry: geometry,
    meanProfiles: meanProfiles,
    detectPeriod: detectPeriod
  };
})(window);
