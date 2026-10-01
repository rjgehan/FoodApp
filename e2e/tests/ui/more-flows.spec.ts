import { expect, test } from '@playwright/test';
import { admin, call, find, groceries, isoDate, newHousehold, newRecipe, plan, unique } from '../../lib/api';
import { calendarDay, fillSlot, fromMenu, sheet, signIn, swipeLeft } from '../../lib/ui';

/** The everyday paths not covered by the core loop. */

test('change a planned dinner to a different recipe', async ({ page }) => {
  const hh = await newHousehold();
  const a = await newRecipe(hh.id, 'Pad Thai', [{ name: 'rice noodles', qty: 1, unit: 'package' }]);
  await newRecipe(hh.id, 'Fried Rice', [{ name: 'rice', qty: 2, unit: 'cup' }]);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: a.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await expect(sheet(page).getByText('Pad Thai')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Swap' }).click();
  const slot = page.getByRole('dialog', { name: /^Dinner · / });
  await slot.getByRole('button', { name: /^Fried Rice/ }).click();
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

test('"Add breakfast to groceries" adds just that meal', async ({ page }) => {
  const hh = await newHousehold();
  const r1 = await newRecipe(hh.id, 'Omelette', [{ name: 'egg', qty: 3 }]);
  const r2 = await newRecipe(hh.id, 'Stir fry', [{ name: 'bok choy', qty: 2 }]);
  const r3 = await newRecipe(hh.id, 'Ramen', [{ name: 'noodles', qty: 1 }]);
  await plan(hh.id, isoDate(0), 'BREAKFAST', { recipeId: r1.id });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: r3.id });
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r2.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  await sheet(page).getByRole('tab', { name: /^Breakfast/ }).click();
  await sheet(page).getByRole('button', { name: 'Add breakfast to groceries' }).click();
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name)).toEqual(['egg']);
  // And then says so, rather than offering the same again.
  await expect(sheet(page).getByRole('button', { name: 'Breakfast is on the list' })).toBeVisible();
});

test('adding the planning window leaves out a day you untick', async ({ page }) => {
  const hh = await newHousehold();
  const r1 = await newRecipe(hh.id, 'Omelette', [{ name: 'egg', qty: 3 }]);
  const r2 = await newRecipe(hh.id, 'Stir fry', [{ name: 'bok choy', qty: 2 }]);
  await plan(hh.id, isoDate(1), 'BREAKFAST', { recipeId: r1.id });
  await plan(hh.id, isoDate(2), 'DINNER', { recipeId: r2.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('radio', { name: 'Upcoming' }).click();
  // Both meals are still to shop for, and the window card says so.
  await expect(page.getByText('2 not on list')).toBeVisible();
  await expect(page.getByText('2 of 7 days planned')).toBeVisible();
  await page.getByRole('button', { name: 'Add week to groceries' }).click();

  const confirm = sheet(page);
  await expect(confirm.getByRole('heading', { name: 'Add 2 days to groceries?' })).toBeVisible();
  await confirm.getByRole('checkbox', { name: /Stir fry/ }).click();
  await expect(confirm.getByRole('heading', { name: 'Add 1 day to groceries?' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Add 1 item' }).click();
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name)).toEqual(['egg']);

  // The plan now shows which is on the list and which is not.
  await expect(page.getByText('1 not on list')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Plan for / }).first().getByText('On grocery list')).toBeVisible();
});

test('eat out: type a new place and it is saved for next time', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByText(String(new Date().getDate()), { exact: true }).first().click();
  const slot = await fillSlot(page, 'Lunch');
  await slot.getByRole('radio', { name: 'Eat out' }).click();
  await slot.getByLabel('Search or add a place').fill('Noodle Bar');
  await slot.getByRole('radio', { name: /Add “Noodle Bar”/ }).click();
  // A time for the booking, shown on the plan.
  await slot.getByRole('switch', { name: /Time/ }).click();
  await slot.getByLabel('Time', { exact: true }).fill('12:30');
  await slot.getByRole('button', { name: 'Plan Noodle Bar' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/places`, { token: hh.owner.token })).map((p: any) => p.name)).toEqual(['Noodle Bar']);
  const [e] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token });
  expect(e).toMatchObject({ mealType: 'LUNCH', placeName: 'Noodle Bar', time: '12:30:00' });
  await expect(sheet(page).getByText(/^Lunch · 12:30/i)).toBeVisible();
});

test('a meal gets a time, and its options open with a long press', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Lasagne', [{ name: 'pasta sheets', qty: 1, unit: 'box' }]);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: r.id, servings: 4 });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');

  // The day sheet's Time sets it for the meal; the plan says "Dinner · 6:45 pm".
  await page.getByRole('button', { name: 'Dinner: Lasagne' }).click();
  await sheet(page).getByRole('button', { name: 'Time' }).click();
  await sheet(page).getByLabel('Time').fill('18:45');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: 'Dinner time' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('region', { name: /^Plan for / }).getByText(/^Dinner · 6:45/i)).toBeVisible();

  // Held down, a planned meal opens its options; Remove from plan takes it off.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.getByRole('button', { name: 'Dinner: Lasagne' });
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const options = page.getByRole('dialog', { name: 'Lasagne options' });
  const now = new Date();
  await expect(options.getByText(`${now.toLocaleDateString('en-US', { weekday: 'long' })} ${now.getDate()} · Dinner`)).toBeVisible();
  await options.getByRole('button', { name: 'Remove from plan' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token })).length).toBe(0);
  // Nothing else opened behind it.
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a dinner can be taken off in one go, after asking', async ({ page }) => {
  const hh = await newHousehold();
  const main = await newRecipe(hh.id, 'Roast chicken', [{ name: 'chicken', qty: 1 }]);
  const side = await newRecipe(hh.id, 'Gravy', [{ name: 'stock', qty: 1, unit: 'cup' }]);
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: main.id });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: side.id });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Dinner: Roast chicken' }).click();
  // The main and its side, each with its role.
  const dishes = sheet(page).getByRole('list', { name: 'Dinner dishes' });
  await expect(dishes.getByRole('listitem').first()).toContainText('Main');
  await expect(dishes.getByRole('listitem').nth(1)).toContainText('Side');
  await sheet(page).getByRole('button', { name: 'Remove dinner' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('Roast chicken and 1 side come off');
  await ask.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(0)}`, { token: hh.owner.token })).length).toBe(0);
  await expect(sheet(page).getByRole('button', { name: 'Plan dinner' })).toBeVisible();
});

