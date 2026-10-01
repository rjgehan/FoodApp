import { expect, test } from '@playwright/test';
import { admin, call, inviteToken, isoDate, newHousehold, newMember, newRecipe, plan } from '../../lib/api';
import { calendarDay, fromMenu, sheet, signIn } from '../../lib/ui';

/**
 * Sharing at iPhone size: the Share screen offers only the other houses you are in, and a public
 * link can be saved into your own recipes — signing in on the way if you need to.
 */

test('the Share screen lists only your other households, as switches', async ({ page }) => {
  const a = await newHousehold();
  const b = await newHousehold();
  const notMine = await newHousehold();
  const cook = await newMember(a.id);
  await call('POST', `/api/invites/${await inviteToken(b.id)}/accept`, { token: cook.token });
  const r = await newRecipe(a.id, 'Weeknight Dal', [{ name: 'lentils', qty: 1, unit: 'cup' }]);

  await signIn(page, cook, a.id);
  await page.goto(`/recipes/${r.id}`);
  await fromMenu(page, 'Recipe options', /^Share/);
  await expect(page).toHaveURL(new RegExp(`/recipes/${r.id}/share$`));

  const share = page.getByRole('main');
  await expect(share.getByText('Share into your other households')).toBeVisible();
  const houses = share.getByRole('list', { name: 'Your other households' });
  const toB = houses.getByRole('switch', { name: b.name });
  await expect(toB).toHaveAttribute('aria-checked', 'false');
  await expect(houses.getByRole('switch')).toHaveCount(1);
  await expect(share.getByText(notMine.name)).toHaveCount(0);
  await expect(share.getByText(a.name)).toHaveCount(0);
  // The link and Explore are still here.
  await expect(share.getByRole('switch', { name: 'Public link' })).toBeVisible();
  await expect(share.getByRole('switch', { name: 'Publish to Explore' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('share-sheet.png') });

  await toB.click();
  await expect(toB).toHaveAttribute('aria-checked', 'true');
  await expect(houses.getByText('Shows in their Shared with you')).toBeVisible();
  await expect.poll(async () => (await call('GET', `/api/recipes/${r.id}`, { token: cook.token })).sharedWith).toEqual([b.id]);

  await toB.click();
  await expect(toB).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await call('GET', `/api/recipes/${r.id}`, { token: cook.token })).sharedWith).toEqual([]);
});

test('somebody in just one household sees no household list on the Share screen', async ({ page }) => {
  const a = await newHousehold();
  const solo = await newMember(a.id);
  const r = await newRecipe(a.id, 'Solo Soup', [{ name: 'leek', qty: 2 }]);

  await signIn(page, solo, a.id);
  await page.goto(`/recipes/${r.id}`);
  // The round Share button on the photo goes to the same place as ••• › Share.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('main');
  await expect(share.getByRole('switch', { name: 'Public link' })).toBeVisible();
  await expect(share.getByText('Share into your other households')).toHaveCount(0);
  // The link and Explore are the only switches left.
  await expect(share.getByRole('switch')).toHaveCount(2);
  await expect(share.getByRole('switch', { name: 'Publish to Explore' })).toBeVisible();
});

test('a public link signs you in, lets you pick a household, and saves a copy there', async ({ page }) => {
  const owners = await newHousehold();
  const a = await newHousehold();
  const b = await newHousehold();
  const cook = await newMember(a.id);
  await call('POST', `/api/invites/${await inviteToken(b.id)}/accept`, { token: cook.token });
  const r = await newRecipe(owners.id, 'Link Lasagna', [{ name: 'noodles', qty: 1, unit: 'box' }]);
  await newRecipe(a.id, 'House A Hash', [{ name: 'potatoes', qty: 2 }]);
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
  await expect(picker.getByText('Save a copy to…')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/r/${token}$`));
  // Each house says how many recipes it has — what tells them apart when choosing where one goes.
  await expect(picker.getByRole('radio', { name: a.name })).toContainText('1 recipe');
  await expect(picker.getByRole('radio', { name: b.name })).toContainText('0 recipes');
  await page.screenshot({ path: test.info().outputPath('public-link-pick.png') });
  await picker.getByRole('radio', { name: b.name }).click();
  await picker.getByRole('button', { name: `Save to ${b.name}` }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Link Lasagna' })).toBeVisible();
  const copyId = page.url().split('/').pop()!;
  expect(copyId).not.toBe(r.id);
  const copy = await call('GET', `/api/recipes/${copyId}`, { token: cook.token });
  expect(copy.householdId).toBe(b.id);
  expect(copy.shared).toBe(false);
});

test('a link that was turned off says so, and offers a way on', async ({ page }) => {
  const owners = await newHousehold();
  const r = await newRecipe(owners.id, 'Withdrawn Waffles', [{ name: 'flour', qty: 1 }]);
  const owner = await admin();
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token });
  await call('DELETE', `/api/recipes/${r.id}/link`, { token: owner.token });

  await page.goto(`/r/${token}`);
  await expect(page.getByRole('heading', { name: 'This recipe is no longer shared' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
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
  const link = page.getByRole('switch', { name: 'Public link' });
  // Turning it on needs no question: nothing that was sent stops working.
  await expect(link).toHaveAttribute('aria-checked', 'false');
  await link.click();
  await expect(link).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Link', { exact: true })).toContainText('/r/');
  const { token } = await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token });

  // One tap only asks; Cancel keeps it.
  await link.click();
  const ask = page.getByRole('alertdialog', { name: 'Turn off the link?' });
  await expect(ask.getByText(/won't be able to open it any more/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('turn-off-link.png') });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(link).toHaveAttribute('aria-checked', 'true');
  expect((await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token })).token).toBe(token);

  // A new link asks too, and the old one stops working.
  await page.getByRole('button', { name: 'New link' }).click();
  const fresh = page.getByRole('alertdialog', { name: 'Make a new link?' });
  await expect(fresh.getByText("The old link will stop working for anyone you've sent it to.")).toBeVisible();
  await fresh.getByRole('button', { name: 'New link' }).click();
  await expect(fresh).toHaveCount(0);
  await expect.poll(async () => (await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token })).token).not.toBe(token);
  const renewed = (await call('GET', `/api/recipes/${r.id}/link`, { token: cook.token })).token;
  await expect(page.getByLabel('Link', { exact: true })).toContainText(renewed);

  await link.click();
  await page.getByRole('alertdialog', { name: 'Turn off the link?' }).getByRole('button', { name: 'Turn off' }).click();
  await expect(link).toHaveAttribute('aria-checked', 'false');
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
  await expect(day.getByRole('button', { name: 'Add a side' })).toBeVisible();

  // Opened, it says what happened and offers what can still be done — nothing to view.
  await day.getByText('Borrowed Soup').click();
  const options = page.getByRole('dialog', { name: 'Borrowed Soup options' });
  await expect(options.getByText(/The household that shared this recipe has deleted it/)).toBeVisible();
  await expect(options.getByRole('button', { name: 'Open recipe' })).toHaveCount(0);
  await expect(options.getByRole('button', { name: 'Swap for something else' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Remove from plan' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('deleted-shared-recipe.png') });
});
