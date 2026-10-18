#!/usr/bin/env node
/*
 * Renders every app-icon PNG from the one source drawing, app-icon.svg (1024, full bleed):
 *
 *   node web/scripts/brand/render-icons.mjs
 *
 *   ios/MealPlanner/Assets.xcassets/AppIcon.appiconset/AppIcon.png   1024  (Xcode makes the rest)
 *   web/public/icon-512.png                                           512
 *   web/public/icon-192.png                                           192
 *   web/public/apple-touch-icon.png                                   180
 *
 * Only a headless Chrome or Edge is needed (no sharp, no resvg): each size is a tiny HTML page
 * holding the SVG at exactly N×N, screenshotted in an N×N window at device scale 1. Set BROWSER
 * to the browser's executable if it isn't in the usual place.
 *
 * The App Store rejects an app icon with an alpha channel, and iOS paints a transparent touch
 * icon black, so every PNG must be opaque RGB. Chromium normally writes RGB already; if a
 * build writes RGBA, the alpha is dropped with ffmpeg when it is installed, or by re-encoding
 * the PNG here otherwise (the drawing has a full-bleed tile, so there is nothing to lose).
 *
 * glyph.svg next to this file is the one-colour mark used inside the apps (web icons.tsx
 * 'waxwing', iPhone AppGlyph.imageset in both asset catalogs). Change it there by hand.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const source = readFileSync(join(here, 'app-icon.svg'), 'utf8');

const OUTPUTS = [
  { size: 1024, file: join(repo, 'ios', 'MealPlanner', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon.png') },
  { size: 512, file: join(repo, 'web', 'public', 'icon-512.png') },
  { size: 192, file: join(repo, 'web', 'public', 'icon-192.png') },
  { size: 180, file: join(repo, 'web', 'public', 'apple-touch-icon.png') },
];

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) {
    console.error('No Chrome or Edge found. Set BROWSER to its executable and run again.');
    process.exit(1);
  }
  return found;
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

// --- PNG helpers: read the header, and drop an alpha channel without any library -------------

/** The IHDR fields that matter here: size, bit depth and colour type (2 = RGB, 6 = RGBA). */
function pngInfo(file) {
  const png = readFileSync(file);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Rewrites an 8-bit RGBA PNG as RGB (alpha thrown away; the art is opaque everywhere). */
function stripAlphaInJs(file) {
  const png = readFileSync(file);
  const { width, height, bitDepth, colorType } = pngInfo(file);
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`${file}: expected 8-bit RGBA, got depth ${bitDepth} type ${colorType}`);
  const idat = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      rgba[y * stride + x] = (v + predictor) & 0xff;
    }
  }
  const rgb = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1); // filter byte 0 (None) at the start of each row
    for (let x = 0; x < width; x++) rgba.copy(rgb, row + 1 + x * 3, y * stride + x * 4, y * stride + x * 4 + 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  writeFileSync(file, Buffer.concat([
    png.subarray(0, 8),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function makeOpaque(file, ffmpeg) {
  if (pngInfo(file).colorType === 2) return 'RGB';
  if (ffmpeg) {
    const tmp = `${file}.rgb.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-pix_fmt', 'rgb24', tmp]);
    renameSync(tmp, file);
    return 'RGBA -> RGB (ffmpeg)';
  }
  stripAlphaInJs(file);
  return 'RGBA -> RGB';
}

// --- Render ----------------------------------------------------------------------------------

const browser = findBrowser();
const ffmpeg = hasFfmpeg();
const work = mkdtempSync(join(tmpdir(), 'waxwing-icons-'));
console.log(`Rendering with ${browser}`);

try {
  for (const { size, file } of OUTPUTS) {
    const svg = source.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    const page = join(work, `icon-${size}.html`);
    writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;overflow:hidden;background:#3A1E36}svg{display:block}
</style></head><body>${svg}</body></html>`);
    const shot = join(work, `icon-${size}.png`);
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`,
      '--force-device-scale-factor=1',
      `--window-size=${size},${size}`,
      `--screenshot=${shot}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore', timeout: 60_000 });
    if (!existsSync(shot)) throw new Error(`The browser wrote no screenshot for ${size}px`);

    const { width, height } = pngInfo(shot);
    if (width !== size || height !== size) throw new Error(`${size}px came out ${width}×${height}`);
    const colour = makeOpaque(shot, ffmpeg);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(shot));
    console.log(`${String(size).padStart(4)}  ${colour.padEnd(20)}  ${file}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
