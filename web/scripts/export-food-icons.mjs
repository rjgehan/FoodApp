#!/usr/bin/env node
/*
 * Copies the food icons from web/src/components/FoodIcons.tsx into the iPhone app's asset
 * catalog, so both apps draw exactly the same art under exactly the same keys. The web file is
 * the original: draw or change an icon there, then run
 *
 *   node web/scripts/export-food-icons.mjs            # rewrite ios/.../Assets.xcassets/FoodIcons
 *   node web/scripts/export-food-icons.mjs --preview out.html   # also a sheet of every icon
 *
 * and add a new key to backend FoodIcons.KEYS. Each icon becomes a template SVG (black strokes,
 * vectors kept), so SwiftUI tints it and scales it to any tile without going soft.
 */
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const catalog = join(web, '..', 'ios', 'MealPlanner', 'Assets.xcassets', 'FoodIcons');

// Bundled to plain JS on the fly: the icons are TSX, and this keeps them the only copy.
const out = join(tmpdir(), `food-icons-${process.pid}.mjs`);
await build({
  entryPoints: [join(web, 'src', 'components', 'FoodIcons.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  outfile: out,
  logLevel: 'silent',
});
const { FOOD_ICONS } = await import(pathToFileURL(out).href);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
rmSync(out);

function svgFor(Icon) {
  return renderToStaticMarkup(createElement(Icon, { width: 48, height: 48 }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(' aria-hidden="true"', '')
    // The asset catalog has no idea what currentColor is; a template image only uses the alpha.
    .replaceAll('currentColor', '#000000');
}

const json = (value) => JSON.stringify(value, null, 2) + '\n';

// Start clean so an icon dropped from the web does not linger on the phone.
rmSync(catalog, { recursive: true, force: true });
mkdirSync(catalog, { recursive: true });
writeFileSync(
  join(catalog, 'Contents.json'),
  json({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }),
);
for (const { key, Icon } of FOOD_ICONS) {
  const set = join(catalog, `${key}.imageset`);
  mkdirSync(set);
  writeFileSync(join(set, `${key}.svg`), svgFor(Icon) + '\n');
  writeFileSync(
    join(set, 'Contents.json'),
    json({
      images: [{ filename: `${key}.svg`, idiom: 'universal' }],
      info: { author: 'xcode', version: 1 },
      properties: { 'preserves-vector-representation': true, 'template-rendering-intent': 'template' },
    }),
  );
}
console.log(`Wrote ${readdirSync(catalog).filter((f) => f.endsWith('.imageset')).length} icons to ${catalog}`);

const previewAt = process.argv.indexOf('--preview');
if (previewAt > 0) {
  const tiles = FOOD_ICONS.map(
    ({ key, label, Icon }) => `
      <figure>
        <div class="tile">${svgFor(Icon).replaceAll('#000000', 'currentColor')}</div>
        <div class="small">${svgFor(Icon).replaceAll('#000000', 'currentColor')}</div>
        <figcaption>${label} <code>${key}</code></figcaption>
      </figure>`,
  ).join('');
  writeFileSync(
    process.argv[previewAt + 1],
    `<!doctype html><meta charset="utf-8"><style>
      body{font:14px system-ui;margin:16px;display:flex;flex-wrap:wrap;gap:16px;background:#fff;color:#333}
      figure{margin:0;width:180px}
      .tile{width:180px;height:180px;border-radius:18px;background:#E2ECDB;color:rgb(38 38 38/.7);display:flex;align-items:center;justify-content:center}
      .tile svg{width:124px;height:124px}
      .small svg{width:24px;height:24px;margin-top:6px}
    </style>${tiles}`,
  );
  console.log(`Preview: ${process.argv[previewAt + 1]}`);
}
