/* One cancellable local worker per image calculation. Stale jobs never publish. */
(function (global) {
  'use strict';
  var active = null, localSourcePromise = null;
  function localSource() {
    if (global.PixelWorkerSource) return Promise.resolve(global.PixelWorkerSource);
    if (!localSourcePromise) localSourcePromise = new Promise(function (resolve, reject) {
      // Classic scripts can load beside a file:// page; fetch/importScripts cannot.
      var script = document.createElement('script');
      script.src = './js/pixel-worker-bundle.js';
      script.onload = function () {
        script.remove();
        if (global.PixelWorkerSource) resolve(global.PixelWorkerSource);
        else { localSourcePromise = null; reject(new Error('本地计算模块加载失败')); }
      };
      script.onerror = function () {
        script.remove(); localSourcePromise = null;
        reject(new Error('本地计算模块加载失败，请确认 js/pixel-worker-bundle.js 存在'));
      };
      document.head.appendChild(script);
    });
    return localSourcePromise;
  }
  function release(job) {
    if (job.worker) job.worker.terminate();
    if (job.url) URL.revokeObjectURL(job.url);
  }
  function cancel() {
    if (!active) return;
    var job = active; active = null;
    release(job);
    var error = new Error('Pixel calculation cancelled'); error.name = 'AbortError';
    job.reject(error);
  }
  function run(request) {
    cancel();
    return new Promise(function (resolve, reject) {
      var job = { worker: null, url: null, reject: reject }; active = job;
      function finish(error, result) {
        if (active !== job) return;
        active = null; release(job);
        if (error) reject(error); else resolve(result);
      }
      function start(source) {
        if (active !== job) return;
        try {
          if (source) job.url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          var worker = job.worker = new Worker(job.url || './js/pixel-worker.js');
          worker.onmessage = function (event) {
            if (event.data.error) finish(new Error(event.data.error));
            else finish(null, event.data.result);
          };
          worker.onerror = function (event) {
            finish(new Error(event.message || '像素计算失败'));
          };
          // Transfer a copy: the app's cached source must survive size changes.
          var payload = Object.assign({}, request, { data: request.data.slice() });
          worker.postMessage(payload, [payload.data.buffer]);
        } catch (error) { finish(error); }
      }
      if (global.location && global.location.protocol === 'file:') {
        localSource().then(start, function (error) { finish(error); });
      } else start();
    });
  }
  global.PixelJob = { run: run, cancel: cancel };
})(window);
