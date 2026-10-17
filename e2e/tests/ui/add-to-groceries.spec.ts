import { expect, test, type Page } from '@playwright/test';
import { call, find, groceries, newHousehold, newRecipe } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/*
 * Add to groceries on a recipe page: a recipe's ingredients straight onto the list, no meal
 * planned. In a house that plans meals it is the cart beside Add to plan — still one filled
 * button on the page; in one that does not, it is the filled button. The sheet starts at the
 * servings the page shows, asks about the optional extras, and asks before adding a recipe the
 * list already has.
 */

/** The page's filled buttons: there is only ever meant to be one. */
const filled = (page: Page) => page.locator('button.bg-accent:visible');

const addCalls = (page: Page) => {
  const bodies: any[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/grocery-list/add-recipe/')) bodies.push(r.postDataJSON());
  });
  return bodies;
};

test('with the Plan on, the cart beside Add to plan adds the recipe at the servings shown, with the extras ticked', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Honey garlic wings', [
    { name: 'chicken wings', qty: 1, unit: 'kg' },
    { name: 'garlic', qty: 4, unit: 'clove' },
    { name: 'honey', qty: 2, unit: 'tbsp' },
    { name: 'sesame seeds', qty: 1, unit: 'tbsp', optional: true },
    { name: 'spring onions', qty: 2, optional: true },
  ]); // serves 4
  const sent = addCalls(page);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByRole('heading', { name: 'Honey garlic wings' })).toBeVisible();

  // One filled button — the plan's — and the cart beside it, outlined.
  await expect(filled(page)).toHaveCount(1);
  await expect(filled(page)).toHaveAccessibleName('Add to plan');
  const cart = page.getByRole('button', { name: 'Add to groceries' });
  await expect(cart).toBeVisible();
  await expect(cart).not.toHaveClass(/bg-accent/);
  // Said in a word on a phone too, so it does not read as a third arrow beside Previous and Next.
  await expect(cart).toHaveText('Groceries', { useInnerText: true });
  // And Add to plan still fits on one line beside it.
  expect((await filled(page).boundingBox())!.height).toBeLessThanOrEqual(52);
  expect(await filled(page).locator('span').evaluate((label) => label.scrollWidth <= label.clientWidth)).toBe(true);

  // Cooking for six: the sheet starts there.
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  await cart.click();
  const s = sheet(page);
  await expect(s.getByRole('heading', { name: 'Add to groceries' })).toBeVisible();
  await expect(s.getByRole('group', { name: 'Servings' })).toContainText('6');
  await expect(s.getByText('Buying the optional extras?')).toBeVisible();
  // Nothing extra unless it is ticked: three things, then four.
  await expect(s.getByRole('button', { name: 'Add 3 items' })).toBeVisible();
  await s.getByRole('button', { name: 'sesame seeds' }).click();
  await expect(s.getByRole('button', { name: 'sesame seeds' })).toHaveAttribute('aria-pressed', 'true');
  await s.getByRole('button', { name: 'Add 4 items' }).click();

  await expect(page.getByText('Added 4 things to Groceries')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sesame = r.ingredients.find((i: any) => i.ingredientName === 'sesame seeds').id;
  expect(sent).toEqual([{ servings: 6, includedOptionalIngredientIds: [sesame] }]);
  const list = await groceries(hh.id);
  expect(find(list, 'chicken wings')).toMatchObject({ quantity: 1.5, unit: 'kg', fromRecipes: ['Honey garlic wings'] });
  expect(find(list, 'garlic').quantity).toBe(6);
  expect(find(list, 'spring onions')).toBeUndefined();

  // The toast's way to the list.
  await page.getByRole('button', { name: 'See list' }).click();
  await expect(page).toHaveURL(/\/grocery-list$/);
  await expect(page.getByText('chicken wings')).toBeVisible();
});

test('a recipe already on the list asks first; Cancel changes nothing and Add again puts the amounts on top', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Chili', [
    { name: 'beef mince', qty: 500, unit: 'g' },
    { name: 'kidney beans', qty: 1, unit: 'can' },
  ]);
  await call('POST', `/api/households/${hh.id}/grocery-list/add-recipe/${r.id}`, { token: hh.owner.token, body: { servings: 4 } });
  const sent = addCalls(page);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);

  await page.getByRole('button', { name: 'Add to groceries' }).click();
  await sheet(page).getByRole('button', { name: 'Add 2 items' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Already on the list — add again?' });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('“Chili” is on Groceries already.');

  // Not this time: the sheet is still there, the list as it was.
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(sheet(page).getByRole('heading', { name: 'Add to groceries' })).toBeVisible();
  expect(find(await groceries(hh.id), 'beef mince').quantity).toBe(500);

  // Yes: sent again with `again`, and the same unit adds up.
  await sheet(page).getByRole('button', { name: 'Add 2 items' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Add again' }).click();
  await expect(page.getByText('Added 2 things to Groceries')).toBeVisible();
  expect(sent.map((b) => b.again ?? false)).toEqual([false, false, true]);
  expect(find(await groceries(hh.id), 'beef mince').quantity).toBe(1000);
});

test('with the Plan off, Add to groceries is the filled button and there is no Add to plan', async ({ page }) => {
  const hh = await newHousehold({ plan: false, cupboard: false });
  const r = await newRecipe(hh.id, 'Pancakes', [
    { name: 'flour', qty: 200, unit: 'g' },
    { name: 'milk', qty: 300, unit: 'ml' },
  ]);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByRole('button', { name: 'Add to plan' })).toHaveCount(0);
  await expect(filled(page)).toHaveCount(1);
  await expect(filled(page)).toHaveAccessibleName('Add to groceries');
  await page.screenshot({ path: test.info().outputPath('plan-off-recipe.png') });

  await filled(page).click();
  // No extras to ask about.
  await expect(sheet(page).getByText('Buying the optional extras?')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Add 2 items' }).click();
  await expect(page.getByText('Added 2 things to Groceries')).toBeVisible();
  expect((await groceries(hh.id)).map((i: any) => i.name).sort()).toEqual(['flour', 'milk']);
});

test('a recipe with no ingredients says there is nothing to add, and where to put them in', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Grandma’s stew', []);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByText("No ingredients yet — until they're in, there's nothing to add to Groceries.")).toBeVisible();

  await page.getByRole('button', { name: 'Add to groceries' }).click();
  const s = sheet(page);
  await expect(s.getByText("No ingredients yet, so there's nothing to add.")).toBeVisible();
  await expect(s.getByRole('button', { name: 'Nothing to add' })).toBeDisabled();
  await s.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${r.id}/edit$`));
});

test('a recipe of nothing but "always have" staples says there was nothing to add', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name: 'olive oil', staple: true } });
  const r = await newRecipe(hh.id, 'Dressing', [{ name: 'olive oil', qty: 3, unit: 'tbsp' }]);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}`);
  await page.getByRole('button', { name: 'Add to groceries' }).click();
  await sheet(page).getByRole('button', { name: 'Add 1 item' }).click();
  await expect(page.getByText('Nothing to add — you always have all of it')).toBeVisible();
  await expect(page.getByRole('button', { name: 'See list' })).toHaveCount(0);
  expect(await groceries(hh.id)).toEqual([]);
});
