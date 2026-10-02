import { expect, test, type Page } from '@playwright/test';
import { call, isoDate, newHousehold, newRecipe, plan, unique } from '../../lib/api';
import { cameraShowing, NUTELLA, ON_THE_JAR } from '../../lib/camera';
import { signIn } from '../../lib/ui';

/**
 * Nutrition facts on the web (the mockup's 5.1 door, 5.4 home, 5.5 label, 5.6 recipe): the
 * numbers are the server's own (USDA figures, checked by the API suite), so these check that the
 * screens show them, that the switches change them, and that the ways in and out work.
 *
 * Open Food Facts is never called: packets are stubbed in the browser, as the cupboard's
 * scanning tests stub the catalogue — a test that phones a charity's servers fails on a train.
 */

/** 400 g chicken breast, 2 eggs, 2 tbsp olive oil, salt, optional coriander — 215 kcal a serving of 4. */
async function chickenAndEggs(householdId: string) {
  return newRecipe(householdId, unique('Chicken and eggs'), [
    { name: 'chicken breast', qty: 400, unit: 'g' },
    { name: 'eggs', qty: 2 },
    { name: 'olive oil', qty: 2, unit: 'tbsp' },
    { name: 'salt', qty: null },
    { name: 'coriander', qty: 1, unit: 'bunch', optional: true },
  ]);
}

/** A jar of Nutella as Open Food Facts describes it, with a 15 g serving. */
const nutellaLabel = {
  barcode: ON_THE_JAR,
  name: 'Nutella',
  brand: 'Ferrero',
  size: '400 g',
  packGrams: 400,
  liquid: false,
  servingSize: '15 g',
  servingGrams: 15,
  per100g: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fibre: 0, sugars: 56.3, satFat: 10.6, saltG: 0.11, sodiumMg: 43, ironMg: null, calciumMg: null, vitaminCMg: null, potassiumMg: null },
  perServing: { kcal: 81, protein: 0.9, carbs: 8.6, fat: 4.6, fibre: 0, sugars: 8.4, satFat: 1.6, saltG: 0.02, sodiumMg: 6, ironMg: null, calciumMg: null, vitaminCMg: null, potassiumMg: null },
  split: { protein: 5, carbs: 43, fat: 52 },
  details: [
    { key: 'sugars', label: 'Sugars', amount: 56.3, unit: 'g', percentDaily: null },
    { key: 'salt', label: 'Salt', amount: 0.11, unit: 'g', percentDaily: null },
  ],
  badges: [{ key: 'high-sugar', label: 'High sugar', tone: 'warn' }],
  nutriScore: 'e',
  novaGroup: 4,
  hasNutrition: true,
  attribution: { text: 'Data from Open Food Facts (ODbL)', url: `https://world.openfoodfacts.org/product/${ON_THE_JAR}`, licence: 'ODbL 1.0' },
};

/** Open Food Facts, without Open Food Facts: answers only for the barcode on the fixture. */
async function packetsSay(page: Page, body: object | null) {
  await page.route('**/api/nutrition/products/*', (route) => {
    const asked = route.request().url().split('/').pop();
    if (asked !== ON_THE_JAR || !body) {
      return route.fulfill({ status: 404, json: { status: 404, message: 'No product with that barcode.' } });
    }
    return route.fulfill({ json: body });
  });
}

const kcalIn = async (page: Page, where = page.locator('main')) =>
  where.getByText('KCAL', { exact: true }).first().locator('..').locator('span').first().textContent();

test("Explore's Nutrition door shows the week's plan, and opens on the week a day at a time", async ({ page }) => {
  const hh = await newHousehold();
  const recipe = await chickenAndEggs(hh.id);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: recipe.id });

  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore');
  const door = page.getByRole('link', { name: 'Nutrition facts' });
  // One serving of the one meal planned this week: 215 kcal and 26 g of protein, for the day it is on.
  await expect(door.getByText('215', { exact: true })).toBeVisible();
  await expect(door.getByText('26g', { exact: true })).toBeVisible();
  await expect(door.getByText("Daily average of this week's plan")).toBeVisible();
  await expect(door.getByText('Coming soon')).toHaveCount(0);

  await door.click();
  await expect(page).toHaveURL(/\/explore\/nutrition$/);
  await expect(page.getByRole('heading', { name: 'Nutrition facts' })).toBeVisible();
  const week = page.getByRole('region', { name: "This week's plan" });
  await expect(week.getByText('215 kcal a day on average')).toBeVisible();
  await expect(week.getByText('1 day', { exact: true })).toBeVisible();
  // Seven bars, today's with its numbers, the rest with nothing planned.
  const days = week.getByRole('list', { name: 'Calories each day' }).getByRole('listitem');
  await expect(days).toHaveCount(7);
  await expect(days.first()).toHaveAttribute('aria-label', /: 215 kcal, 1 of 1 meal counted$/);
  await expect(days.nth(1)).toHaveAttribute('aria-label', /nothing planned$/);
  await expect(week.getByText('All 1 planned meal counted.', { exact: false })).toBeVisible();
  // The ingredient data's source, as the USDA asks.
  await expect(page.getByRole('link', { name: /FoodData Central, 2026/ })).toHaveAttribute('href', 'https://fdc.nal.usda.gov/');

  await page.getByRole('link', { name: 'Explore' }).first().click();
  await expect(page).toHaveURL(/\/explore$/);
});

