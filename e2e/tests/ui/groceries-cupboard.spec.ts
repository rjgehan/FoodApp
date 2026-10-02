import { expect, test } from '@playwright/test';
import { call, find, groceries, isoDate, newHousehold, newRecipe, plan } from '../../lib/api';
import { sheet, signIn, swipeLeft } from '../../lib/ui';

/**
 * What the redesigned Groceries and Cupboard (mockup 4.1–4.7) add on top of the old screens:
 * the recipes under a row, the cupboard's warning, Done shopping's switch, the cupboard's one box
 * that searches or adds, its filters, and the item sheet's Have / Low / Exact.
 */

const cupboard = (householdId: string, token: string) => call('GET', `/api/households/${householdId}/cupboard`, { token });

test('a row says which recipes it is for, and what the cupboard says', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  const chili = await newRecipe(hh.id, 'Chili', [{ name: 'onions', qty: 2 }, { name: 'beans', qty: 1, unit: 'can' }]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: chili.id, servings: 4 });
  const onions = await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name: 'onions' } });
  await call('PATCH', `/api/households/${hh.id}/cupboard/${onions.id}`, { token: T, body: { trackQuantity: true, quantity: 1 } });
  await call('POST', `/api/households/${hh.id}/grocery-list/add-all?start=${isoDate(0)}&end=${isoDate(6)}`, { token: T });
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: T, body: { ingredientName: 'bananas' } });

  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  const onionRow = page.getByRole('button', { name: /onions/ });
  await expect(onionRow).toContainText('Chili');
  await expect(onionRow).toContainText('Cupboard says you have 1');
  await expect(page.getByRole('button', { name: /beans/ })).not.toContainText('Cupboard says');
  await expect(page.getByRole('button', { name: /bananas/ })).toContainText(`Added by ${hh.owner.displayName}`);
});

