(function (global) {
  'use strict';
  global.createDitherEditor = function (state, api) {
    var $ = function (id) { return document.getElementById(id); };
    var preview = new Map(), colors = [], source = null, picking = null, last = null;
    var base = null, ink = null, active = false, strokeMask = null;
    var tool = $('selectionTool'), status = $('ditherStatus');
    function colorLabel(p) { return p.code || p.name; }
    function available() { return state.selectedCells.size && base && ink && base.hex !== ink.hex; }
    function update() {
      $('ditherBiasOut').textContent = Number($('ditherBias').value) === 0 ? '自动' : (Number($('ditherBias').value) > 0 ? '+' : '') + $('ditherBias').value + '%';
      $('ditherPreview').disabled = !available();
      $('ditherApply').disabled = !active || !available();
      $('ditherCancel').disabled = !active;
      $('ditherBaseSwatch').style.background = base ? base.hex : 'transparent';
      $('ditherInkSwatch').style.background = ink ? ink.hex : 'transparent';
      ['Base', 'Ink'].forEach(function (slot) {
        var color = slot === 'Base' ? base : ink;
        $('dither' + slot + 'Text').textContent = color ? colorLabel(color) : '选择' + (slot === 'Base' ? '底色' : '叠加色');
        $('dither' + slot + 'Options').querySelectorAll('[role="option"]').forEach(function (button) {
          button.setAttribute('aria-selected', String(button.dataset.value === $('dither' + slot).value));
        });
      });
      if (base && ink && base.hex === ink.hex) status.textContent = '底色和叠加色需要不同。';
    }
    function stopPicking() {
      picking = null;
      ['Base', 'Ink'].forEach(function (slot) { $('ditherPick' + slot).setAttribute('aria-pressed', 'false'); });
      $('editViewport').classList.remove('dither-picking');
    }
    function rebuild() {
      preview.clear();
      if (active && available()) {
        if (!source) source = api.source();
        state.selectedCells.forEach(function (pos) {
          var rgb = source[pos] || state.palette[state.cells[pos]].rgb;
          preview.set(pos, BeadDither.mix(rgb, base.rgb, ink.rgb, Number($('ditherBias').value), pos % state.cols, Math.floor(pos / state.cols)) ? ink : base);
        });
      }
      update(); api.render();
    }
    function setTool() {
      $('paintSelectionBtn').setAttribute('aria-pressed', String(tool.value === 'paint'));
      $('eraseSelectionBtn').setAttribute('aria-pressed', String(tool.value === 'erase'));
      last = null; stopPicking(); api.stopPick();
      $('editViewport').classList.toggle('dither-brush', ['paint', 'erase'].includes(tool.value));
      $('selectionBrush').disabled = !['paint', 'erase'].includes(tool.value);
    }
    function fillColorMenus() {
      ['Base', 'Ink'].forEach(function (slot) {
        var id = 'dither' + slot, menu = $(id + 'Options');
        menu.replaceChildren(); menu.hidden = true;
        $(id + 'Toggle').setAttribute('aria-expanded', 'false');
        colors.forEach(function (color, i) {
          var button = document.createElement('button');
          button.type = 'button'; button.className = 'cell-color-option';
          button.setAttribute('role', 'option'); button.dataset.value = String(i);
          var swatch = document.createElement('span'); swatch.className = 'sw';
          swatch.style.background = color.hex; swatch.setAttribute('aria-hidden', 'true');
          var label = document.createElement('span'); label.textContent = colorLabel(color);
          button.append(swatch, label);
          button.addEventListener('click', function () {
            $(id).value = String(i);
            menu.hidden = true; $(id + 'Toggle').setAttribute('aria-expanded', 'false');
            $(id).dispatchEvent(new Event('change', { bubbles: true }));
            $(id + 'Toggle').focus();
          });
          menu.appendChild(button);
        });
      });
    }
    function fillColors() {
      var lib = api.library(); colors = (lib ? lib.colors : state.palette).slice();
      ['Base', 'Ink'].forEach(function (slot) {
        var select = $('dither' + slot); select.replaceChildren();
        var empty = document.createElement('option'); empty.value = ''; empty.textContent = slot === 'Base' ? '选择底色' : '选择叠加色'; select.appendChild(empty);
        colors.forEach(function (p, i) { var option = document.createElement('option'); option.value = i; option.textContent = colorLabel(p); select.appendChild(option); });
      });
    }
    function reset() {
      preview.clear(); source = null; base = ink = null; active = false; last = null; strokeMask = null;
      stopPicking(); tool.value = 'paint'; $('ditherBias').value = 0;
      setTool();
      status.textContent = '先选择格子，再指定底色和叠加色。';
      fillColors(); fillColorMenus(); update();
    }
    function apply() {
      if (!active || !preview.size) return;
      api.remember();
      preview.forEach(function (p, pos) { state.cellEdits.set(pos, { lab: p.lab.slice(), code: p.code }); });
      active = false; preview.clear(); stopPicking();
      status.textContent = '已应用交错配色，可撤销或复原。';
      update(); api.apply();
    }
    function stroke(hit) {
      if (!hit) { last = null; return; }
      var radius = (Number($('selectionBrush').value) - 1) / 2;
      var from = last || hit, steps = Math.max(Math.abs(hit.c - from.c), Math.abs(hit.r - from.r), 1);
      for (var step = 0; step <= steps; step++) {
        var c = Math.round(from.c + (hit.c - from.c) * step / steps), r = Math.round(from.r + (hit.r - from.r) * step / steps);
        for (var y = Math.max(0, r - radius); y <= Math.min(state.rows - 1, r + radius); y++) {
          for (var x = Math.max(0, c - radius); x <= Math.min(state.cols - 1, c + radius); x++) {
            if ((x - c) * (x - c) + (y - r) * (y - r) > radius * radius) continue;
            var pos = y * state.cols + x;
            if (tool.value === 'erase') state.selectedCells.delete(pos); else state.selectedCells.add(pos);
          }
        }
      }
      last = hit; api.selection(hit); rebuild();
    }
    tool.addEventListener('change', setTool);
    ['paint', 'erase'].forEach(function (value) {
      $(value === 'paint' ? 'paintSelectionBtn' : 'eraseSelectionBtn').addEventListener('click', function () {
        tool.value = value;
        setTool();
      });
    });
    ['Base', 'Ink'].forEach(function (slot) {
      $('dither' + slot).addEventListener('change', function () {
        var value = $('dither' + slot).value;
        if (slot === 'Base') base = value === '' ? null : colors[Number(value)]; else ink = value === '' ? null : colors[Number(value)];
        stopPicking(); status.textContent = '颜色占比根据原图自动计算，可用滑杆调淡或调浓。'; rebuild();
      });
      $('ditherPick' + slot).addEventListener('click', function () {
        var next = picking === slot ? null : slot; stopPicking(); api.stopPick(); picking = next;
        if (next) { $('ditherPick' + slot).setAttribute('aria-pressed', 'true'); $('editViewport').classList.add('dither-picking'); }
        status.textContent = next ? '点击图中格子吸取' + (slot === 'Base' ? '底色' : '叠加色') + '，不会直接改色。' : '已退出吸色。';
      });
    });
    $('ditherBias').addEventListener('input', rebuild);
    $('ditherPreview').addEventListener('click', function () { active = true; status.textContent = '正在预览；点击应用交错配色，或点击完成保存。'; rebuild(); });
    $('ditherCancel').addEventListener('click', function () { active = false; preview.clear(); status.textContent = '已取消预览，保留已选格子。'; update(); api.render(); });
    $('ditherApply').addEventListener('click', apply);
    return {
      reset: reset, apply: apply,
      cancel: function () { active = false; preview.clear(); stopPicking(); update(); },
      pause: function () { stopPicking(); },
      selectionChanged: function () { if (!state.selectedCells.size) { active = false; stopPicking(); } rebuild(); },
      brush: function () { return !picking && !state.pickingColor && ['paint', 'erase'].includes(tool.value); },
      stroke: stroke,
      begin: function () { strokeMask = new Set(state.selectedCells); last = null; },
      abortStroke: function () { if (strokeMask) { state.selectedCells.clear(); strokeMask.forEach(function (pos) { state.selectedCells.add(pos); }); strokeMask = null; last = null; api.selection(); rebuild(); } },
      end: function () { last = null; strokeMask = null; },
      pick: function (hit) {
        if (!picking) return false;
        var color = state.palette[hit.idx], slot = picking;
        if (!color) return true;
        var i = colors.findIndex(function (p) { return p.hex === color.hex; });
        if (i < 0) { colors.push(color); i = colors.length - 1; ['Base', 'Ink'].forEach(function (s) { var op = document.createElement('option'); op.value = i; op.textContent = colorLabel(color); $('dither' + s).appendChild(op); }); fillColorMenus(); }
        $('dither' + slot).value = i;
        if (slot === 'Base') base = color; else ink = color;
        stopPicking(); status.textContent = '已吸取' + (slot === 'Base' ? '底色' : '叠加色') + '。'; rebuild(); return true;
      },
      previewing: function () { return active && preview.size > 0; },
      color: function (pos) { return preview.get(pos); }
    };
  };
})(window);
