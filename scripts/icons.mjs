// Rasterises the Facelet mark to PNG app icons (no dependencies).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, maskable) {
  const S = 4; // supersampling
  const raw = Buffer.alloc((size * 4 + 1) * size);
  // rounded-rect test in unit coordinates
  const inRR = (x, y, x0, y0, w, h, r) => {
    if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
    const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
    const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const pad = maskable ? 0.2 : 0.16;
  const cell = (1 - 2 * pad - 2 * 0.04) / 3;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let bg = 0, white = 0, alpha = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const x = (px + (sx + 0.5) / S) / size;
        const y = (py + (sy + 0.5) / S) / size;
        const inBg = maskable ? true : inRR(x, y, 0, 0, 1, 1, 0.22);
        if (!inBg) continue;
        alpha++;
        let a = 0;
        for (let i = 0; i < 9; i++) {
          const cx = pad + (i % 3) * (cell + 0.04);
          const cy = pad + Math.floor(i / 3) * (cell + 0.04);
          if (inRR(x, y, cx, cy, cell, cell, cell * 0.24)) a = i === 0 ? 1 : 0.28;
        }
        white += a;
        bg++;
      }
      const n = S * S;
      const w = bg ? white / bg : 0;
      const v = Math.round(10 + (255 - 10) * w);
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = v;
      raw[o + 3] = Math.round((alpha / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
writeFileSync(new URL('../public/icon-192.png', import.meta.url), png(192, false));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), png(512, false));
writeFileSync(new URL('../public/icon-maskable-512.png', import.meta.url), png(512, true));
console.log('icons written');
