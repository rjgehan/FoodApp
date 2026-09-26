import { expect, test } from '@playwright/test';
import { call, newHousehold, newRecipe } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/*
 * The catalog's drawers and groups: the icon on a group, and adding a recipe from inside one
 * so it lands where you were looking.
 */

test('a recipe added from inside a group starts filed in that drawer and group', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: /^Veggie\b/ }).click();

  // The group is empty, so both the header button and the empty state offer it.
  await expect(page.getByRole('link', { name: 'Add a recipe' })).toBeVisible();
  await page.getByRole('link', { name: 'Add recipe' }).click();
  await expect(page).toHaveURL(/\/recipes\/new\?section=DINNER&group=/);

  // Already pressed for you — and still changeable.
  await expect(page.getByRole('button', { name: 'Dinner', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Veggie', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByPlaceholder('Recipe name').fill('Roast carrots');
  await page.getByPlaceholder('ingredient').first().fill('carrots');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Roast carrots' })).toBeVisible();

  const [saved] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(saved).toMatchObject({ name: 'Roast carrots', section: 'DINNER', categories: ['Veggie'] });
});

test('the paste tab starts filed in the drawer it was opened from too', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/breakfast');
  await page.getByRole('link', { name: 'Add recipe' }).click();
  await expect(page).toHaveURL(/section=BREAKFAST/);
  await page.getByRole('tab', { name: 'Paste' }).click();
  await page.getByPlaceholder(/Name:/).fill('Porridge\n\nIngredients\n1 cup oats\n\nInstructions\nCook it.');
  await page.getByRole('button', { name: 'Read it' }).click();
  // Scoped to the tab on screen: Type it out is still there behind it, hidden, with its own form.
  await expect(page.getByRole('tabpanel').getByPlaceholder('Recipe name')).toHaveValue('Porridge');
  await expect(page.getByRole('button', { name: 'Breakfast', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the drawer can be changed before saving, and Back returns to the group', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  const groups = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });
  const side = groups.find((c: any) => c.name === 'Side' && c.section === 'DINNER');

  await page.goto(`/recipes/new?section=DINNER&group=${side.id}`);
  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dinner', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/section/dinner\\?group=${side.id}`));
});

test('moving the drawer sets aside a group the new drawer does not have, instead of making it there', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  const before = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });
  const veggie = before.find((c: any) => c.name === 'Veggie' && c.section === 'DINNER');
  expect(before.some((c: any) => c.name === 'Veggie' && c.section === 'LUNCH')).toBe(false);

  await page.goto(`/recipes/new?section=DINNER&group=${veggie.id}`);
  const veggieChip = page.getByRole('button', { name: /^Veggie\b/ });
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

  const [saved] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(saved).toMatchObject({ name: 'Soup', section: 'LUNCH', categories: [] });
  const after = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });
  expect(after.some((c: any) => c.name === 'Veggie' && c.section === 'LUNCH')).toBe(false);
});

test('a group can be given an icon, and it stays through a rename', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Stew', [{ name: 'beef', qty: 1 }], { categories: ['Main'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: 'More for Main' }).click();

  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/recipe-categories/')),
    sheet(page).getByRole('button', { name: 'Meat', exact: true }).click(),
  ]);
  await expect(sheet(page).getByRole('button', { name: 'Meat', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await sheet(page).getByRole('textbox').fill('Mains');
  await sheet(page).getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('button', { name: /^Mains\b/ })).toBeVisible();

  const groups = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });
  expect(groups.find((c: any) => c.name === 'Mains' && c.section === 'DINNER').iconKey).toBe('meat');
});

test('a new group can be made with an icon', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await page.getByRole('button', { name: 'Options for Dinner' }).click();
  await sheet(page).getByRole('button', { name: 'Add a group' }).click();
  await page.getByPlaceholder('Main dish, Side…').fill('Tacos');
  await page.getByRole('button', { name: 'Pick an icon' }).click();
  await page.getByRole('button', { name: 'Taco', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Tacos\b/ })).toBeVisible();

  const groups = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: hh.owner.token });
  expect(groups.find((c: any) => c.name === 'Tacos').iconKey).toBe('taco');
});