test('an empty week says so instead of showing noughts', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore');
  await expect(page.getByRole('link', { name: 'Nutrition facts' }).getByText('Plan some meals and see what your week adds up to')).toBeVisible();
  await page.goto('/explore/nutrition');
  await expect(page.getByText('Nothing counted yet')).toBeVisible();
  await expect(page.getByText('Nothing planned for the next seven days.')).toBeVisible();
  await page.getByRole('link', { name: 'Plan a meal' }).click();
  await expect(page).toHaveURL(/\/meal-plan$/);
});

test('look up an ingredient: per 100 g or per egg, onto the list, and into recent lookups', async ({ page }) => {
  const hh = await newHousehold();
  await call('DELETE', '/api/nutrition/recent', { token: hh.owner.token });
  const packetSearches: string[] = [];
  page.on('request', (r) => r.url().includes('products=true') && packetSearches.push(r.url()));

  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/nutrition');
  await expect(page.getByText('Things you look up or scan show here.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search an ingredient or product' }).fill('egg');
  const ingredients = page.getByRole('list', { name: 'Ingredients' });
  await ingredients.getByRole('link', { name: /^Egg, whole, raw, fresh/ }).click();

  await expect(page).toHaveURL(/\/explore\/nutrition\/foods\/171287$/);
  await expect(page.getByRole('heading', { name: 'Egg' })).toBeVisible();
  await expect(page.getByText('Whole, raw, fresh')).toBeVisible();
  // Per 100 g first, as USDA gives it; a large egg is half that.
  await expect.poll(() => kcalIn(page)).toBe('143');
  await page.getByRole('radio', { name: '1 large (50g)' }).click();
  await expect.poll(() => kcalIn(page)).toBe('72');
  await expect(page.getByText('High protein')).toBeVisible();
  await expect(page.getByRole('link', { name: /FoodData Central, 2026/ }).first()).toBeVisible();
  // Typing never asked Open Food Facts anything.
  expect(packetSearches).toEqual([]);

  await page.getByRole('button', { name: 'Add to the grocery list' }).click();
  await expect(page.getByText('Added Egg to the list')).toBeVisible();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/grocery-list`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name.toLowerCase() === 'egg')).toBe(true);

  await page.getByRole('button', { name: 'Nutrition' }).click();
  const recent = page.getByRole('list', { name: 'Recent lookups' });
  await expect(recent.getByRole('link', { name: /Egg, whole, raw, fresh.*Ingredient · 143 kcal per 100g/ })).toBeVisible();
});

test('a USDA food is titled by the food, not its group, and that is what goes on the list', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  // "Fish, salmon, Atlantic, farmed, raw" is salmon.
  await page.goto('/explore/nutrition/foods/175167');
  await expect(page.getByRole('heading', { name: 'Salmon' })).toBeVisible();
  await expect(page.getByText('Atlantic, farmed, raw')).toBeVisible();
  await page.getByRole('button', { name: 'Add to the grocery list' }).click();
  await expect(page.getByText('Added Salmon to the list')).toBeVisible();
  // "Oil, olive, salad or cooking" is olive oil.
  await page.goto('/explore/nutrition/foods/171413');
  await expect(page.getByRole('heading', { name: 'Olive oil' })).toBeVisible();
});

test('packets are only searched for when asked, and say where they came from', async ({ page }) => {
  const hh = await newHousehold();
  const asked: string[] = [];
  await page.route('**/api/nutrition/search?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('products') !== 'true') return route.continue();
    asked.push(url.searchParams.get('q') ?? '');
    return route.fulfill({
      json: { query: url.searchParams.get('q'), ingredients: [], recipes: [], productsStatus: 'ok', attribution: [],
        products: [{ barcode: ON_THE_JAR, name: 'Nutella', brand: 'Ferrero', size: '400 g', kcal: 539, protein: 6.3 }] },
    });
  });
  await packetsSay(page, nutellaLabel);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/nutrition');
  const search = page.getByRole('searchbox', { name: 'Search an ingredient or product' });
  await search.fill('nutella');
  await expect(page.getByRole('button', { name: /Search packets for “nutella”/ })).toBeVisible();
  expect(asked).toEqual([]);
  await search.press('Enter');
  const products = page.getByRole('list', { name: 'Products' });
  await products.getByRole('button', { name: /Nutella.*539 kcal per 100g/ }).click();
  expect(asked).toEqual(['nutella']);
  await expect(page).toHaveURL(new RegExp(`/explore/nutrition/products/${ON_THE_JAR}$`));
  await expect(page.getByRole('heading', { name: 'Nutella' })).toBeVisible();
});

test('scan a packet: its label per serving or per 100 g, with the Open Food Facts credit, into the cupboard', async ({ page, context }) => {
  const hh = await newHousehold();
  await context.grantPermissions(['camera']);
  await cameraShowing(page, NUTELLA);
  await packetsSay(page, nutellaLabel);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/nutrition');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();
  await expect(page.getByRole('dialog', { name: 'Scan a product' })).toBeVisible();

  // Reading it fetches a megabyte of WebAssembly the first time.
  await expect(page.getByRole('heading', { name: 'Nutella' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('400 g · Ferrero · scanned')).toBeVisible();
  // Opens on a serving, as the packet gives one.
  await expect(page.getByRole('radio', { name: 'Per serving (15g)' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => kcalIn(page)).toBe('81');
  await expect(page.getByRole('list', { name: 'Details' }).getByText('8.4g')).toBeVisible();
  await page.getByRole('radio', { name: 'Per 100g' }).click();
  await expect.poll(() => kcalIn(page)).toBe('539');
  await expect(page.getByRole('list', { name: 'Details' }).getByText('56g')).toBeVisible();
  await expect(page.getByText('High sugar')).toBeVisible();
  await expect(page.getByText('Nutri-Score E')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Data from Open Food Facts (ODbL)' }).first())
    .toHaveAttribute('href', `https://world.openfoodfacts.org/product/${ON_THE_JAR}`);

  await page.getByRole('button', { name: 'Add to the cupboard' }).click();
  await expect(page.getByText('Added Nutella to the cupboard')).toBeVisible();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name.toLowerCase() === 'nutella')).toBe(true);
});

