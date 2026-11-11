/* Offline ZIP for PNG sheets; PNG data is already compressed. */
(function (global) {
  'use strict';
  function build(files) {
    if (files.length > 65535) throw new RangeError('Too many ZIP entries');
    var encoder = new TextEncoder(), chunks = [], directory = [], offset = 0;
    function header(size) { var bytes = new Uint8Array(size); return { bytes: bytes, view: new DataView(bytes.buffer) }; }
    function crc(bytes) {
      var value = 0xffffffff;
      bytes.forEach(function (b) { value ^= b; for (var k = 0; k < 8; k++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); });
      return (value ^ 0xffffffff) >>> 0;
    }
    files.forEach(function (file) {
      var name = encoder.encode(file.name), data = file.data, checksum = crc(data);
      var local = header(30), central = header(46), v = local.view;
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(12, 33, true);
      v.setUint32(14, checksum, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, name.length, true);
      v = central.view; v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true); v.setUint16(14, 33, true);
      v.setUint32(16, checksum, true); v.setUint32(20, data.length, true); v.setUint32(24, data.length, true); v.setUint16(28, name.length, true); v.setUint32(42, offset, true);
      chunks.push(local.bytes, name, data); directory.push(central.bytes, name); offset += 30 + name.length + data.length;
      if (offset > 0xffffffff) throw new RangeError('ZIP exceeds 4 GB');
    });
    var size = directory.reduce(function (sum, part) { return sum + part.length; }, 0), end = header(22);
    end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length / 2, true); end.view.setUint16(10, directory.length / 2, true);
    end.view.setUint32(12, size, true); end.view.setUint32(16, offset, true);
    return new Blob(chunks.concat(directory, [end.bytes]), { type: 'application/zip' });
  }
  global.ZipStore = { build: build };
})(window);
