'use strict';
// 用纯 Node（zlib）生成 256x256 应用图标 PNG，无需任何依赖。
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 256, H = 256;
const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const BG = [15, 23, 42];      // #0f172a
const CYAN = [34, 211, 238];  // #22d3ee
const DARK = [8, 14, 26];     // 内圆

function insideRounded(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const i = rowStart + 1 + x * 4;
    let r = BG[0], g = BG[1], b = BG[2], a = 255;
    if (!insideRounded(x + 0.5, y + 0.5, W, H, 52)) {
      a = 0;
    } else {
      const dx = x - W / 2, dy = y - H / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 74) { r = CYAN[0]; g = CYAN[1]; b = CYAN[2]; }
      if (d <= 40) { r = DARK[0]; g = DARK[1]; b = DARK[2]; }
      if (d <= 74 && d > 40) {
        const hl = Math.max(0, 1 - d / 80) * 30;
        r = Math.min(255, r + hl); g = Math.min(255, g + hl); b = Math.min(255, b + hl);
      }
    }
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  }
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(outDir, 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + png.length + ' bytes)');
