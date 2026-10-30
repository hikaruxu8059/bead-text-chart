/* 通用演示色库不对应任何珠子品牌；实际色号通过本地 JSON 色卡导入。 */
(function (global, C) {
  'use strict';
  function entry(code, name, hex) {
    var rgb = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    return { code: code, name: name, hex: hex.toLowerCase(), rgb: rgb, lab: C.rgbToLab(rgb) };
  }
  var basic = [
    ['白', '#ffffff'], ['黑', '#171717'], ['浅灰', '#c4c4c4'], ['深灰', '#636363'],
    ['红', '#d32f2f'], ['橙', '#f57c00'], ['黄', '#fbc02d'], ['绿', '#388e3c'],
    ['青', '#0097a7'], ['蓝', '#1976d2'], ['深蓝', '#303f80'], ['紫', '#7b1fa2'],
    ['粉', '#f48fb1'], ['棕', '#795548'], ['米色', '#e7d3b1'], ['浅绿', '#aed581']
  ].map(function (p, i) { return entry('G' + String(i + 1).padStart(2, '0'), p[0], p[1]); });
  var gray = Array.from({ length: 8 }, function (_, i) {
    var v = Math.round(i * 255 / 7).toString(16).padStart(2, '0');
    return entry('BW' + (i + 1), '灰阶' + (i + 1), '#' + v + v + v);
  });

  function parse(text) {
    if (text.length > 2 * 1024 * 1024) throw new Error('色库文件不能超过 2 MB');
    var value;
    try { value = JSON.parse(text); } catch (e) { throw new Error('色库必须是有效的 JSON 文件'); }
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('请填写色库名称 name（1–80 字）');
    if (!Array.isArray(value.colors) || !value.colors.length || value.colors.length > 512) throw new Error('色库需包含 1–512 个颜色');
    var used = new Set();
    var colors = value.colors.map(function (p, i) {
      if (!p || typeof p.code !== 'string' || !p.code.trim() || p.code.length > 32 || /[\r\n\t]/.test(p.code)) throw new Error('第 ' + (i + 1) + ' 个颜色的 code 无效');
      var code = p.code.trim();
      if (used.has(code)) throw new Error('色号重复：' + code);
      used.add(code);
      if (typeof p.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.hex)) throw new Error('色号 ' + code + ' 需要 #RRGGBB 格式的 hex');
      if (p.name != null && (typeof p.name !== 'string' || p.name.length > 80 || /[\r\n\t]/.test(p.name))) throw new Error('色号 ' + code + ' 的 name 无效');
      return entry(code, p.name || code, p.hex);
    });
    return { name: value.name.trim(), colors: colors };
  }

  // 先逐格量化到有限色板，不先聚类；同一原始 RGB 只计算一次最近色。
  function quantize(raw, library) {
    var cache = new Map();
    return raw.map(function (rgb) {
      if (!library || !library.length) {
        // 自由配色使用每通道 16 档的均匀 RGB 色板，共 4096 色。
        return rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(v / 17) * 17)); });
      }
      var key = rgb.join(','), hit = cache.get(key);
      if (hit) return hit;
      var lab = C.rgbToLab(rgb), best = library[0], distance = Infinity;
      for (var i = 0; i < library.length; i++) {
        var d = C.deltaE(lab, library[i].lab);
        if (d < distance) { distance = d; best = library[i]; }
      }
      var result = best.rgb.slice();
      cache.set(key, result);
      return result;
    });
  }

  function match(model, library) {
    var palette = [], byCode = new Map(), remap = [];
    model.palette.forEach(function (p, i) {
      var best = library[0], dist = Infinity;
      library.forEach(function (candidate) {
        var d = C.deltaE(p.lab, candidate.lab);
        if (d < dist) { dist = d; best = candidate; }
      });
      if (!byCode.has(best.code)) {
        byCode.set(best.code, palette.length);
        palette.push(Object.assign({}, best, { count: 0 }));
      }
      remap[i] = byCode.get(best.code);
    });
    var cells = new Int16Array(model.cells.length);
    for (var i = 0; i < cells.length; i++) {
      cells[i] = remap[model.cells[i]];
      palette[cells[i]].count++;
    }
    return { palette: palette, cells: cells };
  }

  var builtins = { basic: { name: '通用 16 色（非品牌色号）', colors: basic }, gray: { name: '通用灰阶 8 色（非品牌色号）', colors: gray } };
  Object.keys(global.MardPalettes || {}).forEach(function (id) {
    var source = global.MardPalettes[id];
    builtins[id] = { name: source.name, colors: source.colors.map(function (p) {
      var color = entry(p[0], '', p[1]); color.name = C.autoName(color.rgb); return color;
    }) };
  });

  global.ColorLibrary = {
    builtins: builtins,
    parse: parse, match: match, quantize: quantize
  };
})(window, window.Color);
