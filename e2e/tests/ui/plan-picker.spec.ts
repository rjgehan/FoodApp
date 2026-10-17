import { expect, test } from '@playwright/test';
import { newHousehold, newRecipe } from '../../lib/api';
import { calendarDay, fillSlot, signIn } from '../../lib/ui';

/*
 * Filling a slot on the Plan (web/src/components/plan/FillSlot.tsx): Mains and Sides are read
 * from a recipe's tags, and the household's other tags are filters of their own after them. A
 * main is a recipe with a tag that says so ("Main", "Mains") or one of the proteins mains are
 * told apart by (Chicken, Beef, Pork, Seafood, Turkey, Lamb, Vegetarian) — so a recipe tagged
 * only Chicken, as migrated and quick-tagged recipes often are, still counts. The iPhone's
 * FillSlotView reads them the same way (CategoryKinds.isMainTag).
 */

test('Mains counts a protein tag as a main, Sides wants a side, and the other tags filter on their own', async ({ page }) => {
  const hh = await newHousehold();
  await newRecipe(hh.id, 'Roast chicken', [{ name: 'chicken', qty: 1 }], { categories: ['Chicken'] });
  await newRecipe(hh.id, 'Beef stew', [{ name: 'beef', qty: 1 }], { categories: ['Main'] });
  await newRecipe(hh.id, 'Pulled pork', [{ name: 'pork shoulder', qty: 1 }], { categories: ['Pork', 'Quick'] });
  await newRecipe(hh.id, 'Coleslaw', [{ name: 'cabbage', qty: 1 }], { categories: ['Side'] });
  await newRecipe(hh.id, 'Speedy noodles', [{ name: 'noodles', qty: 1 }], { categories: ['Quick'] });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await (await calendarDay(page, new Date())).click();
  const slot = await fillSlot(page, 'Dinner');
  const chip = (name: string) => slot.getByRole('button', { name, exact: true });
  const recipes = slot.getByRole('list', { name: 'Recipes' });

  await expect(recipes.getByRole('listitem')).toHaveCount(5);
  // Main and Side have chips of their own; the rest of the tags follow, A to Z.
  await expect(chip('Main')).toHaveCount(0);
  await expect(chip('Side')).toHaveCount(0);
  for (const name of ['Chicken', 'Pork', 'Quick']) await expect(chip(name)).toBeVisible();

  await chip('Mains').click();
  await expect(chip('Mains')).toHaveAttribute('aria-pressed', 'true');
  await expect(recipes.getByRole('listitem')).toHaveCount(3);
  for (const name of ['Roast chicken', 'Beef stew', 'Pulled pork']) await expect(recipes).toContainText(name);
  await expect(recipes).not.toContainText('Coleslaw');
  await expect(recipes).not.toContainText('Speedy noodles');

  await chip('Sides').click();
  await expect(recipes.getByRole('listitem')).toHaveCount(1);
  await expect(recipes).toContainText('Coleslaw');

  await chip('Quick').click();
  await expect(chip('Sides')).toHaveAttribute('aria-pressed', 'false');
  await expect(recipes.getByRole('listitem')).toHaveCount(2);
  await expect(recipes).toContainText('Pulled pork');
  await expect(recipes).toContainText('Speedy noodles');

  // Tapped again, a chip lets go: everything is back.
  await chip('Quick').click();
  await expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
  await expect(recipes.getByRole('listitem')).toHaveCount(5);
});
