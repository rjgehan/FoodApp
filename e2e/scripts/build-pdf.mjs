// Lays the screen inventory out as a PDF: a cover, then each group's screens in a grid of
// phone frames. Optional: SCREENS_INTRO=path/to/intro.html is placed after the cover.
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'screens-output');
const manifest = JSON.parse(readFileSync(join(OUT, 'screens.json'), 'utf8'));
const intro = process.env.SCREENS_INTRO && existsSync(process.env.SCREENS_INTRO)
  ? readFileSync(process.env.SCREENS_INTRO, 'utf8') : '';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const groups = [];
for (const s of manifest.shots) {
  let g = groups.at(-1);
  if (!g || g.name !== s.group) groups.push((g = { name: s.group, shots: [] }));
  g.shots.push(s);
}

const img = (f) => pathToFileURL(join(OUT, 'img', f)).href;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0.45in; }
  body { font: 10pt -apple-system, "SF Pro Text", Helvetica, sans-serif; color: #1c1c1e; margin: 0; }
  .cover { height: 9.8in; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover h1 { font-size: 34pt; margin: 0 0 6pt; letter-spacing: -0.02em; }
  .cover p { color: #6e6e73; font-size: 12pt; margin: 2pt 0; }
  .toc { margin-top: 28pt; columns: 2; }
  .toc div { padding: 3pt 0; border-bottom: 0.5pt solid #e5e5ea; }
  .intro { page-break-after: always; }
  h2 { font-size: 18pt; margin: 0 0 10pt; page-break-after: avoid; }
  section { page-break-before: always; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16pt 14pt; }
  figure { margin: 0; break-inside: avoid; }
  .frame { border: 0.75pt solid #d1d1d6; border-radius: 12pt; overflow: hidden; background: #f2f2f7; max-height: 5.2in; }
  .frame img { width: 100%; display: block; }
  .full .frame { max-height: none; }
  figcaption { margin-top: 5pt; font-weight: 600; font-size: 9pt; }
  figcaption small { display: block; font-weight: 400; color: #6e6e73; margin-top: 1pt; }
  figure.full { grid-column: span 1; }
  .intro { font-size: 9.5pt; line-height: 1.45; }
  .intro h1 { font-size: 22pt; margin: 0 0 8pt; }
  .intro h2 { font-size: 15pt; margin: 18pt 0 6pt; page-break-after: avoid; }
  .intro h3 { font-size: 11.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
  .intro table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 8.8pt; }
  .intro th, .intro td { border: 0.5pt solid #d1d1d6; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  .intro th { background: #f2f2f7; }
  .intro tr { break-inside: avoid; }
  .intro code { font: 8.5pt ui-monospace, Menlo, monospace; background: #f2f2f7; padding: 0 2pt; border-radius: 3pt; }
  .intro pre { background: #f2f2f7; padding: 6pt 8pt; border-radius: 6pt; white-space: pre-wrap; }
  .intro pre code { background: none; padding: 0; }
  .intro li { margin: 2pt 0; break-inside: avoid; }
  .intro hr { border: 0; border-top: 0.5pt solid #d1d1d6; margin: 14pt 0; }
</style></head><body>
  <div class="cover">
    <h1>${esc(process.env.SCREENS_TITLE ?? 'Meal Planner — Screen Inventory')}</h1>
    <p>Every screen and sheet at iPhone size (390 × 844 pt), light and dark.</p>
    <p>Captured ${esc(new Date(manifest.capturedAt).toLocaleString())} · ${manifest.shots.length} screens</p>
    <div class="toc">${groups.map((g) => `<div>${esc(g.name)} — ${g.shots.length}</div>`).join('')}</div>
  </div>
  ${intro ? `<div class="intro">${intro}</div>` : ''}
  ${groups.map((g) => `<section><h2>${esc(g.name)}</h2><div class="grid">${g.shots.map((s) => `
    <figure><div class="frame"><img src="${img(s.file)}"></div>
    <figcaption>${esc(s.title)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</figcaption></figure>`).join('')}
  </div></section>`).join('')}
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const tmp = join(OUT, 'screens.html');
(await import('node:fs')).writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
const pdfPath = process.env.SCREENS_PDF ?? join(OUT, 'screens.pdf');
await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`Wrote ${pdfPath}`);
