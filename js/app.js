/* app.js — UI 控制器。所有图片解析都在本页面完成，没有任何网络请求。 */
(function () {
  'use strict';

  var MAX_ANALYSIS_WIDTH = 2400;   // 分析用画布上限，控制内存与耗时
  var LS_KEY = 'beadchart.settings.v1';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    drop: $('drop'), stage: $('stage'), fileInput: $('fileInput'),
    mode: $('mode'), modeHint: $('modeHint'), dropTitle: $('dropTitle'), dropHint: $('dropHint'),
    gridTitle: $('gridTitle'), resultTab: $('resultTab'), pixelTools: $('pixelTools'), pixelEffects: $('pixelEffects'),
    gridSetupCanvasWrap: $('gridSetupCanvasWrap'), gridSetupZoomOut: $('gridSetupZoomOut'),
    gridSetupDialog: $('gridSetupDialog'), gridSetupViewport: $('gridSetupViewport'), gridSetupZoom: $('gridSetupZoom'),
    openUnitCellBtn: $('openUnitCellBtn'), closeGridSetupBtn: $('closeGridSetupBtn'), gridSetupFitBtn: $('gridSetupFitBtn'),
    chartSampling: $('chartSampling'),
    unitCellSpan: $('unitCellSpan'), unitCellSize: $('unitCellSize'),
    unitCellTools: $('unitCellTools'), selectUnitCellBtn: $('selectUnitCellBtn'), unitCellHint: $('unitCellHint'), unitCellBox: $('unitCellBox'),
    keepRatio: $('keepRatio'), pixelGrid: $('pixelGrid'),
    beadSizeMm: $('beadSizeMm'), physicalSize: $('physicalSize'),
    pixelSampling: $('pixelSampling'),
    pixelLineControls: $('pixelLineControls'), pixelLineStrength: $('pixelLineStrength'), pixelLineStrengthOut: $('pixelLineStrengthOut'),
    colorLibrary: $('colorLibrary'),
    pickBtn: $('pickBtn'), pickBtn2: $('pickBtn2'),
    autoBtn: $('autoBtn'), themeBtn: $('themeBtn'), weakGridBtn: $('weakGridBtn'), fitPreviewBtn: $('fitPreviewBtn'),
    cols: $('cols'), rows: $('rows'),
    offsetX: $('offsetX'), offsetY: $('offsetY'), alignTools: $('alignTools'), resetAlignBtn: $('resetAlignBtn'),
    thresh: $('thresh'), threshOut: $('threshOut'), fixK: $('fixK'), kNum: $('kNum'),
    palette: $('palette'), paletteCount: $('paletteCount'), paletteHint: $('paletteHint'), mergeBtn: $('mergeBtn'), undoMergeBtn: $('undoMergeBtn'),
    resultCanvas: $('resultCanvas'), gridCanvas: $('gridCanvas'),
    rawImg: $('rawImg'), rawWrap: $('rawWrap'),
    paneResult: $('paneResult'), paneRaw: $('paneRaw'), viewport: $('viewport'),
    stageStats: $('stageStats'), probe: $('probe'),
    cellTargetSwatch: $('cellTargetSwatch'), cellEditor: $('cellEditor'), cellEditLabel: $('cellEditLabel'), cellColor: $('cellColor'),
    resetCellBtn: $('resetCellBtn'), clearCellSelectionBtn: $('clearCellSelectionBtn'),
    openCellEditorBtn: $('openCellEditorBtn'),
    cellEditDialog: $('cellEditDialog'),
    cancelCellEditBtn: $('cancelCellEditBtn'),
    doneCellEditBtn: $('doneCellEditBtn'),
    pickCellColorBtn: $('pickCellColorBtn'), pickColorStatus: $('pickColorStatus'),
    editGrid: $('editGrid'),
    editZoom: $('editZoom'),
    undoCellEditBtn: $('undoCellEditBtn'), redoCellEditBtn: $('redoCellEditBtn'),
    editViewport: $('editViewport'),
    editCanvas: $('editCanvas'),
    editReference: $('editReference'),
    zoom: $('zoom'), zoomOut: $('zoomOut'),
    colDir: $('colDir'), rowDir: $('rowDir'),
    optPerCol: $('optPerCol'), outputAxis: $('outputAxis'),
    chartOut: $('chartOut'), chartMeta: $('chartMeta'),
    excelBtn: $('excelBtn'), pngBtn: $('pngBtn'),
    txtBtn: $('txtBtn'),
    toast: $('toast'), busy: $('busy'), perfInfo: $('perfInfo')
  };

  var S = {
    img: null, objectUrl: null,
    mode: 'chart',
    src: null, scale: 1,          // 分析画布 & 相对原图的缩放
    imgData: null, imgDataKey: '', originalImgData: null,
    cols: 100, rows: 77,
    geom: null, detectedGeom: null, // 当前几何与自动识别的基准几何
    base: null,                   // 聚类原始结果
    palette: [], cells: null,
    custom: { merges: [], names: [] },
    selected: new Set(),
    iso: -1, selectedCells: new Set(), cellEdits: new Map(),
    fresh: true, gridKey: '', probeCell: -1,
    view: 'result', weakGrid: false,
    editSession: null, editUndo: [], editRedo: [], pickingColor: false, editTarget: null,
    busyDepth: 0
  };

  // Each processing mode owns its grid and edits for the currently loaded image.
  var modeDrafts = {}, analysisRevision = 0;
  var modeInputs = ['chartSampling', 'unitCellSpan', 'unitCellSize', 'cols', 'rows', 'offsetX', 'offsetY', 'thresh', 'fixK', 'kNum',
    'colorLibrary', 'keepRatio', 'pixelGrid', 'pixelSampling', 'pixelLineStrength',
    'zoom'];

  function saveModeDraft() {
    if (!S.img || !S.base) return;
    var inputs = {};
    modeInputs.forEach(function (key) {
      inputs[key] = { value: el[key].value, checked: el[key].checked };
    });
    modeDrafts[S.mode] = {
      inputs: inputs, cols: S.cols, rows: S.rows, base: S.base,
      geom: S.geom, detectedGeom: S.detectedGeom, gridKey: S.gridKey,
      custom: JSON.parse(JSON.stringify(S.custom)), cellEdits: new Map(S.cellEdits),
      view: S.view, scrollLeft: el.viewport.scrollLeft, scrollTop: el.viewport.scrollTop
    };
  }

  function restoreModeDraft(draft) {
    modeInputs.forEach(function (key) {
      el[key].value = draft.inputs[key].value;
      if (typeof draft.inputs[key].checked === 'boolean') el[key].checked = draft.inputs[key].checked;
    });
    S.cols = draft.cols; S.rows = draft.rows; S.base = draft.base;
    S.geom = draft.geom; S.detectedGeom = draft.detectedGeom; S.gridKey = draft.gridKey;
    S.custom = JSON.parse(JSON.stringify(draft.custom)); S.cellEdits = new Map(draft.cellEdits);
    S.fresh = false;
    prepareCanvas();
    el.threshOut.textContent = el.thresh.value;
    el.zoomOut.textContent = el.zoom.value + 'px';
    el.kNum.disabled = !el.fixK.checked;
    el.thresh.disabled = el.fixK.checked;
    updateLineControls();
    applyCustomAndRender();
    setView(draft.view);
    el.viewport.scrollTo(draft.scrollLeft, draft.scrollTop);
  }

  var ditherEditor = createDitherEditor(S, {
    library: currentLibrary, render: renderCanvas, apply: applyCustomAndRender,
    selection: function (hit) {
      S.editTarget = null; renderCellEditor();
      if (hit) showProbe({ c: hit.c, r: hit.r, idx: S.cells[hit.r * S.cols + hit.c] });
    },
    remember: rememberCellEdit, stopPick: function () { setColorPicking(false); },
    source: function () {
      var id = getImageData();
      return S.mode === 'pixel' ? Pixel.sample(id.data, id.width, id.height, S.cols, S.rows, 'average')
        : sampleOriginalChart();
    }
  });

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
    el.openCellEditorBtn.disabled = !S.cells || S.busyDepth > 0;
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
      Object.keys(debounceTimers).forEach(function (key) { clearTimeout(debounceTimers[key]); });
      cancelUnitCellSelection();
      modeDrafts = {};
      el.unitCellSize.value = '';
      analysisRevision++;
      S.img = img;
      S.originalImgData = null;
      // 空状态允许显示 0；图片载入后网格尺寸必须至少为 1 × 1。
      el.cols.min = el.rows.min = '1';
      el.rawImg.src = src;
      prepareCanvas();
      resetAlign();
      S.geom = S.detectedGeom = null;
      S.fresh = true;
      S.custom = { merges: [], names: [] };
      S.selected.clear();
      ditherEditor.cancel();
      S.cellEdits.clear();
      S.selectedCells.clear();
      S.probeCell = -1;
      el.probe.textContent = '点击：单选 · 再次点击已选格：取消该格 · Shift / Ctrl / ⌘ + 点击：追加多选';
      el.drop.hidden = true;
      el.stage.hidden = false;
      busy(false);
      if (S.mode === 'pixel') defaultPixelSize();
      analyze(S.mode === 'chart');
    };
    img.onerror = function () {
      busy(false);
      toast('图片读取失败');
    };
    img.src = src;
  }

  function prepareCanvas() {
    var nw = S.img.naturalWidth, nh = S.img.naturalHeight;
    S.scale = Math.min(1, MAX_ANALYSIS_WIDTH / Math.max(nw, nh));
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(nw * S.scale));
    cv.height = Math.max(1, Math.round(nh * S.scale));
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = S.mode !== 'pixel' || ['average', 'balanced'].includes(el.pixelSampling.value);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, 0, 0, cv.width, cv.height);
    S.src = cv;
    S.preparedSampling = S.mode === 'pixel' ? el.pixelSampling.value : 'average';
    S.imgData = null;
    S.imgDataKey = '';
  }

  function sampleOriginalChart() {
    // Detection uses the small analysis canvas; sampling always uses unscaled pixels.
    if (!S.originalImgData) {
      var canvas = document.createElement('canvas');
      canvas.width = S.img.naturalWidth; canvas.height = S.img.naturalHeight;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(S.img, 0, 0);
      S.originalImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.height = 1;
    }
    var original = S.originalImgData;
    var sx = original.width / S.src.width, sy = original.height / S.src.height;
    var g = S.geom;
    return Grid.sample(original.data, original.width, original.height, {
      cols: g.cols, rows: g.rows,
      originX: g.originX * sx, originY: g.originY * sy,
      cellW: g.cellW * sx, cellH: g.cellH * sy
    }, 0.30, el.chartSampling.value);
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

  function validGridInput(input) {
    var value = Number(input.value);
    return input.value.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 600;
  }

  function syncGridSize(changed) {
    if (!S.img || !el.keepRatio.checked) return;
    if (!validGridInput(el[changed])) return;
    var ratio = S.img.naturalWidth / S.img.naturalHeight;
    var cols = num(el.cols, 1, 600, 52), rows = num(el.rows, 1, 600, 52);
    if (changed === 'rows') {
      cols = Math.max(1, Math.round(rows * ratio));
      if (cols > 600) { cols = 600; rows = Math.max(1, Math.round(cols / ratio)); }
    } else {
      rows = Math.max(1, Math.round(cols / ratio));
      if (rows > 600) { rows = 600; cols = Math.max(1, Math.round(rows * ratio)); }
    }
    el.cols.value = cols;
    el.rows.value = rows;
  }

  function defaultPixelSize() {
    var ratio = S.img.naturalWidth / S.img.naturalHeight;
    el.cols.value = 52;
    el.rows.value = Math.max(1, Math.min(600, Math.round(52 / ratio)));
  }

  function setMode(mode) {
    if (mode === S.mode) return;
    Object.keys(debounceTimers).forEach(function (key) { clearTimeout(debounceTimers[key]); });
    saveModeDraft();
    analysisRevision++;
    cancelUnitCellSelection();
    S.mode = mode === 'pixel' ? 'pixel' : 'chart';
    var pixel = S.mode === 'pixel';
    el.unitCellTools.hidden = el.openUnitCellBtn.hidden = pixel;
    el.autoBtn.hidden = !pixel;
    document.querySelectorAll('[data-section-number]').forEach(function (node) {
      node.textContent = String(Number(node.dataset.sectionNumber) + (pixel && Number(node.dataset.sectionNumber) >= 3 ? 1 : 0)).padStart(2, '0');
    });
    el.pixelTools.hidden = el.pixelEffects.hidden = !pixel;
    el.gridTitle.textContent = pixel ? '像素尺寸' : '网格参数';
    el.resultTab.textContent = pixel ? '像素图预览' : '识别结果';
    el.modeHint.textContent = pixel ? '上传图片，转成像素图，并生成图纸或文字图纸' : '上传像素图，生成图纸或文字图纸';
    el.dropTitle.textContent = pixel ? '把照片或插画拖进来' : '把图纸拖进来';
    el.dropHint.textContent = pixel ? '建议使用主体清晰、背景简洁的图片，提前裁掉无关区域，便于保留主要轮廓和细节。' : '建议使用清晰、端正的图纸，提前裁掉无关边框、标题和图例，方便识别。';
    el.busy.lastChild.textContent = pixel ? '正在生成像素图…' : '正在识别…';
    S.selectedCells.clear();
    S.probeCell = -1;
    if (modeDrafts[S.mode]) {
      restoreModeDraft(modeDrafts[S.mode]);
      return;
    }
    S.base = null;
    S.geom = S.detectedGeom = null;
    resetAlign();
    S.cellEdits.clear();
    S.selectedCells.clear();
    S.probeCell = -1;
    el.probe.textContent = '点击：单选 · 再次点击已选格：取消该格 · Shift / Ctrl / ⌘ + 点击：追加多选';
    S.custom = { merges: [], names: [] };
    S.fresh = true;
    setView('result');
    if (S.img) {
      if (pixel) defaultPixelSize();
      analyze(!pixel);
    }
  }

  function analyze(withDetect) {
    if (!S.img) return;
    var revision = ++analysisRevision;
    busy(true);
    requestAnimationFrame(function () {
      if (revision !== analysisRevision) { busy(false); return; }
      var t0 = performance.now();
      try {
        // Leave incomplete input untouched, including when an earlier render was queued.
        if (!withDetect && (!validGridInput(el.cols) || !validGridInput(el.rows))) return;
        var sampling = S.mode === 'pixel' ? el.pixelSampling.value : 'average';
        if (S.preparedSampling !== sampling) prepareCanvas();
        var id = getImageData();

        if (withDetect && S.mode === 'chart') {
          el.unitCellSize.value = '';
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
        el.cols.value = S.cols;
        el.rows.value = S.rows;
        var gridKey = S.cols + 'x' + S.rows;
        if (S.gridKey && S.gridKey !== gridKey) {
          ditherEditor.cancel();
          S.cellEdits.clear();
          S.selectedCells.clear();
          S.probeCell = -1;
        }
        S.gridKey = gridKey;
        S.geom = fitGeometry(id.width, id.height);

        var raw = S.mode === 'pixel'
          ? Pixel.sample(id.data, id.width, id.height, S.cols, S.rows, el.pixelSampling.value, +el.pixelLineStrength.value)
          : sampleOriginalChart();
        var options = {
          mode: el.fixK.checked ? 'k' : 'thresh',
          thresh: num(el.thresh, 3, 45, 12),
          k: num(el.kNum, 2, Palette.MAX_COLORS, 12),
          minCount: 1
        };
        options.cluster = true;
        var library = currentLibrary();
        var nextBase = S.mode === 'pixel'
          ? Pixel.build(raw, options, library ? library.colors : null)
          : Palette.build(raw, options);
        replaceAnalysisBase(nextBase);

        applyCustomAndRender();
        el.perfInfo.textContent = (S.mode === 'pixel' ? '像素化耗时 ' : '识别耗时 ') + Math.round(performance.now() - t0) + ' ms';
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
    if (S.mode === 'pixel') return {
      cols: S.cols, rows: S.rows, originX: 0, originY: 0,
      cellW: W / S.cols, cellH: H / S.rows
    };
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

  function replaceAnalysisBase(next) {
    var previous = S.base;
    var samePalette = previous && previous.palette.length === next.palette.length &&
      previous.palette.every(function (p, i) {
        var q = next.palette[i];
        return p.count === q.count && p.rgb.every(function (v, channel) { return v === q.rgb[channel]; });
      });
    // A merge belongs to the palette the user selected. Nearest-color replay on a
    // different clustering can turn a removed gray into black and merge it with white.
    if (!samePalette && S.custom.merges.length) {
      S.custom.merges = [];
      S.showMergeResult = false;
      S.mergeResultKey = null;
      toast('色卡已重新计算，旧的手动合并已重置，请按新色卡重新选择');
    }
    S.base = next;
  }

  function applyDisplayedMerges(base, custom, library) {
    var out = library ? ColorLibrary.match(base, library.colors) : base;
    // Replay each operation on the palette visible after the previous operation.
    custom.merges.forEach(function (merge) {
      out = Palette.applyCustom(out.palette, out.cells, { merges: [merge], names: [] });
      if (library) out = ColorLibrary.match(out, library.colors);
    });
    if (custom.names.length) {
      out = Palette.applyCustom(out.palette, out.cells, { merges: [], names: custom.names });
      if (library) out = ColorLibrary.match(out, library.colors);
    }
    return out;
  }

  /** 合并 / 改名不需要重新采样，只在聚类结果上做后处理 */
  function applyCustomAndRender() {
    if (!S.base) return;
    var library = currentLibrary();
    var out = applyDisplayedMerges(S.base, S.custom, library);
    S.mergeResultKey = null;
    var latestMerge = S.custom.merges[S.custom.merges.length - 1];
    if (S.showMergeResult && latestMerge && Number.isInteger(latestMerge.sourceCell)) {
      var result = out.palette[out.cells[latestMerge.sourceCell]];
      if (result) S.mergeResultKey = result.code || result.hex;
    }
    S.palette = out.palette.map(function (p) { return Object.assign({}, p); });
    S.cells = new Int16Array(out.cells);
    applyCellEdits();
    if (library) S.palette.forEach(function (p) {
      var named = S.custom.names.find(function (n) { return n.code === p.code; });
      if (named) p.name = named.name;
    });
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
    var library = currentLibrary();
    S.cellEdits.forEach(function (edit, pos) {
      if (pos < 0 || pos >= S.cells.length) return;
      if (library && edit.code) {
        var entry = library.colors.find(function (p) { return p.code === edit.code; });
        if (entry) {
          var index = S.palette.findIndex(function (p) { return p.code === entry.code; });
          if (index < 0) { index = S.palette.length; S.palette.push(Object.assign({}, entry, { count: 0 })); }
          S.cells[pos] = index;
          return;
        }
      }
      var best = 0, dist = Infinity;
      for (var i = 0; i < S.palette.length; i++) {
        var d = Color.deltaE(edit.lab, S.palette[i].lab);
        if (d < dist) { dist = d; best = i; }
      }
      S.cells[pos] = best;
    });
    S.palette.forEach(function (p) { p.count = 0; });
    for (var j = 0; j < S.cells.length; j++) {
      if (S.palette[S.cells[j]]) {
        S.palette[S.cells[j]].count++;
      }
    }
    // 改色后删除不再使用的色号，并同步格子索引。
    var remap = [], used = [];
    S.palette.forEach(function (p, i) { if (p.count) { remap[i] = used.length; used.push(p); } });
    for (var t = 0; t < S.cells.length; t++) S.cells[t] = remap[S.cells[t]];
    S.palette = used;
  }

  /* ============================ 渲染 ============================ */

  function beadSizeMm() {
    var value = Number(el.beadSizeMm.value);
    return Number.isFinite(value) && value >= 0.01 && el.beadSizeMm.validity.valid ? value : 0;
  }

  function formatMm(value) { return String(Number(value.toFixed(3))); }

  function renderPhysicalSize() {
    var mm = beadSizeMm();
    el.physicalSize.textContent = !mm ? '输入格子大小后计算成品宽度和高度。' :
      !S.img || !S.cells ? '导入图片后计算成品宽度和高度。' :
      '成品宽 ' + formatMm(S.cols * mm) + ' mm × 高 ' + formatMm(S.rows * mm) + ' mm';
  }

  function renderStats() {
    renderPhysicalSize();
    if (!S.img) return;
    var cell = S.geom ? (S.geom.cellW / S.scale).toFixed(1) : '?';
    el.stageStats.innerHTML =
      '<span>原图 <b>' + S.img.naturalWidth + ' × ' + S.img.naturalHeight + '</b> px</span>' +
      '<span>网格 <b>' + S.cols + '</b> 列 × <b>' + S.rows + '</b> 行 = <b>' + (S.cols * S.rows) + '</b> 颗</span>' +
      (S.mode === 'pixel' && beadSizeMm() ?
        '<span>每格 <b>' + formatMm(beadSizeMm()) + '</b> mm</span><span>成品宽 <b>' + formatMm(S.cols * beadSizeMm()) + '</b> × 高 <b>' + formatMm(S.rows * beadSizeMm()) + '</b> mm</span>' :
        '<span>每格约 <b>' + cell + '</b> px</span>') +
      '<span>最终 <b>' + S.palette.length + '</b> 种颜色</span>';
  }

  function clearPaletteHighlight() {
    if (S.iso < 0) return;
    S.iso = -1;
    renderCanvas();
  }

  function bindPaletteHighlight() {
    // Replacing rows can fire enter events without deliberate pointer movement.
    // Resolve the current row only on a real move, never retain a removed row's index.
    document.addEventListener('pointermove', function (e) {
      var row = e.target.closest && e.target.closest('.pal-row');
      var index = -1;
      if (e.pointerType !== 'touch' && !e.buttons && row && el.palette.contains(row)) {
        var candidate = Number(row.dataset.i);
        if (Number.isInteger(candidate) && candidate >= 0 && candidate < S.palette.length) index = candidate;
      }
      if (S.iso !== index) { S.iso = index; renderCanvas(); }
    });
    el.palette.addEventListener('pointerleave', clearPaletteHighlight);
    document.addEventListener('pointerdown', clearPaletteHighlight, true);
    document.addEventListener('pointercancel', clearPaletteHighlight);
    window.addEventListener('blur', clearPaletteHighlight);
  }

  function renderPalette() {
    var frag = document.createDocumentFragment();
    var library = currentLibrary();
    el.paletteCount.textContent = S.palette.length + ' 色';
    // 只排列色卡显示顺序；保留底层索引供选色、画布定位和合并使用。
    var ordered = S.palette.map(function (p, i) {
      var hsl = Color.rgbToHsl(p.rgb);
      var group = hsl[1] < 0.12 || hsl[2] < 0.08 || hsl[2] > 0.94 ? 12 : Math.floor(((hsl[0] + 15) % 360) / 30);
      return { p: p, i: i, hsl: hsl, group: group };
    });
    ordered.sort(function (a, b) {
      return a.group - b.group || a.p.lab[0] - b.p.lab[0] || a.hsl[0] - b.hsl[0] || a.i - b.i;
    });
    ordered.forEach(function (entry) {
      var p = entry.p, i = entry.i;
      var row = document.createElement('div');
      row.className = 'pal-row';
      if ((p.code || p.hex) === S.mergeResultKey) {
        row.classList.add('merge-result');
        row.title = '最近一次合并的结果';
      }
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
      sw.title = p.code || p.name;

      var n = document.createElement('span');
      n.className = 'pal-n';
      n.textContent = p.count + ' 颗';

      var nameWrap = document.createElement('div');
      nameWrap.className = 'pal-name';
      if (library && p.code) {
        nameWrap.appendChild(span(p.code, 'pal-code'));
        cb.setAttribute('aria-label', '选择色号 ' + p.code);
      } else {
        var name = document.createElement('input');
        name.type = 'text'; name.value = p.name; name.spellcheck = false;
        name.setAttribute('aria-label', '颜色名称');
        name.addEventListener('input', function () {
          p.name = name.value;
          rememberName(p);
          renderTextChart();
        });
        nameWrap.appendChild(name);
        cb.setAttribute('aria-label', '选择颜色 ' + p.name);
      }
      row.appendChild(cb); row.appendChild(sw); row.appendChild(nameWrap); row.appendChild(n);
      frag.appendChild(row);
    });
    el.palette.replaceChildren(frag);
    el.mergeBtn.disabled = true;
    el.undoMergeBtn.disabled = S.custom.merges.length === 0;
    el.paletteHint.textContent = S.palette.length
      ? (library ? '勾选两种及以上颜色可合并：数量多的颜色影响更大，结果匹配为最接近的库内色号，也可能是第三种色号。' : '按色系排列；改名后文字图纸实时更新，勾选两个及以上颜色可合并。')
      : '等待识别结果。';
  }

  function rememberName(p) {
    var list = S.custom.names;
    for (var i = 0; i < list.length; i++) {
      if (p.code ? list[i].code === p.code : Color.deltaE(list[i].lab, p.lab) < 4) { list[i].name = p.name; return; }
    }
    list.push({ lab: p.lab.slice(), name: p.name, code: p.code });
  }

  /** 只在整张图纸放不下时缩小格子；用户自己调过的更大值不会被强行改掉 */
  function shrinkZoomToFit() {
    var avail = el.viewport.clientWidth - 20;
    if (avail <= 0 || !S.cols) return;
    var cur = Math.max(0.1, Math.min(26, Number(el.zoom.value) || 10));
    if (S.cols * cur <= avail) return;
    var cs = Math.max(3, Math.min(26, Math.floor(avail / S.cols)));
    el.zoom.value = cs;
    el.zoomOut.textContent = cs + 'px';
  }

  function renderCanvas() {
    drawCells(el.resultCanvas, Math.max(0.1, Math.min(26, Number(el.zoom.value) || 10)), false);
    if (el.cellEditDialog.open) renderEditCanvas();
  }

  function syncEditPanSpace() {
    if (!el.cellEditDialog.open) return;
    var wrap = el.editCanvas.parentElement;
    var horizontal = el.editViewport.clientWidth / 2;
    var vertical = el.editViewport.clientHeight / 2;
    var oldX = parseFloat(wrap.style.paddingLeft) || 16;
    var oldY = parseFloat(wrap.style.paddingTop) || 16;
    wrap.style.paddingLeft = wrap.style.paddingRight = horizontal + 'px';
    wrap.style.paddingTop = wrap.style.paddingBottom = vertical + 'px';
    // Preserve the viewed image location when the dialog is resized.
    el.editViewport.scrollLeft += horizontal - oldX;
    el.editViewport.scrollTop += vertical - oldY;
  }

  function renderEditCanvas() {
    syncEditPanSpace();
    var cs = num(el.editZoom, 2, Number(el.editZoom.max), 8);
    drawCells(el.editCanvas, cs, true);
    scheduleEditReference();
  }

  function editReferencePlacement(size, cellSize, center) {
    var g = S.geom;
    // Match one source grid cell to one editor cell, including alignment offsets
    // and independently resized horizontal/vertical source pixels.
    return {
      x: size / 2 - (g.originX / g.cellW + center.x * S.cols) * cellSize,
      y: size / 2 - (g.originY / g.cellH + center.y * S.rows) * cellSize,
      width: S.src.width / g.cellW * cellSize,
      height: S.src.height / g.cellH * cellSize
    };
  }

  var referenceFrame = 0;
  function scheduleEditReference() {
    if (referenceFrame) return;
    referenceFrame = requestAnimationFrame(function () {
      referenceFrame = 0;
      if (!el.cellEditDialog.open || !S.img || !S.geom || !S.src) return;
      var size = 180, dpr = window.devicePixelRatio || 1;
      var cv = el.editReference, ctx = cv.getContext('2d');
      cv.width = cv.height = Math.round(size * dpr);
      ctx.scale(cv.width / size, cv.height / size);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      var viewport = el.editViewport.getBoundingClientRect();
      var center = editImagePoint(viewport.left + el.editViewport.clientWidth / 2,
        viewport.top + el.editViewport.clientHeight / 2);
      var placement = editReferencePlacement(size, Number(el.editZoom.value), center);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(S.img, placement.x, placement.y, placement.width, placement.height);
    });
  }

  function drawCells(cv, cs, editor) {
    if (!S.cells) return;
    cv.width = Math.round(S.cols * cs);
    cv.height = Math.round(S.rows * cs);

    var ctx = cv.getContext('2d');
    var css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--sunken').trim() || '#eceaea';
    ctx.fillRect(0, 0, cv.width, cv.height);

    for (var r = 0; r < S.rows; r++) {
      for (var c = 0; c < S.cols; c++) {
        var idx = S.cells[r * S.cols + c];
        var p = S.palette[idx];
        if (!p) continue;
        ctx.globalAlpha = (editor || S.iso < 0 || S.iso === idx) ? 1 : 0.12;
        ctx.fillStyle = editor && ditherEditor.color(r * S.cols + c) ? ditherEditor.color(r * S.cols + c).hex : p.hex;
        // Shared integer boundaries prevent antialiased seams at fractional zoom.
        var left = Math.round(c * cs), top = Math.round(r * cs);
        ctx.fillRect(left, top, Math.round((c + 1) * cs) - left, Math.round((r + 1) * cs) - top);
      }
    }
    ctx.globalAlpha = 1;

    if (editor ? el.editGrid.checked : (S.mode !== 'pixel' || el.pixelGrid.checked)) {
      ctx.strokeStyle = editor ? 'rgba(0,0,0,.16)' : (S.weakGrid ? 'rgba(0,0,0,.4)' : '#000');
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gc = 1; gc < S.cols; gc++) {
        var gx = Math.round(gc * cs) - 0.5;
        ctx.moveTo(gx, 0); ctx.lineTo(gx, cv.height);
      }
      for (var gr = 1; gr < S.rows; gr++) {
        var gy = Math.round(gr * cs) - 0.5;
        ctx.moveTo(0, gy); ctx.lineTo(cv.width, gy);
      }
      ctx.stroke();

      // Strong five-cell guides make chart counting easier without changing bead colors.
      if (!editor && S.mode === 'chart' && !S.weakGrid) {
        ctx.fillStyle = '#000';
        var guideWidth = cs >= 6 ? 2 : 1;
        if (cs >= 6) {
          for (var majorCol = 5; majorCol < S.cols; majorCol += 5) {
            ctx.fillRect(Math.round(majorCol * cs) - 1, 0, guideWidth, cv.height);
          }
          for (var majorRow = 5; majorRow < S.rows; majorRow += 5) {
            ctx.fillRect(0, Math.round(majorRow * cs) - 1, cv.width, guideWidth);
          }
        }
        ctx.fillRect(0, 0, cv.width, guideWidth);
        ctx.fillRect(0, cv.height - guideWidth, cv.width, guideWidth);
        ctx.fillRect(0, 0, guideWidth, cv.height);
        ctx.fillRect(cv.width - guideWidth, 0, guideWidth, cv.height);
      }
    }

    if (editor && ditherEditor.previewing()) return;
    ctx.fillStyle = css.getPropertyValue('--accent').trim() || '#009546';
    var edgeWidth = Math.min(cs / 2, Math.min(3, Math.max(2, cs / 4)));
    S.selectedCells.forEach(function (pos) {
      if (pos < 0 || pos >= S.cells.length) return;
      var r = Math.floor(pos / S.cols), c = pos % S.cols;
      var x = c * cs, y = r * cs;
      // Only exposed edges belong to the selection outline; shared edges stay clear.
      if (r === 0 || !S.selectedCells.has(pos - S.cols)) ctx.fillRect(x, y, cs, edgeWidth);
      if (r === S.rows - 1 || !S.selectedCells.has(pos + S.cols)) ctx.fillRect(x, y + cs - edgeWidth, cs, edgeWidth);
      if (c === 0 || !S.selectedCells.has(pos - 1)) ctx.fillRect(x, y, edgeWidth, cs);
      if (c === S.cols - 1 || !S.selectedCells.has(pos + 1)) ctx.fillRect(x + cs - edgeWidth, y, edgeWidth, cs);
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
      { cols: S.cols, rows: S.rows, cells: S.cells, palette: S.palette,
        libraryName: currentLibrary() ? currentLibrary().name : '' },
      currentOpts()
    );
    el.chartOut.textContent = text;
    el.chartMeta.textContent = (el.outputAxis.value === 'row' ? S.rows + ' 行' : S.cols + ' 列') + ' · ' + S.palette.length + ' 色 · ' + text.length + ' 字';
    saveSettings();
  }

  function updateOutputOptions() {
    var byRow = el.outputAxis.value === 'row';
    $('colDirLabel').textContent = byRow ? '每行串珠顺序' : '列的编号方向';
    $('rowDirLabel').textContent = byRow ? '行的编号方向' : '每列串珠顺序';
    $('perLineLabel').textContent = '输出「每' + (byRow ? '行' : '列') + '各色用量」';
    var horizontal = $('horizontalOrderField');
    var vertical = el.rowDir.closest('.field');
    if (byRow) horizontal.before(vertical);
    else vertical.before(horizontal);
  }

  function currentOpts() {
    return {
      colDir: el.colDir.value,
      rowDir: el.rowDir.value,
      perCol: el.optPerCol.checked,
      axis: el.outputAxis.value
    };
  }

  /* ============================ 探针 ============================ */

  function probeAt(ev, canvas) {
    if (!S.cells) return;
    var rect = (canvas || el.resultCanvas).getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
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
    el.probe.hidden = false;
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

    var parts = [sw, pos, span(p.code || p.name, 'probe-color')];
    if (S.selectedCells.has(hit.r * S.cols + hit.c)) parts.push(span('已选中，可擦除选区或取消全选', 'probe-note'));
    el.probe.replaceChildren.apply(el.probe, parts);
  }

  function setColorPicking(active) {
    S.pickingColor = active;
    el.pickCellColorBtn.setAttribute('aria-pressed', String(active));
    el.editViewport.classList.toggle('picking-color', active);
    el.pickColorStatus.hidden = !active;
    el.pickColorStatus.textContent = active ? '点击图中颜色，立即修改已选格子；再次点击吸色按钮可退出。' : '';
  }

  function renderCellEditor() {
    el.openCellEditorBtn.disabled = !S.cells || S.busyDepth > 0;
    el.undoCellEditBtn.disabled = !S.editUndo.length;
    el.redoCellEditBtn.disabled = !S.editRedo.length;
    var valid = !!S.cells && S.selectedCells.size > 0;
    el.clearCellSelectionBtn.disabled = !valid;
    el.cellColor.disabled = !valid;
    el.pickCellColorBtn.disabled = !valid;

    el.resetCellBtn.disabled = !S.cellEdits.size;
    el.probe.hidden = S.probeCell < 0;
    el.cellTargetSwatch.style.background = 'transparent';
    el.cellColor.replaceChildren();
    if (!valid) {
      el.cellEditLabel.textContent = '已选中 0 格';
    } else el.cellEditLabel.textContent = '已选中 ' + S.selectedCells.size + ' 格';
    if (!S.cells) return;
    var first = S.selectedCells.values().next().value;
    var sameColor = valid, firstColor = S.cells[first];
    S.selectedCells.forEach(function (pos) { if (S.cells[pos] !== firstColor) sameColor = false; });
    var library = currentLibrary();
    var options = library ? library.colors : S.palette;
    if (!valid || (!sameColor && !S.editTarget)) {
      var placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
      placeholder.textContent = valid ? '多种颜色 · 选择新颜色' : '请先选择格子';
      el.cellColor.appendChild(placeholder);
    }
    options.forEach(function (p, i) {
      var option = document.createElement('option');
      option.value = library ? p.code : i;
      option.textContent = p.code || p.name;
      option.style.backgroundColor = p.hex;
      option.style.color = p.rgb[0] * 0.299 + p.rgb[1] * 0.587 + p.rgb[2] * 0.114 > 145 ? '#111' : '#fff';
      option.selected = S.editTarget ? (library ? p.code : p.hex) === S.editTarget
        : sameColor && (library ? p.code === S.palette[firstColor].code : i === firstColor);
      el.cellColor.appendChild(option);
    });
    var chosen = el.cellColor.value === '' ? null : (library ? options.find(function (p) { return p.code === el.cellColor.value; }) : options[Number(el.cellColor.value)]);
    el.cellTargetSwatch.style.background = chosen ? chosen.hex : 'transparent';
    var menu = $('cellColorOptions'), toggle = $('cellColorToggle');
    toggle.disabled = !valid;
    toggle.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    $('cellColorText').textContent = chosen ? (chosen.code || chosen.name) : valid ? '选择颜色' : '请选择格子';
    menu.replaceChildren();
    options.forEach(function (p, i) {
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'cell-color-option';
      button.setAttribute('role', 'option');
      var value = String(library ? p.code : i);
      button.setAttribute('aria-selected', String(el.cellColor.value === value));
      var swatch = span('', 'sw'); swatch.style.background = p.hex;
      swatch.setAttribute('aria-hidden', 'true');
      button.appendChild(swatch); button.appendChild(span(p.code || p.name));
      button.addEventListener('click', function () {
        el.cellColor.value = value;
        el.cellColor.dispatchEvent(new Event('change', { bubbles: true }));
        toggle.focus();
      });
      menu.appendChild(button);
    });
  }

  function handleEditShortcut(e) {
    if (!el.cellEditDialog.open || e.isComposing || e.altKey ||
        e.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return;
    var key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (e.shiftKey || (key !== 'z' && key !== 'd')) return;
      e.preventDefault();
      if (!e.repeat) (key === 'z' ? el.undoCellEditBtn : el.clearCellSelectionBtn).click();
      return;
    }
    if (!['+', '=', '-', '−'].includes(key)) return;
    e.preventDefault();
    var rect = el.editViewport.getBoundingClientRect();
    zoomEditAt(Number(el.editZoom.value) + (key === '-' || key === '−' ? -1 : 1),
      rect.left + el.editViewport.clientWidth / 2, rect.top + el.editViewport.clientHeight / 2);
  }

  // Keep the image point under the gesture fixed while changing canvas size.
  function editImagePoint(x, y) {
    var rect = el.editCanvas.getBoundingClientRect();
    return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
  }

  function zoomEditAt(value, x, y, point) {
    point = point || editImagePoint(x, y);
    el.editZoom.value = Math.max(2, Math.min(Number(el.editZoom.max), Math.round(value)));
    renderEditCanvas();
    var rect = el.editCanvas.getBoundingClientRect();
    el.editViewport.scrollLeft += rect.left + point.x * rect.width - x;
    el.editViewport.scrollTop += rect.top + point.y * rect.height - y;
  }

  function fitEditCanvas() {
    el.editZoom.value = Math.max(2, Math.min(Number(el.editZoom.max), Math.floor(Math.min(
      (el.editViewport.clientWidth - 32) / S.cols,
      (el.editViewport.clientHeight - 32) / S.rows))));
    renderEditCanvas();
    el.editViewport.scrollTo(
      (el.editViewport.scrollWidth - el.editViewport.clientWidth) / 2,
      (el.editViewport.scrollHeight - el.editViewport.clientHeight) / 2);
  }

  function openCellEditor(hit) {
    if (!S.cells || S.busyDepth || el.cellEditDialog.open) return;
    S.editSession = new Map(S.cellEdits);
    S.editUndo = []; S.editRedo = [];
    S.selectedCells.clear();
    ditherEditor.reset();
    S.probeCell = -1;
    el.probe.textContent = '请涂抹选择要修改的格子';
    el.editGrid.checked = true;
    S.editTarget = null;
    setColorPicking(false);
    el.editZoom.max = Math.max(2, Math.min(24, Math.floor(4096 / Math.max(S.cols, S.rows))));
    if (hit) { S.selectedCells.add(hit.r * S.cols + hit.c); showProbe(hit); }
    el.cellEditDialog.showModal();
    document.body.classList.add('editing-cells');
    renderCellEditor();
    fitEditCanvas();
  }

  function closeCellEditor(save) {
    if (!el.cellEditDialog.open) return;
    if (save) ditherEditor.apply();
    ditherEditor.cancel();
    var original = S.editSession;
    S.editSession = null;
    S.editUndo = []; S.editRedo = [];
    setColorPicking(false);
    S.selectedCells.clear();
    S.probeCell = -1;
    el.cellEditDialog.close();
    document.body.classList.remove('editing-cells');
    if (!save) { S.cellEdits = original; applyCustomAndRender(); }
    else { renderCanvas(); renderCellEditor(); }
    el.openCellEditorBtn.focus();
  }

  function applySelectedCellColor(color) {
    if (!color || !S.selectedCells.size) return;
    ditherEditor.cancel();
    var changed = Array.from(S.selectedCells).some(function (pos) {
      return S.palette[S.cells[pos]].hex !== color.hex;
    });
    if (!changed) { renderCellEditor(); return; }
    rememberCellEdit();
    S.selectedCells.forEach(function (pos) {
      S.cellEdits.set(pos, { lab: color.lab.slice(), code: color.code });
    });
    applyCustomAndRender();
    toast('已修改 ' + S.selectedCells.size + ' 格的颜色');
  }

  function restoreCellEdit(redo) {
    var source = redo ? S.editRedo : S.editUndo;
    var destination = redo ? S.editUndo : S.editRedo;
    if (!source.length) return;
    ditherEditor.cancel();
    destination.push(new Map(S.cellEdits));
    S.cellEdits = source.pop();
    S.editTarget = null;
    setColorPicking(false);
    applyCustomAndRender();
  }

  function rememberCellEdit() {
    if (!S.editSession) return;
    S.editRedo = [];
    S.editUndo.push(new Map(S.cellEdits));
    if (S.editUndo.length > 50) S.editUndo.shift();
  }

  /* ============================ 视图切换 ============================ */

  function setView(v) {
    if (v !== 'raw') cancelUnitCellSelection();
    S.view = v;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.view === v);
      t.setAttribute('aria-selected', String(t.dataset.view === v));
    });
    el.paneResult.hidden = v !== 'result';
    el.paneRaw.hidden = v !== 'raw';
    if (v === 'raw') requestAnimationFrame(renderGridOverlay);
  }

  function renderPreviewZoom() {
    el.zoomOut.textContent = el.zoom.value + 'px';
    el.gridSetupZoom.value = el.zoom.value;
    el.gridSetupZoomOut.textContent = el.zoom.value + 'px';
    renderCanvas();
    if (S.img && S.cols) {
      el.rawImg.style.width = (S.cols * Number(el.zoom.value)) + 'px';
      el.rawImg.style.height = 'auto';
      renderGridOverlay();
    }
    saveSettings();
  }

  function fitPreview(inDialog) {
    var viewport = inDialog === true ? el.gridSetupViewport : el.viewport;
    if (!S.img || !S.cells) return;
    var style = getComputedStyle(viewport);
    var width = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    var height = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    var imageRows = (inDialog === true || S.view === 'raw') ? S.cols * S.img.naturalHeight / S.img.naturalWidth : S.rows;
    el.zoom.value = Math.max(0.1, Math.min(26, Math.floor(Math.min(width / S.cols, height / imageRows) * 10) / 10));
    renderPreviewZoom();
    viewport.scrollTo(0, 0);
  }

  var unitCellSelection = false, unitCellDrag = null;

  function cancelUnitCellSelection() {
    var drag = unitCellDrag;
    unitCellSelection = false;
    unitCellDrag = null;
    if (drag && el.rawWrap.hasPointerCapture(drag.id)) el.rawWrap.releasePointerCapture(drag.id);
    el.rawWrap.classList.remove('selecting-unit');
    el.unitCellBox.hidden = true;
    el.selectUnitCellBtn.textContent = '框选单位格';
    el.selectUnitCellBtn.setAttribute('aria-pressed', 'false');
  }

  function applyUnitCellSize(value, fromSelection) {
    if (!S.img || S.mode !== 'chart' || !Number.isFinite(value) || value <= 0) return false;
    var side = Math.round(value * 10) / 10;
    if (side < 0.1 || side > Math.min(S.img.naturalWidth, S.img.naturalHeight)) {
      toast('边长须在 0.1 像素与原图短边之间'); return false;
    }
    var cols = Math.max(1, Math.round(S.img.naturalWidth / side));
    var rows = Math.max(1, Math.round(S.img.naturalHeight / side));
    if (cols > 600 || rows > 600) { toast('行列数不能超过 600，请增大单位格边长'); return false; }
    clearTimeout(debounceTimers.grid);
    clearTimeout(debounceTimers.align);
    el.unitCellSize.value = side.toFixed(1);
    el.cols.value = cols; el.rows.value = rows;
    el.keepRatio.checked = false;
    // Retain the measured spacing even when a 0.1px adjustment keeps counts unchanged.
    S.detectedGeom = { cols: cols, rows: rows, originX: 0, originY: 0,
      cellW: side * S.scale, cellH: side * S.scale };
    if (fromSelection) resetAlign();
    el.unitCellHint.textContent = '单位格 ' + side.toFixed(1) + ' × ' + side.toFixed(1) +
      ' 原图像素，已设为 ' + cols + ' 列 × ' + rows + ' 行。';
    analyze(false);
    return true;
  }

  function bindUnitCellSelection() {
    function selectionSpan() {
      var span = Number(el.unitCellSpan.value);
      return span === 5 || span === 10 ? span : 1;
    }
    function selectionHint() {
      var span = selectionSpan();
      el.unitCellHint.textContent = '框出连续的 ' + span + ' × ' + span +
        ' 格，选框始终保持正方形；松开后按 ' + span + ' 格均分计算单位格边长。';
    }
    el.unitCellSpan.addEventListener('change', function () {
      cancelUnitCellSelection();
      selectionHint();
    });
    el.unitCellSize.addEventListener('change', function () {
      if (el.unitCellSize.value.trim() === '') return;
      if (!applyUnitCellSize(Number(el.unitCellSize.value), false)) {
        el.unitCellSize.value = S.detectedGeom ? (S.detectedGeom.cellW / S.scale).toFixed(1) : '';
      }
    });
    function point(e) {
      var rect = el.rawImg.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
    }
    function squarePoint(e) {
      var a = unitCellDrag.start, b = point(e);
      var W = S.img.naturalWidth, H = S.img.naturalHeight;
      var sx = b.x < a.x ? -1 : 1, sy = b.y < a.y ? -1 : 1;
      var side = Math.max(Math.abs(b.x - a.x) * W, Math.abs(b.y - a.y) * H);
      // Clamp both axes together so the selection stays square at image edges.
      side = Math.min(side, (sx > 0 ? 1 - a.x : a.x) * W,
        (sy > 0 ? 1 - a.y : a.y) * H);
      return { x: a.x + sx * side / W, y: a.y + sy * side / H };
    }
    el.selectUnitCellBtn.addEventListener('click', function () {
      if (unitCellSelection) { cancelUnitCellSelection(); return; }
      if (!S.img) { toast('请先上传图纸'); return; }
      if (S.mode !== 'chart') return;
      unitCellSelection = true;
      el.rawWrap.classList.add('selecting-unit');
      el.selectUnitCellBtn.textContent = '取消框选';
      el.selectUnitCellBtn.setAttribute('aria-pressed', 'true');
      selectionHint();
    });
    el.rawWrap.addEventListener('pointerdown', function (e) {
      if (!unitCellSelection || unitCellDrag || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      unitCellDrag = { id: e.pointerId, start: point(e) };
      el.rawWrap.setPointerCapture(e.pointerId);
    });
    el.rawWrap.addEventListener('pointermove', function (e) {
      if (!unitCellDrag || unitCellDrag.id !== e.pointerId) return;
      var a = unitCellDrag.start, b = squarePoint(e);
      el.unitCellBox.hidden = false;
      el.unitCellBox.style.left = Math.min(a.x, b.x) * 100 + '%';
      el.unitCellBox.style.top = Math.min(a.y, b.y) * 100 + '%';
      el.unitCellBox.style.width = Math.abs(b.x - a.x) * 100 + '%';
      el.unitCellBox.style.height = Math.abs(b.y - a.y) * 100 + '%';
    });
    el.rawWrap.addEventListener('pointerup', function (e) {
      if (!unitCellDrag || unitCellDrag.id !== e.pointerId) return;
      var a = unitCellDrag.start, b = squarePoint(e);
      var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      unitCellDrag = null;
      el.rawWrap.releasePointerCapture(e.pointerId);
      el.unitCellBox.hidden = true;
      if (w * el.rawImg.clientWidth < 3 || h * el.rawImg.clientHeight < 3) {
        toast('选区太小，请放大原图后框出完整的一格'); return;
      }
      if (applyUnitCellSize(w * S.img.naturalWidth / selectionSpan(), true)) cancelUnitCellSelection();
    });
    ['pointercancel', 'lostpointercapture'].forEach(function (name) {
      el.rawWrap.addEventListener(name, function (e) {
        if (unitCellDrag && unitCellDrag.id === e.pointerId) cancelUnitCellSelection();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && unitCellSelection) { e.preventDefault(); cancelUnitCellSelection(); }
    });
  }

  function bindPreviewGestures(viewport, rawOnly) {
    var pointers = new Map(), pinch = null, suppressClick = false, wheel = 0;
    function canvas() { return (rawOnly || S.view === 'raw') ? el.rawImg : el.resultCanvas; }
    function point(x, y) {
      var rect = canvas().getBoundingClientRect();
      return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
    }
    function zoomAt(value, x, y, anchor) {
      anchor = anchor || point(x, y);
      el.zoom.value = Math.max(0.1, Math.min(26, Math.round(value * 10) / 10));
      renderPreviewZoom();
      var rect = canvas().getBoundingClientRect();
      viewport.scrollLeft += rect.left + anchor.x * rect.width - x;
      viewport.scrollTop += rect.top + anchor.y * rect.height - y;
    }
    function startPinch() {
      var pts = Array.from(pointers.values());
      suppressClick = true;
      pinch = { zoom: Number(el.zoom.value), distance: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        point: point((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2) };
    }
    viewport.addEventListener('wheel', function (e) {
      if (!S.cells) return;
      if (!e.ctrlKey && !e.metaKey) { wheel = 0; return; }
      e.preventDefault();
      wheel += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1) * (e.ctrlKey ? 4 : 1);
      var steps = Math.trunc(wheel / 40);
      if (!steps) return;
      wheel -= steps * 40;
      zoomAt(Number(el.zoom.value) - steps, e.clientX, e.clientY);
    }, { passive: false });
    viewport.addEventListener('pointerdown', function (e) {
      if (unitCellSelection || !S.cells || e.button !== 0) return;
      if (!pointers.size) suppressClick = false;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop });
      // Capture on the canvas to retain its normal click-to-edit action.
      e.target.setPointerCapture(e.pointerId);
      if (pointers.size >= 2) startPinch();
      e.preventDefault();
    });
    viewport.addEventListener('pointermove', function (e) {
      var p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && pointers.size >= 2) {
        var pts = Array.from(pointers.values());
        zoomAt(pinch.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / pinch.distance,
          (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, pinch.point);
      } else {
        var dx = p.x - p.startX, dy = p.y - p.startY;
        if (Math.hypot(dx, dy) > 6) suppressClick = true;
        if (suppressClick) {
          viewport.scrollLeft = p.left - dx; viewport.scrollTop = p.top - dy;
        }
      }
    });
    function finish(e) {
      if (!pointers.has(e.pointerId)) return;
      if (e.type !== 'pointerup') suppressClick = true;
      pointers.delete(e.pointerId);
      if (pointers.size >= 2) startPinch();
      else {
        pinch = null;
        pointers.forEach(function (p) {
          p.startX = p.x; p.startY = p.y; p.left = viewport.scrollLeft; p.top = viewport.scrollTop;
        });
      }
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { viewport.addEventListener(name, finish); });
    viewport.addEventListener('click', function (e) {
      if (suppressClick && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ============================ 设置持久化 ============================ */

  function currentLibrary() {
    return ColorLibrary.builtins[el.colorLibrary.value] || null;
  }

  function updateLineControls() {
    el.pixelLineControls.hidden = el.pixelSampling.value !== 'balanced';
    el.pixelLineStrengthOut.textContent = el.pixelLineStrength.value;
  }

  function changeLibrary() {
    S.custom = { merges: [], names: [] };
    S.cellEdits.clear(); S.selectedCells.clear(); S.selected.clear(); S.probeCell = -1;
    el.probe.textContent = '已更换色库，可点击格子指定库内色号';
    if (S.img && S.mode === 'pixel') analyze(false);
    else if (S.base) applyCustomAndRender();
    saveSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        thresh: el.thresh.value, fixK: el.fixK.checked, k: el.kNum.value,
        library: el.colorLibrary.value, chartSampling: el.chartSampling.value,
        pixelSampling: el.pixelSampling.value, pixelSamplingVersion: 3, pixelLineStrength: +el.pixelLineStrength.value,
        beadSizeMm: beadSizeMm() || null,
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
      if (['dominant', 'center'].includes(s.chartSampling)) el.chartSampling.value = s.chartSampling;
      if (Number.isFinite(s.beadSizeMm) && s.beadSizeMm >= 0.01) el.beadSizeMm.value = s.beadSizeMm;
      // 迁移已移除的参考色板设置，回到 MARD 和平衡取样。
      if (s.library === 'web216') {
        s.library = 'mard221'; s.pixelSampling = 'balanced';
        s.pixelSamplingVersion = 3;
      }
      // 已移除的取色选项回到默认效果，避免选择器出现空值。
      if (s.pixelSamplingVersion === 3 && ['balanced', 'lines'].includes(s.pixelSampling)) el.pixelSampling.value = s.pixelSampling;
      if (Number.isFinite(s.pixelLineStrength)) el.pixelLineStrength.value = Math.max(0, Math.min(100, s.pixelLineStrength));
      if (['none', 'mard221', 'mard291'].includes(s.library)) el.colorLibrary.value = s.library;
      if (s.thresh) { el.thresh.value = s.thresh; el.threshOut.textContent = s.thresh; }
      if (s.k) el.kNum.value = s.k;
      if (s.fixK) { el.fixK.checked = true; el.kNum.disabled = false; }
      if (s.zoom) { el.zoom.value = s.zoom; el.zoomOut.textContent = s.zoom + 'px'; }
      if (s.opts) {
        el.colDir.value = s.opts.colDir || 'ltr';
        el.rowDir.value = s.opts.rowDir || 'btt';
        el.optPerCol.checked = s.opts.perCol !== false;
        el.outputAxis.value = s.opts.axis === 'row' ? 'row' : 'column';
      }
      if (s.theme) document.documentElement.setAttribute('data-theme', s.theme);
    } catch (e) { /* 旧版本设置，忽略 */ }
  }

  /* ============================ 事件绑定 ============================ */

  function bind() {
    bindPaletteHighlight();
    el.chartSampling.addEventListener('change', function () {
      saveSettings();
      if (S.mode === 'chart') analyze(false);
    });
    el.beadSizeMm.addEventListener('input', function () { renderStats(); saveSettings(); });
    // Capture runs before the merge button handler, so the click creating a new
    // highlight cannot immediately dismiss it as it bubbles through the page.
    document.addEventListener('click', function (e) {
      if (!S.showMergeResult || e.target.closest('.pal-row.merge-result')) return;
      S.showMergeResult = false;
      S.mergeResultKey = null;
      el.palette.querySelectorAll('.merge-result').forEach(function (row) {
        row.classList.remove('merge-result');
        row.removeAttribute('title');
      });
    }, true);
    el.colorLibrary.addEventListener('change', changeLibrary);
    el.mode.addEventListener('change', function () { setMode(el.mode.value); });
    el.keepRatio.addEventListener('change', function () { syncGridSize('cols'); analyze(false); });
    el.pixelGrid.addEventListener('change', renderCanvas);
    el.pixelSampling.addEventListener('change', function () {
      updateLineControls(); saveSettings();
      if (S.mode === 'pixel') analyze(false);
    });
    el.pixelLineStrength.addEventListener('input', function () {
      updateLineControls(); saveSettings();
      if (S.mode === 'pixel') analyze(false);
    });
    // 选图
    [el.pickBtn, el.pickBtn2].forEach(function (b) {
      b.addEventListener('click', function () { el.fileInput.click(); });
    });
    el.fileInput.addEventListener('change', function (e) {
      loadFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

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
      input.addEventListener('input', function () {
        clearTimeout(debounceTimers.grid);
        if (input.value.trim() === '' && el.keepRatio.checked) {
          el[input.id === 'cols' ? 'rows' : 'cols'].value = '';
          return;
        }
        if (!validGridInput(input)) return;
        syncGridSize(input.id);
        debounce(function () { analyze(false); }, 260, 'grid');
      });
      input.addEventListener('blur', function (e) {
        if (e.relatedTarget && e.relatedTarget.closest('[data-step]')) return;
        if (validGridInput(input)) return;
        var value = Number(input.value);
        input.value = input.value.trim() === '' || !Number.isFinite(value)
          ? (S.img ? S[input.id] : 0)
          : Math.max(S.img ? 1 : 0, Math.min(600, Math.round(value)));
        syncGridSize(input.id);
        debounce(function () { analyze(false); }, 260, 'grid');
      });
    });
    document.querySelectorAll('[data-step]').forEach(function (btn) {
      // Keep pointer presses from restoring a blank field before the click runs.
      btn.addEventListener('pointerdown', function (e) {
        if (e.button === 0) e.preventDefault();
      });
      btn.addEventListener('click', function () {
        var input = el[btn.dataset.step];
        var min = S.img ? 1 : 0;
        var current = input.value.trim() === '' ? 0 : num(input, min, 600, min);
        input.value = current + parseInt(btn.dataset.d, 10);
        input.value = num(input, min, 600, min);
        syncGridSize(input.id);
        debounce(function () { analyze(false); }, 120, 'grid');
      });
    });
    el.autoBtn.addEventListener('click', function () {
      resetAlign();
      if (S.mode === 'pixel' && S.img) defaultPixelSize();
      analyze(S.mode === 'chart');
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
      clearPaletteHighlight();
      el.threshOut.textContent = el.thresh.value;
      if (el.fixK.checked) return;
      debounce(function () { analyze(false); }, 220, 'palette');
    });
    el.fixK.addEventListener('change', function () {
      el.kNum.disabled = !el.fixK.checked;
      el.thresh.disabled = el.fixK.checked;
      analyze(false);
    });
    el.kNum.addEventListener('input', function () {
      if (el.fixK.checked) debounce(function () { analyze(false); }, 260, 'palette');
    });
    el.mergeBtn.addEventListener('click', function () {
      if (S.selected.size < 2) return;
      var keys = [];
      S.selected.forEach(function (i) { if (S.palette[i]) keys.push(S.palette[i].code || S.palette[i].hex); });
      var sourceCell = S.cells.findIndex(function (index) { return S.selected.has(index); });
      S.custom.merges.push({ keys: keys, sourceCell: sourceCell });
      S.showMergeResult = true;
      applyCustomAndRender();
      var resultRow = el.palette.querySelector('.merge-result');
      if (resultRow) resultRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      toast('已合并 ' + keys.length + ' 种颜色');
    });
    el.undoMergeBtn.addEventListener('click', function () {
      if (!S.custom.merges.length) return;
      S.custom.merges.pop();
      applyCustomAndRender();
      toast('已撤销上一次颜色合并');
    });

    // 画布
    el.zoom.addEventListener('input', renderPreviewZoom);
    el.fitPreviewBtn.addEventListener('click', fitPreview);
    bindUnitCellSelection();
    bindPreviewGestures(el.viewport, false);
    bindPreviewGestures(el.gridSetupViewport, true);
    var previewZoomBeforeGridSetup;
    el.openUnitCellBtn.addEventListener('click', function () {
      if (!S.img) { toast('请先上传图纸'); return; }
      if (S.mode !== 'chart') return;
      previewZoomBeforeGridSetup = el.zoom.value;
      el.gridSetupCanvasWrap.appendChild(el.rawWrap);
      el.gridSetupDialog.showModal();
      fitPreview(true);
      el.selectUnitCellBtn.focus();
    });
    el.closeGridSetupBtn.addEventListener('click', function () { el.gridSetupDialog.close(); });
    el.gridSetupDialog.addEventListener('cancel', function (e) {
      if (unitCellSelection) { e.preventDefault(); cancelUnitCellSelection(); }
    });
    el.gridSetupDialog.addEventListener('close', function () {
      cancelUnitCellSelection();
      el.paneRaw.appendChild(el.rawWrap);
      el.zoom.value = previewZoomBeforeGridSetup;
      renderPreviewZoom();
    });
    el.gridSetupZoom.addEventListener('input', function () {
      el.zoom.value = el.gridSetupZoom.value;
      renderPreviewZoom();
    });
    el.gridSetupFitBtn.addEventListener('click', function () { fitPreview(true); });
    el.weakGridBtn.addEventListener('click', function () {
      S.weakGrid = !S.weakGrid;
      el.weakGridBtn.setAttribute('aria-pressed', String(S.weakGrid));
      renderCanvas();
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { setView(t.dataset.view); });
    });
    el.openCellEditorBtn.addEventListener('click', function () { openCellEditor(); });
    el.resultCanvas.addEventListener('click', function (e) { openCellEditor(probeAt(e)); });
    el.resultCanvas.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCellEditor(); }
    });
    el.cancelCellEditBtn.addEventListener('click', function () { closeCellEditor(false); });
    el.doneCellEditBtn.addEventListener('click', function () { closeCellEditor(true); });
    el.cellEditDialog.addEventListener('cancel', function (e) { e.preventDefault(); closeCellEditor(false); });
    el.editZoom.addEventListener('input', renderEditCanvas);
    el.editViewport.addEventListener('scroll', scheduleEditReference, { passive: true });
    new ResizeObserver(function () {
      syncEditPanSpace();
      scheduleEditReference();
    }).observe(el.editViewport);
    el.editGrid.addEventListener('change', renderEditCanvas);
    el.pickCellColorBtn.addEventListener('click', function () { var active = !S.pickingColor; ditherEditor.pause(); setColorPicking(active); });
    var colorPickerIds = ['cellColor', 'ditherBase', 'ditherInk'];
    function closeColorMenu(id) {
      $(id + 'Options').hidden = true;
      $(id + 'Toggle').setAttribute('aria-expanded', 'false');
    }
    colorPickerIds.forEach(function (id) {
      var toggle = $(id + 'Toggle'), menu = $(id + 'Options');
      toggle.addEventListener('click', function () {
        var open = menu.hidden;
        colorPickerIds.forEach(closeColorMenu);
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        var selected = menu.querySelector('[aria-selected="true"]') || menu.firstElementChild;
        if (open && selected) selected.focus();
      });
      menu.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); closeColorMenu(id); toggle.focus();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var next = e.key === 'ArrowDown' ? e.target.nextElementSibling : e.target.previousElementSibling;
          if (next) next.focus();
        }
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.cell-color-picker')) colorPickerIds.forEach(closeColorMenu);
    });
    el.cellColor.addEventListener('change', function () {
      var library = currentLibrary();
      if (!S.selectedCells.size || !el.cellColor.value) return;
      var color = library ? library.colors.find(function (p) { return p.code === el.cellColor.value; }) : S.palette[Number(el.cellColor.value)];
      if (!color) return;
      S.editTarget = library ? color.code : color.hex;
      setColorPicking(false);
      applySelectedCellColor(color);
    });
    el.undoCellEditBtn.addEventListener('click', function () { restoreCellEdit(false); });
    el.redoCellEditBtn.addEventListener('click', function () { restoreCellEdit(true); });
    var editPointers = new Map(), pinch = null, wheelDelta = 0, spacePan = false;
    el.cellEditDialog.addEventListener('keydown', function (e) {
      if (!editPointers.size) handleEditShortcut(e);
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'Space' || e.target.matches('input, select, textarea') || e.target.isContentEditable) return;
      e.preventDefault(); spacePan = true; el.editViewport.classList.add('space-pan');
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space') { spacePan = false; el.editViewport.classList.remove('space-pan'); }
    });
    function startPinch() {
      ditherEditor.abortStroke();
      var points = Array.from(editPointers.values());
      if (points.length < 2) { pinch = null; return; }
      var x = (points[0].x + points[1].x) / 2, y = (points[0].y + points[1].y) / 2;
      editPointers.forEach(function (p) { p.moved = true; p.painted = false; });
      pinch = { distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
        zoom: Number(el.editZoom.value), point: editImagePoint(x, y) };
    }
    function resetGesture() {
      ditherEditor.abortStroke();
      editPointers.clear(); pinch = null; wheelDelta = 0; spacePan = false;
      el.editViewport.classList.remove('space-pan');
      el.editViewport.classList.remove('dragging');
    }
    el.cellEditDialog.addEventListener('close', resetGesture);
    window.addEventListener('blur', resetGesture);
    el.editViewport.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });
    el.editViewport.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) { wheelDelta = 0; return; }
      e.preventDefault();
      var delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.editViewport.clientHeight : 1);
      wheelDelta += delta * (e.ctrlKey ? 4 : 1);
      var steps = Math.trunc(wheelDelta / 40);
      if (!steps) return;
      wheelDelta -= steps * 40;
      zoomEditAt(Number(el.editZoom.value) - steps, e.clientX, e.clientY);
    }, { passive: false });
    el.editViewport.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      el.editViewport.focus({ preventScroll: true });
      var panOnly = spacePan;
      editPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        left: el.editViewport.scrollLeft, top: el.editViewport.scrollTop, moved: false, panOnly: panOnly });
      el.editViewport.setPointerCapture(e.pointerId);
      if (editPointers.size >= 2) startPinch();
      else if (!panOnly && ditherEditor.brush()) { ditherEditor.begin(); ditherEditor.stroke(probeAt(e, el.editCanvas)); editPointers.get(e.pointerId).painted = true; }
      e.preventDefault();
    });
    el.editViewport.addEventListener('pointermove', function (e) {
      var p = editPointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && editPointers.size >= 2) {
        var points = Array.from(editPointers.values());
        var x = (points[0].x + points[1].x) / 2, y = (points[0].y + points[1].y) / 2;
        var distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        zoomEditAt(pinch.zoom * distance / pinch.distance, x, y, pinch.point);
        return;
      }
      if (p.painted) { ditherEditor.stroke(probeAt(e, el.editCanvas)); return; }
      var dx = p.x - p.startX, dy = p.y - p.startY;
      if (Math.hypot(dx, dy) > 6) p.moved = true;
      if (p.moved) {
        el.editViewport.classList.add('dragging');
        el.editViewport.scrollLeft = p.left - dx;
        el.editViewport.scrollTop = p.top - dy;
      }
    });
    function finishPointer(e) {
      var p = editPointers.get(e.pointerId);
      if (!p) return;
      editPointers.delete(e.pointerId);
      if (el.editViewport.hasPointerCapture(e.pointerId)) el.editViewport.releasePointerCapture(e.pointerId);
      if (editPointers.size >= 2) startPinch();
      else {
        pinch = null;
        // The remaining finger can continue panning, but cannot accidentally select.
        editPointers.forEach(function (other) {
          other.startX = other.x; other.startY = other.y;
          other.left = el.editViewport.scrollLeft; other.top = el.editViewport.scrollTop;
          other.moved = true;
        });
      }
      if (!editPointers.size) el.editViewport.classList.remove('dragging');
      if (p.painted) { if (e.type === 'pointercancel') ditherEditor.abortStroke(); else ditherEditor.end(); return; }
      if (e.type !== 'pointerup' || p.moved || p.panOnly) return;
      var hit = probeAt(e, el.editCanvas);
      if (!hit) return;
      if (ditherEditor.pick(hit)) return;
      if (S.pickingColor) {
        var color = S.palette[hit.idx];
        if (!color) return;
        S.editTarget = currentLibrary() ? color.code : color.hex;
        setColorPicking(false);
        applySelectedCellColor(color);
        el.clearCellSelectionBtn.click();
        el.pickColorStatus.textContent = '已用 ' + (color.code || color.name) + ' 修改选中格子。';
        el.pickColorStatus.hidden = false;
        return;
      }

    }
    el.editViewport.addEventListener('pointerup', finishPointer);
    el.editViewport.addEventListener('pointercancel', finishPointer);
    el.editViewport.addEventListener('lostpointercapture', finishPointer);
    el.clearCellSelectionBtn.addEventListener('click', function () {
      S.selectedCells.clear();
      S.editTarget = null;
      S.probeCell = -1;
      setColorPicking(false);
      ditherEditor.selectionChanged();
      el.probe.textContent = '已取消全部选择，请涂抹选择格子';
      renderCanvas();
      renderCellEditor();
    });
    el.resetCellBtn.addEventListener('click', function () {
      var count = S.cellEdits.size;
      if (!count) return;
      rememberCellEdit();
      ditherEditor.cancel();
      S.cellEdits.clear();
      S.editTarget = null;
      setColorPicking(false);
      applyCustomAndRender();
      toast('已恢复全部 ' + count + ' 格的原始颜色');
    });
    el.rawImg.addEventListener('load', renderGridOverlay);
    window.addEventListener('resize', function () { debounce(renderGridOverlay, 150, 'resize'); });

    // 输出选项
    [el.colDir, el.rowDir, el.optPerCol, el.outputAxis].forEach(function (c) {
      c.addEventListener('change', function () {
        updateOutputOptions(); renderTextChart(); renderCellEditor(); saveSettings();
        if (S.probeCell >= 0) showProbe({ r: Math.floor(S.probeCell / S.cols), c: S.probeCell % S.cols, idx: S.cells[S.probeCell] });
      });
    });

    // 导出
    el.txtBtn.addEventListener('click', function () {
      if (!S.cells) return toast('还没有识别结果');
      download(new Blob([el.chartOut.textContent], { type: 'text/plain;charset=utf-8' }), '文字图纸.txt');
    });
    el.excelBtn.addEventListener('click', function () {
      if (!S.cells) return toast('还没有识别结果');
      try {
        download(ExcelExport.build({ cols: S.cols, rows: S.rows, cells: S.cells, palette: S.palette }), '彩色图纸.xlsx');
      } catch (error) {
        console.error(error); toast('Excel 导出失败，请重试');
      }
    });
    var chartExporter = PixelExport.create(S, { mm: beadSizeMm, download: download, toast: toast });
    el.pngBtn.addEventListener('click', chartExporter.open);

    // 主题
    el.themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      saveSettings();
      renderCanvas();
    });
  }

  /* ============================ 启动 ============================ */

  if (!document.documentElement.getAttribute('data-theme') &&
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  loadSettings();
  renderPhysicalSize();
  el.thresh.disabled = el.fixK.checked;
  updateOutputOptions();
  updateLineControls();
  bind();
  el.threshOut.textContent = el.thresh.value;
  el.zoomOut.textContent = el.zoom.value + 'px';

  // 便于本地调试：devtools 里可以直接看状态
  window.__bead = S;

  // 调试入口：?view=raw 在上传图片后切到原图视图
  var q = new URLSearchParams(location.search);
  if (q.get('view') === 'raw') S.pendingView = 'raw';
})();