test('Done shopping with the cupboard switched off only clears the list', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  for (const name of ['birthday card', 'wrapping paper']) {
    const item = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: T, body: { ingredientName: name } });
    await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${item.id}`, { token: T, body: { checked: true } });
  }
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');

  await page.getByRole('button', { name: 'List options' }).click();
  await sheet(page).getByRole('button', { name: /Done shopping/ }).click();
  const done = sheet(page);
  await expect(done.getByText('2 ticked items leave the list.')).toBeVisible();
  await expect(done.getByRole('button', { name: 'Finish · 2 to cupboard' })).toBeVisible();
  // One left out by hand, then the whole shop.
  await done.getByRole('button', { name: /birthday card/ }).click();
  await expect(done.getByText('Not for the house')).toBeVisible();
  await expect(done.getByRole('button', { name: 'Finish · 1 to cupboard' })).toBeVisible();
  await done.getByRole('switch', { name: /Put them in the cupboard/ }).click();
  await done.getByRole('button', { name: 'Finish', exact: true }).click();

  await expect.poll(async () => (await groceries(hh.id)).length).toBe(0);
  expect(await cupboard(hh.id, T)).toEqual([]);
});

test('the cupboard box finds what you have, and offers to add what you do not', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name: 'tahini sauce' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');

  await page.getByRole('searchbox').fill('tahini');
  await expect(page.getByText('Similar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit tahini sauce' })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect.poll(async () => (await cupboard(hh.id, T)).map((i: { name: string }) => i.name).sort()).toEqual([
    'tahini',
    'tahini sauce',
  ]);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  // Typed exactly, there is nothing to offer.
  await page.getByRole('searchbox').fill('tahini');
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
});

test('the cupboard filters: low, always have, reminders', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  const add = async (name: string, body: object = {}) => {
    const item = await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name } });
    if (Object.keys(body).length) await call('PATCH', `/api/households/${hh.id}/cupboard/${item.id}`, { token: T, body });
    return item;
  };
  await add('passata', { runningLow: true });
  await add('olive oil', { staple: true });
  const paprika = await add('paprika');
  await call('PUT', `/api/households/${hh.id}/restock/${paprika.ingredientId}`, { token: T, body: { everyDays: 28 } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');

  const names = page.getByRole('button', { name: /^Edit / });
  const shown = () => names.evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label')));
  await expect(names).toHaveCount(3);
  await page.getByRole('button', { name: 'Low · 1' }).click();
  await expect.poll(shown).toEqual(['Edit passata']);
  await page.getByRole('button', { name: 'Always have · 1' }).click();
  await expect.poll(shown).toEqual(['Edit olive oil']);
  await page.getByRole('button', { name: 'Reminders · 1' }).click();
  await expect.poll(shown).toEqual(['Edit paprika']);
  await page.getByRole('button', { name: 'All · 3' }).click();
  await expect(names).toHaveCount(3);
});

test('a cupboard item: Have, Low or an exact count, and a rename that would merge says so', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name: 'chickpeas' } });
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name: 'chickpeas (tin)' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');

  await page.getByRole('button', { name: 'Edit chickpeas (tin)' }).click();
  const edit = sheet(page);
  await expect(edit.getByRole('radio', { name: 'Have' })).toHaveAttribute('aria-checked', 'true');
  await edit.getByRole('radio', { name: 'Exact' }).click();
  await edit.getByRole('button', { name: 'One more' }).click();
  await edit.getByRole('button', { name: 'One more' }).click();
  await edit.getByPlaceholder('unit').fill('tins');
  await expect(edit.getByRole('group', { name: 'How many' })).toContainText('3 tins');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () => find(await cupboard(hh.id, T), 'chickpeas (tin)'))
    .toMatchObject({ quantity: 3, unit: 'tins' });

  // Back to Low: the count goes, and the row's pill says Low.
  await page.getByRole('button', { name: 'Edit chickpeas (tin)' }).click();
  await sheet(page).getByRole('radio', { name: 'Low' }).click();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(async () => find(await cupboard(hh.id, T), 'chickpeas (tin)'))
    .toMatchObject({ quantity: null, runningLow: true });

  await page.getByRole('button', { name: 'Edit chickpeas (tin)' }).click();
  await sheet(page).getByLabel('Name').fill('Chickpeas');
  await expect(sheet(page).getByText('would merge it with the item you already have')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Merge' })).toBeVisible();
});

test('a cupboard item takes an optional use-by date, and can lose it again', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: T, body: { name: 'spinach' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');

  await page.getByRole('button', { name: 'Edit spinach' }).click();
  const edit = sheet(page);
  await expect(edit.getByText('Optional · plans use it up in time')).toBeVisible();
  await edit.getByLabel('Use by', { exact: true }).fill(isoDate(2));
  await expect(edit.getByText('Optional · plans use it up in time')).toHaveCount(0);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () => find(await cupboard(hh.id, T), 'spinach'))
    .toMatchObject({ useBy: isoDate(2), useSoon: true, useSoonGuess: false });

  // Opened again it shows the date, and the × takes it off.
  await page.getByRole('button', { name: 'Edit spinach' }).click();
  await expect(sheet(page).getByLabel('Use by', { exact: true })).toHaveValue(isoDate(2));
  await sheet(page).getByRole('button', { name: 'Clear the use-by date' }).click();
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => find(await cupboard(hh.id, T), 'spinach')).toMatchObject({ useBy: null });
});

test('a grocery item’s Cupboard row opens the cupboard on it', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: hh.owner.token, body: { ingredientName: 'rice' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  await swipeLeft(page, page.getByText('rice', { exact: true }));
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(sheet(page).getByRole('button', { name: /Cupboard/ })).toContainText('None recorded');
  await sheet(page).getByRole('button', { name: /Cupboard/ }).click();
  await expect(page).toHaveURL(/\/cupboard\?q=rice$/);
  await expect(page.getByRole('searchbox')).toHaveValue('rice');
  await expect(page.getByText('Add “rice”')).toBeVisible();
});
