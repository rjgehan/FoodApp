// Real screens, straight out of the running app, for videos and press shots.
// Dark mode, iPhone size, the showcase household — no mockups, no recreations.
//
//   OUT=../brag-output-.../composition/assets/frames node scripts/capture-frames.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:8080';
const WEB = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? './frames';
const HOUSEHOLD = process.env.SHOWCASE_HOUSEHOLD ?? 'Gehan House';

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

mkdirSync(OUT, { recursive: true });

const session = await call('POST', '/api/auth/login', { body: { username: 'ryan', pin: '1234' } });
const houses = await call('GET', '/api/households', { token: session.token });
const home = houses.find((h) => h.name === HOUSEHOLD) ?? houses[0];
const recipes = await call('GET', `/api/households/${home.id}/recipes`, { token: session.token });
const hero = recipes.find((r) => r.name.includes('Parmentier')) ?? recipes.find((r) => r.coverImageId);

// Re-running must not hit "that's already on this meal": clear tomorrow's slot for the
// recipe the capture plans, so the add always succeeds and the shot is the success state.
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const planned = await call('GET', `/api/households/${home.id}/meal-plan?start=${tomorrow}&end=${tomorrow}`, { token: session.token });
for (const entry of planned.filter((e) => e.recipeId === hero.id)) {
  await call('DELETE', `/api/households/${home.id}/meal-plan/${entry.id}`, { token: session.token });
}

const browser = await chromium.launch({
  channel: 'chrome',
  // A phone has no hover and a coarse pointer; without this the app shows desktop affordances.
  args: ['--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  hasTouch: true,
  isMobile: true,
  baseURL: WEB,
});
const page = await ctx.newPage();
await page.goto('/');
await page.evaluate(([s, hh]) => {
  localStorage.setItem('mp_token', s.token);
  localStorage.setItem('mp_userId', s.userId);
  localStorage.setItem('mp_displayName', s.displayName);
  localStorage.setItem('mp_activeHouseholdId', hh);
}, [session, home.id]);

const shot = async (name, wait = 700) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
};

const go = async (path, name) => {
  await page.goto(path);
  await shot(name);
};

// The catalog, one drawer, and the recipe itself — the way you'd actually walk in.
await go('/recipes', '01-recipes');
await go('/recipes/section/dinner', '02-dinner-groups');
await page.getByRole('button', { name: /^Main/ }).first().click();
await shot('03-dinner-main');
await go(`/recipes/${hero.id}`, '04-recipe');

// Recipe → plan, the first step of the loop.
await page.getByRole('button', { name: /Add to plan/i }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Tomorrow' }).click();
await shot('05-add-to-plan');
await page.getByRole('dialog').getByRole('button', { name: /^Add to Tomorrow/ }).click();
await shot('06-added');

// Plan → groceries.
await go('/meal-plan', '07-plan');
await go('/grocery-list', '08-groceries');

// Shopping: tick them off one at a time, keeping a frame per tick so the video can
// play the real states back as motion instead of animating a mockup.
for (const n of [1, 2, 3]) {
  const next = page.locator('button[aria-pressed="false"]').first();
  await next.click();
  await page.waitForTimeout(260);
  await shot(`09-groceries-tick-${n}`, 120);
}

// Cook and put away.
await go('/cupboard', '10-cupboard');
await go('/recipes/explore', '11-explore');

// Scrolled into the method, where a recipe earns its keep.
await page.goto(`/recipes/${hero.id}`);
await page.waitForTimeout(700);
await page.evaluate(() => window.scrollTo({ top: 900 }));
await shot('12-recipe-method', 500);

await browser.close();
console.log(`\nFrames in ${OUT}`);
