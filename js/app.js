/* app.js — UI 控制器。所有图片解析都在本页面完成，没有任何网络请求。 */
(function () {
  'use strict';

  var MAX_ANALYSIS_WIDTH = 2400;   // 分析用画布上限，控制内存与耗时
  var LS_KEY = 'beadchart.settings.v1';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    drop: $('drop'), stage: $('stage'), fileInput: $('fileInput'),
    pickBtn: $('pickBtn'), pickBtn2: $('pickBtn2'), demoBtn: $('demoBtn'),
    autoBtn: $('autoBtn'), themeBtn: $('themeBtn'), weakGridBtn: $('weakGridBtn'),
    cols: $('cols'), rows: $('rows'),
    offsetX: $('offsetX'), offsetY: $('offsetY'), alignTools: $('alignTools'), resetAlignBtn: $('resetAlignBtn'),
    thresh: $('thresh'), threshOut: $('threshOut'), fixK: $('fixK'), kNum: $('kNum'),
    minCount: $('minCount'),
    palette: $('palette'), paletteHint: $('paletteHint'), mergeBtn: $('mergeBtn'), undoMergeBtn: $('undoMergeBtn'),
    resultCanvas: $('resultCanvas'), gridCanvas: $('gridCanvas'),
    rawImg: $('rawImg'), rawWrap: $('rawWrap'),
    paneResult: $('paneResult'), paneRaw: $('paneRaw'), viewport: $('viewport'),
    stageStats: $('stageStats'), probe: $('probe'),
    cellEditor: $('cellEditor'), cellEditLabel: $('cellEditLabel'), cellColor: $('cellColor'),
    applyCellBtn: $('applyCellBtn'), resetCellBtn: $('resetCellBtn'),
    clearCellSelectionBtn: $('clearCellSelectionBtn'),
    zoom: $('zoom'), zoomOut: $('zoomOut'),
    colDir: $('colDir'), rowDir: $('rowDir'),
    optPerCol: $('optPerCol'), optBold: $('optBold'),
    chartOut: $('chartOut'), chartMeta: $('chartMeta'),
    copyBtn: $('copyBtn'), csvBtn: $('csvBtn'), pngBtn: $('pngBtn'),
    txtBtn: $('txtBtn'), mdBtn: $('mdBtn'),
    toast: $('toast'), busy: $('busy'), perfInfo: $('perfInfo')
  };

  var S = {
    img: null, objectUrl: null,
    src: null, scale: 1,          // 分析画布 & 相对原图的缩放
    imgData: null, imgDataKey: '',
    cols: 100, rows: 77,
    geom: null, detectedGeom: null, // 当前几何与自动识别的基准几何
    base: null,                   // 聚类原始结果
    palette: [], cells: null,
    custom: { merges: [], names: [] },
    selected: new Set(),
    iso: -1, selectedCells: new Set(), cellEdits: new Map(),
    fresh: true, gridKey: '', probeCell: -1,
    view: 'result', weakGrid: false,
    busyDepth: 0
  };

  /* ============================ 工具 ============================ */

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, ms || 2000);
  }

  function busy(on) {
    S.busyDepth += on ? 1 : -1;
    if (S.busyDepth < 0) S.busyDepth = 0;
    el.busy.hidden = S.busyDepth === 0;
  }

  function num(input, min, max, dflt) {
    var v = parseInt(input.value, 10);
    if (!isFinite(v)) v = dflt;
    return Math.max(min, Math.min(max, v));
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  var debounceTimers = Object.create(null);
  function debounce(fn, ms, key) {
    key = key || fn.name || 'default';
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, ms);
  }

  /* ============================ 载图 ============================ */

  function loadFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image') !== 0) {
      toast('请选择图片文件');
      return;
    }
    if (S.objectUrl) URL.revokeObjectURL(S.objectUrl);
    S.objectUrl = URL.createObjectURL(file);
    loadSrc(S.objectUrl);
  }

  function loadSrc(src) {
    busy(true);
    var img = new Image();
    img.onload = function () {
      S.img = img;
      el.rawImg.src = src;
      prepareCanvas();
      resetAlign();
      S.geom = S.detectedGeom = null;
      S.fresh = true;
      S.custom = { merges: [], names: [] };
      S.selected.clear();
      S.cellEdits.clear();
      S.selectedCells.clear();
      S.probeCell = -1;
      el.drop.hidden = true;
      el.stage.hidden = false;
      busy(false);
      analyze(true);
    };
    img.onerror = function () {
      busy(false);
      toast('图片读取失败');
    };
    img.src = src;
  }

  function prepareCanvas() {
    var nw = S.img.naturalWidth, nh = S.img.naturalHeight;
    S.scale = Math.min(1, MAX_ANALYSIS_WIDTH / nw);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(nw * S.scale));
    cv.height = Math.max(1, Math.round(nh * S.scale));
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, 0, 0, cv.width, cv.height);
    S.src = cv;
    S.imgData = null;
    S.imgDataKey = '';
  }

  function resetAlign() {
    el.offsetX.value = el.offsetY.value = 0;
  }

  function getImageData() {
    var key = S.src.width + ':' + S.src.height;
    if (S.imgData && S.imgDataKey === key) return S.imgData;
    var ctx = S.src.getContext('2d', { willReadFrequently: true });
    try {
      S.imgData = ctx.getImageData(0, 0, S.src.width, S.src.height);
    } catch (e) {
      toast('无法读取像素：请通过本地服务器打开（npm run dev），不要直接双击 index.html', 6000);
      throw e;
    }
    S.imgDataKey = key;
    return S.imgData;
  }

  /* ============================ 分析 ============================ */

  function analyze(withDetect) {
    if (!S.img) return;
    busy(true);
    requestAnimationFrame(function () {
      var t0 = performance.now();
      try {
        var id = getImageData();

        if (withDetect) {
          var g = Grid.detect(id.data, id.width, id.height);
          if (g) {
            S.detectedGeom = g;
            el.cols.value = g.cols;
            el.rows.value = g.rows;
          } else {
            S.detectedGeom = null;
            toast('没能自动识别网格，请手动填写行列数', 3500);
          }
        }

        S.cols = num(el.cols, 1, 600, 100);
        S.rows = num(el.rows, 1, 600, 77);
        var gridKey = S.cols + 'x' + S.rows;
        if (S.gridKey && S.gridKey !== gridKey) {
          S.cellEdits.clear();
          S.selectedCells.clear();
          S.probeCell = -1;
        }
        S.gridKey = gridKey;
        S.geom = fitGeometry(id.width, id.height);

        var raw = Grid.sample(id.data, id.width, id.height, S.geom, 0.30);
        S.base = Palette.build(raw, {
          mode: el.fixK.checked ? 'k' : 'thresh',
          thresh: num(el.thresh, 3, 45, 12),
          k: num(el.kNum, 2, Palette.MAX_COLORS, 12),
          minCount: num(el.minCount, 1, 99, 3)
        });

        applyCustomAndRender();
        el.perfInfo.textContent = '识别耗时 ' + Math.round(performance.now() - t0) + ' ms';
      } catch (e) {
        console.error(e);
      } finally {
        busy(false);
      }
    });
  }

  /**
   * 按当前行列数确定每格的落点。
   * 自动识别得到的起点（可能为负，表示第一格被切掉一角）保留下来；
   * 手动改行列数时，从这个起点重新把区域均分。
   */
  function fitGeometry(W, H) {
    var g = S.detectedGeom;
    var ox = g ? g.originX : 0;
    var oy = g ? g.originY : 0;
    var dx = parseFloat(el.offsetX.value) || 0;
    var dy = parseFloat(el.offsetY.value) || 0;
    ox += dx * S.scale;
    oy += dy * S.scale;
    if (g && g.cols === S.cols && g.rows === S.rows) return {
      cols: g.cols, rows: g.rows, originX: ox, originY: oy,
      cellW: g.cellW, cellH: g.cellH
    };
    return {
      cols: S.cols, rows: S.rows,
      originX: ox, originY: oy,
      cellW: (W - ox) / S.cols,
      cellH: (H - oy) / S.rows
    };
  }

  /** 合并 / 改名不需要重新采样，只在聚类结果上做后处理 */
  function applyCustomAndRender() {
    if (!S.base) return;
    var out = Palette.applyCustom(S.base.palette, S.base.cells, S.custom);
    S.palette = out.palette.map(function (p) { return Object.assign({}, p); });
    S.cells = new Int16Array(out.cells);
    applyCellEdits();
    Color.nameAll(S.palette);
    S.iso = -1;
    S.selected.clear();
    if (S.fresh) { shrinkZoomToFit(); S.fresh = false; }
    renderPalette();
    renderCanvas();
    renderGridOverlay();
    renderStats();
    renderCellEditor();
    if (S.probeCell >= 0 && S.probeCell < S.cells.length) {
      showProbe({
        c: S.probeCell % S.cols,
        r: Math.floor(S.probeCell / S.cols),
        idx: S.cells[S.probeCell]
      });
    }
    renderTextChart();
    if (S.pendingView) { setView(S.pendingView); S.pendingView = null; }
  }

  function applyCellEdits() {
    S.cellEdits.forEach(function (edit, pos) {
      if (pos < 0 || pos >= S.cells.length) return;
      var best = 0, dist = Infinity;
      for (var i = 0; i < S.palette.length; i++) {
        var d = Color.deltaE(edit.lab, S.palette[i].lab);
        if (d < dist) { dist = d; best = i; }
      }
      S.cells[pos] = best;
    });
    S.palette.forEach(function (p) { p.count = 0; });
    for (var j = 0; j < S.cells.length; j++) {
      if (S.palette[S.cells[j]]) S.palette[S.cells[j]].count++;
    }
  }

  /* ============================ 渲染 ============================ */

  function renderStats() {
    if (!S.img) return;
    var cell = S.geom ? (S.geom.cellW / S.scale).toFixed(1) : '?';
    el.stageStats.innerHTML =
      '<span>原图 <b>' + S.img.naturalWidth + ' × ' + S.img.naturalHeight + '</b> px</span>' +
      '<span>网格 <b>' + S.cols + '</b> 列 × <b>' + S.rows + '</b> 行 = <b>' + (S.cols * S.rows) + '</b> 颗</span>' +
      '<span>每格约 <b>' + cell + '</b> px</span>' +
      '<span>识别到 <b>' + S.palette.length + '</b> 种颜色</span>';
  }

  function renderPalette() {
    var frag = document.createDocumentFragment();
    S.palette.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'pal-row';
      row.dataset.i = i;

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = S.selected.has(i);
      cb.addEventListener('change', function () {
        if (cb.checked) S.selected.add(i); else S.selected.delete(i);
        el.mergeBtn.disabled = S.selected.size < 2;
      });

      var sw = document.createElement('span');
      sw.className = 'pal-sw';
      sw.style.background = p.hex;
      sw.title = p.hex.toUpperCase();

      var name = document.createElement('input');
      name.type = 'text';
      name.value = p.name;
      name.spellcheck = false;
      name.addEventListener('input', function () {
        p.name = name.value;
        rememberName(p);
        renderTextChart();
      });

      var n = document.createElement('span');
      n.className = 'pal-n';
      n.textContent = p.count + ' 颗';

      row.appendChild(cb); row.appendChild(sw); row.appendChild(name); row.appendChild(n);
      row.addEventListener('mouseenter', function () { S.iso = i; renderCanvas(); });
      row.addEventListener('mouseleave', function () { S.iso = -1; renderCanvas(); });
      frag.appendChild(row);
    });
    el.palette.replaceChildren(frag);
    el.mergeBtn.disabled = true;
    el.undoMergeBtn.disabled = S.custom.merges.length === 0;
    el.paletteHint.textContent = S.palette.length
      ? '改名后文字图纸实时更新；勾选两个及以上色块可合并为同一种珠子。'
      : '等待识别结果。';
  }

  function rememberName(p) {
    var list = S.custom.names;
    for (var i = 0; i < list.length; i++) {
      if (Color.deltaE(list[i].lab, p.lab) < 4) { list[i].name = p.name; return; }
    }
    list.push({ lab: p.lab.slice(), name: p.name });
  }

  /** 只在整张图纸放不下时缩小格子；用户自己调过的更大值不会被强行改掉 */
  function shrinkZoomToFit() {
    var avail = el.viewport.clientWidth - 20;
    if (avail <= 0 || !S.cols) return;
    var cur = num(el.zoom, 3, 26, 10);
    if (S.cols * cur <= avail) return;
    var cs = Math.max(3, Math.min(26, Math.floor(avail / S.cols)));
    el.zoom.value = cs;
    el.zoomOut.textContent = cs + 'px';
  }

  function renderCanvas() {
    var cv = el.resultCanvas;
    if (!S.cells) return;
    var cs = num(el.zoom, 3, 26, 10);
    cv.width = S.cols * cs;
    cv.height = S.rows * cs;

    var ctx = cv.getContext('2d');
    var css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--sunken').trim() || '#eceaea';
    ctx.fillRect(0, 0, cv.width, cv.height);

    for (var r = 0; r < S.rows; r++) {
      for (var c = 0; c < S.cols; c++) {
        var idx = S.cells[r * S.cols + c];
        var p = S.palette[idx];
        if (!p) continue;
        ctx.globalAlpha = (S.iso < 0 || S.iso === idx) ? 1 : 0.12;
        ctx.fillStyle = p.hex;
        ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }
    ctx.globalAlpha = 1;

    if (cs >= 6) {
      ctx.strokeStyle = S.weakGrid ? 'rgba(0,0,0,.4)' : '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gc = 1; gc < S.cols; gc++) {
        var gx = gc * cs - 0.5;
        ctx.moveTo(gx, 0); ctx.lineTo(gx, cv.height);
      }
      for (var gr = 1; gr < S.rows; gr++) {
        var gy = gr * cs - 0.5;
        ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy);
      }
      ctx.stroke();
    }

    S.selectedCells.forEach(function (pos) {
      if (pos < 0 || pos >= S.cells.length) return;
      var lockR = Math.floor(pos / S.cols);
      var lockC = pos % S.cols;
      ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#009546';
      ctx.lineWidth = Math.min(3, Math.max(2, cs / 4));
      ctx.strokeRect(lockC * cs + 1, lockR * cs + 1, Math.max(1, cs - 2), Math.max(1, cs - 2));
    });
  }

  function renderGridOverlay() {
    if (!S.img || !S.geom || !el.rawImg.complete || !el.rawImg.clientWidth) return;
    var cv = el.gridCanvas;
    var dw = el.rawImg.clientWidth, dh = el.rawImg.clientHeight;
    cv.width = dw; cv.height = dh;
    cv.style.width = dw + 'px';
    cv.style.height = dh + 'px';

    var g = S.geom;
    var k = dw / S.img.naturalWidth / S.scale;   // 分析画布坐标 → 显示坐标
    var x0 = 0, y0 = 0;
    var w = S.src.width * k, h = S.src.height * k;

    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, dw, dh);
    ctx.strokeStyle = 'rgba(0,149,70,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    var c, r, v;
    for (c = 0; c <= g.cols; c++) {
      v = g.originX + c * g.cellW;
      if (v < -0.5 || v > S.src.width + 0.5) continue;
      var x = Math.round(x0 + v * k) + 0.5;
      ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h);
    }
    for (r = 0; r <= g.rows; r++) {
      v = g.originY + r * g.cellH;
      if (v < -0.5 || v > S.src.height + 0.5) continue;
      var y = Math.round(y0 + v * k) + 0.5;
      ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,149,70,1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, w, h);
  }

  function renderTextChart() {
    if (!S.cells) return;
    var text = TextChart.build(
      { cols: S.cols, rows: S.rows, cells: S.cells, palette: S.palette },
      currentOpts()
    );
    el.chartOut.textContent = text;
    el.chartMeta.textContent = S.cols + ' 列 · ' + S.palette.length + ' 色 · ' + text.length + ' 字';
    saveSettings();
  }

  function currentOpts() {
    return {
      colDir: el.colDir.value,
      rowDir: el.rowDir.value,
      perCol: el.optPerCol.checked,
      bold: el.optBold.checked
    };
  }

  /* ============================ 探针 ============================ */

  function probeAt(ev) {
    if (!S.cells) return;
    var cs = num(el.zoom, 3, 26, 10);
    var rect = el.resultCanvas.getBoundingClientRect();
    var c = Math.floor((ev.clientX - rect.left) / (rect.width / S.cols));
    var r = Math.floor((ev.clientY - rect.top) / (rect.height / S.rows));
    if (c < 0 || r < 0 || c >= S.cols || r >= S.rows) return null;
    return { c: c, r: r, idx: S.cells[r * S.cols + c] };
  }

  function span(text, cls) {
    var s = document.createElement('span');
    if (cls) s.className = cls;
    if (text != null) s.textContent = text;
    return s;
  }

  function showProbe(hit) {
    if (!hit) return;
    S.probeCell = hit.r * S.cols + hit.c;
    var p = S.palette[hit.idx];
    if (!p) return;
    var colNo = el.colDir.value === 'rtl' ? S.cols - hit.c : hit.c + 1;
    var rowNo = el.rowDir.value === 'ttb' ? hit.r + 1 : S.rows - hit.r;
    var fromTop = el.rowDir.value === 'ttb';

    // 用 DOM 而不是 innerHTML，这样 CSP 可以禁掉行内样式
    var sw = span('', 'sw');
    sw.style.background = p.hex;

    var pos = span('第 ');
    pos.appendChild(span(String(colNo), 'hl'));
    pos.appendChild(span(' 列 · 自' + (fromTop ? '上' : '下') + '数第 '));
    pos.appendChild(span(String(rowNo), 'hl'));
    pos.appendChild(span(' 颗'));

    var parts = [sw, pos, span(p.name, 'hl'), span(p.hex.toUpperCase())];
    if (S.selectedCells.has(hit.r * S.cols + hit.c)) parts.push(span('（已选中；再次点击可取消）', 'hl'));
    el.probe.replaceChildren.apply(el.probe, parts);
  }

  function renderCellEditor() {
    var valid = !!S.cells && S.selectedCells.size > 0;
    el.cellColor.disabled = el.applyCellBtn.disabled = !valid;
    el.clearCellSelectionBtn.disabled = !valid;
    var hasEdited = false;
    S.selectedCells.forEach(function (pos) { if (S.cellEdits.has(pos)) hasEdited = true; });
    el.resetCellBtn.disabled = !valid || !hasEdited;
    el.cellColor.replaceChildren();
    if (!valid) {
      el.cellEditLabel.textContent = '请点击识别结果中的格子';
      return;
    }
    el.cellEditLabel.textContent = '已选中 ' + S.selectedCells.size + ' 格';
    var first = S.selectedCells.values().next().value;
    var sameColor = true, firstColor = S.cells[first];
    S.selectedCells.forEach(function (pos) { if (S.cells[pos] !== firstColor) sameColor = false; });
    S.palette.forEach(function (p, i) {
      var option = document.createElement('option');
      option.value = i;
      option.textContent = p.name + '（' + p.hex.toUpperCase() + '）';
      option.selected = sameColor && i === firstColor;
      el.cellColor.appendChild(option);
    });
  }

  /* ============================ 视图切换 ============================ */

  function setView(v) {
    S.view = v;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.view === v);
    });
    el.paneResult.hidden = v !== 'result';
    el.paneRaw.hidden = v !== 'raw';
    el.alignTools.hidden = v !== 'raw';
    if (v === 'raw') requestAnimationFrame(renderGridOverlay);
  }

  /* ============================ 设置持久化 ============================ */

  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        thresh: el.thresh.value, fixK: el.fixK.checked, k: el.kNum.value,
        minCount: el.minCount.value,
        zoom: el.zoom.value, opts: currentOpts(),
        theme: document.documentElement.getAttribute('data-theme') || ''
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function loadSettings() {
    var raw;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (s.thresh) { el.thresh.value = s.thresh; el.threshOut.textContent = s.thresh; }
      if (s.k) el.kNum.value = s.k;
      if (s.minCount) el.minCount.value = s.minCount;
      if (s.fixK) { el.fixK.checked = true; el.kNum.disabled = false; }
      if (s.zoom) { el.zoom.value = s.zoom; el.zoomOut.textContent = s.zoom + 'px'; }
      if (s.opts) {
        el.colDir.value = s.opts.colDir || 'ltr';
        el.rowDir.value = s.opts.rowDir || 'btt';
        el.optPerCol.checked = s.opts.perCol !== false;
        el.optBold.checked = s.opts.bold !== false;
      }
      if (s.theme) document.documentElement.setAttribute('data-theme', s.theme);
    } catch (e) { /* 旧版本设置，忽略 */ }
  }

  /* ============================ 事件绑定 ============================ */

  function bind() {
    // 选图
    [el.pickBtn, el.pickBtn2].forEach(function (b) {
      b.addEventListener('click', function () { el.fileInput.click(); });
    });
    el.fileInput.addEventListener('change', function (e) {
      loadFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    el.demoBtn.addEventListener('click', function () { loadSrc('./demo/sample.jpg'); });

    // 拖放（整页可拖）
    ['dragenter', 'dragover'].forEach(function (t) {
      window.addEventListener(t, function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
          e.preventDefault();
          el.drop.classList.add('hot');
        }
      });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      window.addEventListener(t, function () { el.drop.classList.remove('hot'); });
    });
    window.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        loadFile(e.dataTransfer.files[0]);
      }
    });
    el.drop.addEventListener('click', function (e) {
      if (e.target === el.drop || e.target.parentNode === el.drop) el.fileInput.click();
    });

    // 粘贴
    window.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { loadFile(items[0]); }
    });

    // 网格参数
    [el.cols, el.rows].forEach(function (input) {
      input.addEventListener('input', function () { debounce(function () { analyze(false); }, 260, 'grid'); });
    });
    document.querySelectorAll('[data-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = el[btn.dataset.step];
        input.value = num(input, 1, 600, 1) + parseInt(btn.dataset.d, 10);
        input.value = num(input, 1, 600, 1);
        debounce(function () { analyze(false); }, 120, 'grid');
      });
    });
    el.autoBtn.addEventListener('click', function () {
      resetAlign();
      analyze(true);
    });
    [el.offsetX, el.offsetY].forEach(function (input) {
      input.addEventListener('input', function () {
        debounce(function () { analyze(false); }, 120, 'align');
      });
    });
    el.resetAlignBtn.addEventListener('click', function () {
      resetAlign();
      analyze(false);
    });

    // 配色
    el.thresh.addEventListener('input', function () {
      el.threshOut.textContent = el.thresh.value;
      if (el.fixK.checked) return;
      debounce(function () { analyze(false); }, 220, 'palette');
    });
    el.fixK.addEventListener('change', function () {
      el.kNum.disabled = !el.fixK.checked;
      analyze(false);
    });
    el.kNum.addEventListener('input', function () {
      if (el.fixK.checked) debounce(function () { analyze(false); }, 260, 'palette');
    });
    el.minCount.addEventListener('input', function () {
      debounce(function () { analyze(false); }, 260, 'palette');
    });
    el.mergeBtn.addEventListener('click', function () {
      if (S.selected.size < 2) return;
      var labs = [];
      S.selected.forEach(function (i) { if (S.palette[i]) labs.push(S.palette[i].lab.slice()); });
      S.custom.merges.push({ labs: labs });
      applyCustomAndRender();
      toast('已合并 ' + labs.length + ' 种颜色');
    });
    el.undoMergeBtn.addEventListener('click', function () {
      if (!S.custom.merges.length) return;
      S.custom.merges.pop();
      applyCustomAndRender();
      toast('已撤销上一次颜色合并');
    });

    // 画布
    el.zoom.addEventListener('input', function () {
      el.zoomOut.textContent = el.zoom.value + 'px';
      renderCanvas();
      saveSettings();
    });
    el.weakGridBtn.addEventListener('click', function () {
      S.weakGrid = !S.weakGrid;
      el.weakGridBtn.setAttribute('aria-pressed', String(S.weakGrid));
      renderCanvas();
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { setView(t.dataset.view); });
    });
    el.resultCanvas.addEventListener('mousemove', function (e) { showProbe(probeAt(e)); });
    el.resultCanvas.addEventListener('click', function (e) {
      var hit = probeAt(e);
      if (!hit) return;
      var pos = hit.r * S.cols + hit.c;
      if (S.selectedCells.has(pos)) {
        S.selectedCells.delete(pos);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        S.selectedCells.add(pos);
      } else {
        S.selectedCells.clear();
        S.selectedCells.add(pos);
      }
      renderCanvas();
      renderCellEditor();
      showProbe(hit);
    });
    el.applyCellBtn.addEventListener('click', function () {
      if (!S.selectedCells.size) return;
      var p = S.palette[num(el.cellColor, 0, S.palette.length - 1, 0)];
      if (!p) return;
      S.selectedCells.forEach(function (pos) { S.cellEdits.set(pos, { lab: p.lab.slice() }); });
      var count = S.selectedCells.size;
      applyCustomAndRender();
      toast('已修改 ' + count + ' 格的颜色');
    });
    el.resetCellBtn.addEventListener('click', function () {
      if (!S.selectedCells.size) return;
      var count = S.selectedCells.size;
      S.selectedCells.forEach(function (pos) { S.cellEdits.delete(pos); });
      applyCustomAndRender();
      toast('已恢复所选 ' + count + ' 格的识别颜色');
    });
    el.clearCellSelectionBtn.addEventListener('click', function () {
      S.selectedCells.clear();
      renderCanvas();
      renderCellEditor();
      el.probe.textContent = '已取消全部选择';
    });
    el.rawImg.addEventListener('load', renderGridOverlay);
    window.addEventListener('resize', function () { debounce(renderGridOverlay, 150, 'resize'); });

    // 输出选项
    [el.colDir, el.rowDir, el.optPerCol, el.optBold].forEach(function (c) {
      c.addEventListener('change', function () { renderTextChart(); renderCellEditor(); });
    });

    // 导出
    el.copyBtn.addEventListener('click', function () {
      var text = el.chartOut.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); },
          function () { fallbackCopy(text); });
      } else fallbackCopy(text);
    });
    el.txtBtn.addEventListener('click', function () {
      download(new Blob([el.chartOut.textContent], { type: 'text/plain;charset=utf-8' }), '文字图纸.txt');
    });
    el.mdBtn.addEventListener('click', function () {
      download(new Blob([el.chartOut.textContent], { type: 'text/markdown;charset=utf-8' }), '文字图纸.md');
    });
    el.csvBtn.addEventListener('click', function () {
      if (!S.cells) return toast('还没有识别结果');
      var csv = TextChart.toCSV({ cols: S.cols, rows: S.rows, cells: S.cells, palette: S.palette });
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'grid.csv');
    });
    el.pngBtn.addEventListener('click', function () {
      if (!S.cells) return toast('还没有识别结果');
      el.resultCanvas.toBlob(function (b) { if (b) download(b, 'chart.png'); });
    });

    // 主题
    el.themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      saveSettings();
      renderCanvas();
    });
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); }
    catch (e) { toast('复制失败，请手动选择文本'); }
    ta.remove();
  }

  /* ============================ 启动 ============================ */

  if (!document.documentElement.getAttribute('data-theme') &&
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  loadSettings();
  bind();
  el.threshOut.textContent = el.thresh.value;
  el.zoomOut.textContent = el.zoom.value + 'px';

  // 便于本地调试：devtools 里可以直接看状态
  window.__bead = S;

  // 调试入口：?demo 直接载入示例图纸，?view=raw 直接切到网格校验视图
  var q = new URLSearchParams(location.search);
  if (q.get('view') === 'raw') S.pendingView = 'raw';
  if (q.has('demo')) loadSrc('./demo/sample.jpg');
})();
