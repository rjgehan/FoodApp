import { expect, test } from '@playwright/test';
import { call, groceries, newHousehold, type Session } from '../../lib/api';
import { quote, sql } from '../../lib/db';
import { sheet, signIn, swipeLeft } from '../../lib/ui';

/**
 * Restock reminders at iPhone size: set from a grocery row or a cupboard item, and the "Time to
 * restock?" question the app asks on opening once one has come due.
 */

async function remindedAndDue(householdId: string, owner: Session, name: string, everyDays: number, daysAgo: number) {
  const item = await call('POST', `/api/households/${householdId}/cupboard`, { token: owner.token, body: { name } });
  await call('PUT', `/api/households/${householdId}/restock/${item.ingredientId}`, { token: owner.token, body: { everyDays } });
  // The clock cannot be wound on, so the last purchase is wound back in the local database.
  return {
    ingredientId: item.ingredientId as string,
    wound: sql(
      `UPDATE restock_reminders SET last_bought_at = now() - interval '${daysAgo} days' ` +
        `WHERE household_id = ${quote(householdId)} AND ingredient_id = ${quote(item.ingredientId)}`,
    ),
  };
}

const reminders = (householdId: string, owner: Session) =>
  call('GET', `/api/households/${householdId}/restock`, { token: owner.token });

test('opening the app asks about what is due; Add puts the ticked ones on the list', async ({ page }) => {
  const hh = await newHousehold();
  const coffee = await remindedAndDue(hh.id, hh.owner, 'coffee', 21, 22);
  if (!coffee.wound) {
    test.info().annotations.push({ type: 'skipped', description: 'No docker access to wind the clock back.' });
    return;
  }
  await remindedAndDue(hh.id, hh.owner, 'dish soap', 14, 15);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');

  const prompt = sheet(page);
  await expect(prompt.getByRole('heading', { name: 'Time to restock?' })).toBeVisible();
  await expect(prompt.getByText('every 3 weeks · last bought', { exact: false })).toBeVisible();
  await expect(prompt.getByRole('button', { name: /coffee/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(prompt.getByRole('button', { name: /dish soap/ })).toHaveAttribute('aria-pressed', 'true');

  // Still some soap under the sink.
  await prompt.getByRole('button', { name: /dish soap/ }).click();
  await prompt.getByRole('button', { name: 'Add 1 to list' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // On the list straight away, from the live update.
  await expect(page.getByRole('button', { name: /coffee/ }).first()).toBeVisible();
  expect((await groceries(hh.id)).map((i) => i.name)).toEqual(['coffee']);
  const soap = (await reminders(hh.id, hh.owner)).find((r: { name: string }) => r.name === 'dish soap');
  expect(soap.snoozedUntil).not.toBeNull();

  // Asked once per app open, not on every page.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', { name: 'Time to restock?' })).toHaveCount(0);
});

test('Not now lets everything be for a few days', async ({ page }) => {
  const hh = await newHousehold();
  const rice = await remindedAndDue(hh.id, hh.owner, 'rice', 7, 8);
  if (!rice.wound) {
    test.info().annotations.push({ type: 'skipped', description: 'No docker access to wind the clock back.' });
    return;
  }

  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await sheet(page).getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Time to restock?' })).toHaveCount(0);

  await expect.poll(async () => (await reminders(hh.id, hh.owner))[0].snoozedUntil).not.toBeNull();
  expect(await groceries(hh.id)).toEqual([]);
});

test('a grocery row: swipe → Remind sets how often, and the row says so', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: hh.owner.token, body: { ingredientName: 'dog food' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');

  await swipeLeft(page, page.getByText('dog food', { exact: true }));
  await page.getByRole('button', { name: 'Remind', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'dog food' })).toBeVisible();
  await sheet(page).getByLabel('Remind me to buy it').selectOption({ label: 'Every 3 weeks' });
  await sheet(page).getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Every 3 weeks', { exact: true })).toBeVisible();
  expect(await reminders(hh.id, hh.owner)).toMatchObject([{ name: 'dog food', everyDays: 21 }]);
});

test('a cupboard item: its sheet sets a reminder in days, and turns it off again', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name: 'coffee filters' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');

  await page.getByRole('button', { name: 'Edit coffee filters' }).click();
  await sheet(page).getByLabel('Remind me to buy it').selectOption({ label: 'Every … days' });
  await sheet(page).getByLabel('Days between').fill('10');
  await sheet(page).getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Every 10 days')).toBeVisible();
  expect(await reminders(hh.id, hh.owner)).toMatchObject([{ name: 'coffee filters', everyDays: 10 }]);

  await page.getByRole('button', { name: 'Edit coffee filters' }).click();
  await expect(sheet(page).getByLabel('Days between')).toHaveValue('10');
  await sheet(page).getByLabel('Remind me to buy it').selectOption({ label: 'Off' });
  await sheet(page).getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Every 10 days')).toHaveCount(0);
  expect(await reminders(hh.id, hh.owner)).toEqual([]);
});
