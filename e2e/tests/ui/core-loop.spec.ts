import { expect, test } from '@playwright/test';
import { admin, call, groceries, find, isoDate, legacyMember, newHousehold, newRecipe, plan } from '../../lib/api';
import { calendarDay, fillSlot, sheet, signIn, tab, tapRowStart } from '../../lib/ui';
import { TUTORIAL_SEEN } from '../../lib/device';

/**
 * Recipe → plan → groceries → shop → cupboard, clicked through at iPhone size, the way the
 * family actually uses it.
 */

test('sign in from the tap-your-name screen with the keypad', async ({ page }) => {
  const hh = await newHousehold();
  // Made for them before invite links, and never signed into: they choose a PIN on the keypad.
  const { username } = await legacyMember(hh.id, null);

  await page.goto('/');
  // Email and password come first now; the name-and-PIN screens are a link underneath.
  await page.getByText('Sign in with your name and PIN').click();
  await page.getByRole('button', { name: new RegExp(hh.name) }).click();
  await page.getByRole('button', { name: username }).click();
  await expect(page.getByText('Pick a 4-digit PIN')).toBeVisible();
  for (const d of '24682468') await page.getByRole('button', { name: d, exact: true }).click();
  // Exact: the sign-in screen's own "Meal Planner" heading would otherwise match before it has gone.
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  // A PIN-only account is asked to move to email and password straight away.
  await expect(sheet(page).getByRole('heading', { name: 'Add an email and password' })).toBeVisible();
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
  const slot = await fillSlot(page, 'Dinner');
  await slot.getByRole('button', { name: /^Chicken Parmesan/ }).click();

  // The day sheet (not the picker) now has it as Dinner's main, ready for a side.
  await expect(slot).toHaveCount(0);
  await expect(sheet(page).getByRole('button', { name: 'Add a side' })).toBeVisible();
  await expect(sheet(page).getByRole('tab', { name: /^Dinner/ })).toContainText('1 dish');
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
  const slot = await fillSlot(page, 'Dinner');
  await slot.getByRole('button', { name: /^Steak Frites/ }).click();
  const extras = sheet(page);
  await expect(extras.getByRole('heading', { name: 'Include the extras?' })).toBeVisible();
  await expect(extras.getByText('Steak Frites has 1 optional ingredient.')).toBeVisible();
  await extras.getByRole('checkbox', { name: /^Parsley/ }).click();
  await extras.getByRole('button', { name: 'Plan with 1 extra' }).click();

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
  await page.getByRole('button', { name: 'Add the next 7 days to groceries' }).click();
  // It asks first, naming the day that will add something and how much.
  const confirm = sheet(page);
  await expect(confirm.getByRole('heading', { name: 'Add 1 day to groceries?' })).toBeVisible();
  await expect(confirm.getByRole('checkbox', { name: /Chili/ })).toHaveAttribute('aria-checked', 'true');
  await confirm.getByRole('button', { name: 'Add 1 item' }).click();
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

  const other = await browser.newContext({ storageState: TUTORIAL_SEEN, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
  // The days of the planning window as tiles, today first.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = tomorrow.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const short = tomorrow.toLocaleDateString('en-US', { weekday: 'short' });
  await sheet(page).getByRole('radio', { name: day }).click();
  await sheet(page).getByText('feta').click();
  // Filed under Breakfast, so Breakfast is already chosen.
  await expect(sheet(page).getByRole('radio', { name: 'Breakfast' })).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('button', { name: `Add to ${short} · Breakfast` }).click();
  await expect(page.getByText(`On the plan for ${short} · Breakfast`)).toBeVisible();
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
  // Share is the round button on the photo, beside •••; everything else waits behind •••.
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
  for (const hidden of [/^Edit recipe/, /^Organise/, /^Index card/, /^Photos & links/, /^Delete/, /^Add photos/]) {
    await expect(page.getByRole('button', { name: hidden })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Recipe options' }).click();
  for (const shown of [/^Edit recipe/, /^Share/, /^Organise/, /^Photos & links/, /^Index card/, /^Delete/]) {
    await expect(sheet(page).getByRole('button', { name: shown })).toBeVisible();
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
  await expect(page.getByText("Plan the week together. One list, everyone's phone.")).toBeVisible();
});

test('the avatar opens Settings: your account, and the way into the household', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Your account' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('heading', { name: hh.owner.displayName })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(settings.getByRole('button', { name: /^Theme/ })).toBeVisible();
  // Your name and sign-in are one row further in; that sheet names itself, so the card inside
  // drops its own title.
  await settings.getByRole('button', { name: /^Password & sign-in/ }).click();
  const account = page.getByRole('dialog', { name: 'Password & sign-in' });
  await expect(account.getByText('Username')).toBeVisible();
  await expect(account.getByRole('heading', { name: 'You', exact: true })).toHaveCount(0);
  await account.getByRole('button', { name: 'Close' }).click();
  // Household lost its tab and lives in here now.
  await settings.getByRole('link', { name: /^Household settings/ }).click();
  await expect(page).toHaveURL(/\/household$/);
});
