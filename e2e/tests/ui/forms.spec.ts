import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newRecipe } from '../../lib/api';
import { fromMenu, sheet, signIn } from '../../lib/ui';

test('pasting an ordinary recipe fills the form', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByRole('tab', { name: 'Paste' }).click();
  await page.getByPlaceholder(/Name:/).fill(
    'Chicken Parmesan\n\nIngredients\n2 chicken breasts\n1 1/2 cups marinara sauce\n8 oz mozzarella, shredded\n\nInstructions\nFry it.\nBake it.',
  );
  await page.getByRole('button', { name: 'Read it' }).click();

  // Scoped to the tab on screen: Type it out is still there behind it, hidden, with its own form.
  const form = page.getByRole('tabpanel');
  await expect(form.getByPlaceholder('Recipe name')).toHaveValue('Chicken Parmesan');
  const qty = form.getByPlaceholder('qty');
  await expect(qty.nth(1)).toHaveValue('1.5');
  await expect(form.getByPlaceholder('ingredient').nth(1)).toHaveValue('marinara sauce');
  await expect(form.getByPlaceholder('One step per line.')).toHaveValue('Fry it.\nBake it.');
});

test('a blank amount is saved as "some", not as 1', async ({ page }) => {
  test.fail(true, 'KNOWN BUG: RecipeForm turns a blank quantity into 1 — "1 Salt and pepper to taste"');
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByPlaceholder('Recipe name').fill('Seasoned Eggs');
  await page.getByPlaceholder('ingredient').first().fill('salt and pepper');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Seasoned Eggs' })).toBeVisible();
  const recipes = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(Number(recipes[0].ingredients[0].quantity)).not.toBe(1);
});

test('typing a unit and pressing Return keeps what was typed', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  const unit = page.getByPlaceholder('unit').first();
  await unit.click();
  await unit.pressSequentially('lb');
  await unit.press('Enter');
  await expect(unit).toHaveValue('lb');
});

test('the unit list is not cut off at the bottom of a sheet', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'flour' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByText('flour', { exact: true }).click();
  await sheet(page).getByText('Track an exact amount').click();
  await sheet(page).getByPlaceholder('unit').click();
  const list = page.getByRole('listbox');
  const box = await list.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test('a link typed without https:// is saved with it, never a dead page', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Dumplings', [{ name: 'flour', qty: 2, unit: 'cup' }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', 'Photos & links');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link 1', { exact: true }).fill('tiktok.com/@cook/video/1');
  // One button, which says what it will do: close, or save the links and close.
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/links')),
    page.getByRole('button', { name: 'Save links' }).click(),
  ]);
  // Back as the server keeps it, so what is on screen is what was saved.
  await expect(page.getByRole('link', { name: 'Watch on TikTok' })).toHaveAttribute('href', 'https://tiktok.com/@cook/video/1');
  await expect(page.getByText('Ingredients')).toBeVisible({ timeout: 1000 });
});

test('a video somebody named keeps its name, and a recipe with no links can be given one', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Dumplings', [{ name: 'flour', qty: 2, unit: 'cup' }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  // Not only behind •••: the page itself offers it when there are none.
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link 1', { exact: true }).fill('https://www.tiktok.com/@nonna/video/2');
  await page.getByLabel('Link 1 name').fill("Nonna's version");
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/links')),
    page.getByRole('button', { name: 'Save links' }).click(),
  ]);
  await expect(page.getByRole('link', { name: "Nonna's version · TikTok" }))
    .toHaveAttribute('href', 'https://www.tiktok.com/@nonna/video/2');

  // The public page names it the same way.
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: hh.owner.token });
  await page.goto(`/r/${token}`);
  await expect(page.getByRole('link', { name: "Nonna's version · TikTok" })).toBeVisible();
});

test('a recipe keeps as many links as you give it, and the page lists them', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByPlaceholder('Recipe name').fill('Ragu');
  await page.getByPlaceholder('ingredient').first().fill('mince');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link 1', { exact: true }).fill('tiktok.com/@cook/video/9');
  // Named after the site until somebody names it.
  await expect(page.getByLabel('Link 1 name')).toHaveAttribute('placeholder', /TikTok/);
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link 2', { exact: true }).fill('https://www.seriouseats.com/ragu');
  await page.getByLabel('Link 2 name').fill('Serious Eats version');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByRole('heading', { name: 'Ragu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch on TikTok' })).toHaveAttribute('href', 'https://tiktok.com/@cook/video/9');
  await expect(page.getByRole('link', { name: /Serious Eats version/ })).toHaveAttribute('href', 'https://www.seriouseats.com/ragu');

  const [saved] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(saved.links).toEqual([
    { url: 'https://tiktok.com/@cook/video/9', label: null },
    { url: 'https://www.seriouseats.com/ragu', label: 'Serious Eats version' },
  ]);

  // Editing starts from them, and taking one out takes it out.
  await page.goto(`/recipes/${saved.id}/edit`);
  await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('https://tiktok.com/@cook/video/9');
  await page.getByRole('button', { name: 'Remove link 1' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Ragu' })).toBeVisible();
  const after = await call('GET', `/api/recipes/${saved.id}`, { token: hh.owner.token });
  expect(after.links).toEqual([{ url: 'https://www.seriouseats.com/ragu', label: 'Serious Eats version' }]);
});

test('a link the server will not keep is said on the form, not lost', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByPlaceholder('Recipe name').fill('Ragu');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link 1', { exact: true }).fill('not a link');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  // Named, so with several links on the form it is clear which one.
  await expect(page.getByText('"not a link" isn\'t a web address')).toBeVisible();
  await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('not a link');
});

test('a place menu link typed without https:// is accepted or explained', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'Diner' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await page.getByText('Diner', { exact: true }).click();
  await sheet(page).locator('input[type=url]').fill('diner.com/menu');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('username sign-in turns off iOS auto-capitalisation', async ({ page }) => {
  await page.goto('/');
  // Behind the email form now, with the rest of the name-and-PIN screens.
  await page.getByText('Sign in with your name and PIN').click();
  await page.getByText('Sign in with a username instead').click();
  await expect(page.locator('input').first()).toHaveAttribute('autocapitalize', /none|off/);
});

test('recipe groups: Not now on a split suggestion is remembered', async ({ page }) => {
  const hh = await newHousehold();
  for (const [name, ing] of [['Beef Stew', 'beef'], ['Beef Tacos', 'ground beef'], ['Chicken Curry', 'chicken thigh']]) {
    await newRecipe(hh.id, name, [{ name: ing, qty: 1, unit: 'lb' }], { categories: ['Main dish'] });
  }
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByText('Main dish', { exact: true }).click();
  await expect(page.getByText(/Split Main dish up\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.reload();
  await expect(page.getByText('Beef Stew')).toBeVisible(); // loaded, so an absence means something
  await expect(page.getByText(/Split Main dish up\?/)).toHaveCount(0);
});

test('group card buttons are big enough to tap', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Stew', [{ name: 'beef', qty: 1 }], { categories: ['Main dish'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  // Before the fix: two 24pt buttons ("Rename or delete …"); after: one ••• ("More for …").
  const btn = page.getByRole('button', { name: /^(Rename or delete|More for) Main dish$/ });
  const box = await btn.boundingBox();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
});
