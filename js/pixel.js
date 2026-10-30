/* pixel.js — 主体色 / 面积平均取样 → 颜色聚类 → 色卡匹配。 */
(function (global) {
  'use strict';

  function colorDistance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  // 判断是否为局部细长笔画：结构矩、双侧背景、沿线延续共同支持。
  // 不根据颜色深浅偏置，也不对整图做加深或锐化。
  function lineCandidate(buckets, winner, area, bounds, data, width, height, limitWidth) {
    var cellW = bounds.right - bounds.left, cellH = bounds.bottom - bounds.top;
    if (Math.min(cellW, cellH) < 3) return null;
    function near(x, y, rgb) {
      var best = Infinity;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var px = Math.floor(x) + dx, py = Math.floor(y) + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        var i = (py * width + px) * 4, a = data[i + 3] / 255;
        best = Math.min(best, colorDistance(rgb, [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)]));
      }
      return best;
    }
    // 用邻域外围确认背景，避免较宽笔画成为格内主色后反向增强浅色缝隙。
    var surround = [], cx = (bounds.left + bounds.right) / 2, cy = (bounds.top + bounds.bottom) / 2;
    [-0.75, -0.25, 0.25, 0.75].forEach(function (t) {
      [[t, -1.25], [t, 1.25], [-1.25, t], [1.25, t]].forEach(function (p) {
        var x = Math.floor(cx + p[0] * cellW), y = Math.floor(cy + p[1] * cellH);
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        var i = (y * width + x) * 4, a = data[i + 3] / 255;
        surround.push([data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)]);
      });
    });
    var bestSupport = 0, background = winner.rgb;
    surround.forEach(function (rgb) {
      var count = surround.filter(function (other) { return colorDistance(rgb, other) <= 32; }).length;
      if (count > bestSupport) { bestSupport = count; background = rgb; }
    });
    if (surround.length >= 8 && bestSupport >= surround.length * 0.65) winner = { rgb: background };
    var bins = Array.from(buckets.values());
    var seeds = bins.filter(function (b) { return b !== winner && colorDistance(b.rgb, winner.rgb) >= 50; });
    seeds.sort(function (a, b) { return b.weight - a.weight; });
    var best = null;
    seeds.slice(0, 8).forEach(function (seed) {
      var w = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      bins.forEach(function (b) {
        if (colorDistance(b.rgb, seed.rgb) > 32) return;
        w += b.weight; sx += b.sx; sy += b.sy; sxx += b.sxx; syy += b.syy; sxy += b.sxy;
        minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
        minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
      });
      var fraction = w / area;
      if (w < 1 || fraction < 0.02 || fraction > 0.65) return;
      var mx = sx / w, my = sy / w;
      var vx = Math.max(0, sxx / w - mx * mx), vy = Math.max(0, syy / w - my * my), cov = sxy / w - mx * my;
      var root = Math.hypot(vx - vy, 2 * cov), major = (vx + vy + root) / 2, minor = Math.max(0, (vx + vy - root) / 2);
      if (major < 1.2 * minor + 0.15) return;
      var angle = Math.atan2(2 * cov, vx - vy) / 2;
      var tx = Math.cos(angle), ty = Math.sin(angle), nx = -ty, ny = tx;
      var span = Math.abs(tx) * (maxX - minX + 1) + Math.abs(ty) * (maxY - minY + 1);
      var fullSpan = Math.abs(tx) * cellW + Math.abs(ty) * cellH;
      if (span < fullSpan * 0.2) return;
      // 已接近一格宽的笔画交给正常取样，避免粗轮廓向相邻格扩张。
      if (limitWidth && w / span > Math.min(cellW, cellH) * 0.45) return;
      var strong = w >= 2 && fraction >= 0.04 && major >= 2.5 * minor + 0.25 && span >= fullSpan * 0.6;
      var radius = Math.max(1.75, Math.sqrt(minor) * 2.2 + 1.25);
      var backgroundRadius = Math.max(radius, Math.min(cellW, cellH) * 0.4);
      function hasBackground(distance) {
        return near(mx + nx * distance, my + ny * distance, winner.rgb) <= 45 && near(mx - nx * distance, my - ny * distance, winner.rgb) <= 45;
      }
      if (!hasBackground(radius) && !hasBackground(backgroundRadius)) return;
      var along = Math.max(3, fullSpan * 0.7);
      // 用局部弧线的延续验证笔画，避免弯曲轮廓被直线外推误判为孤点。
      var continuation = Infinity;
      [-1, 1].forEach(function (sign) {
        [-Math.PI / 6, 0, Math.PI / 6].forEach(function (turn) {
          var ux = tx * Math.cos(turn) - ty * Math.sin(turn);
          var uy = tx * Math.sin(turn) + ty * Math.cos(turn);
          continuation = Math.min(continuation, near(mx + sign * ux * along, my + sign * uy * along, seed.rgb));
        });
      });
      if (continuation > 40) return;
      var offCenter = Math.abs((mx - (bounds.left + bounds.right) / 2) * nx + (my - (bounds.top + bounds.bottom) / 2) * ny);
      var normalSpan = Math.abs(nx) * cellW + Math.abs(ny) * cellH;
      var score = fraction * Math.min(2, colorDistance(seed.rgb, winner.rgb) / 100) * Math.min(2, span / fullSpan) / (1 + offCenter / normalSpan);
      if (!best || (strong && !best.strong) || (strong === best.strong && score > best.score)) best = { strong: strong, rgb: seed.rgb, score: score, mx: mx, my: my, tx: tx, ty: ty, nx: nx, ny: ny, radius: radius, cellW: cellW, cellH: cellH };
    });
    return best;
  }

  function sample(data, width, height, cols, rows, method, lineStrength) {
    var balanced = method === 'balanced';
    var strength = Number(lineStrength);
    strength = balanced ? (Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) / 100 : 0.65) : 1;
    var lines = method === 'lines' || (balanced && strength > 0);
    var dominant = method === 'dominant' || lines;
    var candidates = lines ? new Array(cols * rows) : null;
    var raw = new Array(cols * rows);
    raw.gridCols = cols; raw.gridRows = rows;
    raw.lineMask = new Uint8Array(cols * rows);
    for (var r = 0; r < rows; r++) {
      var top = r * height / rows, bottom = (r + 1) * height / rows;
      for (var c = 0; c < cols; c++) {
        var left = c * width / cols, right = (c + 1) * width / cols;
        var red = 0, green = 0, blue = 0, area = 0;
        var buckets = dominant ? new Map() : null;
        var centerX = (left + right) / 2, centerY = (top + bottom) / 2;
        for (var y = Math.floor(top); y < Math.ceil(bottom); y++) {
          var wy = Math.min(y + 1, bottom) - Math.max(y, top);
          for (var x = Math.floor(left); x < Math.ceil(right); x++) {
            var weight = wy * (Math.min(x + 1, right) - Math.max(x, left));
            var i = (y * width + x) * 4;
            var alpha = data[i + 3] / 255;
            var cr = data[i] * alpha + 255 * (1 - alpha);
            var cg = data[i + 1] * alpha + 255 * (1 - alpha);
            var cb = data[i + 2] * alpha + 255 * (1 - alpha);
            red += cr * weight;
            green += cg * weight;
            blue += cb * weight;
            area += weight;
            if (dominant && weight > 0) {
              // 将小幅 RGB 噪声归入同一色桶，但不平均两种边界颜色。
              var key = ((Math.round(cr) >> 4) << 8) | ((Math.round(cg) >> 4) << 4) | (Math.round(cb) >> 4);
              var distance = (x + 0.5 - centerX) ** 2 + (y + 0.5 - centerY) ** 2;
              var bucket = buckets.get(key);
              if (!bucket) { bucket = { weight: 0, centerWeight: 0, distance: Infinity, rgb: null, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; buckets.set(key, bucket); }
              bucket.weight += weight;
              // 线条模式以格心附近的覆盖为主，降低格边纹理对轮廓位置的干扰。
              var ux = (x + 0.5 - centerX) / (right - left);
              var uy = (y + 0.5 - centerY) / (bottom - top);
              bucket.centerWeight += weight * Math.exp(-8 * (ux * ux + uy * uy));
              if (lines) {
                var px = x + 0.5, py = y + 0.5;
                bucket.sx += px * weight; bucket.sy += py * weight;
                bucket.sxx += px * px * weight; bucket.syy += py * py * weight; bucket.sxy += px * py * weight;
                bucket.minX = Math.min(bucket.minX, px); bucket.maxX = Math.max(bucket.maxX, px);
                bucket.minY = Math.min(bucket.minY, py); bucket.maxY = Math.max(bucket.maxY, py);
              }
              // 代表色取桶内靠近格子中心的真实像素，避免桶均值再制造杂色。
              if (distance < bucket.distance) { bucket.distance = distance; bucket.rgb = [cr, cg, cb]; }
            }
          }
        }
        if (dominant) {
          var winner = null;
          buckets.forEach(function (bucket) {
            if (!winner || bucket.weight > winner.weight + 1e-9 ||
                (Math.abs(bucket.weight - winner.weight) < 1e-9 && bucket.distance < winner.distance)) winner = bucket;
          });
          if (method === 'lines') {
            // 相近颜色跨越 RGB 桶边界时共同投票，防止一块底色被拆票给少量杂色。
            var bins = Array.from(buckets.values()), bestVote = -1;
            bins.forEach(function (seed) {
              var vote = 0;
              bins.forEach(function (other) {
                if (colorDistance(seed.rgb, other.rgb) <= 24) vote += other.centerWeight;
              });
              if (vote > bestVote + 1e-9 || (Math.abs(vote - bestVote) < 1e-9 && seed.distance < winner.distance)) {
                winner = seed; bestVote = vote;
              }
            });
          }
          raw[r * cols + c] = balanced ? [red / area, green / area, blue / area] : winner.rgb;
          if (lines) candidates[r * cols + c] = lineCandidate(buckets, winner, area, { left: left, top: top, right: right, bottom: bottom }, data, width, height, method === 'lines');
        } else raw[r * cols + c] = [red / area, green / area, blue / area];
      }
    }
    if (lines) {
      // 短线段必须在原图中存在，并由两侧方向、颜色一致的可靠线段支持。
      // 不递归传播，也不跨过没有线条证据的空白格。
      // 弯曲笔画允许邻格切线缓慢转向，但连接路径必须有原图像素支撑。
      function sourceConnects(a, b) {
        var length = Math.hypot(b.mx - a.mx, b.my - a.my);
        var steps = Math.max(4, Math.ceil(length)), hits = 0, missing = 0;
        for (var step = 1; step < steps; step++) {
          var t = step / steps, x = Math.floor(a.mx + (b.mx - a.mx) * t);
          var y = Math.floor(a.my + (b.my - a.my) * t), found = false;
          for (var dy = -1; dy <= 1 && !found; dy++) for (var dx = -1; dx <= 1; dx++) {
            var px = x + dx, py = y + dy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            var i = (py * width + px) * 4, alpha = data[i + 3] / 255;
            var rgb = [data[i] * alpha + 255 * (1 - alpha), data[i + 1] * alpha + 255 * (1 - alpha), data[i + 2] * alpha + 255 * (1 - alpha)];
            if (colorDistance(rgb, a.rgb) <= 40) { found = true; break; }
          }
          if (found) { hits++; missing = 0; } else if (++missing > 2) return false;
        }
        return hits >= (steps - 1) * 0.8;
      }
      var supported = candidates.map(function (candidate, pos) {
        if (!candidate || candidate.strong) return !!candidate;
        var r = Math.floor(pos / cols), c = pos % cols, before = [], after = [];
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nr = r + dy, nc = c + dx;
          if ((!dx && !dy) || nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          var other = candidates[nr * cols + nc];
          if (!other || !other.strong || colorDistance(candidate.rgb, other.rgb) > 32) continue;
          if (Math.abs(candidate.tx * other.tx + candidate.ty * other.ty) < 0.65) continue;
          var vx = other.mx - candidate.mx, vy = other.my - candidate.my;
          var along = vx * candidate.tx + vy * candidate.ty;
          var across = Math.abs(vx * candidate.nx + vy * candidate.ny);
          if (across > Math.max(2, Math.min(candidate.cellW, candidate.cellH) * 0.4)) continue;
          if (Math.abs(along) < Math.min(candidate.cellW, candidate.cellH) * 0.25) continue;
          if (!sourceConnects(candidate, other)) continue;
          (along < 0 ? before : after).push([nc, nr]);
        }
        // 两侧已经相邻时无需补格，防止斜线变成双排阶梯。
        return before.some(function (a) {
          return after.some(function (b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) > 1; });
        });
      });
      candidates = candidates.map(function (candidate, pos) { return supported[pos] ? candidate : null; });
      var kept = 0;
      candidates.forEach(function (candidate, pos) {
        if (!candidate) return;
        var r = Math.floor(pos / cols), c = pos % cols, suppress = false;
        // 相邻格跨着同一条细线时，只选法向上更合适的一格，避免线宽翻倍。
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nr = r + dy, nc = c + dx;
          if ((!dx && !dy) || nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          var otherPos = nr * cols + nc, other = candidates[otherPos];
          if (!other || colorDistance(candidate.rgb, other.rgb) > 40) continue;
          var gridNormal = Math.abs(dx * candidate.cellW * candidate.nx + dy * candidate.cellH * candidate.ny);
          var gridTangent = Math.abs(dx * candidate.cellW * candidate.tx + dy * candidate.cellH * candidate.ty);
          if (gridNormal <= gridTangent * 1.2) continue;
          var offsetNormal = Math.abs((other.mx - candidate.mx) * candidate.nx + (other.my - candidate.my) * candidate.ny);
          if (offsetNormal > Math.min(candidate.radius, other.radius) + 1) continue;
          if (other.score > candidate.score + 1e-9 || (Math.abs(other.score - candidate.score) < 1e-9 && otherPos < pos)) suppress = true;
        }
        if (!suppress) {
          // 平衡模式只增强连续细线；其他格子维持面积平均，保留自然过渡。
          raw[pos] = balanced ? raw[pos].map(function (v, k) { return v + (candidate.rgb[k] - v) * strength; }) : candidate.rgb;
          raw.lineMask[pos] = 1; kept++;
        }
      });
      raw.retainedLineCells = kept;
    }
    if (balanced && !lines) raw.retainedLineCells = 0;
    return raw;
  }

  function build(raw, opts, library) {
    var result;
    if (opts.cluster === false) {
      var quantized = global.ColorLibrary.quantize(raw, library);
      var palette = [], cells = new Int16Array(quantized.length), indices = new Map();
      quantized.forEach(function (rgb, i) {
        var hex = global.Color.hex(rgb), index = indices.get(hex);
        if (index == null) {
          index = palette.length; indices.set(hex, index);
          palette.push({ rgb: rgb.slice(), hex: hex, lab: global.Color.rgbToLab(rgb), name: '', count: 0 });
        }
        cells[i] = index; palette[index].count++;
      });
      result = { palette: palette, cells: cells };
    } else {
      // 在原始色差上合并，避免先匹配色卡放大纸张纹理等微小色差。
      result = global.Palette.build(raw, Object.assign({}, opts, { coverAllColors: true }));
    }
    if (library && library.length) result = global.ColorLibrary.match(result, library);
    result.retainedLineCells = raw.retainedLineCells || 0;
    return result;
  }

  global.Pixel = { sample: sample, build: build };
})(window);
