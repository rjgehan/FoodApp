import { expect, test } from '@playwright/test';
import { call, find, groceries, newHousehold, newMember, statusOf, type Json, type Session } from '../../lib/api';
import { quote, sql } from '../../lib/db';

/**
 * Restock reminders: "remind me to buy this every 3 weeks". The clock runs from the last time
 * it was bought, the app asks on opening once it has run out, and the answer either puts it on
 * the list or leaves it be for three days.
 */

const base = (householdId: string) => `/api/households/${householdId}/restock`;

async function inCupboard(householdId: string, owner: Session, name: string): Promise<string> {
  const item = await call('POST', `/api/households/${householdId}/cupboard`, { token: owner.token, body: { name } });
  return item.ingredientId;
}

async function remind(householdId: string, owner: Session, ingredientId: string, everyDays: number): Promise<Json> {
  return call('PUT', `${base(householdId)}/${ingredientId}`, { token: owner.token, body: { everyDays } });
}

const due = (householdId: string, owner: Session): Promise<Json[]> =>
  call('GET', `${base(householdId)}/due`, { token: owner.token });

const reminders = (householdId: string, owner: Session): Promise<Json[]> =>
  call('GET', base(householdId), { token: owner.token });

/**
 * The clock cannot be wound on, so the last purchase is wound back instead — straight in the
 * local dev database, the only one this suite touches. False with no docker to do it with.
 */
function boughtDaysAgo(householdId: string, ingredientId: string, days: number): boolean {
  return sql(
    `UPDATE restock_reminders SET last_bought_at = now() - interval '${days} days' ` +
      `WHERE household_id = ${quote(householdId)} AND ingredient_id = ${quote(ingredientId)}`,
  );
}

function skipWithoutDocker() {
  test.info().annotations.push({ type: 'skipped', description: 'No docker access to the dev database; the clock is left to the backend tests.' });
}

test('set, change and turn off — one per thing, and a new one starts counting now', async () => {
  const hh = await newHousehold();
  const coffee = await inCupboard(hh.id, hh.owner, 'coffee');

  const before = Date.now();
  const set = await remind(hh.id, hh.owner, coffee, 21);
  expect(set).toMatchObject({ ingredientId: coffee, name: 'coffee', everyDays: 21, due: false, snoozedUntil: null });
  expect(new Date(set.lastBoughtAt).getTime()).toBeGreaterThanOrEqual(before - 5_000);
  expect(new Date(set.dueAt).getTime() - new Date(set.lastBoughtAt).getTime()).toBe(21 * 86_400_000);

  const changed = await remind(hh.id, hh.owner, coffee, 14);
  expect(changed.everyDays).toBe(14);
  // Changing how often keeps the clock it already had.
  expect(changed.lastBoughtAt).toBe(set.lastBoughtAt);
  expect(await reminders(hh.id, hh.owner)).toHaveLength(1);

  await call('DELETE', `${base(hh.id)}/${coffee}`, { token: hh.owner.token });
  // Off twice is still off.
  await call('DELETE', `${base(hh.id)}/${coffee}`, { token: hh.owner.token });
  expect(await reminders(hh.id, hh.owner)).toHaveLength(0);
});

test('only whole days from one to a year, for a real ingredient', async () => {
  const hh = await newHousehold();
  const coffee = await inCupboard(hh.id, hh.owner, 'coffee');
  const put = (id: string, body: unknown) => statusOf('PUT', `${base(hh.id)}/${id}`, { token: hh.owner.token, body });
  expect(await put(coffee, { everyDays: 0 })).toBe(400);
  expect(await put(coffee, { everyDays: 366 })).toBe(400);
  expect(await put(coffee, {})).toBe(400);
  expect(await put('00000000-0000-0000-0000-000000000000', { everyDays: 7 })).toBe(404);
  expect(await put(coffee, { everyDays: 365 })).toBe(200);
});

