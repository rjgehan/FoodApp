import { expect, test } from '@playwright/test';
import { admin, call, find, groceries, isoDate, newHousehold, newRecipe, plan, unique } from '../../lib/api';
import { fromMenu, sheet, signIn, swipeLeft } from '../../lib/ui';

/** The everyday paths not covered by the core loop. */

test('change a planned dinner to a different recipe', async ({ page }) => {
  const hh = await newHousehold();
  const a = await newRecipe(hh.id, 'Pad Thai', [{ name: 'rice noodles', qty: 1, unit: 'package' }]);
  await newRecipe(hh.id, 'Fried Rice', [{ name: 'rice', qty: 2, unit: 'cup' }]);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: a.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await sheet(page).getByText('Pad Thai').click();
  await sheet(page).getByRole('button', { name: 'Change' }).click();
  await page.getByText('Fried Rice', { exact: true }).last().click();
  await expect.poll(async () => {
    const [e] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token });
    return e?.recipeName;
  }).toBe('Fried Rice');
});

test('change servings on a planned meal', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Curry', [{ name: 'chickpeas', qty: 2, unit: 'can' }]);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: r.id, servings: 4 });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await sheet(page).getByText('Curry').click();
  for (let i = 0; i < 4; i++) {
    await sheet(page).getByRole('button', { name: 'More servings' }).click();
    await page.waitForTimeout(250);
  }
  await expect.poll(async () => {
    const [e] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token });
    return e?.servings;
  }).toBe(8);
});

test('"Add this day to Groceries" adds just that day', async ({ page }) => {
  const hh = await newHousehold();
  const r1 = await newRecipe(hh.id, 'Omelette', [{ name: 'egg', qty: 3 }]);
  const r2 = await newRecipe(hh.id, 'Stir fry', [{ name: 'bok choy', qty: 2 }]);
  await plan(hh.id, isoDate(0), 'BREAKFAST', { recipeId: r1.id });
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r2.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await sheet(page).getByText('Add this day to Groceries').click();
  await sheet(page).getByRole('button', { name: 'Add to Groceries' }).click();
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name)).toEqual(['egg']);
});

test('eat out: type a new place and it is saved for next time', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await sheet(page).getByRole('button', { name: /^\+?\s*Add$/ }).nth(1).click(); // Lunch
  await sheet(page).getByText('Eat out', { exact: true }).click();
  await sheet(page).getByPlaceholder(/Tony's/).fill('Noodle Bar');
  await sheet(page).getByText(/Add “Noodle Bar”/).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/places`, { token: hh.owner.token })).map((p: any) => p.name)).toEqual(['Noodle Bar']);
  const [e] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token });
  expect(e).toMatchObject({ mealType: 'LUNCH', placeName: 'Noodle Bar' });
});

test('month view shows planned days and opens one', async ({ page }) => {
  const hh = await newHousehold();
  await plan(hh.id, isoDate(0), 'DINNER', { itemName: 'tacos' });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Show the month' }).click();
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await expect(sheet(page).getByText('tacos')).toBeVisible();
});

test('search finds a recipe by an ingredient', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Green Curry', [{ name: 'lemongrass', qty: 1, unit: 'stalk' }]);
  await newRecipe(hh.id, 'Toast', [{ name: 'bread', qty: 2, unit: 'slice' }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');
  await page.getByPlaceholder(/Search recipes/).fill('lemongr');
  await expect(page.getByText('Green Curry')).toBeVisible();
  await expect(page.getByText('Toast', { exact: true })).toHaveCount(0);
});

test('cupboard: swipe → Buy again moves it from the cupboard to the list', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'coffee' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await swipeLeft(page, page.getByText('coffee', { exact: true }));
  await page.getByRole('button', { name: /Buy again/ }).click();
  await expect.poll(async () => find(await groceries(hh.id), 'coffee')).toBeTruthy();
  // Used up: it leaves the cupboard as it goes on the list.
  await expect(page.getByText('coffee', { exact: true })).toHaveCount(0);
});

test('cupboard: Low is a one-tap toggle', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'flour' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Low', exact: true }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/cupboard`, { token: owner.token }))[0].runningLow).toBe(true);
});

