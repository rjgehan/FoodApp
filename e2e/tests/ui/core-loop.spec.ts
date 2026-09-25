import { expect, test } from '@playwright/test';
import { admin, call, groceries, find, isoDate, newHousehold, newRecipe, plan } from '../../lib/api';
import { calendarDay, sheet, signIn, tab, tapRowStart } from '../../lib/ui';

/**
 * Recipe → plan → groceries → shop → cupboard, clicked through at iPhone size, the way the
 * family actually uses it.
 */

test('sign in from the tap-your-name screen with the keypad', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/users`, { token: owner.token, body: { username: `pad${Date.now()}` } });
  const username = (await call('GET', `/api/households/${hh.id}/members`, { token: owner.token }))
    .find((m: any) => m.username.startsWith('pad')).username;

  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(hh.name) }).click();
  await page.getByRole('button', { name: username }).click();
  await expect(page.getByText('Pick a 4-digit PIN')).toBeVisible();
  for (const d of '24682468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible();
});

test('plan a recipe for next Tuesday from the Plan tab', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Chicken Parmesan', [{ name: 'chicken breast', qty: 2 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');

  // The coming Tuesday, picked off the month calendar at the bottom of the page.
  const today = new Date();
  const ahead = (2 - today.getDay() + 7) % 7 || 7;
  const d = new Date(today);
  d.setDate(today.getDate() + ahead);

  await (await calendarDay(page, d)).click();
  await sheet(page).getByRole('button', { name: /^\+?\s*Add$/ }).nth(2).click(); // Dinner
  await page.getByText('Chicken Parmesan', { exact: true }).last().click();

  // The day sheet (not the picker) now lists it under Dinner.
  await expect(sheet(page).getByText('Add side')).toBeVisible();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  const saved = () => call('GET', `/api/households/${hh.id}/meal-plan?start=${y}-${m}-${day}&end=${y}-${m}-${day}`, { token: hh.owner.token });
  await expect.poll(async () => (await saved()).length).toBe(1);
  expect((await saved())[0]).toMatchObject({ mealType: 'DINNER', recipeName: 'Chicken Parmesan' });
});

test('a recipe with optional extras asks which ones to buy', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Steak Frites', [
    { name: 'ribeye', qty: 1, unit: 'lb' },
    { name: 'parsley', qty: 1, unit: 'bunch', optional: true },
  ]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  const today = new Date().getDate();
  await page.getByText(String(today), { exact: true }).first().click();
  await sheet(page).getByRole('button', { name: /^\+?\s*Add$/ }).nth(2).click();
  await page.getByText('Steak Frites', { exact: true }).last().click();
  await expect(sheet(page).getByText('parsley')).toBeVisible();
  await sheet(page).getByText('parsley').click();
  await sheet(page).getByRole('button', { name: 'Add to Dinner' }).click();

  const saved = () => call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token });
  await expect.poll(async () => (await saved()).length).toBe(1);
  expect((await saved())[0].includedOptionalIngredientIds).toHaveLength(1);
});

test('Plan → Groceries covers the planning window, even late in the week', async ({ page }) => {
  // On a Thursday the Plan tab opens on a mostly-past week; the meals the family is shopping
  // for are next Monday–Wednesday.
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Chili', [{ name: 'beans', qty: 2, unit: 'can' }]);
  await plan(hh.id, isoDate(5), 'DINNER', { recipeId: r.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: /^Add .+ to Groceries$/ }).click();
  await expect(sheet(page).getByText(/Add the meals from/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Add to Groceries' }).click();
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name)).toEqual(['beans']);
});

test('check off, then Done shopping puts things in the cupboard', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Pasta', [
    { name: 'spaghetti', qty: 1, unit: 'lb' },
    { name: 'garlic', qty: 4, unit: 'clove' },
  ]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id, servings: 4 });
  await call('POST', `/api/households/${hh.id}/grocery-list/add-all?start=${isoDate(0)}&end=${isoDate(6)}`, { token: hh.owner.token });

  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  await expect(page.getByText('2 to buy')).toBeVisible();

  await tapRowStart(page, page.getByText('spaghetti', { exact: true }));
  await expect(page.getByText(/In the cart · 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Done shopping' }).first().click();
  await sheet(page).getByRole('button', { name: /Put away 1/ }).click();

  await expect(page.getByText('1 to buy')).toBeVisible();
  await tab(page, 'Cupboard').click();
  await expect(page.getByText('spaghetti', { exact: true })).toBeVisible();
  expect(find(await groceries(hh.id), 'spaghetti')).toBeUndefined();
});

test('a second phone sees ticks without refreshing', async ({ page, browser }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: hh.owner.token, body: { ingredientName: 'lemons' } });

  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone2 = await other.newPage();
  await signIn(phone2, hh.owner, hh.id);
  await phone2.goto('/grocery-list');
  await expect(phone2.getByText('lemons')).toBeVisible();
  // The list loads before the live socket is up; a tick sent before then is not an event it can see.
  await expect(phone2.getByText(/offline/)).toHaveCount(0);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  await tapRowStart(page, page.getByText('lemons', { exact: true }));

  await expect(phone2.getByText(/In the cart · 1/)).toBeVisible();
  await other.close();
});

test('there is no home screen: the app opens on Plan, with five tabs', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/');
  await expect(page).toHaveURL(/\/meal-plan$/);
  await page.goto('/somewhere-that-does-not-exist');
  await expect(page).toHaveURL(/\/meal-plan$/);
  const tabs = page.getByRole('link').filter({ hasText: /^(Plan|Recipes|Groceries|Cupboard|Household)$/ });
  await expect(tabs.last()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today', exact: true })).toHaveCount(0);
});

test('recipe → plan in one sheet, straight from the recipe', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Shakshuka', [
    { name: 'egg', qty: 4 },
    { name: 'feta', qty: 2, unit: 'oz', optional: true },
  ], { section: 'BREAKFAST' });
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await page.getByRole('button', { name: 'Add to plan' }).click();
  await sheet(page).getByRole('button', { name: 'Tomorrow' }).click();
  await sheet(page).getByText('feta').click();
  // Filed under Breakfast, so Breakfast is already chosen.
  await sheet(page).getByRole('button', { name: 'Add to Tomorrow · Breakfast' }).click();
  await expect(page.getByText(/On the plan for Tomorrow · Breakfast/)).toBeVisible();
  const [e] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(1)}`, { token: hh.owner.token });
  expect(e).toMatchObject({ mealType: 'BREAKFAST', recipeName: 'Shakshuka' });
  expect(e.includedOptionalIngredientIds).toHaveLength(1);
});

