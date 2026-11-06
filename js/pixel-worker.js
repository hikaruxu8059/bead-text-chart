/* Pixel sampling and optional texture cleanup stays off the UI thread. No network requests. */
'use strict';
self.window = self;
importScripts('color.js', 'mard-palettes.js', 'color-library.js', 'palette.js', 'pixel-denoise.js', 'pixel.js');
self.onmessage = function (event) {
  var job = event.data;
  try {
    var raw = Pixel.sample(job.data, job.width, job.height, job.cols, job.rows, 'lines');
    if (job.denoise) raw = PixelDenoise.clean(raw, job.data, job.width, job.height, job.cols, job.rows);
    var result = Pixel.build(raw, job.options, job.library);
    self.postMessage({ result: result }, [result.cells.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || String(error) });
  }
};
