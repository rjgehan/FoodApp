import { expect, test } from '@playwright/test';
import { call, newHousehold, newMember, unique } from '../../lib/api';
import { fromMenu, sheet, signIn } from '../../lib/ui';

/**
 * Filling a cupboard without typing it: the starter list a new household is offered, the same
 * list from the Cupboard's •••, and copying another of your houses' cupboards.
 */

const cupboardNames = async (householdId: string, token: string) =>
  (await call('GET', `/api/households/${householdId}/cupboard`, { token })).map((i: any) => i.name.toLowerCase()).sort();

test('a household made on the Household page starts by ticking what is in the house', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await page.getByRole('button', { name: 'Start another household' }).click();
  const name = unique('Cabin');
  await sheet(page).getByPlaceholder('Gehan House').fill(name);
  await sheet(page).getByRole('button', { name: 'Create' }).click();

  const starter = sheet(page);
  await expect(starter.getByRole('heading', { name: 'Let’s start your cupboard' })).toBeVisible();
  await starter.getByRole('button', { name: 'salt', exact: true }).click();
  await starter.getByRole('button', { name: 'butter', exact: true }).click();
  await expect(starter.getByRole('button', { name: 'salt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await starter.getByRole('button', { name: 'Select all in Baking' }).click();
  await expect(starter.getByRole('button', { name: 'Clear Baking' })).toBeVisible();
  const baking = await starter.getByRole('region', { name: 'Baking' }).getByRole('listitem').count();
  await starter.getByRole('button', { name: `Add ${baking + 2} to cupboard` }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const made = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.name === name);
  await expect.poll(async () => (await cupboardNames(made.id, hh.owner.token)).length).toBe(baking + 2);
  expect(await cupboardNames(made.id, hh.owner.token)).toEqual(expect.arrayContaining(['salt', 'butter', 'brown sugar']));

  // Offered once: coming back to the app does not ask again.
  await page.reload();
  // The new house is the one open now, so the page is named for it.
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Skip leaves a new household’s cupboard empty, and the page still scrolls', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await page.getByRole('button', { name: 'Start another household' }).click();
  const name = unique('Flat');
  await sheet(page).getByPlaceholder('Gehan House').fill(name);
  await sheet(page).getByRole('button', { name: 'Create' }).click();
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Two sheets swapped places; neither may leave the page locked.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  const made = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.name === name);
  expect(await cupboardNames(made.id, hh.owner.token)).toEqual([]);
});

test('the basics from the Cupboard’s ••• show what is here already', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name: 'rice' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await fromMenu(page, 'Cupboard options', 'Start with the basics…');

  const starter = sheet(page);
  await expect(starter.getByRole('heading', { name: 'Start with the basics' })).toBeVisible();
  const rice = starter.getByRole('button', { name: 'rice', exact: true });
  await expect(rice).toBeDisabled();
  await expect(rice).toHaveAttribute('aria-pressed', 'true');
  await expect(starter.getByRole('button', { name: 'Add to cupboard' })).toBeDisabled();
  await starter.getByRole('button', { name: 'ketchup', exact: true }).click();
  await starter.getByRole('button', { name: 'Add 1 to cupboard' }).click();

  await expect(page.getByRole('status')).toHaveText('Added 1 to the cupboard.');
  await expect(page.getByRole('button', { name: 'Edit ketchup' })).toBeVisible();
  expect(await cupboardNames(hh.id, hh.owner.token)).toEqual(['ketchup', 'rice']);
});

test('an empty cupboard offers the basics too', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Start with the basics' }).click();
  await expect(sheet(page).getByRole('button', { name: 'eggs', exact: true })).toBeVisible();
});

test('copy another of your households’ cupboards from the •••', async ({ page }) => {
  const home = await newHousehold(unique('Home'));
  const cabin = await newHousehold(unique('Cabin'));
  const { token } = home.owner;
  for (const name of ['oats', 'honey', 'tea']) {
    await call('POST', `/api/households/${home.id}/cupboard`, { token, body: { name } });
  }
  await call('POST', `/api/households/${cabin.id}/cupboard`, { token, body: { name: 'tea' } });

  await signIn(page, home.owner, cabin.id);
  await page.goto('/cupboard');
  await expect(page.getByRole('button', { name: 'Edit tea' })).toBeVisible();
  await fromMenu(page, 'Cupboard options', 'Copy from another household…');
  const copy = sheet(page);
  await copy.getByRole('button', { name: home.name, exact: true }).click();
  await expect(copy).toContainText(`“${home.name}” has 3 items in its cupboard.`);
  await expect(copy).toContainText('2 items will be copied');
  await copy.getByRole('button', { name: 'Copy 2 items' }).click();

  await expect(page.getByRole('status')).toHaveText('Copied 2 items; 1 was already here.');
  await expect(page.getByRole('button', { name: 'Edit honey' })).toBeVisible();
  expect(await cupboardNames(cabin.id, token)).toEqual(['honey', 'oats', 'tea']);
});

test('somebody in one household is not offered a copy', async ({ page }) => {
  const hh = await newHousehold();
  const member = await newMember(hh.id);
  await signIn(page, member, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Cupboard options' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Start with the basics…' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Copy from another household…' })).toHaveCount(0);
});
