import { expect, test, type Page } from '@playwright/test';
import { admin, call, groceries, newHousehold, newRecipe, setKitchen, unique } from '../../lib/api';
import { signIn } from '../../lib/ui';

/*
 * What the kitchen can make, on the web: Can make in a drawer and on Global recipes, a recipe
 * saying which machine the kitchen lacks, and Meal ideas — Explore's door for a household that
 * doesn't plan — putting ideas the kitchen can make straight onto Groceries.
 */

const machinesRow = (page: Page) => page.getByRole('group', { name: 'Machines' });
const canMakeChip = (page: Page) => page.getByRole('button', { name: /^Can make/ });
const card = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^${name}\\b`) });

/** A dinner with exactly these machines, picked by hand, and one ingredient of its own. */
const dinner = (householdId: string, name: string, appliances: string[]) =>
  newRecipe(householdId, name, [{ name: unique(name.split(' ')[0]).toLowerCase(), qty: 1 }], { appliances });

test('a drawer can show only what the kitchen can make, and a recipe says which machine it lacks', async ({ page }) => {
  const hh = await newHousehold();
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  const roast = await dinner(hh.id, 'Roast chicken', ['oven']);
  const chili = await dinner(hh.id, 'Chili beans', ['slow-cooker']);
  await dinner(hh.id, 'Crispy wings', ['oven', 'air-fryer']);
  await dinner(hh.id, 'Green salad', []);
  await signIn(page, hh.owner, hh.id);

  await page.goto('/recipes/section/dinner');
  // First on the Machines row, with how many the kitchen can make: oven or air fryer will do.
  await expect(machinesRow(page).getByRole('button').first()).toHaveText(/^Can make\s*3$/);
  await expect(canMakeChip(page)).toHaveAttribute('aria-pressed', 'false');
  await canMakeChip(page).click();
  await expect(page).toHaveURL(/[?&]can=1/);
  await expect(card(page, 'Chili beans')).toHaveCount(0);
  for (const name of ['Roast chicken', 'Crispy wings', 'Green salad']) await expect(card(page, name)).toBeVisible();

  // With the slow cooker's own chip as well, there is nothing left — and it says why.
  await machinesRow(page).getByRole('button', { name: /^Slow cooker/ }).click();
  await expect(page.getByText('Nothing here needs the slow cooker and can be made in your kitchen.')).toBeVisible();
  // Off again: everything that needs one.
  await canMakeChip(page).click();
  await expect(card(page, 'Chili beans')).toBeVisible();

  // The recipe says so, and the machine it lacks is drawn as missing.
  await page.goto(`/recipes/${chili.id}`);
  await expect(page.getByText('Your kitchen has no slow cooker.')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Slow cooker, not in your kitchen' })).toBeVisible();
  await page.getByRole('link', { name: 'Change your kitchen' }).click();
  await expect(page).toHaveURL(/\/household\/kitchen$/);
  // One it can make says nothing.
  await page.goto(`/recipes/${roast.id}`);
  await expect(page.getByRole('heading', { name: 'Roast chicken' })).toBeVisible();
  await expect(page.getByText(/^Your kitchen has no/)).toHaveCount(0);
});

test('a kitchen nobody has described has no Can make, and no recipe is said to need anything', async ({ page }) => {
  const hh = await newHousehold();
  const chili = await dinner(hh.id, 'Chili beans', ['slow-cooker']);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/section/dinner');
  await expect(machinesRow(page).getByRole('button', { name: /^Slow cooker/ })).toBeVisible();
  await expect(canMakeChip(page)).toHaveCount(0);
  await page.goto(`/recipes/${chili.id}`);
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toHaveText('Slow cooker');
  await expect(page.getByText(/^Your kitchen has no/)).toHaveCount(0);
});

test('Global recipes can show only what the kitchen can make', async ({ page }) => {
  const hh = await newHousehold();
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  const tag = unique('Gx').replace(/[^A-Za-z0-9]/g, '');
  const other = await newHousehold();
  const { token } = await admin();
  const bake = await dinner(other.id, `${tag} bake`, ['oven']);
  const stew = await dinner(other.id, `${tag} stew`, ['slow-cooker']);
  for (const r of [bake, stew]) await call('PUT', `/api/recipes/${r.id}/published`, { token, body: { published: true } });
  await signIn(page, hh.owner, hh.id);

  await page.goto('/explore/recipes');
  await page.getByLabel('Search published recipes').fill(tag);
  const published = page.getByRole('list', { name: 'Published recipes' });
  await expect(published.getByRole('listitem')).toHaveCount(2);
  await canMakeChip(page).click();
  await expect(canMakeChip(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(published.getByRole('listitem')).toHaveCount(1);
  await expect(published).toContainText(`${tag} bake`);
  await expect(published).not.toContainText(`${tag} stew`);
  // The one it can't make, opened, says why.
  await page.goto(`/explore/recipes/${stew.id}`);
  await expect(page.getByText('Your kitchen has no slow cooker.')).toBeVisible();
});

test('with the Plan off, Meal ideas offer what the kitchen can make and put the ticked ones on Groceries', async ({ page }) => {
  const hh = await newHousehold({ plan: false });
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  // Six it can make, so every idea on screen is the household's own, and a swap brings the sixth.
  const names = ['Alpha bake', 'Bravo pie', 'Charlie hotpot', 'Delta gratin', 'Echo tart', 'Foxtrot roast'];
  const mine = [];
  for (const name of names) mine.push(await dinner(hh.id, name, ['oven']));
  const slow = await dinner(hh.id, 'Golf stew', ['slow-cooker']);
  await signIn(page, hh.owner, hh.id);

  await page.goto('/explore');
  await expect(page.getByRole('link', { name: 'Meal plans' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Meal ideas' }).click();
  await expect(page).toHaveURL(/\/explore\/meal-ideas$/);
  await expect(page.getByText('Dinner ideas your kitchen can make.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dinner', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const list = page.getByRole('list', { name: 'Meal ideas' });
  const rows = list.getByRole('listitem');
  await expect(rows).toHaveCount(5);
  const shown = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!));
  expect(shown.every((n) => names.includes(n))).toBe(true);
  expect(shown).not.toContain(slow.name);
  await expect(page.getByText(/^Only recipes your kitchen can make/)).toBeVisible();

  // Swap one: the sixth takes its place.
  const missingOne = names.find((n) => !shown.includes(n))!;
  await page.getByRole('button', { name: `Another instead of ${shown[0]}` }).click();
  await expect(list.getByRole('listitem', { name: missingOne })).toBeVisible();
  await expect(list.getByRole('listitem', { name: shown[0] })).toHaveCount(0);

  // Every idea starts ticked; keep two.
  const now = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!));
  const keep = now.slice(0, 2);
  for (const name of now.slice(2)) await page.getByRole('button', { name: `Add ${name} to Groceries` }).click();
  await expect(page.getByRole('button', { name: `Add ${keep[0]} to Groceries` })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add 2 to Groceries' }).click();

  await expect(page).toHaveURL(/\/grocery-list$/);
  const ingredientOf = (name: string) => mine.find((r) => r.name === name)!.ingredients[0].ingredientName;
  const want = keep.map(ingredientOf).sort();
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name).sort()).toEqual(want);

  // Back on Meal ideas, those two are being shopped for already, so they aren't offered again.
  await page.goto('/explore/meal-ideas');
  await expect(rows.first()).toBeVisible();
  const after = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!));
  for (const name of keep) expect(after).not.toContain(name);
  expect(after.filter((n) => names.includes(n))).toHaveLength(4);

  // Each meal has its own ideas, and the address says which (Explore's chips open straight onto one).
  await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await expect(page).toHaveURL(/[?&]meal=breakfast/);
  await expect(page.getByText('Breakfast ideas your kitchen can make.', { exact: false })).toBeVisible();
});
