#!/usr/bin/env node
/*
 * Copies the kitchen machine drawings from web/src/components/MachineIcons.tsx into the iPhone
 * app's asset catalog, so both apps draw exactly the same machines under exactly the same keys.
 * The web file is the original: draw or change a machine there, then run
 *
 *   node web/scripts/export-machine-icons.mjs            # rewrite ios/.../Assets.xcassets/MachineIcons
 *   node web/scripts/export-machine-icons.mjs --preview out.html   # also a sheet of every machine
 *
 * A new machine also needs its key in backend KitchenMachines, web utils/machines.ts and the
 * iPhone's KitchenMachines.swift (the e2e kitchen spec reads all three). Each drawing becomes a
 * template SVG (black strokes, vectors kept), so SwiftUI tints it like an SF Symbol and scales
 * it to a 15px pill or a big setup tile without going soft. The iPhone asks for
 * "MachineIcons/<key>", which is why the folder provides its namespace.
 */
import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const catalog = join(web, '..', 'ios', 'MealPlanner', 'Assets.xcassets', 'MachineIcons');

// Bundled to plain JS on the fly: the drawings are TSX, and this keeps them the only copy.
const out = join(tmpdir(), `machine-icons-${process.pid}.mjs`);
await build({
  entryPoints: [join(web, 'src', 'components', 'MachineIcons.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  outfile: out,
  logLevel: 'silent',
});
const { MACHINE_ICONS } = await import(pathToFileURL(out).href);
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
rmSync(out);

function svgFor(Icon) {
  // Drawn on the web's own 24-unit grid, at that size: the catalog keeps the vectors, so the
  // phone scales it to whatever frame it is given.
  return renderToStaticMarkup(createElement(Icon, { width: 24, height: 24 }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    // What the web needs on the page and the catalog does not.
    .replace(' aria-hidden="true"', '')
    .replace(' focusable="false"', '')
    .replace(/ data-machine="[^"]*"/, '')
    // The asset catalog has no idea what currentColor is; a template image only uses the alpha.
    .replaceAll('currentColor', '#000000');
}

const json = (value) => JSON.stringify(value, null, 2) + '\n';

// Start clean so a machine dropped from the web does not linger on the phone.
rmSync(catalog, { recursive: true, force: true });
mkdirSync(catalog, { recursive: true });
writeFileSync(
  join(catalog, 'Contents.json'),
  json({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }),
);
for (const { key, Icon } of MACHINE_ICONS) {
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
console.log(`Wrote ${readdirSync(catalog).filter((f) => f.endsWith('.imageset')).length} machines to ${catalog}`);

const previewAt = process.argv.indexOf('--preview');
if (previewAt > 0) {
  const tiles = MACHINE_ICONS.map(
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
      .tile{width:180px;height:180px;border-radius:18px;background:#F1E7DA;color:rgb(38 38 38/.8);display:flex;align-items:center;justify-content:center}
      .tile svg{width:96px;height:96px}
      .small svg{width:15px;height:15px;margin-top:6px}
    </style>${tiles}`,
  );
  console.log(`Preview: ${process.argv[previewAt + 1]}`);
}
