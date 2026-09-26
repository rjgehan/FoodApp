import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newMember, statusOf } from '../../lib/api';

/**
 * Filling a cupboard in one go: ticking through the starter list, and copying another of your
 * own houses' cupboards. Neither ever changes what is in the cupboard already.
 */

const cupboard = async (householdId: string, token?: string) =>
  call('GET', `/api/households/${householdId}/cupboard`, { token: token ?? (await admin()).token });

const named = (items: any[], name: string) => items.find((i) => i.name.toLowerCase() === name);

test('the starter list is grouped, says what is here, and adds the rest in one request', async () => {
  const hh = await newHousehold();
  const { token } = hh.owner;
  const rice = await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name: 'rice' } });
  await call('PATCH', `/api/households/${hh.id}/cupboard/${rice.id}`, { token, body: { runningLow: true } });

  const groups = await call('GET', `/api/households/${hh.id}/cupboard/starters`, { token });
  expect(groups.map((g: any) => g.name)).toEqual(expect.arrayContaining(['Baking', 'Spices', 'Fridge']));
  const all = groups.flatMap((g: any) => g.items);
  expect(all.length).toBeGreaterThanOrEqual(50);
  expect(all.find((i: any) => i.name === 'rice')).toEqual({ name: 'rice', have: true });
  expect(all.find((i: any) => i.name === 'salt')).toEqual({ name: 'salt', have: false });

  const result = await call('POST', `/api/households/${hh.id}/cupboard/starters`, {
    token,
    body: { names: ['salt', 'Salt', 'rice', 'baking soda', 'eggs', 'olive oil'] },
  });
  expect(result).toEqual({ added: 4, skipped: 2 });

  const items = await cupboard(hh.id, token);
  expect(items).toHaveLength(5);
  // Ticked again, the rice is still low: ticking says you have it, not that it is fine now.
  expect(named(items, 'rice').runningLow).toBe(true);
  // Each is in an aisle, the way typing it into the cupboard would have put it.
  const aisles = await call('GET', `/api/households/${hh.id}/categories`, { token });
  const aisle = (name: string) => aisles.find((a: any) => a.id === named(items, name).categoryId)?.name;
  expect(aisle('salt')).toBe('Spices');
  expect(aisle('baking soda')).toBe('Baking');
  expect(aisle('eggs')).toBe('Dairy & eggs');
  expect(aisle('olive oil')).toBe('Dry goods');

  const after = (await call('GET', `/api/households/${hh.id}/cupboard/starters`, { token })).flatMap((g: any) => g.items);
  expect(after.find((i: any) => i.name === 'salt').have).toBe(true);
});

test('the starter list is only for people in the house', async () => {
  const hh = await newHousehold();
  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  expect(await statusOf('GET', `/api/households/${hh.id}/cupboard/starters`, { token: outsider.token })).toBe(403);
  expect(await statusOf('POST', `/api/households/${hh.id}/cupboard/starters`, {
    token: outsider.token, body: { names: ['salt'] },
  })).toBe(403);
  expect(await statusOf('POST', `/api/households/${hh.id}/cupboard/starters`, {
    token: hh.owner.token, body: {},
  })).toBe(400);
});

test('copying a cupboard brings what is missing, with its amounts and flags, and leaves the rest', async () => {
  const home = await newHousehold();
  const cabin = await newHousehold();
  const { token } = home.owner;
  const add = (hh: string, name: string, staple = false) =>
    call('POST', `/api/households/${hh}/cupboard`, { token, body: { name, staple } });

  const flour = await add(home.id, 'flour');
  await call('PATCH', `/api/households/${home.id}/cupboard/${flour.id}`, {
    token, body: { trackQuantity: true, quantity: 2, unit: 'kg' },
  });
  const butter = await add(home.id, 'butter');
  await call('PATCH', `/api/households/${home.id}/cupboard/${butter.id}`, { token, body: { runningLow: true } });
  await add(home.id, 'salt', true);
  await add(home.id, 'coffee');
  // The cabin has its own coffee already.
  await add(cabin.id, 'coffee');

  const result = await call('POST', `/api/households/${cabin.id}/cupboard/copy-from/${home.id}`, { token });
  expect(result).toEqual({ copied: 3, skipped: 1 });

  const items = await cupboard(cabin.id, token);
  expect(items.map((i: any) => i.name.toLowerCase()).sort()).toEqual(['butter', 'coffee', 'flour', 'salt']);
  expect(named(items, 'flour')).toMatchObject({ quantity: 2, unit: 'kg' });
  expect(named(items, 'butter').runningLow).toBe(true);
  expect(named(items, 'salt').staple).toBe(true);
  // Home is as it was.
  expect(await cupboard(home.id, token)).toHaveLength(4);

  // Doing it again has nothing left to bring.
  expect(await call('POST', `/api/households/${cabin.id}/cupboard/copy-from/${home.id}`, { token }))
    .toEqual({ copied: 0, skipped: 4 });
});

test('a cupboard is only copied between houses you are in both of', async () => {
  const home = await newHousehold();
  const cabin = await newHousehold();
  await call('POST', `/api/households/${home.id}/cupboard`, { token: home.owner.token, body: { name: 'tea' } });
  const onlyInCabin = await newMember(cabin.id);
  const onlyInHome = await newMember(home.id);

  const copy = (into: string, from: string, token: string) =>
    statusOf('POST', `/api/households/${into}/cupboard/copy-from/${from}`, { token });
  expect(await copy(cabin.id, home.id, onlyInCabin.token)).toBe(403);
  expect(await copy(cabin.id, home.id, onlyInHome.token)).toBe(403);
  expect(await copy(home.id, home.id, home.owner.token)).toBe(400);
  expect(await cupboard(cabin.id)).toHaveLength(0);
});
