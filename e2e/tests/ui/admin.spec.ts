import { expect, test } from '@playwright/test';
import { admin, adminByPassword, call, newHousehold, newMember, newRecipe, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * The read-only admin pages, at iPhone size: the admin finds them in Settings and reads down to
 * a recipe; anybody else is sent home and never sees the way in.
 */

test('the admin gets in from Settings and reads a household down to one of its recipes', async ({ page }) => {
  const hh = await newHousehold(unique('Admin UI'));
  const member = await newMember(hh.id);
  const recipeName = unique('Admin soup');
  await newRecipe(hh.id, recipeName, [{ name: 'leek', qty: 2 }], { instructions: 'Chop.\nSimmer.' });

  await signIn(page, await adminByPassword(), hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Your account' }).click();
  await sheet(page).getByRole('link', { name: /^Admin/ }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  const overview = page.getByRole('list', { name: 'Overview', exact: true });
  await expect(overview.getByText('Households', { exact: true })).toBeVisible();
  await expect(overview.getByText('Without a password')).toBeVisible();

  // At phone width the tables are cards, sorted from a menu above them. Newest at the top.
  const households = page.getByRole('list', { name: 'Households', exact: true });
  await expect(households).toBeVisible();
  await expect(page.getByRole('table', { name: 'Households', exact: true })).toBeHidden();
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Sort by created' });
  await expect(page).toHaveURL(/sort=created&dir=desc/);
  await expect(page.getByRole('button', { name: /^Descending/ })).toBeVisible();
  await households.getByRole('link', { name: new RegExp(hh.name) }).click();

  await expect(page.getByRole('heading', { name: hh.name, level: 1 })).toBeVisible();
  const people = page.getByRole('list', { name: 'People in this household', exact: true });
  await expect(people.getByText(member.email)).toBeVisible();
  await expect(people.getByText('Owner')).toBeVisible();
  // Read-only: nothing to press that would change anybody.
  await expect(page.getByRole('button', { name: /remove|delete|reset/i })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('admin-household.png'), fullPage: true });

  await page.getByRole('link', { name: new RegExp(recipeName) }).click();
  await expect(page.getByRole('heading', { name: recipeName, level: 1 })).toBeVisible();
  await expect(page.getByText('leek')).toBeVisible();
  await expect(page.getByText('Simmer.')).toBeVisible();
  await expect(page.getByRole('link', { name: hh.name })).toBeVisible();

  // People, searched for. A pause after a space keeps the space: two-word searches still work.
  await page.goto('/admin?tab=people');
  const search = page.getByRole('searchbox', { name: 'Search people' });
  await search.pressSequentially('Nobody ');
  await expect(page).toHaveURL(/q=Nobody(&|$)/);
  await search.pressSequentially('here');
  await expect(search).toHaveValue('Nobody here');
  await expect(page).toHaveURL(/q=Nobody\+here/);
  await search.fill(member.email);
  const found = page.getByRole('list', { name: 'People', exact: true });
  await expect(found.getByText(member.email)).toBeVisible();
  await expect(found.getByRole('listitem')).toHaveCount(1);

  // Recipes, narrowed to one household.
  await page.goto('/admin?tab=recipes');
  await page.getByRole('combobox', { name: 'Household', exact: true }).selectOption({ label: hh.name });
  await expect(page.getByRole('list', { name: 'Recipes', exact: true }).getByText(recipeName)).toBeVisible();
});

test('on a computer the lists are tables', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: process.env.WEB_URL ?? 'http://localhost:5173' });
  const page = await context.newPage();
  const hh = await newHousehold(unique('Admin wide'));
  await signIn(page, await adminByPassword(), hh.id);
  await page.goto('/admin');
  const table = page.getByRole('table', { name: 'Households', exact: true });
  await expect(table).toBeVisible();
  await expect(page.getByRole('list', { name: 'Households', exact: true })).toBeHidden();

  // Sorting by People, most first, then flipping it.
  await table.getByRole('button', { name: 'People' }).click();
  await expect(page).toHaveURL(/sort=members&dir=desc/);
  await expect(table.getByRole('columnheader', { name: 'People' })).toHaveAttribute('aria-sort', 'descending');
  await table.getByRole('button', { name: 'People' }).click();
  await expect(table.getByRole('columnheader', { name: 'People' })).toHaveAttribute('aria-sort', 'ascending');
  await page.screenshot({ path: test.info().outputPath('admin-desktop.png'), fullPage: true });

  // The whole row goes to the household, not just its name.
  await page.goto('/admin?sort=created&dir=desc');
  await table.getByRole('row', { name: new RegExp(hh.name) }).getByRole('cell').nth(2).click();
  await expect(page.getByRole('heading', { name: hh.name, level: 1 })).toBeVisible();
  await context.close();
});

test('anybody else is sent home, and has no Admin row in Settings', async ({ page }) => {
  const hh = await newHousehold();
  const member = await newMember(hh.id);
  expect((await call('GET', '/api/users/me', { token: member.token })).admin).toBe(false);

  await signIn(page, member, hh.id);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/meal-plan$/);
  await page.goto('/admin/households/' + hh.id);
  await expect(page).toHaveURL(/\/meal-plan$/);

  await page.getByRole('button', { name: 'Your account' }).click();
  await expect(sheet(page).getByRole('link', { name: 'Household settings' })).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: /^Admin/ })).toHaveCount(0);
});

test('the admin signed in with their PIN is sent home like anybody else', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, await admin(), hh.id);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/meal-plan$/);
  await page.getByRole('button', { name: 'Your account' }).click();
  await expect(sheet(page).getByRole('link', { name: 'Household settings' })).toBeVisible();
  await expect(sheet(page).getByRole('link', { name: /^Admin/ })).toHaveCount(0);
});

test('the admin deletes an account from People, after being told what happens', async ({ page }) => {
  const hh = await newHousehold();
  const person = await newMember(hh.id);
  await signIn(page, await adminByPassword(), hh.id);
  await page.goto(`/admin?tab=people&q=${encodeURIComponent(person.email)}`);

  await page.getByRole('button', { name: `Delete ${person.displayName}` }).click();
  await expect(sheet(page).getByText('they leave; everyone else stays.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-delete.png') });
  await sheet(page).getByRole('button', { name: 'Delete account' }).click();

  await expect(page.getByRole('status')).toHaveText(`Deleted ${person.displayName}.`);
  await expect(page.getByText('Nobody matches that.')).toBeVisible();
});