test('groceries: Move an item to another aisle and it sticks', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'tortillas' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  await fromMenu(page, 'List options', 'Change aisles');
  // The aisle picker is a native <select>, which on iOS is the system wheel.
  await page.locator('li', { hasText: 'tortillas' }).first().locator('select').selectOption({ label: 'Frozen' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  const frozenHeading = page.getByText('Frozen', { exact: true });
  await expect(frozenHeading).toBeVisible();
  const [h, t] = await Promise.all([frozenHeading.boundingBox(), page.getByText('tortillas').boundingBox()]);
  expect(t!.y).toBeGreaterThan(h!.y);
});

test('household: reorder an aisle and the list follows', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'milk' } });
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'apples' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await page.getByRole('button', { name: /^Store aisles/ }).click();
  // Walk Dairy & eggs to the top.
  for (let i = 0; i < 8; i++) {
    const up = page.getByRole('button', { name: 'Move Dairy & eggs earlier' });
    if (await up.isDisabled()) break;
    await up.click();
    await page.waitForTimeout(150);
  }
  await page.goto('/grocery-list');
  const [milk, apples] = await Promise.all([page.getByText('milk', { exact: true }).boundingBox(), page.getByText('apples', { exact: true }).boundingBox()]);
  expect(milk!.y).toBeLessThan(apples!.y);
});

test('recipe page: the arrows step through the drawer', async ({ page }) => {
  const hh = await newHousehold();
  const a = await newRecipe(hh.id, 'Alpha Stew', [{ name: 'beef', qty: 1 }]);
  await newRecipe(hh.id, 'Beta Soup', [{ name: 'leek', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${a.id}`);
  await expect(page.getByRole('heading', { name: 'Alpha Stew' })).toBeVisible();
  await page.getByRole('button', { name: /next/i }).or(page.getByRole('link', { name: /next/i })).first().click();
  await expect(page.getByRole('heading', { name: 'Beta Soup' })).toBeVisible();
});

test('a recipe with no ingredients says so when planned', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  const r = await call('POST', `/api/households/${hh.id}/recipes`, { token: owner.token, body: { name: 'Mystery Bake', servings: 2, ingredients: [] } });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: r.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await expect(sheet(page).getByText(/no ingredients|add ingredients|needs ingredients/i)).toBeVisible();
});

test('a drawer shows its own groups, not another drawer’s', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);

  await page.goto('/recipes/section/breakfast');
  for (const own of ['Main', 'Morning drinks', 'Fruit']) {
    await expect(page.getByText(own, { exact: true })).toBeVisible();
  }
  for (const elsewhere of ['Sandwiches', 'Veggie', 'Beef']) {
    await expect(page.getByText(elsewhere, { exact: true })).toHaveCount(0);
  }

  await page.goto('/recipes/section/dinner');
  await expect(page.getByText('Full meal', { exact: true })).toBeVisible();
  await expect(page.getByText('Sandwiches', { exact: true })).toHaveCount(0);
  // Dinner's Main opens onto the meats.
  await page.getByText('Main', { exact: true }).click();
  for (const meat of ['Beef', 'Chicken', 'Pork', 'Seafood']) {
    await expect(page.getByText(meat, { exact: true })).toBeVisible();
  }
});

test('publish a recipe, find it in Explore from another household, keep it', async ({ page }) => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const name = unique('Published Chili');
  const r = await newRecipe(mine.id, name, [{ name: 'beans', qty: 2, unit: 'can' }]);

  // Publish it from the household that owns it.
  await signIn(page, mine.owner, mine.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Share/);
  await sheet(page).getByRole('button', { name: 'Publish to Explore' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Take out of Explore' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/in Explore/)).toBeVisible();

  // Find it from the other household.
  await signIn(page, theirs.owner, theirs.id);
  await page.goto('/recipes');
  await page.getByText('Explore', { exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/explore$/);
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(`from ${mine.name}`).first()).toBeVisible();

  // Keep it: it lands in their own catalog.
  await page.getByText(name).click();
  await page.getByRole('button', { name: 'Save to my recipes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${theirs.id}/recipes`, { token: theirs.owner.token }))
      .some((x: any) => x.id === r.id)).toBe(true);
});
