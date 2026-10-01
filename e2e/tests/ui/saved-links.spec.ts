import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { call, isoDate, newHousehold, uploadImage } from '../../lib/api';
import { calendarDay, fillSlot, sheet, signIn } from '../../lib/ui';

/*
 * Saved links on the phone: a link that will not come through as a recipe is kept instead of
 * lost, it lives on its own shelf in Recipes, and it plans like a recipe. The server's import is
 * stood in for, and every saved link either brings its picture or points at a reserved address,
 * so nothing here reaches TikTok.
 */

const COVER_JPEG = readFileSync(new URL('../fixtures/cover-8px.jpg', import.meta.url));
const TIKTOK = 'https://www.tiktok.com/@e2ecook/video/99';

async function savedLink(householdId: string, token: string, name: string) {
  const coverImageId = await uploadImage(householdId, COVER_JPEG);
  return call('POST', `/api/households/${householdId}/saved-links`, {
    token,
    body: { url: TIKTOK, name, coverImageId },
  });
}

test('a link that cannot be read is saved instead, and waits in Saved links', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.route('**/recipes/import', (route) =>
    route.fulfill({
      status: 422,
      json: { status: 422, message: 'That video has no recipe this can read.' },
    }),
  );

  await page.goto('/recipes/new');
  await page.getByRole('tab', { name: 'From a link' }).click();
  const panel = page.getByRole('tabpanel');
  // Always there, quietly, for a link you only want to keep.
  await expect(panel.getByRole('button', { name: 'Just save the link' })).toBeVisible();

  await panel.getByLabel('A link to a recipe').fill('https://www.nothing.invalid/crispy-gnocchi');
  await panel.getByRole('button', { name: 'Get the recipe' }).click();
  await expect(panel.getByText('That video has no recipe this can read.')).toBeVisible();

  await panel.getByRole('button', { name: 'Save the link instead' }).click();
  await expect(panel.getByText('Saved to Saved links')).toBeVisible();
  // The page said nothing, so it goes by its site's name.
  await expect(panel.getByText('nothing.invalid', { exact: true }).first()).toBeVisible();
  expect(await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token })).toHaveLength(0);

  await panel.getByRole('button', { name: 'See saved links' }).click();
  await expect(page).toHaveURL(/\/recipes\/saved-links$/);
  await expect(page.getByRole('heading', { name: 'Saved links' })).toBeVisible();
  const tile = page.getByRole('link', { name: /nothing\.invalid/ }).first();
  await expect(tile).toHaveAttribute('href', 'https://www.nothing.invalid/crispy-gnocchi');
  await expect(tile).toHaveAttribute('target', '_blank');

  // And the shelf is on the front of Recipes, after the drawers, with its count.
  await page.getByRole('button', { name: 'Recipes' }).click();
  const shelf = page.getByRole('link', { name: /Saved links/ });
  await expect(shelf).toContainText('1 link');
  await expect(shelf.locator('[data-icon="saved-links"]')).toHaveCount(1);
});

test('a saved link is planned from its menu, and opens from the plan', async ({ page }) => {
  const hh = await newHousehold();
  const link = await savedLink(hh.id, hh.owner.token, 'Crispy gnocchi');
  await signIn(page, hh.owner, hh.id);

  await page.goto('/recipes/saved-links');
  await expect(page.getByText('TikTok', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More for Crispy gnocchi' }).click();
  await sheet(page).getByRole('button', { name: 'Plan it' }).click();

  const planSheet = sheet(page);
  await planSheet.getByRole('button', { name: 'Tomorrow' }).click();
  await planSheet.getByRole('button', { name: 'Dinner', exact: true }).click();
  await planSheet.getByRole('button', { name: /^Add to Tomorrow · Dinner$/ }).click();
  await expect(page.getByRole('status')).toContainText('On the plan for Tomorrow · Dinner');

  const tomorrow = isoDate(1);
  const [entry] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${tomorrow}&end=${tomorrow}`, {
    token: hh.owner.token,
  });
  expect(entry).toMatchObject({ savedLinkId: link.id, mealType: 'DINNER' });

  // On the plan: its name, where it is from, and a way to open it.
  await page.goto('/meal-plan');
  const d = new Date();
  d.setDate(d.getDate() + 1);
  await (await calendarDay(page, d)).click();
  const day = sheet(page);
  await expect(day.getByText('Saved link · TikTok')).toBeVisible();
  // Nothing to shop for, so the day offers no Add to groceries for it.
  await expect(day.getByRole('button', { name: /to groceries$/ })).toHaveCount(0);
  await day.getByRole('button', { name: /Crispy gnocchi/ }).click();
  const options = page.getByRole('dialog', { name: 'Crispy gnocchi options' });
  await expect(options.getByRole('link', { name: 'Open on TikTok' })).toHaveAttribute('href', TIKTOK);

  // It has no ingredients, and its options say so rather than pretending.
  await expect(options.getByText(/A saved link has no ingredients/)).toBeVisible();
});

test('the plan picker offers saved links alongside the recipes', async ({ page }) => {
  const hh = await newHousehold();
  const link = await savedLink(hh.id, hh.owner.token, 'Smash burger tacos');
  await signIn(page, hh.owner, hh.id);

  await page.goto('/meal-plan');
  await (await calendarDay(page, new Date())).click();
  const slot = await fillSlot(page, 'Dinner');
  await slot.getByRole('button', { name: 'Links', exact: true }).click();
  await slot.getByRole('button', { name: /Smash burger tacos/ }).click();

  await expect(sheet(page).getByText('Saved link · TikTok')).toBeVisible();
  const today = isoDate(0);
  const [entry] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${today}&end=${today}`, {
    token: hh.owner.token,
  });
  expect(entry).toMatchObject({ savedLinkId: link.id, mealType: 'DINNER' });
});

test('making a saved link a recipe starts the form from it, and saving takes it off the shelf', async ({ page }) => {
  const hh = await newHousehold();
  await savedLink(hh.id, hh.owner.token, 'Gochujang noodles');
  await signIn(page, hh.owner, hh.id);

  await page.goto('/recipes/saved-links');
  await page.getByRole('button', { name: 'More for Gochujang noodles' }).click();
  await sheet(page).getByRole('button', { name: 'Make it a recipe' }).click();

  await expect(page).toHaveURL(/\/recipes\/new/);
  await expect(page.getByPlaceholder('Recipe name')).toHaveValue('Gochujang noodles');
  await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue(TIKTOK);
  await page.getByPlaceholder('ingredient').first().fill('noodles');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await expect(page.getByRole('heading', { name: 'Gochujang noodles' })).toBeVisible();
  const [recipe] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(recipe.coverImageId).not.toBeNull();
  expect(await call('GET', `/api/households/${hh.id}/saved-links`, { token: hh.owner.token })).toEqual([]);
});

test('deleting a saved link asks first, in the app', async ({ page }) => {
  const hh = await newHousehold();
  await savedLink(hh.id, hh.owner.token, 'Miso salmon');
  await signIn(page, hh.owner, hh.id);

  await page.goto('/recipes/saved-links');
  await page.getByRole('button', { name: 'More for Miso salmon' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(sheet(page).getByText('Delete “Miso salmon”?')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
});