test('due once its days have passed, unless it is already waiting on the list', async () => {
  const hh = await newHousehold();
  const filters = await inCupboard(hh.id, hh.owner, 'coffee filters');
  await remind(hh.id, hh.owner, filters, 21);
  expect(await due(hh.id, hh.owner)).toEqual([]);

  if (!boughtDaysAgo(hh.id, filters, 20)) return skipWithoutDocker();
  expect(await due(hh.id, hh.owner)).toEqual([]);

  boughtDaysAgo(hh.id, filters, 22);
  expect((await due(hh.id, hh.owner)).map((r) => r.name)).toEqual(['coffee filters']);

  const row = await call('POST', `/api/households/${hh.id}/grocery-list/items`, {
    token: hh.owner.token,
    body: { ingredientName: 'Coffee Filters' },
  });
  expect(await due(hh.id, hh.owner)).toEqual([]);
  expect((await reminders(hh.id, hh.owner))[0].due).toBe(false);

  // In the cart is not the same as bought: until Done shopping, it still counts as due.
  await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${row.id}`, { token: hh.owner.token, body: { checked: true } });
  expect(await due(hh.id, hh.owner)).toHaveLength(1);
});

test('Done shopping starts the clock over, but not for what was bought for someone else', async () => {
  const hh = await newHousehold();
  const soap = await inCupboard(hh.id, hh.owner, 'dish soap');
  const food = await inCupboard(hh.id, hh.owner, 'dog food');
  await remind(hh.id, hh.owner, soap, 14);
  await remind(hh.id, hh.owner, food, 14);
  if (!boughtDaysAgo(hh.id, soap, 15)) return skipWithoutDocker();
  boughtDaysAgo(hh.id, food, 15);
  expect(await due(hh.id, hh.owner)).toHaveLength(2);

  const ids: string[] = [];
  for (const name of ['dish soap', 'dog food']) {
    const row = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: hh.owner.token, body: { ingredientName: name } });
    await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${row.id}`, { token: hh.owner.token, body: { checked: true } });
    ids.push(row.id);
  }
  const shopped = Date.now();
  await call('POST', `/api/households/${hh.id}/grocery-list/put-away`, {
    token: hh.owner.token,
    body: { putAway: [ids[0]], leaveOut: [ids[1]] },
  });

  expect((await due(hh.id, hh.owner)).map((r) => r.name)).toEqual(['dog food']);
  const soapNow = (await reminders(hh.id, hh.owner)).find((r) => r.name === 'dish soap');
  expect(new Date(soapNow.lastBoughtAt).getTime()).toBeGreaterThanOrEqual(shopped - 5_000);
});

test('adding it to the cupboard by hand counts as buying it', async () => {
  const hh = await newHousehold();
  const tea = await inCupboard(hh.id, hh.owner, 'tea');
  await remind(hh.id, hh.owner, tea, 7);
  if (!boughtDaysAgo(hh.id, tea, 8)) return skipWithoutDocker();
  expect(await due(hh.id, hh.owner)).toHaveLength(1);

  await inCupboard(hh.id, hh.owner, 'Tea');
  expect(await due(hh.id, hh.owner)).toEqual([]);
});