test('the month calendar shows planned days and opens one', async ({ page }) => {
  const hh = await newHousehold();
  await plan(hh.id, isoDate(0), 'DINNER', { itemName: 'tacos' });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  // The calendar is always on screen now — it is the bottom half of the page.
  await (await calendarDay(page, new Date())).click();
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

test('groceries and cupboard: the outer edges of a row are part of the row', async ({ page }) => {
  // The rows sit on a card. When the card held the padding, a thumb on the outer strip of a
  // row — about where the circle is — tapped the card and nothing happened.
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'limes' } });
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'rice' } });
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'salt', staple: true } });
  await signIn(page, hh.owner, hh.id);

  await page.goto('/grocery-list');
  const edgesOf = async (text: string) => {
    const row = page.getByText(text, { exact: true });
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const card = (await page.locator('ul.card', { hasText: text }).boundingBox())!;
    const y = (await row.boundingBox())!.y + 10;
    return { left: card.x + 4, right: card.x + card.width - 4, y };
  };
  const limesRow = page.getByRole('button', { name: /limes/ });
  const limes = await edgesOf('limes');
  await page.mouse.click(limes.left, limes.y);
  await expect(limesRow).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => find(await groceries(hh.id), 'limes')?.checked).toBe(true);

  // Unticking it, then ticking it again from the far edge of its card.
  await limesRow.click();
  await expect(limesRow).toHaveAttribute('aria-pressed', 'false');
  const again = await edgesOf('limes');
  await page.mouse.click(again.right, again.y);
  await expect(limesRow).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/cupboard');
  const rice = await edgesOf('rice');
  await page.mouse.click(rice.left, rice.y);
  await expect(sheet(page).getByRole('heading', { name: 'Edit item' })).toBeVisible();
  await expect(sheet(page).getByLabel('Name')).toHaveValue('rice');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);

  // An "Always have" row has only its pill on the right, so its right edge is the row too.
  const salt = await edgesOf('salt');
  await page.mouse.click(salt.right, salt.y);
  await expect(sheet(page).getByLabel('Name')).toHaveValue('salt');
});

