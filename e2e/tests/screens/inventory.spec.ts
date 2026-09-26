import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_URL, admin, call, isoDate, newHousehold, newMember, newRecipe, plan } from '../../lib/api';
import { fromMenu, sheet, signIn, swipeLeft } from '../../lib/ui';

/**
 * The screen inventory: every screen and sheet at iPhone size, light and dark, with a realistic
 * household behind it. `npm run screens` turns the result into screens-output/screens.pdf.
 *
 * Not a test of behaviour — a failed step here just means a screen moved; fix the selector.
 */
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../screens-output');
const shots: { file: string; title: string; note: string; group: string }[] = [];
const missed: string[] = [];
let group = '';

/** One screen's worth of navigation. A step that fails is noted and skipped, not fatal. */
async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    missed.push(`${group} / ${label}: ${String(e).split('\n')[0].slice(0, 160)}`);
  }
}

async function shot(page: Page, title: string, note = '', { full = false } = {}) {
  await page.waitForTimeout(450); // let sheets finish sliding in
  const file = `${String(shots.length + 1).padStart(3, '0')}.png`;
  await page.screenshot({ path: join(OUT, 'img', file), fullPage: full, scale: 'css' });
  shots.push({ file, title, note, group });
}

/** A plain coloured PNG, so recipe cards have real covers. */
function swatch(r: number, g: number, b: number): Buffer {
  // A 64×64 gradient, written by hand so there is no image dependency.
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, r + x); raw[o + 1] = Math.min(255, g + y); raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function uploadCover(householdId: string, token: string, recipeId: string, rgb: [number, number, number]) {
  const form = new FormData();
  form.append('file', new Blob([swatch(...rgb)], { type: 'image/png' }), 'cover.png');
  const res = await fetch(`${API_URL}/api/households/${householdId}/images`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form,
  });
  if (!res.ok) return;
  const img = await res.json();
  await call('PUT', `/api/recipes/${recipeId}/images`, { token, body: { coverImageId: img.id, photoIds: [img.id] } });
}

