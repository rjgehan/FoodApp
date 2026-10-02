import { expect, test } from '@playwright/test';
import { admin, call, inviteToken, newHousehold, newMember, newRecipe, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * Explore (the mockup's 5.1–5.3): its three doors, Global recipes, and moving a published recipe
 * into your own. Explore is server-wide, so these find their own recipes by searching for their
 * unique names rather than counting the list.
 */

async function published(householdId: string, name: string) {
  const r = await newRecipe(householdId, name, [
    { name: 'ramen noodles', qty: 2, unit: 'pack' },
    { name: 'spring onions', qty: 2, optional: true },
  ], { prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 2 });
  await call('PUT', `/api/recipes/${r.id}/published`, { token: (await admin()).token, body: { published: true } });
  return r;
}

const keeps = async (householdId: string, token: string, recipeId: string) =>
  (await call('GET', `/api/households/${householdId}/recipes`, { token })).some((x: any) => x.id === recipeId);

test('Explore opens on three doors, and the two still being built say what is coming', async ({ page }) => {
  const hh = await newHousehold();
  const cook = await newMember(hh.id);
  await published((await newHousehold()).id, unique('Door Ramen'));

  await signIn(page, cook, hh.id);
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  // Global recipes says how many there are to look through.
  const global = page.getByRole('link', { name: /^Global recipes, \d+ published$/ });
  await expect(global).toBeVisible();
  await expect(global.getByText(/^\d+ recipes?$/)).toBeVisible();

  for (const [door, path, promise] of [
    ['Nutrition facts', '/explore/nutrition', 'Any ingredient or product'],
    ['Meal plans', '/explore/meal-plans', 'Cook from cupboard'],
  ]) {
    const link = page.getByRole('link', { name: new RegExp(`^${door}`) });
    await expect(link.getByText('Coming soon')).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: door }).first()).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();
    await expect(page.getByText(promise)).toBeVisible();
    await expect(page.getByText('Not built yet. This is where it will go.')).toBeVisible();
    await page.getByRole('link', { name: 'Explore' }).first().click();
    await expect(page).toHaveURL(/\/explore$/);
  }
});

test('in one household, the + on a published recipe moves it in without opening it', async ({ page }) => {
  const owners = await newHousehold();
  const hh = await newHousehold();
  const cook = await newMember(hh.id);
  const name = unique('Plus Ramen');
  const r = await published(owners.id, name);
  const ours = await published(hh.id, unique('Our Own Stew'));

  await signIn(page, cook, hh.id);
  await page.goto('/explore/recipes');
  await expect(page.getByRole('heading', { name: 'Global recipes' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search published recipes' }).fill(name);
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText(owners.name)).toBeVisible();
  await expect(card.getByText('25 min')).toBeVisible();

  await card.getByRole('button', { name: `Move ${name} into my recipes` }).click();
  // Only one household to put it in, so the sheet does not ask which.
  await expect(sheet(page).getByRole('radio')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Move into my recipes' }).click();
  await expect(page.getByText('Moved into your recipes')).toBeVisible();
  await expect.poll(() => keeps(hh.id, cook.token, r.id)).toBe(true);
  // The card says where it went, and the + has gone.
  await expect(card.getByText('In your Dinner drawer')).toBeVisible();
  await expect(card.getByRole('button', { name: `Move ${name} into my recipes` })).toHaveCount(0);

  // Not kept yet leaves it out now; Published by you shows this household's own.
  await page.getByRole('button', { name: 'Not kept yet' }).click();
  await expect(page.getByText(name)).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search published recipes' }).fill('');
  await page.getByRole('button', { name: 'Published by you' }).click();
  await expect(page.getByText(ours.name)).toBeVisible();
  // One of your own is just your recipe: it opens on the recipe page.
  await page.getByText(ours.name).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${ours.id}$`));
});

test('in two households, moving a published recipe in asks which, and files it there', async ({ page }) => {
  const owners = await newHousehold();
  const a = await newHousehold();
  const b = await newHousehold();
  const cook = await newMember(a.id);
  await call('POST', `/api/invites/${await inviteToken(b.id)}/accept`, { token: cook.token });
  const name = unique('Which Ramen');
  const r = await published(owners.id, name);

  await signIn(page, cook, a.id);
  await page.goto(`/explore/recipes/${r.id}`);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(`From ${owners.name}`)).toBeVisible();
  await expect(page.getByText('Serves 2')).toBeVisible();
  await expect(page.getByText('Optional')).toBeVisible();
  // Written as "2 pack", read as the grocery list says it.
  await expect(page.getByRole('list', { name: 'Ingredients' }).getByText('2 packs')).toBeVisible();

  await page.getByRole('button', { name: 'Move into my recipes' }).click();
  const move = sheet(page);
  // The household on screen is ticked to begin with.
  await expect(move.getByRole('radio', { name: a.name })).toHaveAttribute('aria-checked', 'true');
  await move.getByRole('radio', { name: b.name }).click();
  await expect(move.getByRole('radio', { name: b.name })).toHaveAttribute('aria-checked', 'true');
  await move.getByRole('button', { name: `Move into ${b.name}` }).click();
  await expect(page.getByText(`Moved into ${b.name}`)).toBeVisible();

  await expect.poll(() => keeps(b.id, cook.token, r.id)).toBe(true);
  expect(await keeps(a.id, cook.token, r.id)).toBe(false);
  // Still not kept in the household on screen, so the page still offers to move it.
  await expect(page.getByRole('button', { name: 'Move into my recipes' })).toBeVisible();
});

test('a member of the household that published it is not offered that household to move it into', async ({ page }) => {
  const owners = await newHousehold();
  const other = await newHousehold();
  const cook = await newMember(other.id);
  await call('POST', `/api/invites/${await inviteToken(owners.id)}/accept`, { token: cook.token });
  const name = unique('Home Ramen');
  const r = await published(owners.id, name);
  const sectionAtHome = async () =>
    (await call('GET', `/api/households/${owners.id}/recipes`, { token: cook.token })).find((x: any) => x.id === r.id)?.section;
  const before = await sectionAtHome();

  await signIn(page, cook, other.id);
  await page.goto(`/explore/recipes/${r.id}`);
  await page.getByRole('button', { name: 'Move into my recipes' }).click();
  const move = sheet(page);
  // Its home already has it, which leaves one household: nothing to ask.
  await expect(move.getByRole('radio')).toHaveCount(0);
  await expect(move.getByText(owners.name, { exact: true })).toHaveCount(0);
  // Another drawer than its home's, so a move that re-filed it at home would show.
  await move.getByRole('button', { name: 'Lunch', exact: true }).click();
  await move.getByRole('button', { name: 'Move into my recipes' }).click();
  await expect(page.getByText('Moved into your recipes')).toBeVisible();

  await expect.poll(() => keeps(other.id, cook.token, r.id)).toBe(true);
  // Filed where its publisher keeps it, untouched.
  expect(before).toBe('DINNER');
  expect(await sectionAtHome()).toBe('DINNER');
});