test('groceries: Move an item to another aisle and it sticks', async ({ page }) => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'tortillas' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  // Its sheet, from a swipe: the aisles are chips, and the one it is in is filled.
  await swipeLeft(page, page.getByText('tortillas', { exact: true }));
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const aisles = sheet(page).getByRole('group', { name: 'Aisle' });
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/category') && r.request().method() === 'PUT'),
    aisles.getByRole('button', { name: 'Frozen', exact: true }).click(),
  ]);
  await expect(aisles.getByRole('button', { name: 'Frozen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet(page).getByText('Tortillas will always go in Frozen.')).toBeVisible();
  await page.keyboard.press('Escape');
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
  await expect(page).toHaveURL(/\/household\/aisles$/);
  // Walk Dairy & eggs to the top from the keyboard: its grip takes the arrow keys. Each step is
  // saved behind the move, so ask the server whether it has arrived rather than the page.
  const grip = page.getByRole('button', { name: 'Move Dairy & eggs', exact: true });
  await expect(async () => {
    await grip.focus();
    await page.keyboard.press('ArrowUp');
    const aisles = await call('GET', `/api/households/${hh.id}/categories`, { token: owner.token });
    expect(aisles.sort((a: any, b: any) => a.position - b.position)[0].name).toBe('Dairy & eggs');
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Store aisles' }).getByRole('listitem').first()).toContainText('Dairy & eggs');
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
  const inExplore = page.getByRole('switch', { name: 'Publish to Explore' });
  await expect(inExplore).toHaveAttribute('aria-checked', 'false');
  await inExplore.click();
  await expect(inExplore).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Recipe', exact: true }).click();
  // Back on the recipe, ••• › Share says where it is now.
  await page.getByRole('button', { name: 'Recipe options' }).click();
  await expect(sheet(page).getByRole('button', { name: /^Share/ })).toContainText('In Explore');
  await page.keyboard.press('Escape');
  // Still in its own drawer, not shown as somebody else's recipe.
  await expect(page.getByText(/Dinner/).first()).toBeVisible();
  await expect(page.getByText(/^Shared by/)).toHaveCount(0);

  // Find it from the other household.
  await signIn(page, theirs.owner, theirs.id);
  // Explore is a tab of its own now, and it opens on a choice of what to explore.
  // The reload matters: signIn swaps the stored session, and the app reads which household
  // it is looking at when it starts.
  await page.goto('/explore');
  await expect(page).toHaveURL(/\/explore$/);
  await page.getByText('Global recipes').first().click();
  await expect(page).toHaveURL(/\/explore\/recipes$/);
  await page.getByRole('searchbox', { name: 'Search published recipes' }).fill(name);
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card).toBeVisible();
  // Each card says which household published it.
  await expect(card.getByText(mine.name)).toBeVisible();

  // Open it: read-only, with where it is from and one thing to do.
  await card.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/explore/recipes/${r.id}$`));
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(`From ${mine.name}`)).toBeVisible();
  await expect(page.getByText('beans')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to plan' })).toHaveCount(0);

  // Keep it: it lands in their own catalog. The admin is in many households, so it asks which,
  // with the one on screen ticked to begin with.
  await page.getByRole('button', { name: 'Move into my recipes' }).click();
  await expect(sheet(page).getByRole('radio', { name: theirs.name, exact: true })).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('button', { name: `Move into ${theirs.name}` }).click();
  await expect(page.getByText('Moved into your recipes')).toBeVisible();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${theirs.id}/recipes`, { token: theirs.owner.token }))
      .some((x: any) => x.id === r.id)).toBe(true);
  // Kept now: the one button opens it where it lives.
  await expect(page.getByText('In your Dinner drawer')).toBeVisible();
  await page.getByRole('button', { name: 'Open in my recipes' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${r.id}$`));
});

test('the list copies as plain lines, ready for a Notes checklist', async ({ page, context }) => {
  // Notes will not take checkboxes from a paste, so what goes on the clipboard is one item per
  // line and nothing else — the shape its "turn these into a checklist" button expects.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, {
    token: hh.owner.token,
    body: { ingredientName: 'chicken thighs', quantity: 2, unit: 'lb' },
  });
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, {
    token: hh.owner.token,
    body: { ingredientName: 'milk' },
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');

  await fromMenu(page, 'List options', 'Copy for Notes');
  await expect(page.getByText(/Copied 2 items/)).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n').sort()).toEqual(['2 lb chicken thighs', 'milk']);
  // No headings, no title: every line has to be a real item or it becomes a stray checkbox.
  expect(copied).not.toMatch(/Unsorted|Groceries/);
});

test('a recipe can be deleted from its ••• menu, and its planned meal goes with it', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Leftover stew', [{ name: 'beef', qty: 1, unit: 'lb' }]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id, servings: 2 });
  const owner = await admin();

  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Delete/);
  const ask = page.getByRole('alertdialog', { name: 'Delete Leftover stew?' });
  await expect(ask.getByText(/This can['’]t be undone\./)).toBeVisible();
  await ask.getByRole('button', { name: 'Delete recipe' }).click();

  await expect(page).toHaveURL(/\/recipes$/);
  const recipes = await call('GET', `/api/households/${hh.id}/recipes`, { token: owner.token });
  expect(recipes.some((x: any) => x.id === r.id)).toBe(false);
  const entries = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(6)}`, { token: owner.token });
  expect(JSON.stringify(entries)).not.toContain(r.id);
});
