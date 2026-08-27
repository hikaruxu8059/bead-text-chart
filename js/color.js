/* color.js — sRGB / Lab 转换、感知距离、中文色名自动命名 */
(function (global) {
  'use strict';

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  function hex(rgb) {
    return '#' + rgb.map(function (v) {
      return Math.round(clamp255(v)).toString(16).padStart(2, '0');
    }).join('');
  }

  /* --- sRGB -> CIE Lab (D65) --- */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function pivot(t) {
    return t > 0.008856451679 ? Math.cbrt(t) : (903.2962962 * t + 16) / 116;
  }

  function rgbToLab(rgb) {
    var r = srgbToLinear(rgb[0]), g = srgbToLinear(rgb[1]), b = srgbToLinear(rgb[2]);
    var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    var y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
    var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    var fx = pivot(x), fy = pivot(y), fz = pivot(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  /** CIE76 ΔE。够用且快，滑杆量纲直观（~2.3 为肉眼可辨阈值）。 */
  function deltaE(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  /* --- RGB -> HSL，用于命名 --- */
  function rgbToHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, d = mx - mn, s = 0, h = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  var HUES = [
    [14, '红'], [40, '橙'], [66, '黄'], [88, '黄绿'], [150, '绿'],
    [175, '青绿'], [196, '青'], [250, '蓝'], [285, '紫'],
    [325, '紫红'], [346, '粉红'], [361, '红']
  ];

  /** 依据 HSL 给出一个人能看懂的中文色名，如「深绿」「米白」「浅粉红」。 */
  function autoName(rgb) {
    var hsl = rgbToHsl(rgb), h = hsl[0], s = hsl[1], l = hsl[2];

    // 判断「有没有颜色」要看彩度而不是 HSL 饱和度：
    // 接近纯白/纯黑时 s 的分母趋近 0，#fffefe 这种会被算出 s≈1。
    var chroma = (Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2])) / 255;

    if (chroma < 0.055 || s < 0.11) {
      if (l < 0.10) return '黑';
      if (l < 0.28) return '深灰';
      if (l < 0.52) return '灰';
      if (l < 0.74) return '浅灰';
      if (l < 0.93) return '米白';
      return '白';
    }

    var base = '红';
    for (var i = 0; i < HUES.length; i++) {
      if (h < HUES[i][0]) { base = HUES[i][1]; break; }
    }

    // 低饱和的暖色偏米色系，单独给名字更好认
    if (s < 0.30 && l > 0.80 && (base === '黄' || base === '橙' || base === '黄绿')) return '米黄';
    // 暗橙/暗红在珠子里就是棕色，叫「深橙」反而认不出来
    if ((base === '橙' || base === '红') && l < 0.34 && s < 0.75) return l < 0.20 ? '深棕' : '棕';

    var pre = '';
    if (l < 0.26) pre = '深';
    else if (l > 0.80) pre = '浅';
    else if (l > 0.62 && s < 0.55) pre = '浅';
    if (s < 0.26 && l >= 0.26 && l <= 0.80) pre = '灰';

    return pre + base;
  }

  /** 就地为整个色卡补名并去重（同名追加序号）。 */
  function nameAll(palette) {
    var used = Object.create(null);
    palette.forEach(function (p) {
      if (!p.name) p.name = autoName(p.rgb);
      var n = (used[p.name] || 0) + 1;
      used[p.name] = n;
      if (n > 1) p.name = p.name + n;
    });
    return palette;
  }

  global.Color = {
    hex: hex,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    rgbToHsl: rgbToHsl,
    autoName: autoName,
    nameAll: nameAll
  };
})(window);
