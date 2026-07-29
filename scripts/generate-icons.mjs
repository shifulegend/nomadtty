/**
 * NomadTTY — generates the project's favicon/icon assets.
 *
 * Renders a ">_" terminal-prompt glyph (matching the app's own monospace/
 * terminal visual language) onto the brand blue (#0052cc) used throughout
 * `public/session-manager.html` and `src/kb.js`. Pure Node core (fs, zlib)
 * -- no image-library dependency, since this is a one-off asset-generation
 * script, not a runtime dependency of the app itself (see
 * docs/ai/project-overview.md's "zero runtime dependencies" convention for
 * client-side code).
 *
 * Usage: node scripts/generate-icons.mjs
 * Output: public/favicon.svg, public/apple-touch-icon.png,
 *         public/icon-192.png, public/icon-512.png
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const BG = [0x00, 0x52, 0xcc]; // #0052cc -- the app's own accent blue
const FG = [0xff, 0xff, 0xff]; // white glyph, matches toolbar's active-button text

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Glyph geometry as fractions of the icon's width/height (0..1), shared
 * verbatim between the PNG raster render and the SVG vector render below
 * so both stay visually identical. */
const GLYPH = {
  chevronTop: [0.26, 0.24, 0.58, 0.50],
  chevronBottom: [0.58, 0.50, 0.26, 0.76],
  strokeWidth: 0.085,
  cursor: [0.64, 0.66, 0.84, 0.745], // x1,y1,x2,y2
};

function isForeground(fx, fy) {
  const half = GLYPH.strokeWidth / 2;
  const [ax, ay, bx, by] = GLYPH.chevronTop;
  const [cx2, cy2, dx2, dy2] = GLYPH.chevronBottom;
  const d1 = distToSegment(fx, fy, ax, ay, bx, by);
  const d2 = distToSegment(fx, fy, cx2, cy2, dx2, dy2);
  const [cx1, cy1, cx2b, cy2b] = GLYPH.cursor;
  const inCursor = fx >= cx1 && fx <= cx2b && fy >= cy1 && fy <= cy2b;
  return d1 < half || d2 < half || inCursor;
}

/** Rounded-rect mask so corners are background-only (soft app-icon look),
 * computed in the same 0..1 fractional space as the glyph. */
function insideRoundedRect(fx, fy, radiusFrac) {
  const rx = Math.min(fx, 1 - fx);
  const ry = Math.min(fy, 1 - fy);
  if (rx >= radiusFrac || ry >= radiusFrac) return true;
  const dx = radiusFrac - rx, dy = radiusFrac - ry;
  return dx * dx + dy * dy <= radiusFrac * radiusFrac;
}

// ---- Minimal PNG encoder (8-bit RGBA, filter type 0, single IDAT) ----
function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function encodePNG(width, height, rgbaPixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter type: None
    rgbaPixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function renderIconPNG(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radiusFrac = 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) / size, fy = (y + 0.5) / size;
      const idx = (y * size + x) * 4;
      if (!insideRoundedRect(fx, fy, radiusFrac)) {
        pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
        continue;
      }
      const fg = isForeground(fx, fy);
      const [r, g, b] = fg ? FG : BG;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
    }
  }
  return encodePNG(size, size, pixels);
}

function renderSVG() {
  const f = (v) => (v * 100).toFixed(2);
  const [ax, ay, bx, by] = GLYPH.chevronTop.map(f);
  const [cx2, cy2, dx2, dy2] = GLYPH.chevronBottom.map(f);
  const [rx1, ry1, rx2, ry2] = GLYPH.cursor;
  const strokeW = (GLYPH.strokeWidth * 100).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="rgb(${BG.join(',')})"/>
  <polyline points="${ax},${ay} ${bx},${by} ${cx2},${cy2} ${dx2},${dy2}"
    fill="none" stroke="rgb(${FG.join(',')})" stroke-width="${strokeW}"
    stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="${f(rx1)}" y="${f(ry1)}" width="${f(rx2 - rx1)}" height="${f(ry2 - ry1)}"
    fill="rgb(${FG.join(',')})"/>
</svg>
`;
}

writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), renderSVG());
console.log('-> public/favicon.svg');

writeFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'), renderIconPNG(180));
console.log('-> public/apple-touch-icon.png (180x180)');

writeFileSync(join(PUBLIC_DIR, 'icon-192.png'), renderIconPNG(192));
console.log('-> public/icon-192.png');

writeFileSync(join(PUBLIC_DIR, 'icon-512.png'), renderIconPNG(512));
console.log('-> public/icon-512.png');
