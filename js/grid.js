/* grid.js — 网格周期自动检测 + 逐格取色
   全部基于 Canvas 像素，纯本地运算。 */
(function (global) {
  'use strict';

  var MIN_PERIOD = 5;
  var MAX_PERIOD = 120;

  /* ------------------------------------------------------------------
     1. 边缘能量曲线

     对每一条相邻像素边界，统计整列（或整行）的平均 RGB 色差。
     网格线会贯穿大部分画面，在固定间距上形成稳定脉冲；图案轮廓虽然更深，
     通常只覆盖局部，不会像格线一样在整条边界上持续出现。
     ------------------------------------------------------------------ */
  function meanProfiles(data, W, H, smooth) {
    var ex = new Float64Array(W);
    var ey = new Float64Array(H);
    var x, y, i, j;

    for (y = 0; y < H; y++) {
      var row = y * W * 4;
      for (x = 1; x < W; x++) {
        i = row + x * 4;
        j = i - 4;
        ex[x] += Math.abs(data[i] - data[j]) +
                 Math.abs(data[i + 1] - data[j + 1]) +
                 Math.abs(data[i + 2] - data[j + 2]);
      }
    }
    for (x = 0; x < W; x++) {
      for (y = 1; y < H; y++) {
        i = (y * W + x) * 4;
        j = i - W * 4;
        ey[y] += Math.abs(data[i] - data[j]) +
                 Math.abs(data[i + 1] - data[j + 1]) +
                 Math.abs(data[i + 2] - data[j + 2]);
      }
    }
    for (x = 1; x < W; x++) ex[x] /= H;
    for (y = 1; y < H; y++) ey[y] /= W;

    if (smooth === false) return { ex: ex, ey: ey };

    // 三点轻度平滑，降低 JPEG 单像素噪声，同时保留 1–2px 格线峰。
    for (x = 1; x < W - 1; x++) {
      ex[x] = ex[x] * 0.6 + (ex[x - 1] + ex[x + 1]) * 0.2;
    }
    for (y = 1; y < H - 1; y++) {
      ey[y] = ey[y] * 0.6 + (ey[y - 1] + ey[y + 1]) * 0.2;
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

    // 先对去掉基线后的边缘能量做自相关。真实格距会让相隔 p 的格线峰
    // 反复重合；人物轮廓等非周期边缘则不会。整数粗扫不会因为候选步长
    // 略偏而在长图上累计相位漂移。
    var mean = 0;
    for (var m = 1; m < n; m++) mean += E[m];
    mean /= Math.max(1, n - 1);
    var V = new Float64Array(n);
    for (m = 1; m < n; m++) V[m] = Math.max(0, E[m] - mean);

    var scores = new Float64Array(maxP + 1);
    var best = 0;
    for (var p = MIN_PERIOD; p <= maxP; p++) {
      var dot = 0, aa = 0, bb = 0;
      for (var i = 1; i + p < n; i++) {
        var a = V[i], b = V[i + p];
        dot += a * b; aa += a * a; bb += b * b;
      }
      scores[p] = aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : 0;
      if (scores[p] > best) best = scores[p];
    }
    if (best < 0.18) return null;

    // 倍数周期也会相关，选择第一个足够强的局部峰作为基础格距。
    var pick = null;
    for (p = MIN_PERIOD; p <= maxP; p++) {
      if (scores[p] >= best * 0.72 &&
          scores[p] >= (scores[p - 1] || 0) &&
          scores[p] >= (scores[p + 1] || 0)) {
        pick = p;
        break;
      }
    }
    if (pick == null) pick = MIN_PERIOD;

    // 再以折叠得分做亚像素细化，适配图片缩放后的非整数格距。
    var lo = Math.max(MIN_PERIOD, pick - 1.1);
    var hi = Math.min(maxP, pick + 1.1);
    var step = Math.max(0.002, pick / (3 * n));
    var out = null;
    for (var q = lo; q <= hi; q += step) {
      var f = fold(E, q, n);
      if (!out || f.score > out.score) {
        out = { period: q, phase: f.phase, score: f.score, correlation: scores[pick] };
      }
    }
    return out;
  }

  /**
   * 在指定格子尺寸附近重新寻找周期。
   * 横纵方向独立检测时，内容边缘有时会让其中一边误中 1/2 或 2 倍周期；
   * 串珠图的格子通常接近正方形，因此可以用另一方向的结果做一次温和校正。
   */
  function detectPeriodNear(E, target) {
    var n = E.length;
    var maxP = Math.min(MAX_PERIOD, Math.floor(n / 6));
    if (!(target >= MIN_PERIOD && target <= maxP)) return null;

    var lo = Math.max(MIN_PERIOD, target * 0.88);
    var hi = Math.min(maxP, target * 1.12);
    var step = Math.max(0.002, target / (2 * n));
    var out = null;
    for (var p = lo; p <= hi; p += step) {
      var f = fold(E, p, n);
      if (!out || f.score > out.score) out = { period: p, phase: f.phase, score: f.score };
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
    // 超过半格才计入边缘残格，避免轻微留白或裁切导致多算一行/列。
    var count = whole + (span - whole >= 0.50 ? 1 : 0);
    count = Math.max(1, Math.min(600, count));

    return { origin: origin, size: p, count: count };
  }

  // Small resized pixel-art cells need unsmoothed profiles: smoothing erases their
  // fundamental frequency and the line detector otherwise locks onto a multiple.
  function spectralPeak(E, period) {
    var mean = 0, total = 0, real = 0, imaginary = 0;
    for (var i = 1; i < E.length; i++) total += E[i];
    mean = total / Math.max(1, E.length - 1);
    if (total < 1e-8) return { score: 0, phase: 0, period: period };
    for (i = 1; i < E.length; i++) {
      var angle = 2 * Math.PI * i / period, value = E[i] - mean;
      real += value * Math.cos(angle); imaginary += value * Math.sin(angle);
    }
    var phase = Math.atan2(imaginary, real) * period / (2 * Math.PI);
    if (phase < 0) phase += period;
    return { period: period, phase: phase, score: Math.hypot(real, imaginary) / total };
  }

  function detectSmallCells(prof) {
    var length = Math.max(prof.ex.length, prof.ey.length);
    if (Math.min(prof.ex.length, prof.ey.length) < 24) return null;
    var step = 1 / (length * 8), best = null;
    for (var frequency = 1 / 5; frequency <= 1 / 2; frequency += step) {
      var x = spectralPeak(prof.ex, 1 / frequency), y = spectralPeak(prof.ey, 1 / frequency);
      var score = Math.sqrt(x.score * y.score);
      if (!best || score > best.score) best = { x: x, y: y, score: score };
    }
    if (best.score < 0.18 || Math.min(best.x.score, best.y.score) < 0.12) return null;
    // Printed grid lines also have strong harmonics. Do not mistake a half-cell
    // harmonic for a fundamental if its larger period has comparable support.
    for (var multiple = 2; multiple <= 6; multiple++) {
      var period = best.x.period * multiple;
      var sx = spectralPeak(prof.ex, period), sy = spectralPeak(prof.ey, period);
      if (Math.sqrt(sx.score * sy.score) >= best.score * 0.85) return null;
    }
    function refine(E, target) {
      var result = spectralPeak(E, target);
      for (var f = 1 / (target * 1.02); f <= 1 / (target * 0.98); f += step / 2) {
        var candidate = spectralPeak(E, 1 / f);
        if (candidate.score > result.score) result = candidate;
      }
      return result;
    }
    return { x: refine(prof.ex, best.x.period), y: refine(prof.ey, best.y.period) };
  }

  function detect(data, W, H) {
    var small = detectSmallCells(meanProfiles(data, W, H, false));
    if (small) {
      var smallX = geometry(W, small.x), smallY = geometry(H, small.y);
      return { cols: smallX.count, rows: smallY.count,
        originX: smallX.origin, originY: smallY.origin,
        cellW: smallX.size, cellH: smallY.size,
        confidence: Math.min(small.x.score, small.y.score) };
    }
    var prof = meanProfiles(data, W, H);
    var px = detectPeriod(prof.ex);
    var py = detectPeriod(prof.ey);
    if (!px || !py) return null;

    // 优先选择横纵格子尺寸更接近的组合，但只有候选周期本身仍有足够
    // 周期信号时才替换，避免为了“方格”强行覆盖真实检测结果。
    var nx = detectPeriodNear(prof.ex, py.period);
    var ny = detectPeriodNear(prof.ey, px.period);
    var pairs = [[px, py]];
    if (nx && nx.score >= 0.35) pairs.push([nx, py]);
    if (ny && ny.score >= 0.35) pairs.push([px, ny]);

    var bestPair = pairs[0];
    var bestQuality = -Infinity;
    for (var i = 0; i < pairs.length; i++) {
      var ax = pairs[i][0], ay = pairs[i][1];
      var squarePenalty = Math.abs(Math.log(ax.period / ay.period));
      var signal = Math.log(1 + Math.min(ax.score, ay.score));
      var quality = signal - 1.8 * squarePenalty;
      if (quality > bestQuality) {
        bestQuality = quality;
        bestPair = pairs[i];
      }
    }
    px = bestPair[0];
    py = bestPair[1];

    // 串珠/十字绣图纸使用正方形格子。若一边被大色块轮廓误判成基础
    // 周期的整数倍，取较小周期；两边接近时取加权平均。随后分别重算
    // 横纵相位，使最终列数/行数自然遵循原图的宽高比。
    var ratio = Math.max(px.period, py.period) / Math.min(px.period, py.period);
    var commonPeriod;
    if (ratio > 1.18) {
      commonPeriod = Math.min(px.period, py.period);
    } else {
      commonPeriod = (px.period * px.score + py.period * py.score) /
                     Math.max(1e-9, px.score + py.score);
    }
    var fx = fold(prof.ex, commonPeriod, prof.ex.length);
    var fy = fold(prof.ey, commonPeriod, prof.ey.length);
    px = { period: commonPeriod, phase: fx.phase, score: fx.score };
    py = { period: commonPeriod, phase: fy.phase, score: fy.score };

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
     减少格线、抗锯齿边缘和 JPEG 杂色的影响；也支持直接取中心像素。
     ------------------------------------------------------------------ */
  function sample(data, W, H, geom, inset, method) {
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

        if (method === 'center') {
          var cx = Math.max(0, Math.min(W - 1, Math.floor((rx0 + rx1) / 2)));
          var cy = Math.max(0, Math.min(H - 1, Math.floor((ry0 + ry1) / 2)));
          var center = (cy * W + cx) * 4;
          out[r * cols + c] = [data[center], data[center + 1], data[center + 2]];
          continue;
        }

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
