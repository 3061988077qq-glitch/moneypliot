import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const sizes = [180, 192, 512];

for (const size of sizes) {
  await writeFile(new URL(`../assets/icon-${size}.png`, import.meta.url), makeIcon(size));
}

function makeIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const s = size / 512;

  fillRoundedRect(pixels, size, 0, 0, size, size, 112 * s, [255, 247, 250, 255]);
  fillEllipse(pixels, size, 64 * s, 86 * s, 448 * s, 426 * s, [247, 169, 191, 255]);
  fillEllipse(pixels, size, 112 * s, 60 * s, 242 * s, 210 * s, [217, 138, 161, 255]);
  fillEllipse(pixels, size, 270 * s, 60 * s, 400 * s, 210 * s, [217, 138, 161, 255]);
  fillEllipse(pixels, size, 171 * s, 251 * s, 205 * s, 285 * s, [74, 38, 51, 255]);
  fillEllipse(pixels, size, 307 * s, 251 * s, 341 * s, 285 * s, [74, 38, 51, 255]);
  strokeLine(pixels, size, 218 * s, 320 * s, 294 * s, 320 * s, 18 * s, [74, 38, 51, 255]);
  strokeLine(pixels, size, 256 * s, 164 * s, 256 * s, 210 * s, 18 * s, [139, 213, 192, 255]);
  strokeLine(pixels, size, 230 * s, 179 * s, 282 * s, 179 * s, 18 * s, [139, 213, 192, 255]);

  return encodePNG(size, size, pixels);
}

function fillRoundedRect(pixels, size, x, y, width, height, radius, color) {
  for (let yy = Math.floor(y); yy < y + height; yy += 1) {
    for (let xx = Math.floor(x); xx < x + width; xx += 1) {
      const dx = Math.max(x + radius - xx, 0, xx - (x + width - radius));
      const dy = Math.max(y + radius - yy, 0, yy - (y + height - radius));
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, size, xx, yy, color);
    }
  }
}

function fillEllipse(pixels, size, x1, y1, x2, y2, color) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  for (let y = Math.floor(y1); y <= y2; y += 1) {
    for (let x = Math.floor(x1); x <= x2; x += 1) {
      const value = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (value <= 1) setPixel(pixels, size, x, y, color);
    }
  }
}

function strokeLine(pixels, size, x1, y1, x2, y2, width, color) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const lengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSq));
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      if ((x - px) ** 2 + (y - py) ** 2 <= (width / 2) ** 2) setPixel(pixels, size, x, y, color);
    }
  }
}

function setPixel(pixels, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (Math.floor(y) * size + Math.floor(x)) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function encodePNG(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