test('capture every screen', async ({ page }) => {
  mkdirSync(join(OUT, 'img'), { recursive: true });

  // --- A household that looks lived in -------------------------------------------------------
  const hh = await newHousehold('Gehan House');
  const owner = await admin();
  const T = owner.token;
  await newMember(hh.id);

  const R = async (name: string, section: string, cats: string[], servings: number, ings: any[], extra = {}) =>
    newRecipe(hh.id, name, ings, { section, categories: cats, servings, ...extra });
  const parm = await R('Chicken Parmesan', 'DINNER', ['Main dish'], 4, [
    { name: 'chicken breast', qty: 2 }, { name: 'breadcrumbs', qty: 1, unit: 'cup' },
    { name: 'parmesan', qty: 0.5, unit: 'cup' }, { name: 'marinara sauce', qty: 1.5, unit: 'cup' },
    { name: 'mozzarella', qty: 8, unit: 'oz' }, { name: 'spaghetti', qty: 1, unit: 'lb' },
    { name: 'basil', qty: 1, unit: 'bunch', optional: true },
  ], { links: [{ url: 'https://www.tiktok.com/@cook/video/7300000000000000000', label: null }, { url: 'https://www.seriouseats.com/chicken-parmesan', label: 'Serious Eats version' }],
       prepTimeMinutes: 20, cookTimeMinutes: 30,
       description: 'Crispy, saucy, better than the restaurant.',
       instructions: 'Pound the chicken thin.\nDredge in egg, then breadcrumbs and parmesan.\nFry until golden.\nTop with sauce and mozzarella; bake 15 minutes at 425°F.\nServe over spaghetti.' });
  const frites = await R('Steak Frites', 'DINNER', ['Main dish'], 2, [
    { name: 'ribeye steak', qty: 1, unit: 'lb' }, { name: 'potatoes', qty: 2, unit: 'lb' },
    { name: 'butter', qty: 2, unit: 'tbsp' }, { name: 'parsley', qty: 1, unit: 'bunch', optional: true },
  ]);
  const tacos = await R('Steak Tacos', 'DINNER', ['Main dish'], 4, [
    { name: 'flank steak', qty: 2, unit: 'lb' }, { name: 'tortillas', qty: 8 }, { name: 'onion', qty: 1 },
    { name: 'cilantro', qty: 1, unit: 'bunch' }, { name: 'lime', qty: 2 },
  ]);
  const salad = await R('Caesar Salad', 'LUNCH', ['Side'], 2, [
    { name: 'romaine', qty: 1, unit: 'head' }, { name: 'parmesan', qty: 0.25, unit: 'cup' }, { name: 'croutons', qty: 1, unit: 'cup' },
  ]);
  const oats = await R('Overnight Oats', 'BREAKFAST', [], 1, [
    { name: 'rolled oats', qty: 0.5, unit: 'cup' }, { name: 'milk', qty: 0.5, unit: 'cup' }, { name: 'banana', qty: 1 },
  ]);
  await R('Lemonade', 'DRINKS', [], 6, [{ name: 'lemon', qty: 6 }, { name: 'sugar', qty: 1, unit: 'cup' }]);
  await R('Trail Mix', 'SNACKS', [], 8, [{ name: 'peanuts', qty: 2, unit: 'cup' }]);
  for (const [r, rgb] of [[parm, [200, 90, 40]], [frites, [120, 60, 30]], [tacos, [60, 140, 60]], [salad, [90, 170, 90]]] as const) {
    await uploadCover(hh.id, T, r.id, rgb as [number, number, number]);
  }

  const place = await call('POST', `/api/households/${hh.id}/places`, {
    token: T, body: { name: 'Golden Dragon', menuUrl: 'https://example.com/menu', phone: '555-0100', notes: 'Order the dumplings.' },
  });
  await plan(hh.id, isoDate(0), 'BREAKFAST', { recipeId: oats.id, servings: 1 });
  await plan(hh.id, isoDate(0), 'LUNCH', { placeId: place.id, time: '12:30' } as any);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: parm.id });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: salad.id });
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: frites.id });
  await plan(hh.id, isoDate(2), 'DINNER', { recipeId: tacos.id });
  await plan(hh.id, isoDate(3), 'BREAKFAST', { itemName: 'eggs' });
  await call('POST', `/api/households/${hh.id}/grocery-list/add-all?start=${isoDate(0)}&end=${isoDate(6)}`, { token: T });
  for (const n of ['paper towels', 'coffee']) {
    await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: T, body: { ingredientName: n } });
  }
  const list = await call('GET', `/api/households/${hh.id}/grocery-list`, { token: T });
  for (const name of ['potatoes', 'lime']) {
    const i = list.find((x: any) => x.name === name);
    if (i) await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${i.id}`, { token: T, body: { checked: true } });
  }
  for (const [name, staple] of [['olive oil', true], ['salt', true], ['rice', false], ['eggs', false], ['butter', false]] as const) {
    await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name, staple } });
  }
  const cup = await call('GET', `/api/households/${hh.id}/cupboard`, { token: T });
  const eggs = cup.find((c: any) => c.name === 'eggs');
  await call('PATCH', `/api/households/${hh.id}/cupboard/${eggs.id}`, { token: T, body: { trackQuantity: true, quantity: 6, unit: 'ct' } });
  const butter = cup.find((c: any) => c.name === 'butter');
  await call('PATCH', `/api/households/${hh.id}/cupboard/${butter.id}`, { token: T, body: { runningLow: true } });

  // --- Signed out ----------------------------------------------------------------------------
  const todayNum = String(new Date().getDate());
  const openToday = async () => {
    await page.goto('/meal-plan');
    await page.getByText(todayNum, { exact: true }).first().click();
    await sheet(page).waitFor();
  };

  group = 'Sign in';
  await step('landing', async () => {
    await page.goto('/');
    await shot(page, 'Sign in', 'Email and password first; the PIN screens are a link underneath.');
    await page.getByText('Sign in with your name and PIN').click();
    await shot(page, 'Which house?', 'Every household on the server is listed here, before signing in.');
    await page.getByRole('button', { name: /Gehan House/ }).last().click();
    await shot(page, 'Tap your name');
    await page.getByRole('button', { name: /E2E Admin/i }).first().click();
    await shot(page, 'PIN pad');
  });
  await step('username', async () => {
    await page.goto('/');
    await page.getByText('Sign in with your name and PIN').click();
    await page.getByText('Sign in with a username instead').click();
    await shot(page, 'Sign in with a username', 'No autocapitalize="none" — iOS will type "Ryan".');
  });
  await step('public link', async () => {
    const link = await call('POST', `/api/recipes/${parm.id}/link`, { token: T });
    await page.goto(`/r/${link.token}`);
    await shot(page, 'Shared recipe link (no account)', 'What someone sees when you text them a recipe.', { full: true });
  });

  // --- Signed in ------------------------------------------------------------------------------
  await signIn(page, owner, hh.id);

  group = 'Plan';
  await step('week', async () => {
    await page.goto('/meal-plan');
    await shot(page, 'Plan — this week', '', { full: true });
  });
  await step('day sheet', async () => {
    await openToday();
    await shot(page, 'Day sheet');
    await sheet(page).getByText('Chicken Parmesan').first().click();
    await shot(page, 'Day sheet — meal expanded', 'Change / View recipe / servings / delete.');
  });
  await step('picker', async () => {
    await openToday();
    await sheet(page).getByRole('button', { name: /Add a snack/ }).click();
    await shot(page, 'Recipe picker', 'Search, filter by group, or type anything.');
    await sheet(page).locator('input').first().fill('toast');
    await shot(page, 'Recipe picker — typed something new');
    await sheet(page).getByText('Eat out', { exact: true }).click();
    await shot(page, 'Eat out picker');
  });
  await step('optional prompt', async () => {
    await openToday();
    await sheet(page).getByRole('button', { name: /Add side/ }).last().click();
    await page.getByText('Steak Frites', { exact: true }).last().click();
    await shot(page, 'Optional extras prompt');
  });
  await step('next month', async () => {
    await page.goto('/meal-plan');
    await page.getByRole('button', { name: 'Next month' }).click();
    await shot(page, 'Plan — next month', 'The rail lists that month\u2019s planned days; empty months say so.');
    await page.goto('/meal-plan');
    await page.getByRole('button', { name: /^Add .+ to Groceries$/ }).click();
    await shot(page, 'Add planned meals to Groceries — confirm');
  });

  group = 'Recipes';
  await step('catalog', async () => {
    await page.goto('/recipes');
    await shot(page, 'Recipe catalog', '', { full: true });
    await page.getByPlaceholder(/Search recipes/).fill('steak');
    await shot(page, 'Recipe search');
  });
  await step('drawer', async () => {
    await page.goto('/recipes/section/dinner');
    await shot(page, 'Dinner drawer — groups', 'The + and pencil on each card are 24pt targets.', { full: true });
    await page.getByText('Main dish', { exact: true }).first().click();
    await shot(page, 'Group — with split suggestion', '', { full: true });
    await page.getByRole('button', { name: /^Options for/ }).click();
    await shot(page, 'Group ••• menu');
    await sheet(page).getByRole('button', { name: 'Edit group' }).click();
    await shot(page, 'Edit group');
  });
  await step('recipe', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await shot(page, 'Recipe', 'No "Plan this" action; photo/video editing sits between ingredients and method.', { full: true });
  });
  await step('share', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await page.getByRole('button', { name: 'Recipe options' }).click();
    await shot(page, 'Recipe ••• menu');
    await sheet(page).getByRole('button', { name: /^Share/ }).click();
    await shot(page, 'Share sheet');
  });
  await step('add to plan', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await page.getByRole('button', { name: 'Add to plan' }).click();
    await shot(page, 'Add to plan');
  });
  await step('organize', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await fromMenu(page, 'Recipe options', 'Organize');
    await shot(page, 'Organize', '', { full: true });
  });
  await step('photos', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await fromMenu(page, 'Recipe options', 'Photos & links');
    await shot(page, 'Photos & links', '', { full: true });
  });
  await step('index card', async () => {
    await page.goto(`/recipes/${parm.id}`);
    await fromMenu(page, 'Recipe options', 'Index card');
    await shot(page, 'Index card', '', { full: true });
  });
  await step('edit', async () => {
    await page.goto(`/recipes/${parm.id}/edit`);
    await shot(page, 'Edit recipe', '', { full: true });
  });
  await step('new', async () => {
    await page.goto('/recipes/new');
    await shot(page, 'New recipe — type it out', '', { full: true });
    await page.getByPlaceholder('unit').first().click();
    await shot(page, 'Unit picker');
    await page.getByRole('tab', { name: 'From a link' }).click();
    await shot(page, 'New recipe — from a link', '', { full: true });
    await page.getByRole('tab', { name: 'Paste' }).click();
    await shot(page, 'New recipe — paste', '', { full: true });
  });

  group = 'Groceries';
  await step('list', async () => {
    await page.goto('/grocery-list');
    await shot(page, 'Grocery list', '', { full: true });
  });
  await step('done shopping', async () => {
    await page.goto('/grocery-list');
    await page.getByRole('button', { name: 'Done shopping' }).first().click();
    await shot(page, 'Done shopping sheet', 'Amounts bought are not shown or recorded.');
  });
  await step('move', async () => {
    await page.goto('/grocery-list');
    await page.getByRole('button', { name: 'List options' }).click();
    await shot(page, 'Groceries ••• menu');
    await sheet(page).getByRole('button', { name: 'Change aisles' }).click();
    await shot(page, 'Change aisles');
  });
  await step('copy for notes', async () => {
    await page.goto('/grocery-list');
    await page.getByRole('button', { name: 'List options' }).click();
    await sheet(page).getByRole('button', { name: 'Copy for Notes' }).click();
    await shot(page, 'Copied for Notes', 'Plain lines, aisle order — Notes turns them into checkboxes.');
  });
  await step('swipe', async () => {
    await page.goto('/grocery-list');
    await swipeLeft(page, page.getByText('coffee', { exact: true }));
    await shot(page, 'Swipe to remove');
  });

  group = 'Cupboard';
  await step('cupboard', async () => {
    await page.goto('/cupboard');
    await shot(page, 'Cupboard', 'Have/Low, exact amounts, and Always have.', { full: true });
    await page.getByPlaceholder(/Do we have/).fill('flour');
    await shot(page, 'Cupboard search — not there');
  });
  await step('edit item', async () => {
    await page.goto('/cupboard');
    await page.getByText('eggs', { exact: true }).click();
    await shot(page, 'Edit cupboard item');
    await sheet(page).getByPlaceholder('unit').click();
    await shot(page, 'Edit cupboard item — unit list', 'The list runs off the bottom of the screen.');
  });
  await step('swipe', async () => {
    await page.goto('/cupboard');
    await swipeLeft(page, page.getByText('rice', { exact: true }));
    await shot(page, 'Swipe — buy again / remove');
  });

  group = 'Household';
  await step('household', async () => {
    await page.goto('/household');
    await shot(page, 'Household', '', { full: true });
    await page.getByRole('button', { name: 'Show QR code' }).click();
    await shot(page, 'Invite someone — QR code');
  });
  for (const row of ['Household', 'Store aisles', 'You', 'Join a household', 'Start another household']) {
    await step(row, async () => {
      await page.goto('/household');
      await page.getByRole('button', { name: new RegExp(`^${row}`) }).last().click();
      await shot(page, `Household → ${row}`, '', { full: false });
    });
  }
  await step('place', async () => {
    await page.goto('/household');
    await page.getByText('Golden Dragon').first().click();
    await shot(page, 'Place details');
  });
  await step('icons', async () => {
    await page.goto('/household');
    await page.getByRole('button', { name: /^Recipe icons/ }).click();
    await page.getByRole('button', { name: /Change/ }).first().click();
    await shot(page, 'Recipe icon picker');
  });

  // --- Dark mode pass on the main tabs --------------------------------------------------------
  group = 'Dark mode';
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const [path, title] of [['/meal-plan', 'Plan'], ['/recipes', 'Recipes'], [`/recipes/${parm.id}`, 'Recipe'], ['/grocery-list', 'Groceries'], ['/cupboard', 'Cupboard'], ['/household', 'Household']]) {
    await step(title, async () => {
      await page.goto(path);
      await shot(page, `${title} (dark)`);
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });

  writeFileSync(join(OUT, 'screens.json'), JSON.stringify({ capturedAt: new Date().toISOString(), shots, missed }, null, 2));
  if (missed.length) console.log('Screens not captured:\n' + missed.join('\n'));
});
