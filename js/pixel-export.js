/* Shared chart PNG export for recognition and pixel conversion modes. */
(function (global) {
  'use strict';
  function dimensions(cols, rows, mm, dpi) {
    return { width: Math.max(1, Math.round(cols * mm * dpi / 25.4)), height: Math.max(1, Math.round(rows * mm * dpi / 25.4)) };
  }
  function fits(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= 8192 && height <= 8192 && width * height <= 32000000;
  }
  // Paper-sized sheets, with complete cells inside the printable margins.
  function printPlan(cols, rows, mm, options) {
    options = options || {};
    var papers = { a4: [210, 297], a3: [297, 420] };
    var paper = options.paper || 'a4', orientation = options.orientation || 'auto';
    var margin = options.margin === undefined ? 5 : Number(options.margin);
    if (!Number.isFinite(mm) || mm < 0.01 || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 ||
        !papers[paper] || !['auto', 'portrait', 'landscape'].includes(orientation) || !Number.isFinite(margin) || margin < 0) return null;
    var best = null;
    ['portrait', 'landscape'].forEach(function (direction) {
      if (orientation !== 'auto' && orientation !== direction) return;
      var w = papers[paper][direction === 'portrait' ? 0 : 1], h = papers[paper][direction === 'portrait' ? 1 : 0];
      var c = Math.min(cols, Math.floor((w - margin * 2) / mm + 1e-9));
      var r = Math.min(rows, Math.floor((h - margin * 2) / mm + 1e-9));
      if (c < 1 || r < 1) return;
      var across = Math.ceil(cols / c), down = Math.ceil(rows / r), count = across * down;
      if (!best || count < best.count || (count === best.count && c * r > best.cols * best.rows)) {
        var pixels = dimensions(w, h, 1, 300);
        best = { cols: c, rows: r, across: across, down: down, count: count,
          paper: paper, orientation: direction, margin: margin, widthMm: w, heightMm: h,
          width: pixels.width, height: pixels.height, inset: Math.round(margin * 300 / 25.4) };
      }
    });
    return best;
  }
  function shareSize(cols, rows, target) {
    var scale = Math.max(1, Math.round(target / Math.max(cols, rows)));
    return { width: cols * scale, height: rows * scale };
  }
  function withDensity(bytes, dpi) {
    var chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
    view.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4); // pHYs
    var ppm = Math.round(dpi / 0.0254);
    view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
    var crc = 0xffffffff;
    for (var i = 4; i < 17; i++) {
      crc ^= chunk[i];
      for (var bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
    var parts = [bytes.slice(0, 8)], offset = 8;
    while (offset + 12 <= bytes.length) {
      var length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      var type = String.fromCharCode.apply(null, bytes.subarray(offset + 4, offset + 8));
      if (type !== 'pHYs') parts.push(bytes.slice(offset, offset + length + 12));
      if (type === 'IHDR') parts.push(chunk);
      offset += length + 12;
    }
    return new Blob(parts, { type: 'image/png' });
  }
  // Include the numbering frame and optional legend in size validation.
  function shareLayout(cols, rows, target, colorCount) {
    var scale = Math.max(1, Math.round(target / Math.max(cols, rows))), initialScale = scale, layout;
    do {
      var width = cols * scale, height = rows * scale;
      var margin = Math.max(16, Math.ceil(scale * 1.15));
      var sheetWidth = Math.max(width + margin * 2, colorCount ? Math.round(target * 0.5 * scale / initialScale) : 0);
      var gap = Math.max(12, Math.round(sheetWidth * 0.022));
      var available = sheetWidth - gap * 2;
      var preferredCard = Math.max(24, target * 0.08 * scale / initialScale);
      var columns = Math.max(1, Math.floor(available / (preferredCard * 1.25)));
      var slot = available / columns, card = Math.max(1, Math.floor(slot / 1.25));
      var legendLeft = gap;
      var rowHeight = Math.ceil(card * 1.7);
      var legendTop = height + margin * 2 + gap;
      var sheetHeight = colorCount ? legendTop + Math.ceil(colorCount / columns) * rowHeight + gap : height + margin * 2;
      layout = { width: sheetWidth, height: sheetHeight, patternWidth: width, patternHeight: height,
        x: Math.floor((sheetWidth - width) / 2), y: margin, scale: scale,
        columns: columns, gap: gap, slot: slot, card: card, legendLeft: legendLeft, rowHeight: rowHeight, legendTop: legendTop };
      if (sheetWidth <= 8192 && sheetHeight <= 8192 && sheetWidth * sheetHeight <= 32000000) break;
      scale--;
    } while (scale >= 1);
    return layout;
  }
  function inkFor(rgb) { return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 145 ? '#111' : '#fff'; }
  function fitText(ctx, text, x, y, size, width, color) {
    ctx.font = '600 ' + size + 'px sans-serif';
    var measured = ctx.measureText(text).width;
    if (measured > width) ctx.font = '600 ' + (size * width / measured) + 'px sans-serif';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function shareSheet(pattern, state, layout, includePalette, watermark) {
    var canvas = document.createElement('canvas'); canvas.width = layout.width; canvas.height = layout.height;
    var ctx = canvas.getContext('2d'), x = layout.x, y = layout.y, cell = layout.scale;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(pattern, x, y);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var numberSize = Math.max(3, Math.min(cell * 0.55, y * 0.45));
    for (var c = 0; c < state.cols; c++) {
      fitText(ctx, String(c + 1), x + (c + 0.5) * cell, y / 2, numberSize, cell * 0.9, '#111');
      fitText(ctx, String(state.cols - c), x + (c + 0.5) * cell, y + layout.patternHeight + y / 2, numberSize, cell * 0.9, '#111');
    }
    for (var r = 0; r < state.rows; r++) {
      fitText(ctx, String(r + 1), x - y / 2, y + (r + 0.5) * cell, numberSize, y * 0.9, '#111');
      fitText(ctx, String(state.rows - r), x + layout.patternWidth + y / 2, y + (r + 0.5) * cell, numberSize, y * 0.9, '#111');
    }
    if (includePalette) {
      var counts = new Array(state.palette.length).fill(0);
      state.cells.forEach(function (i) { counts[i]++; });
      var colors = state.palette.map(function (p, i) { return { color: p, count: counts[i], index: i }; })
        .filter(function (p) { return p.count; }).sort(function (a, b) { return b.count - a.count || a.index - b.index; });
      colors.forEach(function (entry, i) {
        var left = layout.legendLeft + (i % layout.columns) * layout.slot + (layout.slot - layout.card) / 2;
        var top = layout.legendTop + Math.floor(i / layout.columns) * layout.rowHeight;
        ctx.fillStyle = entry.color.hex;
        ctx.beginPath(); ctx.roundRect(left, top, layout.card, layout.card, layout.card * 0.24); ctx.fill();
        fitText(ctx, entry.color.code || entry.color.name || '颜色', left + layout.card / 2, top + layout.card / 2, layout.card * 0.3, layout.card * 0.85, inkFor(entry.color.rgb));
        fitText(ctx, String(entry.count), left + layout.card / 2, top + layout.card * 1.23, layout.card * 0.28, layout.slot * 0.9, '#111');
      });
    }
    if (watermark) {
      var spacingX = Math.max(200, canvas.width / 3), spacingY = Math.max(180, Math.min(layout.patternWidth, layout.patternHeight) / 3);
      for (var wy = spacingY / 2; wy < canvas.height; wy += spacingY) for (var wx = spacingX / 2; wx < canvas.width; wx += spacingX) {
        ctx.save(); ctx.translate(wx, wy); ctx.rotate(-Math.PI / 7);
        var size = Math.max(12, Math.min(72, canvas.width * 0.035));
        ctx.font = '500 ' + size + 'px sans-serif';
        var length = ctx.measureText(watermark).width;
        if (length > spacingX * 0.82) ctx.font = '500 ' + (size * spacingX * 0.82 / length) + 'px sans-serif';
        ctx.lineWidth = Math.max(1, size / 22); ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.strokeText(watermark, 0, 0); ctx.fillText(watermark, 0, 0); ctx.restore();
      }
    }
    return canvas;
  }
  function patternSheet(source, state, s, tile, grid, labels) {
    var canvas = document.createElement('canvas'); canvas.width = s.width; canvas.height = s.height;
    var output = canvas.getContext('2d'); output.imageSmoothingEnabled = false;
    output.drawImage(source, tile.col, tile.row, tile.cols, tile.rows, 0, 0, s.width, s.height);
    if (grid) {
      var cellW = s.width / tile.cols, cellH = s.height / tile.rows;
      var weight = Math.max(1, Math.floor(Math.min(cellW, cellH) / 24));
      output.strokeStyle = 'rgba(0,0,0,.35)'; output.lineWidth = weight;
      output.beginPath();
      for (var c = 1; c < tile.cols; c++) {
        var x = Math.round(c * cellW) - (weight % 2 ? 0.5 : 0);
        output.moveTo(x, 0); output.lineTo(x, s.height);
      }
      for (var r = 1; r < tile.rows; r++) {
        var y = Math.round(r * cellH) - (weight % 2 ? 0.5 : 0);
        output.moveTo(0, y); output.lineTo(s.width, y);
      }
      // Keep the internal grid line when two printed sheets meet.
      if (tile.col > 0) { output.moveTo(0, 0); output.lineTo(0, s.height); }
      if (tile.col + tile.cols < state.cols) { output.moveTo(s.width, 0); output.lineTo(s.width, s.height); }
      if (tile.row > 0) { output.moveTo(0, 0); output.lineTo(s.width, 0); }
      if (tile.row + tile.rows < state.rows) { output.moveTo(0, s.height); output.lineTo(s.width, s.height); }
      output.stroke();
    }
    if (labels) {
      var labelW = s.width / tile.cols, labelH = s.height / tile.rows;
      output.textAlign = 'center'; output.textBaseline = 'middle';
      for (var row = 0; row < tile.rows; row++) for (var col = 0; col < tile.cols; col++) {
        var color = state.palette[state.cells[(row + tile.row) * state.cols + col + tile.col]], text = color.code || color.name;
        if (!text) continue;
        var fontSize = Math.min(labelH * 0.45, labelW * 0.45);
        output.font = '600 ' + fontSize + 'px sans-serif';
        var measured = output.measureText(text).width;
        if (measured > labelW * 0.8) fontSize *= labelW * 0.8 / measured;
        output.font = '600 ' + fontSize + 'px sans-serif';
        var brightness = color.rgb[0] * 0.299 + color.rgb[1] * 0.587 + color.rgb[2] * 0.114;
        output.fillStyle = brightness > 145 ? '#111' : '#fff';
        output.fillText(text, (col + 0.5) * labelW, (row + 0.5) * labelH);
      }
    }
    return canvas;
  }
  function create(state, api) {
    var $ = function (id) { return document.getElementById(id); };
    var dialog = $('pixelExportDialog'), mode = $('exportSizeMode'), grid = $('exportGrid');
    var quality = $('exportQuality'), mm = $('exportBeadMm'), labels = $('exportLabels'), submit = $('exportPixelConfirm');
    var palette = $('exportPalette'), watermark = $('exportWatermark'), watermarkText = $('exportWatermarkText');
    var paper = $('exportPaper'), orientation = $('exportOrientation'), margin = $('exportMargin');
    var exporting = false;
    function physicalPlan() {
      if (!mm.validity.valid || !margin.validity.valid || margin.value.trim() === '') return null;
      return printPlan(state.cols, state.rows, Number(mm.value), { paper: paper.value, orientation: orientation.value, margin: Number(margin.value) });
    }
    function layout() { return shareLayout(state.cols, state.rows, Number(quality.value), palette.checked ? state.palette.length : 0); }
    function size() {
      return mode.value === 'physical' ? dimensions(state.cols, state.rows, Number(mm.value), 300) : { width: layout().patternWidth, height: layout().patternHeight };
    }
    function update() {
      var physical = mode.value === 'physical';
      $('exportPhysicalFields').hidden = !physical;
      $('exportShareFields').hidden = physical;
      $('exportShareOptions').hidden = physical;
      $('exportWatermarkField').hidden = physical || !watermark.checked;
      var validMm = Number.isFinite(Number(mm.value)) && Number(mm.value) >= 0.01 && mm.validity.valid;
      var plan = physical && validMm ? physicalPlan() : null;
      var s = physical ? size() : layout();
      var valid = physical ? !!plan && plan.count <= 65534 : fits(s.width, s.height);
      var missingWatermark = !physical && watermark.checked && !watermarkText.value.trim();
      valid = valid && !missingWatermark;
      submit.disabled = !valid || exporting;
      if (!exporting) submit.textContent = physical && plan && plan.count > 1 ? '下载 ' + plan.count + ' 张 PNG（ZIP）' : '下载 PNG';
      $('exportSizeError').hidden = valid;
      $('exportSizeError').textContent = valid ? '' : missingWatermark ? '请输入水印名称。' : physical && !validMm ? '请填写有效的每格大小（mm）。' : physical ? '每格大小或页边距过大，所选纸张放不下完整格子，请调整后重试。' : '导出超过上限：单边最多 8192px，总计最多 3200 万像素，请调整导出尺寸或关闭色卡。';
      $('exportDimensions').textContent = !valid ? '' : physical ? '成品宽 ' + Number((state.cols * Number(mm.value)).toFixed(3)) + ' × 高 ' + Number((state.rows * Number(mm.value)).toFixed(3)) + ' mm · 300 DPI' + '；' + plan.paper.toUpperCase() + ' ' + (plan.orientation === 'portrait' ? '纵向' : '横向') + ' ' + plan.widthMm + ' × ' + plan.heightMm + ' mm，页边距 ' + plan.margin + ' mm；共 ' + plan.count + ' 张（横向 ' + plan.across + ' × 纵向 ' + plan.down + '），按行列范围拼接' : '图片尺寸：' + s.width + ' × ' + s.height + ' px';
    }
    mode.addEventListener('change', update);
    quality.addEventListener('change', update);
    mm.addEventListener('input', update);
    paper.addEventListener('change', update);
    orientation.addEventListener('change', update);
    margin.addEventListener('input', update);
    palette.addEventListener('change', update);
    watermark.addEventListener('change', update);
    watermarkText.addEventListener('input', update);
    $('cancelPixelExport').addEventListener('click', function () { dialog.close(); });
    submit.addEventListener('click', async function () {
      update(); if (submit.disabled) return;
      var density = mode.value === 'physical' ? 300 : null, beadMm = Number(mm.value);
      var sheetLayout = density ? null : layout(), includePalette = palette.checked;
      var watermarkValue = !density && watermark.checked ? watermarkText.value.trim() : '';
      var includeGrid = grid.checked, includeLabels = labels.checked;
      // Export one consistent snapshot even if another analysis finishes while encoding.
      var model = { cols: state.cols, rows: state.rows, cells: state.cells.slice(), palette: state.palette.map(function (p) { return Object.assign({}, p, { rgb: p.rgb.slice() }); }) };
      var plan = density ? physicalPlan() : { cols: model.cols, rows: model.rows, count: 1 };
      exporting = true;
      submit.disabled = true;
      var source, canvas;
      try {
        source = document.createElement('canvas'); source.width = model.cols; source.height = model.rows;
        var ctx = source.getContext('2d'), pixels = ctx.createImageData(model.cols, model.rows);
        for (var i = 0; i < model.cells.length; i++) {
          var rgb = model.palette[model.cells[i]].rgb;
          pixels.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
        }
        ctx.putImageData(pixels, 0, 0);
        var files = [], index = 0, lastName;
        for (var row = 0; row < model.rows; row += plan.rows) for (var col = 0; col < model.cols; col += plan.cols) {
          var tile = { row: row, col: col, rows: Math.min(plan.rows, model.rows - row), cols: Math.min(plan.cols, model.cols - col) };
          var s = density ? dimensions(tile.cols, tile.rows, beadMm, density) : { width: sheetLayout.patternWidth, height: sheetLayout.patternHeight };
          if (!fits(s.width, s.height)) throw new Error('Invalid sheet size');
          submit.textContent = '正在生成 ' + (++index) + ' / ' + plan.count + '…';
          await new Promise(function (resolve) { setTimeout(resolve, 0); });
          canvas = patternSheet(source, model, s, tile, includeGrid, includeLabels);
          if (density) {
            var printCanvas = document.createElement('canvas'); printCanvas.width = plan.width; printCanvas.height = plan.height;
            var printCtx = printCanvas.getContext('2d');
            printCtx.fillStyle = '#fff'; printCtx.fillRect(0, 0, plan.width, plan.height);
            printCtx.drawImage(canvas, plan.inset, plan.inset);
            canvas.width = canvas.height = 1;
            canvas = printCanvas;
          }
          if (sheetLayout) {
            var pattern = canvas;
            canvas = shareSheet(pattern, model, sheetLayout, includePalette, watermarkValue);
            pattern.width = pattern.height = 1;
          }
          var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
          if (!blob) throw new Error('PNG export failed');
          canvas.width = canvas.height = 1;
          if (density) blob = withDensity(new Uint8Array(await blob.arrayBuffer()), density);
          lastName = density ? '实际尺寸图纸-' + plan.paper.toUpperCase() + '.png' : '图纸-' + s.width + 'x' + s.height + '.png';
          if (plan.count === 1) {
            if (sheetLayout) lastName = '图纸-' + sheetLayout.width + 'x' + sheetLayout.height + '.png';
            api.download(blob, lastName);
          } else {
            lastName = '图纸-' + plan.paper.toUpperCase() + '-' + String(index).padStart(String(plan.count).length, '0') + '-行' + (row + 1) + '-' + (row + tile.rows) + '-列' + (col + 1) + '-' + (col + tile.cols) + '.png';
            files.push({ name: lastName, data: new Uint8Array(await blob.arrayBuffer()) });
          }
        }
        if (files.length) api.download(global.ZipStore.build(files), '实际尺寸图纸-' + plan.paper.toUpperCase() + '-' + plan.count + '张.zip');
        dialog.close();
      } catch (e) { api.toast('导出失败，请减小图片尺寸后重试'); }
      finally {
        if (canvas) canvas.width = canvas.height = 1;
        if (source) source.width = source.height = 1;
        exporting = false; update();
      }
    });
    return { open: function () {
      if (!state.cells) return api.toast('还没有识别结果');
      mode.value = 'share';
      quality.value = '2400'; grid.checked = true; labels.checked = false;
      palette.checked = true; watermark.checked = false;
      mm.value = api.mm() || '';
      update(); dialog.showModal();
    } };
  }
  global.PixelExport = { dimensions: dimensions, printPlan: printPlan, shareSize: shareSize, shareLayout: shareLayout, withDensity: withDensity, create: create };
})(window);