test('Add to list adds the ticked ones to their aisles and lets the rest be for three days', async () => {
  const hh = await newHousehold();
  const milk = await inCupboard(hh.id, hh.owner, 'milk');
  const oats = await inCupboard(hh.id, hh.owner, 'oats');
  await remind(hh.id, hh.owner, milk, 7);
  await remind(hh.id, hh.owner, oats, 7);
  if (!boughtDaysAgo(hh.id, milk, 8)) return skipWithoutDocker();
  boughtDaysAgo(hh.id, oats, 8);

  const added = await call('POST', `${base(hh.id)}/add-due`, { token: hh.owner.token, body: { add: [milk], snooze: [oats] } });
  expect(added.map((i: Json) => i.name)).toEqual(['milk']);

  // The same as adding it by hand: an ordinary row, in an aisle.
  const list = await groceries(hh.id);
  expect(list).toHaveLength(1);
  expect(find(list, 'milk')).toMatchObject({ checked: false, quantity: null, sorted: true });
  expect(find(list, 'milk').categoryId).not.toBeNull();

  expect(await due(hh.id, hh.owner)).toEqual([]);
  const snoozed = (await reminders(hh.id, hh.owner)).find((r) => r.name === 'oats');
  const days = (new Date(snoozed.snoozedUntil).getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(2.9);
  expect(days).toBeLessThanOrEqual(3);

  // Three days on, oats are asked about again.
  sql(`UPDATE restock_reminders SET snoozed_until = now() - interval '1 minute' WHERE ingredient_id = ${quote(oats)} AND household_id = ${quote(hh.id)}`);
  expect((await due(hh.id, hh.owner)).map((r) => r.name)).toEqual(['oats']);
});

test('Not now lets them all be', async () => {
  const hh = await newHousehold();
  const rice = await inCupboard(hh.id, hh.owner, 'rice');
  await remind(hh.id, hh.owner, rice, 7);
  if (!boughtDaysAgo(hh.id, rice, 8)) return skipWithoutDocker();

  await call('POST', `${base(hh.id)}/snooze`, { token: hh.owner.token, body: { ingredientIds: [rice] } });

  expect(await due(hh.id, hh.owner)).toEqual([]);
  expect(await groceries(hh.id)).toEqual([]);
});

test('a renamed cupboard item takes its reminder along, and an older phone saving it wipes nothing', async () => {
  const hh = await newHousehold();
  const item = await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name: 'eggs' } });
  await remind(hh.id, hh.owner, item.ingredientId, 14);

  // What the iOS app has always sent from its cupboard sheet.
  const renamed = await call('PATCH', `/api/households/${hh.id}/cupboard/${item.id}`, {
    token: hh.owner.token,
    body: { name: 'large eggs', staple: false, trackQuantity: false },
  });
  const [reminder] = await reminders(hh.id, hh.owner);
  expect(reminder).toMatchObject({ ingredientId: renamed.ingredientId, name: 'large eggs', everyDays: 14 });
});

test('only the household can see or change its reminders', async () => {
  const hh = await newHousehold();
  const coffee = await inCupboard(hh.id, hh.owner, 'coffee');
  await remind(hh.id, hh.owner, coffee, 7);
  const outsider = await newMember((await newHousehold()).id);
  const as = { token: outsider.token };

  expect(await statusOf('GET', base(hh.id), as)).toBe(403);
  expect(await statusOf('GET', `${base(hh.id)}/due`, as)).toBe(403);
  expect(await statusOf('PUT', `${base(hh.id)}/${coffee}`, { ...as, body: { everyDays: 1 } })).toBe(403);
  expect(await statusOf('DELETE', `${base(hh.id)}/${coffee}`, as)).toBe(403);
  expect(await statusOf('POST', `${base(hh.id)}/add-due`, { ...as, body: { add: [coffee] } })).toBe(403);
  expect(await statusOf('POST', `${base(hh.id)}/snooze`, { ...as, body: { ingredientIds: [coffee] } })).toBe(403);
  expect(await statusOf('GET', base(hh.id))).toBe(401);

  expect(await reminders(hh.id, hh.owner)).toMatchObject([{ everyDays: 7, snoozedUntil: null }]);
  expect(await groceries(hh.id)).toEqual([]);

  // A member of the house can, whoever set it.
  const member = await newMember(hh.id);
  expect(await statusOf('GET', `${base(hh.id)}/due`, { token: member.token })).toBe(200);
});

test('a household with reminders can still be deleted', async () => {
  const hh = await newHousehold();
  await remind(hh.id, hh.owner, await inCupboard(hh.id, hh.owner, 'coffee'), 7);
  await call('DELETE', `/api/households/${hh.id}`, { token: hh.owner.token });
  expect(await statusOf('GET', base(hh.id), { token: hh.owner.token })).toBe(403);
});