test('a barcode Open Food Facts does not know says so', async ({ page }) => {
  const hh = await newHousehold();
  await packetsSay(page, null);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/nutrition');
  await page.getByRole('searchbox', { name: 'Search an ingredient or product' }).fill('5000000000001');
  await page.getByRole('button', { name: /^Look up barcode 5000000000001/ }).click();
  await expect(page.getByRole('heading', { name: 'Not in Open Food Facts' })).toBeVisible();
  await page.getByRole('button', { name: 'Search instead' }).click();
  await expect(page).toHaveURL(/\/explore\/nutrition$/);
});

test("a recipe's nutrition, from the recipe page: servings, an optional side counted in, and what was left out", async ({ page }) => {
  const hh = await newHousehold();
  const recipe = await chickenAndEggs(hh.id);

  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${recipe.id}`);
  const way = page.getByRole('list', { name: 'Nutrition' }).getByRole('link', { name: /Nutrition facts/ });
  await expect(way).toContainText('215 kcal a serving');
  await way.click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}/nutrition$`));
  await expect(page.getByRole('heading', { name: recipe.name })).toBeVisible();
  await expect(page.getByText('4 servings in the recipe')).toBeVisible();
  const serving = page.getByRole('region', { name: 'Per serving' });
  await expect.poll(() => kcalIn(page, serving)).toBe('215');
  await expect(serving.getByText('11% of a 2,000 kcal day')).toBeVisible();
  await expect(serving.getByRole('meter', { name: /^Protein/ })).toHaveAttribute('aria-valuemax', '50');

  const contributors = page.getByRole('list', { name: 'Biggest contributors' });
  await expect(contributors.getByRole('listitem').first()).toContainText('56%');
  await expect(contributors.getByRole('listitem').first()).toContainText('Chicken breast');
  await expect(contributors.getByText('Not counted · no amount')).toBeVisible();
  await expect(page.getByText("Salt has no amount, so isn't counted.", { exact: false })).toBeVisible();

  // Two servings is twice one.
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(page.getByText('2 servings', { exact: true })).toBeVisible();
  await expect.poll(() => kcalIn(page, serving)).toBe('431');

  // The optional coriander, counted in with a tap and out again.
  await contributors.getByRole('button', { name: 'Count coriander in' }).click();
  await expect(contributors.getByRole('button', { name: 'Leave coriander out' })).toBeVisible();
  await expect.poll(() => kcalIn(page, serving)).toBe('434');
  await contributors.getByRole('button', { name: 'Leave coriander out' }).click();
  await expect(contributors.getByRole('button', { name: 'Count coriander in' })).toBeVisible();

  // Back to the recipe it came from.
  await page.getByRole('button', { name: 'Recipe' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}$`));

  // And it is now among the recent lookups, from where it opens with "Nutrition" as the way back.
  await page.goto('/explore/nutrition');
  await page.getByRole('list', { name: 'Recent lookups' }).getByRole('link', { name: new RegExp(recipe.name) }).click();
  await expect(page.getByRole('button', { name: 'Nutrition' })).toBeVisible();
});
