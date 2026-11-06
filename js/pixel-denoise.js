/* Optional cleanup on the original fixed grid. No region relocation. */
(function (global) {
  'use strict';
  var MAX_COLORS = 48;
  function cleanAssignmentKeys(source, lookup, labs, width, height, cols, rows, C) {
    var limit = Math.min(32, Math.floor(width * height / (cols * rows) * .35));
    if (limit < 3) return source;
    // Related ink shades must form one component; otherwise a multicolored
    // contour would be mistaken for several isolated paper speckles.
    var classes = new Uint8Array(labs.length), representatives = [];
    for (var i = 0; i < labs.length; i++) {
      var group = -1;
      for (var j = 0; j < representatives.length; j++) {
        if (C.deltaE(labs[i], representatives[j]) < 18) { group = j; break; }
      }
      if (group < 0) { group = representatives.length; representatives.push(labs[i]); }
      classes[i] = group;
    }
    var cleaned = source.slice(), visited = new Uint8Array(source.length);
    var queue = new Int32Array(source.length), boundary = new Uint32Array(labs.length);
    var boundaryKey = new Uint16Array(labs.length);
    for (var seed = 0; seed < source.length; seed++) {
      if (visited[seed]) continue;
      var head = 0, tail = 1, seedClass = classes[lookup[source[seed]]];
      queue[0] = seed; visited[seed] = 1; boundary.fill(0);
      while (head < tail) {
        var at = queue[head++], x = at % width, y = Math.floor(at / width);
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          var pos = ny * width + nx, color = lookup[source[pos]];
          if (classes[color] === seedClass) {
            if (!visited[pos]) { visited[pos] = 1; queue[tail++] = pos; }
          } else { boundary[color]++; boundaryKey[color] = source[pos]; }
        }
      }
      if (tail >= limit) continue;
      var fill = 0;
      for (j = 1; j < labs.length; j++) if (boundary[j] > boundary[fill]) fill = j;
      // Read connectivity from the immutable source, never from earlier fills.
      if (boundary[fill]) for (j = 0; j < tail; j++) cleaned[queue[j]] = boundaryKey[fill];
    }
    return cleaned;
  }
  function clean(raw, data, width, height, cols, rows) {
    if (cols >= width && rows >= height) return raw;
    var C = global.Color, count = cols * rows, sourceCount = width * height;
    var keys = new Uint16Array(sourceCount), frequency = new Uint32Array(32768);
    var sums = new Float64Array(32768 * 3), bins = [], i, j, k;
    // Composite before quantization: transparent pixels must never become dark detail.
    for (i = 0; i < sourceCount; i++) {
      var a = data[i * 4 + 3] / 255;
      var red = data[i * 4] * a + 255 * (1 - a), green = data[i * 4 + 1] * a + 255 * (1 - a), blue = data[i * 4 + 2] * a + 255 * (1 - a);
      k = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
      keys[i] = k;
      if (!frequency[k]++) bins.push(k);
      sums[k * 3] += red; sums[k * 3 + 1] += green; sums[k * 3 + 2] += blue;
    }
    bins.sort(function (a, b) { return frequency[b] - frequency[a] || a - b; });
    var palette = [], labs = [], lookup = new Uint8Array(32768), accum = [];
    for (i = 0; i < bins.length; i++) {
      k = bins[i]; var rgb = [sums[k * 3] / frequency[k], sums[k * 3 + 1] / frequency[k], sums[k * 3 + 2] / frequency[k]];
      var lab = C.rgbToLab(rgb), best = 0, distance = Infinity;
      for (j = 0; j < labs.length; j++) {
        var d = (lab[0] - labs[j][0]) ** 2 + (lab[1] - labs[j][1]) ** 2 + (lab[2] - labs[j][2]) ** 2;
        if (d < distance) { distance = d; best = j; }
      }
      if (distance > 64 && palette.length < MAX_COLORS) {
        best = palette.length; palette.push(rgb); labs.push(lab); accum.push([0, 0, 0, 0]);
      }
      lookup[k] = best; var total = accum[best];
      total[0] += sums[k * 3]; total[1] += sums[k * 3 + 1]; total[2] += sums[k * 3 + 2]; total[3] += frequency[k];
    }
    for (i = 0; i < palette.length; i++) {
      palette[i] = accum[i].slice(0, 3).map(function (v) { return v / accum[i][3]; });
      labs[i] = C.rgbToLab(palette[i]);
    }
    // Source evidence distinguishes isolated texture from continuous strokes.
    var originalKeys = keys;
    keys = cleanAssignmentKeys(keys, lookup, labs, width, height, cols, rows, C);

    var rawLabs = raw.map(C.rgbToLab), target = new Uint8Array(count);
    for (i = 0; i < count; i++) {
      var best = 0, distance = Infinity;
      for (j = 0; j < palette.length; j++) {
        var error = C.deltaE(rawLabs[i], labs[j]);
        if (error < distance) { best = j; distance = error; }
      }
      target[i] = best;
    }
    var close = new Uint8Array(palette.length * palette.length), grouped = new Uint8Array(palette.length * palette.length);
    for (i = 0; i < palette.length; i++) for (j = 0; j < palette.length; j++) {
      var distance = C.deltaE(labs[i], labs[j]);
      close[i * palette.length + j] = distance < 8;
      grouped[i * palette.length + j] = distance < 12;
    }
    var originalSupport = new Uint32Array(count), survivingSupport = new Uint32Array(count);
    var votes = new Uint32Array(count * palette.length), area = new Uint32Array(count);
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      var pos = y * width + x;
      var cell = Math.min(rows - 1, Math.floor(y * rows / height)) * cols + Math.min(cols - 1, Math.floor(x * cols / width));
      var original = lookup[originalKeys[pos]], cleaned = lookup[keys[pos]];
      area[cell]++; votes[cell * palette.length + cleaned]++;
      if (close[target[cell] * palette.length + original]) {
        originalSupport[cell]++;
        if (original === cleaned) survivingSupport[cell]++;
      }
    }
    // Count related shades together: paper texture must not split a flat
    // background into many competing colors and outvote its own main tone.
    var winners = new Uint8Array(count), coverage = new Float32Array(count);
    for (i = 0; i < count; i++) {
      var winner = 0, bestVote = -1;
      for (j = 0; j < palette.length; j++) {
        var vote = 0;
        for (k = 0; k < palette.length; k++) if (grouped[j * palette.length + k]) vote += votes[i * palette.length + k];
        if (vote > bestVote) { bestVote = vote; winner = j; }
      }
      winners[i] = winner; coverage[i] = bestVote / Math.max(1, area[i]);
    }
    var result = raw.map(function (rgb) { return rgb.slice(); }), removed = 0;
    result.gridCols = cols; result.gridRows = rows;
    result.lineMask = new Uint8Array(raw.lineMask || count);
    for (i = 0; i < count; i++) {
      var winner = winners[i];
      var isolated = originalSupport[i] >= 2 && survivingSupport[i] < originalSupport[i] * .4;
      var support = 0, neighbors = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var r = Math.floor(i / cols) + dy, c = i % cols + dx;
        if ((!dx && !dy) || r < 0 || r >= rows || c < 0 || c >= cols) continue;
        neighbors++;
        var neighbor = r * cols + c;
        if (coverage[neighbor] >= .6 && C.deltaE(labs[winner], labs[winners[neighbor]]) < 12) support++;
      }
      // Low-contrast grain needs a uniform source area AND surrounding support.
      // High-contrast contours, eyes and small dots do not qualify for this pass.
      var grain = coverage[i] >= .7 && neighbors >= 3 && support >= Math.ceil(neighbors * .6) && C.deltaE(rawLabs[i], labs[winner]) <= 22;
      if ((isolated && coverage[i] >= .65) || grain) {
        result[i] = palette[winner].slice();
        if (C.deltaE(rawLabs[i], labs[winner]) > 6) { result.lineMask[i] = 0; removed++; }
      }
    }
    result.retainedLineCells = result.lineMask.reduce(function (sum, value) { return sum + value; }, 0);
    result.removedTextureCells = removed;
    return result;
  }
  global.PixelDenoise = { clean: clean };
})(window);
