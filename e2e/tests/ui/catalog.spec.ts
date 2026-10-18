import { expect, test, type Page } from '@playwright/test';
import { call, newHousehold, newRecipe } from '../../lib/api';
import { newRecipeWay, sheet, signIn } from '../../lib/ui';

/*
 * The catalogue's drawers and their tags: filtering a drawer by tags and machines, making and
 * using tags without leaving it (the "+ Tag" chip, the quick-tag card, select mode's Tag and
 * Move), Manage tags, and a recipe started from a drawer landing where you were looking.
 */

const tagsOf = (hh: { id: string; owner: { token: string } }) =>
  call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });

const recipesOf = (hh: { id: string; owner: { token: string } }) =>
  call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });

const named = (all: any[], name: string) => all.find((r: any) => r.name === name);

/** A drawer's tag chip, by the tag's name (its count follows the name). */
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: new RegExp(`^${name}\\b`) });

/** A recipe's card in the drawer's grid. */
const card = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^${name}\\b`) });

const waitFor = (page: Page, method: string, part: string) =>
  page.waitForResponse((r) => r.request().method() === method && r.url().includes(part) && r.ok());

test('a recipe added from a drawer starts filed there, with the tags that were chosen', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await chip(page, 'Veggie').click();
  await expect(chip(page, 'Veggie')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Add recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/new\?section=DINNER&tags=Veggie$/);
  // It says where the recipe will go before you pick a way in.
  await expect(page.getByText(/Will be filed in\s*Dinner · Veggie/)).toBeVisible();
  await newRecipeWay(page, 'Type it out');

  // Already pressed for you — and still changeable.
  await expect(page.getByRole('group', { name: 'Drawer' }).getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: 'Veggie', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByPlaceholder('Recipe name').fill('Roast carrots');
  await page.getByPlaceholder('ingredient').first().fill('carrots');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Roast carrots' })).toBeVisible();

  const [saved] = await recipesOf(hh);
  expect(saved).toMatchObject({ name: 'Roast carrots', section: 'DINNER', categories: ['Veggie'] });
});

test('the paste tab starts filed in the drawer it was opened from too', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/breakfast');
  await page.getByRole('link', { name: 'Add recipe', exact: true }).click();
  await expect(page).toHaveURL(/section=BREAKFAST/);
  await newRecipeWay(page, 'Paste from an AI');
  await page.getByPlaceholder(/Name:/).fill('Porridge\n\nIngredients\n1 cup oats\n\nInstructions\nCook it.');
  await page.getByRole('button', { name: 'Read into form' }).click();
  await expect(page.getByRole('heading', { name: 'Check recipe' })).toBeVisible();
  await expect(page.getByPlaceholder('Recipe name')).toHaveValue('Porridge');
  await expect(page.getByRole('button', { name: 'Breakfast', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the drawer can be changed before saving, and Cancel returns to the drawer with its tags', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new?section=DINNER&tags=Side');
  await newRecipeWay(page, 'Type it out');
  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dinner', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // Back to the ways in, then Cancel leaves for the drawer it was started from, Side still chosen.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/recipes\/section\/dinner\?tags=Side$/);
  await expect(chip(page, 'Side')).toHaveAttribute('aria-pressed', 'true');
});

test('moving the drawer sets aside a tag the new drawer does not have, instead of making it there', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  const before = await tagsOf(hh);
  expect(before.some((c: any) => c.name === 'Veggie' && c.section === 'LUNCH')).toBe(false);

  await page.goto('/recipes/new?section=DINNER&tags=Veggie');
  await newRecipeWay(page, 'Type it out');
  const veggieChip = page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: /^Veggie\b/ });
  await expect(veggieChip).toHaveAttribute('aria-pressed', 'true');

  // Lunch has no Veggie, so it is not ticked — not even as a "new" one.
  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await expect(veggieChip).toHaveCount(0);
  // Back in Dinner it is ticked again, as it was.
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await expect(veggieChip).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await page.getByPlaceholder('Recipe name').fill('Soup');
  await page.getByPlaceholder('ingredient').first().fill('leeks');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Soup' })).toBeVisible();

  const [saved] = await recipesOf(hh);
  expect(saved).toMatchObject({ name: 'Soup', section: 'LUNCH', categories: [] });
  expect((await tagsOf(hh)).some((c: any) => c.name === 'Veggie' && c.section === 'LUNCH')).toBe(false);
});

test('a new tag typed in the form is made in the recipe’s drawer when it is saved', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new?section=SNACKS');
  await newRecipeWay(page, 'Type it out');
  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByLabel('New tag name').fill('Lunchbox');
  await page.getByLabel('New tag name').press('Enter');
  await expect(page.getByRole('button', { name: 'Lunchbox · new' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByPlaceholder('Recipe name').fill('Flapjacks');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Flapjacks' })).toBeVisible();
  expect(named(await recipesOf(hh), 'Flapjacks')).toMatchObject({ section: 'SNACKS', categories: ['Lunchbox'] });
  expect((await tagsOf(hh)).filter((c: any) => c.name === 'Lunchbox').map((c: any) => c.section)).toEqual(['SNACKS']);
});

test('old links into a group open with that tag chosen', async ({ page }) => {
  const hh = await newHousehold();
  const tags = await tagsOf(hh);
  const side = tags.find((c: any) => c.name === 'Side' && c.section === 'DINNER');
  const veggie = tags.find((c: any) => c.name === 'Veggie' && c.section === 'DINNER');
  await signIn(page, hh.owner, hh.id);

  await page.goto(`/recipes/section/dinner?group=${side.id}`);
  await expect(page).toHaveURL(/\/recipes\/section\/dinner\?tags=Side$/);
  await expect(chip(page, 'Side')).toHaveAttribute('aria-pressed', 'true');

  await page.goto(`/recipes/new?section=DINNER&group=${veggie.id}`);
  await expect(page.getByText(/Will be filed in\s*Dinner · Veggie/)).toBeVisible();
});

test('tag chips filter a drawer: two chips mean both, All clears, Untagged stands alone', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Beef stew', [{ name: 'beef', qty: 1 }], { categories: ['Beef', 'Main'] });
  await newRecipe(hh.id, 'Burgers', [{ name: 'beef mince', qty: 1 }], { categories: ['Beef'] });
  await newRecipe(hh.id, 'Chicken curry', [{ name: 'chicken', qty: 1 }], { categories: ['Chicken'] });
  await newRecipe(hh.id, 'Green salad', [{ name: 'lettuce', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  await expect(chip(page, 'All')).toHaveAccessibleName(/All\s*4/);
  await expect(chip(page, 'Beef')).toHaveAccessibleName(/Beef\s*2/);
  await expect(chip(page, 'Untagged')).toHaveAccessibleName(/Untagged\s*1/);

  await chip(page, 'Beef').click();
  await expect(card(page, 'Burgers')).toBeVisible();
  await expect(card(page, 'Beef stew')).toBeVisible();
  await expect(card(page, 'Green salad')).toHaveCount(0);
  await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'false');

  await chip(page, 'Main').click();
  await expect(card(page, 'Beef stew')).toBeVisible();
  await expect(card(page, 'Burgers')).toHaveCount(0);
  await expect(page).toHaveURL(/tags=Beef%2CMain|tags=Beef,Main/);

  await chip(page, 'Chicken').click();
  await expect(page.getByText('Nothing tagged Beef + Chicken + Main.')).toBeVisible();

  // Kept in the address: a reload (or coming back from a recipe) finds it as it was.
  await page.reload();
  await expect(chip(page, 'Chicken')).toHaveAttribute('aria-pressed', 'true');

  await chip(page, 'All').click();
  await expect(page.getByRole('link', { name: /Serves 4/ })).toHaveCount(4);

  // Untagged is a filter of its own: it clears the tags, and a tag clears it.
  await chip(page, 'Chicken').click();
  await chip(page, 'Untagged').click();
  await expect(chip(page, 'Chicken')).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page, 'Green salad')).toBeVisible();
  await expect(card(page, 'Chicken curry')).toHaveCount(0);
  await chip(page, 'Beef').click();
  await expect(chip(page, 'Untagged')).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page, 'Burgers')).toBeVisible();
});

test('machine chips filter a drawer by what its recipes need', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Crispy wings', [{ name: 'chicken wings', qty: 1 }], { instructions: 'Air fry at 200C for 20 minutes.' });
  await newRecipe(hh.id, 'Lasagne', [{ name: 'pasta sheets', qty: 1 }], { instructions: 'Bake in the oven for 40 minutes.' });
  await newRecipe(hh.id, 'Stir fry', [{ name: 'noodles', qty: 1 }], { instructions: 'Fry everything in a wok.' });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  const machines = page.getByRole('group', { name: 'Machines' });
  await expect(machines.getByRole('button')).toHaveCount(2);
  await machines.getByRole('button', { name: /^Air fryer/ }).click();
  await expect(card(page, 'Crispy wings')).toBeVisible();
  await expect(card(page, 'Lasagne')).toHaveCount(0);
  await expect(card(page, 'Stir fry')).toHaveCount(0);
  await machines.getByRole('button', { name: /^Oven/ }).click();
  await expect(page.getByText('Nothing here needs the oven and air fryer.')).toBeVisible();
});

test('at phone width, Untagged and "+ Tag" are in reach without scrolling past every tag', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Toast', [{ name: 'bread', qty: 1 }]);
  for (const name of ['Family favourite', 'Freezer friendly']) {
    await call('POST', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token, body: { name, section: 'DINNER' } });
  }
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  const addTag = page.getByRole('button', { name: 'New tag' });

  // Ten tags run well off the screen; Untagged comes straight after All, and "+ Tag" holds the end.
  await expect(chip(page, 'Veggie')).not.toBeInViewport();
  await expect(chip(page, 'Untagged')).toBeInViewport({ ratio: 1 });
  await expect(addTag).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath('drawer-chips.png') });

  // Scrolled to the end, it is still there, after the last tag.
  await page.getByRole('group', { name: 'Tags' }).evaluate((row) => (row.scrollLeft = row.scrollWidth));
  await expect(chip(page, 'Veggie')).toBeInViewport({ ratio: 1 });
  await expect(addTag).toBeInViewport({ ratio: 1 });
  await addTag.click();
  await expect(page.getByLabel('New tag name')).toBeInViewport({ ratio: 1 });
});

test('"+ Tag" makes a tag at once and goes straight to picking its recipes', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Fish pie', [{ name: 'cod', qty: 1 }]);
  await newRecipe(hh.id, 'Meatloaf', [{ name: 'beef mince', qty: 1 }]);
  await newRecipe(hh.id, 'Ramen', [{ name: 'noodles', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByLabel('New tag name').fill('Weeknight');
  await Promise.all([waitFor(page, 'POST', '/recipe-categories'), page.getByLabel('New tag name').press('Enter')]);
  await expect(page.getByRole('heading', { name: 'Pick recipes for Weeknight' })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Fish pie' }).click();
  await page.getByRole('checkbox', { name: 'Ramen' }).click();
  await Promise.all([
    waitFor(page, 'PUT', '/recipes'),
    page.getByRole('button', { name: 'Tag 2 Weeknight' }).click(),
  ]);
  await expect(page.getByText('Tagged 2 recipes Weeknight')).toBeVisible();
  // The drawer then shows the new tag.
  await expect(chip(page, 'Weeknight')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'Meatloaf')).toHaveCount(0);

  const all = await recipesOf(hh);
  expect(named(all, 'Fish pie').categories).toEqual(['Weeknight']);
  expect(named(all, 'Ramen').categories).toEqual(['Weeknight']);
  expect(named(all, 'Meatloaf').categories).toEqual([]);
  expect((await tagsOf(hh)).find((c: any) => c.name === 'Weeknight')).toMatchObject({ section: 'DINNER', recipeCount: 2 });
});

test('a tag nothing wears offers to tag recipes', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Halloumi salad', [{ name: 'halloumi', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await chip(page, 'Veggie').click();
  await expect(page.getByText('Nothing tagged Veggie.')).toBeVisible();
  await page.getByRole('button', { name: 'Tag recipes' }).click();
  await expect(page.getByRole('heading', { name: 'Pick recipes for Veggie' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Halloumi salad' }).click();
  await Promise.all([waitFor(page, 'PUT', '/recipes'), page.getByRole('button', { name: 'Tag 1 Veggie' }).click()]);
  await expect(card(page, 'Halloumi salad')).toBeVisible();
  expect(named(await recipesOf(hh), 'Halloumi salad').categories).toEqual(['Veggie']);
});

test('picking a tag’s recipes can search the drawer, and what the search hides stays picked', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Chicken curry', [{ name: 'chicken', qty: 1 }]);
  await newRecipe(hh.id, 'Chicken pie', [{ name: 'chicken', qty: 1 }]);
  await newRecipe(hh.id, 'Fish pie', [{ name: 'cod', qty: 1 }]);
  await newRecipe(hh.id, 'Ramen', [{ name: 'noodles', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByLabel('New tag name').fill('Pies');
  await Promise.all([waitFor(page, 'POST', '/recipe-categories'), page.getByLabel('New tag name').press('Enter')]);
  await expect(page.getByRole('heading', { name: 'Pick recipes for Pies' })).toBeVisible();

  const search = page.getByLabel('Search Dinner');
  await search.fill('chicken');
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Chicken pie' }).click();
  await search.fill('fish');
  await expect(page.getByRole('checkbox', { name: 'Chicken pie' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Fish pie' }).click();
  await search.fill('');
  await expect(page.getByRole('checkbox')).toHaveCount(4);
  await expect(page.getByRole('checkbox', { name: 'Chicken pie' })).toHaveAttribute('aria-checked', 'true');

  await Promise.all([waitFor(page, 'PUT', '/recipes'), page.getByRole('button', { name: 'Tag 2 Pies' }).click()]);
  await expect(chip(page, 'Pies')).toHaveAttribute('aria-pressed', 'true');
  // The search was for picking: it goes with it.
  await expect(search).toHaveValue('');
  const all = await recipesOf(hh);
  expect(named(all, 'Chicken pie').categories).toEqual(['Pies']);
  expect(named(all, 'Fish pie').categories).toEqual(['Pies']);
  expect(named(all, 'Chicken curry').categories).toEqual([]);
});

test('a long tag name gives way in the picking bar instead of spilling out of its button', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Sunday gravy', [{ name: 'tomatoes', qty: 1 }]);
  const long = 'Grandma Rosa’s Sunday specials from the old country';
  await call('POST', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token, body: { name: long, section: 'DINNER' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await chip(page, 'Grandma').click();
  await page.getByRole('button', { name: 'Tag recipes' }).click();
  await page.getByRole('checkbox', { name: 'Sunday gravy' }).click();

  const tagButton = page.getByRole('toolbar').getByRole('button', { name: `Tag 1 ${long}` });
  await expect(tagButton).toBeVisible();
  // One line in a button its own height, cut short with an ellipsis — the title above has it whole.
  expect((await tagButton.boundingBox())!.height).toBe(36);
  expect(await tagButton.locator('span').evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
  await expect(page.getByRole('toolbar').getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
});

test('the quick-tag card tags untagged recipes with the drawer’s own tag in one tap', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Tofu stir fry', [{ name: 'tofu', qty: 1 }]);
  await newRecipe(hh.id, 'Lentil curry', [{ name: 'red lentils', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  // Read as vegetarian, and Dinner already has Veggie: that is the tag offered, not a new one.
  const suggestion = page.getByRole('region', { name: 'Tag suggestion' });
  await expect(suggestion).toContainText('2 untagged recipes look like Veggie');
  await Promise.all([waitFor(page, 'PUT', '/recipes'), suggestion.getByRole('button', { name: 'Tag them' }).click()]);
  await expect(suggestion).toHaveCount(0);
  await expect(page.getByText('Tagged 2 recipes Veggie')).toBeVisible();
  await expect(chip(page, 'Veggie')).toHaveAccessibleName(/Veggie\s*2/);

  const all = await recipesOf(hh);
  expect(all.map((r: any) => r.categories)).toEqual([['Veggie'], ['Veggie']]);
  expect((await tagsOf(hh)).filter((c: any) => c.name.startsWith('Veg'))).toHaveLength(1);
});

test('select mode tags several recipes at once, a dash for a tag only some wear', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Beef stew', [{ name: 'beef', qty: 1 }], { categories: ['Beef'] });
  await newRecipe(hh.id, 'Burgers', [{ name: 'beef mince', qty: 1 }], { categories: ['Beef'] });
  await newRecipe(hh.id, 'Coleslaw', [{ name: 'cabbage', qty: 1 }], { categories: ['Side'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Select recipes' })).toBeVisible();
  for (const name of ['Beef stew', 'Burgers', 'Coleslaw']) await page.getByRole('checkbox', { name }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected recipes' })).toContainText('3 selected');
  await page.getByRole('button', { name: 'Tag', exact: true }).click();

  const tagSheet = sheet(page);
  await expect(tagSheet.getByRole('heading', { name: 'Tag 3 recipes' })).toBeVisible();
  const beef = tagSheet.getByRole('checkbox', { name: 'Beef', exact: true });
  await expect(beef).toHaveAttribute('aria-checked', 'mixed');
  await expect(beef).toContainText('On 2 of 3');
  await beef.click();
  await expect(beef).toHaveAttribute('aria-checked', 'true');
  await expect(beef).toContainText('Goes on all 3');
  // Side is on one of them: tapped twice it comes off all three.
  const side = tagSheet.getByRole('checkbox', { name: 'Side', exact: true });
  await side.click();
  await side.click();
  await expect(side).toHaveAttribute('aria-checked', 'false');
  await tagSheet.getByLabel('New tag name').fill('Family');
  await tagSheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(tagSheet.getByText('New tag, goes on all 3')).toBeVisible();

  await Promise.all([
    waitFor(page, 'POST', '/recipe-categories'),
    waitFor(page, 'PUT', '/recipes'),
    tagSheet.getByRole('button', { name: 'Save' }).click(),
  ]);
  await expect(page.getByText('Changed the tags on 3 recipes')).toBeVisible();
  await expect.poll(async () => (await recipesOf(hh)).map((r: any) => r.categories)).toEqual([
    ['Beef', 'Family'],
    ['Beef', 'Family'],
    ['Beef', 'Family'],
  ]);
});

test('in the Tag sheet, a tag the drawer has, typed in and saved straight away, goes on too', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Pasta bake', [{ name: 'pasta', qty: 1 }]);
  await newRecipe(hh.id, 'Prawn linguine', [{ name: 'linguine', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Pasta bake' }).click();
  await page.getByRole('checkbox', { name: 'Prawn linguine' }).click();
  await page.getByRole('button', { name: 'Tag', exact: true }).click();

  // Typed as it comes to mind, in any case, and Save without Add first: it is Dinner's own Seafood.
  const tagSheet = sheet(page);
  await tagSheet.getByLabel('New tag name').fill('seafood');
  await Promise.all([waitFor(page, 'PUT', '/recipes'), tagSheet.getByRole('button', { name: 'Save' }).click()]);
  await expect(page.getByText('Tagged 2 recipes')).toBeVisible();
  await expect.poll(async () => (await recipesOf(hh)).map((r: any) => r.categories)).toEqual([['Seafood'], ['Seafood']]);
  // No second Seafood was made for it.
  expect((await tagsOf(hh)).filter((c: any) => c.section === 'DINNER' && c.name.toLowerCase() === 'seafood')).toHaveLength(1);
});

test('select mode moves recipes to another drawer, keeping only the tags it has', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Beef sandwich', [{ name: 'beef', qty: 1 }], { categories: ['Beef', 'Main'] });
  await newRecipe(hh.id, 'Potato salad', [{ name: 'potatoes', qty: 1 }], { categories: ['Side'] });
  await newRecipe(hh.id, 'Roast', [{ name: 'lamb', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Beef sandwich' }).click();
  await page.getByRole('checkbox', { name: 'Potato salad' }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const move = sheet(page);
  await move.getByRole('radio', { name: 'Lunch' }).click();
  // Lunch has a Main and a Side, but no Beef — and says so before anything moves.
  await expect(move.getByText('Beef isn’t a tag in Lunch, so it comes off.')).toBeVisible();
  await Promise.all([waitFor(page, 'PUT', '/filing'), move.getByRole('button', { name: 'Move to Lunch' }).click()]);
  await expect(page.getByText('Moved 2 to Lunch · took off Beef')).toBeVisible();
  await expect(card(page, 'Beef sandwich')).toHaveCount(0);
  await expect(card(page, 'Roast')).toBeVisible();

  await expect.poll(async () => named(await recipesOf(hh), 'Potato salad').section).toBe('LUNCH');
  const all = await recipesOf(hh);
  expect(named(all, 'Beef sandwich')).toMatchObject({ section: 'LUNCH', categories: ['Main'] });
  expect(named(all, 'Potato salad')).toMatchObject({ section: 'LUNCH', categories: ['Side'] });
  // No Beef was made in Lunch on the way.
  expect((await tagsOf(hh)).some((c: any) => c.name === 'Beef' && c.section === 'LUNCH')).toBe(false);
});

test('Manage tags: icon, rename and delete each save at once, and every row has its bin', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Stew', [{ name: 'beef', qty: 1 }], { categories: ['Beef'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: 'Edit tags' }).click();
  await expect(page.getByRole('heading', { name: 'Tags in Dinner' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Tags in Dinner' });
  // Every row, the first included, can be deleted from where it stands.
  await expect(list.getByRole('button', { name: /^Delete / })).toHaveCount(8);

  await list.getByRole('button', { name: 'Icon for Main' }).click();
  await Promise.all([waitFor(page, 'PATCH', '/recipe-categories/'), sheet(page).getByRole('button', { name: 'Meat', exact: true }).click()]);
  await expect(list.getByRole('button', { name: 'Icon for Main' }).locator('[data-icon="meat"]')).toBeVisible();

  await list.getByLabel('Name of Side').fill('Sides');
  await Promise.all([waitFor(page, 'PATCH', '/recipe-categories/'), list.getByLabel('Name of Side').press('Enter')]);
  await expect(list.getByLabel('Name of Sides')).toBeVisible();

  await list.getByRole('button', { name: 'Delete Beef' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Untags 1 recipe. The recipe stays.');
  await Promise.all([waitFor(page, 'DELETE', '/recipe-categories/'), confirm.getByRole('button', { name: 'Delete Beef' }).click()]);
  await expect(list.getByLabel('Name of Beef')).toHaveCount(0);

  const tags = await tagsOf(hh);
  expect(tags.find((c: any) => c.name === 'Main' && c.section === 'DINNER').iconKey).toBe('meat');
  expect(tags.some((c: any) => c.name === 'Sides' && c.section === 'DINNER')).toBe(true);
  expect(tags.some((c: any) => c.name === 'Beef' && c.section === 'DINNER')).toBe(false);
  expect(named(await recipesOf(hh), 'Stew')).toMatchObject({ section: 'DINNER', categories: [] });

  // Back in the drawer, the chips are already the new ones.
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/section\/dinner$/);
  await expect(chip(page, 'Sides')).toBeVisible();
  await expect(chip(page, 'Beef')).toHaveCount(0);
});

test('Manage tags: a new tag is added there, and a name the drawer has is refused first', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner?edit=1');
  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByLabel('New tag name').fill('main');
  await page.getByLabel('New tag name').press('Enter');
  await expect(page.getByText("There's already a tag called Main in Dinner.")).toBeVisible();
  await page.getByLabel('New tag name').fill('Tacos');
  await Promise.all([waitFor(page, 'POST', '/recipe-categories'), page.getByLabel('New tag name').press('Enter')]);
  await expect(page.getByLabel('Name of Tacos')).toBeVisible();
  expect((await tagsOf(hh)).find((c: any) => c.name === 'Tacos')).toMatchObject({ section: 'DINNER' });
});

test('a change the server refuses is put back, with its reason', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.route('**/recipe-categories/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 409, message: 'Somebody renamed it first.' }) })
      : route.continue(),
  );
  await page.goto('/recipes/section/dinner?edit=1');
  const list = page.getByRole('list', { name: 'Tags in Dinner' });
  await list.getByLabel('Name of Veggie').fill('Greens');
  await list.getByLabel('Name of Veggie').press('Enter');
  await expect(page.getByText('Somebody renamed it first.')).toBeVisible();
  await expect(list.getByLabel('Name of Veggie')).toHaveValue('Veggie');
  expect((await tagsOf(hh)).some((c: any) => c.name === 'Greens')).toBe(false);
});

test('Manage tags: Escape calls a rename off instead of saving it', async ({ page }) => {
  const hh = await newHousehold();
  const renames: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/recipe-categories/')) renames.push(r.postData() ?? '');
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner?edit=1');
  const list = page.getByRole('list', { name: 'Tags in Dinner' });
  await list.getByLabel('Name of Chicken').fill('Poultry');
  await list.getByLabel('Name of Chicken').press('Escape');
  await expect(list.getByLabel('Name of Chicken')).toHaveValue('Chicken');
  await expect(list.getByLabel('Name of Chicken')).not.toBeFocused();

  // A rename that is meant goes as the only one sent.
  await list.getByLabel('Name of Beef').fill('Steak');
  await Promise.all([waitFor(page, 'PATCH', '/recipe-categories/'), list.getByLabel('Name of Beef').press('Enter')]);
  expect(renames).toEqual([JSON.stringify({ name: 'Steak' })]);
  const names = (await tagsOf(hh)).filter((c: any) => c.section === 'DINNER').map((c: any) => c.name);
  expect(names).toContain('Chicken');
  expect(names).not.toContain('Poultry');
});

test('renaming the tag a drawer is filtered by keeps it chosen, under its new name', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Chicken curry', [{ name: 'chicken', qty: 1 }], { categories: ['Chicken'] });
  await newRecipe(hh.id, 'Beef stew', [{ name: 'beef', qty: 1 }], { categories: ['Beef'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await chip(page, 'Chicken').click();
  await expect(page).toHaveURL(/tags=Chicken$/);

  await page.getByRole('button', { name: 'Edit tags' }).click();
  const list = page.getByRole('list', { name: 'Tags in Dinner' });
  await list.getByLabel('Name of Chicken').fill('Poultry');
  await Promise.all([waitFor(page, 'PATCH', '/recipe-categories/'), list.getByLabel('Name of Chicken').press('Enter')]);
  // Back in the drawer: the same tag still chosen, by its new name, and the address says so.
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await expect(page).toHaveURL(/tags=Poultry$/);
  await expect(chip(page, 'Poultry')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'Chicken curry')).toBeVisible();
  await expect(card(page, 'Beef stew')).toHaveCount(0);

  // Deleted, it stops being chosen and leaves the address, so a new tag by that name is not chosen by surprise.
  await page.getByRole('button', { name: 'Edit tags' }).click();
  await list.getByRole('button', { name: 'Delete Poultry' }).click();
  await Promise.all([
    waitFor(page, 'DELETE', '/recipe-categories/'),
    page.getByRole('alertdialog').getByRole('button', { name: 'Delete Poultry' }).click(),
  ]);
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/section\/dinner$/);
  await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
});

test('a tag another phone made meanwhile is the one "+ Tag" picks recipes for, not a refusal', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Ramen', [{ name: 'noodles', qty: 1 }]);
  await newRecipe(hh.id, 'Omelette', [{ name: 'eggs', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await expect(chip(page, 'Veggie')).toBeVisible();

  // Made on another phone after this drawer had fetched its tags.
  const quick = await call('POST', `/api/households/${hh.id}/recipe-categories`, {
    token: hh.owner.token,
    body: { name: 'Quick', section: 'DINNER' },
  });
  await page.getByRole('button', { name: 'New tag' }).click();
  await page.getByLabel('New tag name').fill('quick');
  await page.getByLabel('New tag name').press('Enter');
  // Refused as a copy, so the tags are fetched again and it is that Quick's recipes being picked.
  await expect(page.getByRole('heading', { name: 'Pick recipes for Quick', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Ramen' }).click();
  await Promise.all([
    waitFor(page, 'PUT', `/recipe-categories/${quick.id}/recipes`),
    page.getByRole('button', { name: 'Tag 1 Quick', exact: true }).click(),
  ]);
  await expect(chip(page, 'Quick')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/There's already a tag/)).toHaveCount(0);
  expect((await tagsOf(hh)).filter((c: any) => c.name.toLowerCase() === 'quick')).toHaveLength(1);
  expect(named(await recipesOf(hh), 'Ramen').categories).toEqual(['Quick']);
});

test('a refresh that comes back after a tap still brings in what other phones did', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Chicken curry', [{ name: 'chicken', qty: 1 }]);
  await newRecipe(hh.id, 'Chicken pie', [{ name: 'chicken', qty: 1 }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await expect(card(page, 'Chicken pie')).toBeVisible();
  await page.getByRole('navigation', { name: 'Tabs' }).last().getByRole('link', { name: 'Recipes' }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();

  // Another phone adds a recipe; this one is on a slow network, so the drawer's refresh is slow.
  await newRecipe(hh.id, 'Gamma gratin', [{ name: 'potatoes', qty: 1 }]);
  await page.route(`**/api/households/${hh.id}/recipes`, async (route) => {
    if (route.request().method() === 'GET') await new Promise((done) => setTimeout(done, 2000));
    await route.continue();
  });
  await page.getByRole('link', { name: /^Dinner/ }).click();
  // Tagged while the refresh is still on its way: the tap shows at once...
  await Promise.all([
    waitFor(page, 'PUT', '/recipes'),
    page.getByRole('region', { name: 'Tag suggestion' }).getByRole('button', { name: 'Tag them' }).click(),
  ]);
  await expect(chip(page, 'Chicken')).toHaveAccessibleName(/Chicken\s*2/);
  // ...and what the other phone did still arrives, rather than waiting for the drawer to be opened again.
  await expect(card(page, 'Gamma gratin')).toBeVisible({ timeout: 12_000 });
  await expect(chip(page, 'Chicken')).toHaveAccessibleName(/Chicken\s*2/);
});

test('catalogue search finds recipes with where they are filed, and gathers the saved links', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Pesto pasta', [{ name: 'pasta', qty: 1 }], { categories: ['Veggie', 'Main'] });
  await call('POST', `/api/households/${hh.id}/saved-links`, {
    token: hh.owner.token,
    body: { url: 'https://www.nothing.invalid/pasta-bake', name: 'Pasta bake' },
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');
  await page.getByPlaceholder(/Search recipes/).fill('pasta');
  await expect(page.getByText('Recipes · 1')).toBeVisible();
  await expect(page.getByRole('link', { name: /Pesto pasta/ })).toContainText('Dinner · Main, Veggie');
  const links = page.getByRole('link', { name: /1 saved link matches "pasta"/ });
  await links.click();
  await expect(page).toHaveURL(/\/recipes\/saved-links\?q=pasta/);
  await expect(page.getByText('Pasta bake')).toBeVisible();
});

test('a recipe shows its drawer, its tags side by side, and the machines it needs', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Crispy wings', [{ name: 'chicken wings', qty: 1 }], {
    categories: ['Chicken', 'Quick'],
    instructions: 'Air fry at 200C for 20 minutes.',
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByRole('heading', { name: 'Crispy wings' })).toBeVisible();
  await expect(page.getByText('Dinner', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText(['Chicken', 'Quick']);
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toHaveText('Air fryer');
  // Flat tags read as a path no more.
  await expect(page.getByText(/›/)).toHaveCount(0);
});

test('a long name with a row of tags and machines grows the recipe’s picture, and Back still answers', async ({ page }) => {
  const hh = await newHousehold();
  const name = 'Grandma’s slow-roasted Sunday chicken with crispy potatoes and gravy';
  await newRecipe(hh.id, name, [{ name: 'chicken', qty: 1 }], {
    categories: ['Main', 'Chicken', 'Family favourite', 'Sunday roast', 'Freezer friendly'],
    instructions: 'Preheat the oven. Blitz the herbs in a food processor. Roast for 2 hours, then finish in the air fryer.',
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await card(page, 'Grandma').click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('long-hero.png') });

  // Everything on the picture starts below the round buttons, the drawer's pill first.
  const back = page.getByRole('button', { name: 'Back' });
  const buttonsEnd = (await back.boundingBox())!.y + (await back.boundingBox())!.height;
  expect((await page.getByText('Dinner', { exact: true }).boundingBox())!.y).toBeGreaterThan(buttonsEnd);
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toBeInViewport({ ratio: 1 });
  await back.click();
  await expect(page).toHaveURL(/\/recipes\/section\/dinner$/);
});
