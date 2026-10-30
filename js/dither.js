/* Local two-color ordered dithering; no changes outside the painted mask. */
(function (global) {
  'use strict';
  var matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function mix(rgb, base, ink, bias, x, y) {
    var dot = 0, length = 0;
    for (var i = 0; i < 3; i++) {
      var delta = ink[i] - base[i];
      dot += (rgb[i] - base[i]) * delta;
      length += delta * delta;
    }
    var coverage = Math.max(0, Math.min(1, (length ? dot / length : 0) + bias / 100));
    return coverage > (matrix[(y % 4) * 4 + x % 4] + 0.5) / 16;
  }
  global.BeadDither = { mix: mix };
})(window);
