import { expect, test } from '@playwright/test';
import { admin, call, inviteToken, isoDate, newHousehold, newMember, newRecipe, plan } from '../../lib/api';
import { calendarDay, fromMenu, sheet, signIn } from '../../lib/ui';

/**
 * Sharing at iPhone size: the Share sheet offers only the other houses you are in, and a public
 * link can be saved into your own recipes — signing in on the way if you need to.
 */

test('the Share sheet lists only your other households, as switches', async ({ page }) => {
  const a = await newHousehold();
  const b = await newHousehold();
  const notMine = await newHousehold();
  const cook = await newMember(a.id);
  await call('POST', `/api/invites/${await inviteToken(b.id)}/accept`, { token: cook.token });
  const r = await newRecipe(a.id, 'Weeknight Dal', [{ name: 'lentils', qty: 1, unit: 'cup' }]);

  await signIn(page, cook, a.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Share/);

  const share = sheet(page);
  await expect(share.getByRole('heading', { name: 'Your other households' })).toBeVisible();
  const toB = share.getByRole('switch', { name: b.name });
  await expect(toB).toHaveAttribute('aria-checked', 'false');
  await expect(share.getByText(notMine.name)).toHaveCount(0);
  await expect(share.getByText(a.name)).toHaveCount(0);
  // The link and Explore are still here.
  await expect(share.getByRole('heading', { name: 'Anyone with the link' })).toBeVisible();
  await expect(share.getByRole('switch', { name: 'In Explore' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('share-sheet.png') });

  await toB.click();
  await expect(toB).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await call('GET', `/api/recipes/${r.id}`, { token: cook.token })).sharedWith).toEqual([b.id]);

  await toB.click();
  await expect(toB).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await call('GET', `/api/recipes/${r.id}`, { token: cook.token })).sharedWith).toEqual([]);
});

test('somebody in just one household sees no household list in the Share sheet', async ({ page }) => {
  const a = await newHousehold();
  const solo = await newMember(a.id);
  const r = await newRecipe(a.id, 'Solo Soup', [{ name: 'leek', qty: 2 }]);

  await signIn(page, solo, a.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Share/);
  await expect(sheet(page).getByRole('heading', { name: 'Anyone with the link' })).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Your other households' })).toHaveCount(0);
  // Explore is the only switch left.
  await expect(sheet(page).getByRole('switch')).toHaveCount(1);
  await expect(sheet(page).getByRole('switch', { name: 'In Explore' })).toBeVisible();
});

