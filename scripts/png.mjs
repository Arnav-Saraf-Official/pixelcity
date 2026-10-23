// =====================================================================
// Minimal PNG codec for the texture pipeline (build + import/export).
// Decodes 8-bit non-interlaced PNGs to RGBA; encodes RGBA to a PNG.
// No dependencies: node:zlib does the compression.
// =====================================================================
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {Buffer} buf
 * @returns {{width:number,height:number,data:Uint8ClampedArray}} RGBA8
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('decodePng expects a Buffer');
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');

  let pos = 8, ihdr = null, palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  if (ihdr.depth !== 8) throw new Error('only 8-bit PNGs are supported (got ' + ihdr.depth + ')');
  if (ihdr.interlace !== 0) throw new Error('interlaced PNGs are not supported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error('unsupported PNG colour type ' + ihdr.colorType);
  if (ihdr.colorType === 3 && !palette) throw new Error('palette PNG has no PLTE');

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error('truncated PNG data');

  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error('bad PNG filter ' + filter);
      cur[i] = v & 0xff;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    if (ihdr.colorType === 6) {
      rgba[o] = out[i * 4]; rgba[o + 1] = out[i * 4 + 1]; rgba[o + 2] = out[i * 4 + 2]; rgba[o + 3] = out[i * 4 + 3];
    } else if (ihdr.colorType === 2) {
      rgba[o] = out[i * 3]; rgba[o + 1] = out[i * 3 + 1]; rgba[o + 2] = out[i * 3 + 2]; rgba[o + 3] = 255;
    } else if (ihdr.colorType === 0) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = out[i]; rgba[o + 3] = 255;
    } else if (ihdr.colorType === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = out[i * 2]; rgba[o + 3] = out[i * 2 + 1];
    } else {
      const p = out[i] * 3;
      rgba[o] = palette[p]; rgba[o + 1] = palette[p + 1]; rgba[o + 2] = palette[p + 2];
      rgba[o + 3] = trns && out[i] < trns.length ? trns[out[i]] : 255;
    }
  }
  if (trns && ihdr.colorType === 0 && trns.length >= 2) {
    const key = trns.readUInt16BE(0);
    for (let i = 0; i < width * height; i++) if (out[i] === key) rgba[i * 4 + 3] = 0;
  }
  if (trns && ihdr.colorType === 2 && trns.length >= 6) {
    const kr = trns.readUInt16BE(0), kg = trns.readUInt16BE(2), kb = trns.readUInt16BE(4);
    for (let i = 0; i < width * height; i++) {
      if (out[i * 3] === kr && out[i * 3 + 1] === kg && out[i * 3 + 2] === kb) rgba[i * 4 + 3] = 0;
    }
  }
  return { width, height, data: rgba };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img RGBA8
 * @returns {Buffer}
 */
export function encodePng(img) {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
