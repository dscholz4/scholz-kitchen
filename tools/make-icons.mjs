// Generates icons/*.png (a steaming bowl) with no dependencies.
// Usage: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2f, 0x6b, 0x4f];
const FG = [0xf6, 0xf4, 0xef];

// Shape in a 512 unit space. Returns true when the point is foreground.
function inside(x, y) {
  // bowl: lower half disc + rim
  const cx = 256, cy = 268, r = 156;
  if (y >= cy && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  if (y >= cy - 16 && y <= cy + 4 && x >= cx - r - 14 && x <= cx + r + 14) return true;
  // foot
  if (y >= 418 && y <= 440 && x >= 196 && x <= 316) return true;
  // steam: three wavy strokes
  for (const sx of [190, 256, 322]) {
    if (y >= 96 && y <= 222) {
      const wx = sx + 14 * Math.sin((y - 96) / 21);
      if (Math.abs(x - wx) <= 11) return true;
    }
  }
  return false;
}

function render(size) {
  const ss = 4; // supersampling
  const px = Buffer.alloc(size * size * 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let hit = 0;
      for (let a = 0; a < ss; a++) for (let b = 0; b < ss; b++) {
        if (inside(((i + (a + 0.5) / ss) / size) * 512, ((j + (b + 0.5) / ss) / size) * 512)) hit++;
      }
      const t = hit / (ss * ss);
      const o = (j * size + i) * 3;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] * (1 - t) + FG[c] * t);
    }
  }
  return png(size, size, px);
}

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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), render(size));
  console.log('wrote', name);
}