test('a public link signs you in, lets you pick a household, and saves a copy there', async ({ page }) => {
  const owners = await newHousehold();
  const a = await newHousehold();
  const b = await newHousehold();
  const cook = await newMember(a.id);
  await call('POST', `/api/invites/${await inviteToken(b.id)}/accept`, { token: cook.token });
  const r = await newRecipe(owners.id, 'Link Lasagna', [{ name: 'noodles', qty: 1, unit: 'box' }]);
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: (await admin()).token });

  // Signed out: the recipe reads as before, with a quiet way to keep it.
  await page.goto(`/r/${token}`);
  await expect(page.getByRole('heading', { name: 'Link Lasagna' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan', exact: true })).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Save to my recipes' });
  await save.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('public-link-signed-out.png'), fullPage: true });
  await save.click();

  await expect(page.getByText('Sign in to save Link Lasagna to your recipes')).toBeVisible();
  // Changed their mind: straight back to the recipe.
  await page.getByRole('button', { name: 'Back to the recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Link Lasagna' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to my recipes' }).click();

  await page.getByLabel('Email').fill(cook.email);
  await page.getByLabel('Password').fill(cook.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Two households, so they are asked which — on the same link, not dropped into the app.
  const picker = sheet(page);
  await expect(picker.getByText('Save to which household?')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/r/${token}$`));
  await page.screenshot({ path: test.info().outputPath('public-link-pick.png') });
  await picker.getByRole('button', { name: b.name }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Link Lasagna' })).toBeVisible();
  const copyId = page.url().split('/').pop()!;
  expect(copyId).not.toBe(r.id);
  const copy = await call('GET', `/api/recipes/${copyId}`, { token: cook.token });
  expect(copy.householdId).toBe(b.id);
  expect(copy.shared).toBe(false);
});

test('signed in with one household, Save goes straight to the copy', async ({ page }) => {
  const owners = await newHousehold();
  const a = await newHousehold();
  const cook = await newMember(a.id);
  const r = await newRecipe(owners.id, 'Quick Omelette', [{ name: 'eggs', qty: 3 }]);
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: (await admin()).token });

  await signIn(page, cook, a.id);
  await page.goto(`/r/${token}`);
  await page.getByRole('button', { name: 'Save to my recipes' }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Quick Omelette' })).toBeVisible();
  const mine = await call('GET', `/api/households/${a.id}/recipes`, { token: cook.token });
  expect(mine.filter((x: { name: string }) => x.name === 'Quick Omelette')).toHaveLength(1);
});

test('turning off the link asks first, and Cancel keeps it', async ({ page }) => {
  const a = await newHousehold();
  const cook = await newMember(a.id);
  const r = await newRecipe(a.id, 'Brief Broth', [{ name: 'bones', qty: 1 }]);

  await signIn(page, cook, a.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Share/);
  const share = sheet(page);
  await share.getByRole('button', { name: 'Create a link' }).click();
  await expect(share.getByLabel('Link')).toContainText('/r/');
  const { token } = await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token });

  // One tap only asks; Cancel keeps it.
  await share.getByRole('button', { name: 'Turn off the link' }).click();
  await expect(share.getByText(/won't be able to open it any more/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('turn-off-link.png') });
  await share.getByRole('button', { name: 'Cancel' }).click();
  await expect(share.getByText(/won't be able to open it any more/)).toHaveCount(0);
  expect((await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token })).token).toBe(token);

  await share.getByRole('button', { name: 'Turn off the link' }).click();
  await share.getByRole('button', { name: 'Turn off the link' }).last().click();
  await expect(share.getByRole('button', { name: 'Create a link' })).toBeVisible();
  expect((await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token })).token).toBeNull();
});

test('saving from a link turned off while it was open says so', async ({ page }) => {
  const owners = await newHousehold();
  const mine = await newHousehold();
  const reader = await newMember(mine.id);
  const r = await newRecipe(owners.id, 'Gone Gazpacho', [{ name: 'tomatoes', qty: 6 }]);
  const owner = await admin();
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token });

  await signIn(page, reader, mine.id);
  await page.goto(`/r/${token}`);
  await expect(page.getByRole('heading', { name: 'Gone Gazpacho' })).toBeVisible();
  await call('DELETE', `/api/recipes/${r.id}/link`, { token: owner.token });

  await page.getByRole('button', { name: 'Save to my recipes' }).click();
  await expect(page.getByText(/This link has been turned off/)).toBeVisible();
});

test('a shared recipe deleted by its owners stays on the other plan, marked as deleted', async ({ page }) => {
  const owners = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(owners.id, 'Borrowed Soup', [{ name: 'leek', qty: 2 }]);
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: owner.token, body: { householdIds: [theirs.id] } });
  await plan(theirs.id, isoDate(0), 'LUNCH', { recipeId: r.id });
  await call('DELETE', `/api/recipes/${r.id}`, { token: owner.token });

  await signIn(page, theirs.owner, theirs.id);
  await page.goto('/meal-plan');
  await (await calendarDay(page, new Date())).click();
  const day = sheet(page);
  await expect(day.getByText('Borrowed Soup')).toBeVisible();
  await expect(day.getByText('Recipe was deleted')).toBeVisible();
  // It may still be cooked from memory, so bread can still go next to it.
  await expect(day.getByRole('button', { name: 'Add side' })).toBeVisible();

  // Opened, it says what happened and offers what can still be done — nothing to view.
  await day.getByText('Borrowed Soup').click();
  await expect(day.getByText(/The household that shared this recipe has deleted it/)).toBeVisible();
  await expect(day.getByRole('button', { name: 'View recipe' })).toHaveCount(0);
  await expect(day.getByRole('button', { name: 'Change' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Remove' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('deleted-shared-recipe.png') });
});