test('the recipe page has one filled button, and the rest behind •••', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Ramen', [{ name: 'noodles', qty: 1 }], {
    videoUrl: 'https://www.tiktok.com/@cook/video/1',
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByRole('button', { name: 'Add to plan' })).toBeVisible();
  for (const hidden of ['Edit', 'Share', 'Organize', 'Index card', 'Add photos']) {
    await expect(page.getByRole('button', { name: hidden, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Recipe options' }).click();
  for (const shown of ['Edit', 'Share', 'Organize', 'Photos & video', 'Index card']) {
    await expect(sheet(page).getByRole('button', { name: shown, exact: true })).toBeVisible();
  }
});

test('sign out lives under Household → You, not in the header', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await expect(page.getByRole('button', { name: /log out|sign out/i })).toHaveCount(0);
  await page.goto('/household');
  // The row reads "You" plus your name; the header's avatar is "Your account".
  await page.getByRole('button', { name: /^You / }).click();
  await sheet(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Who’s cooking?')).toBeVisible();
});

test('the avatar opens Settings: your account, and the way into the household', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Your account' }).click();
  await expect(sheet(page).getByText('Username')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
  // The sheet names itself once: the card inside drops its own title.
  await expect(sheet(page).getByText('Settings', { exact: true })).toHaveCount(1);
  // Household lost its tab and lives in here now.
  await sheet(page).getByRole('link', { name: 'Household settings' }).click();
  await expect(page).toHaveURL(/\/household$/);
});
