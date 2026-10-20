import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newMember, newRecipe, plan, isoDate, statusOf, unique } from '../../lib/api';

/**
 * An outsider — signed in, but in a different household — must not be able to read or change
 * anything of ours, whether they address it through their own household's URLs or ours.
 */
test('an outsider cannot reach another household’s data', async () => {
  const ours = await newHousehold();
  const theirs = await newHousehold();
  const outsider = await newMember(theirs.id);
  const owner = await admin();

  const recipe = await newRecipe(ours.id, 'Private Stew', [{ name: 'beef', qty: 1, unit: 'lb' }]);
  const entry = await plan(ours.id, isoDate(3), 'DINNER', { recipeId: recipe.id });
  const [item] = await call('POST', `/api/households/${ours.id}/grocery-list/add-meal/${entry.id}`, { token: owner.token });
  const cup = await call('POST', `/api/households/${ours.id}/cupboard`, { token: owner.token, body: { name: 'rice' } });
  const tags = await call('GET', `/api/households/${ours.id}/recipe-categories`, { token: owner.token });
  const tag = tags.find((t: any) => t.section === 'DINNER' && t.name === 'Main');
  const receipt = await call('POST', `/api/households/${ours.id}/receipts`, {
    token: owner.token,
    body: { storeName: 'Kings Food Markets', lines: [{ text: 'BEEF', kind: 'ITEM', price: 9.99, onSale: false, ingredientId: item.ingredientId }] },
  });
  const hidden = await call('POST', `/api/households/${ours.id}/stores/hidden`, {
    token: owner.token, body: { name: 'Soup Kitchen', latitude: 40.7431, longitude: -74.0312 } });

  const O = ours.id;
  const T = theirs.id;
  const attempts: [string, string, unknown?][] = [
    ['GET', `/api/households/${O}/recipes`],
    ['GET', `/api/recipes/${recipe.id}`],
    ['PUT', `/api/recipes/${recipe.id}`, { name: 'x', servings: 1, ingredients: [] }],
    ['DELETE', `/api/recipes/${recipe.id}`],
    ['POST', `/api/recipes/${recipe.id}/link`],
    ['PUT', `/api/recipes/${recipe.id}/shares`, { householdIds: [T] }],
    ['PUT', `/api/households/${T}/recipes/${recipe.id}/filing`, { section: 'DINNER', categories: [] }],
    ['GET', `/api/households/${O}/meal-plan?start=${isoDate(0)}&end=${isoDate(7)}`],
    ['PATCH', `/api/households/${T}/meal-plan/entries/${entry.id}`, { notes: 'x' }],
    ['DELETE', `/api/households/${T}/meal-plan/${entry.id}`],
    ['POST', `/api/households/${T}/grocery-list/add-meal/${entry.id}`],
    // A recipe straight onto a list: ours, or ours onto theirs (it is not shared with them).
    ['POST', `/api/households/${O}/grocery-list/add-recipe/${recipe.id}`, { servings: 4 }],
    ['POST', `/api/households/${T}/grocery-list/add-recipe/${recipe.id}`, { servings: 4 }],
    ['GET', `/api/households/${O}/grocery-list`],
    ['PATCH', `/api/households/${T}/grocery-list/items/${item.id}`, { checked: true }],
    ['PATCH', `/api/households/${O}/grocery-list/items/${item.id}`, { checked: true }],
    ['DELETE', `/api/households/${T}/grocery-list/items/${item.id}`],
    ['GET', `/api/households/${O}/cupboard`],
    ['PATCH', `/api/households/${T}/cupboard/${cup.id}`, { name: 'x' }],
    ['POST', `/api/households/${T}/cupboard/${cup.id}/adjust`, { delta: 1 }],
    ['DELETE', `/api/households/${T}/cupboard/${cup.id}`],
    ['GET', `/api/households/${O}/members`],
    ['DELETE', `/api/households/${O}/members/${owner.userId}`],
    ['GET', `/api/households/${O}/invite`],
    ['DELETE', `/api/households/${O}/invite`],
    ['PATCH', `/api/households/${O}/name`, { name: 'x' }],
    ['GET', `/api/households/${O}/places`],
    // The kitchen: its machines and the two parts of the app it can turn off.
    ['PATCH', `/api/households/${O}/kitchen`, { planEnabled: false, cupboardEnabled: false, machines: ['oven'] }],
    // Tags: ours by our URL, and ours by theirs.
    ['GET', `/api/households/${O}/recipe-categories`],
    ['POST', `/api/households/${O}/recipe-categories`, { name: 'Sneaky', section: 'DINNER', recipeIds: [recipe.id] }],
    ['PATCH', `/api/households/${O}/recipe-categories/${tag.id}`, { name: 'x' }],
    ['PATCH', `/api/households/${T}/recipe-categories/${tag.id}`, { name: 'x' }],
    ['PUT', `/api/households/${O}/recipe-categories/${tag.id}/recipes`, { add: [recipe.id] }],
    ['PUT', `/api/households/${T}/recipe-categories/${tag.id}/recipes`, { add: [recipe.id] }],
    ['POST', `/api/households/${O}/recipe-categories/${tag.id}/recipes`, { recipeIds: [recipe.id] }],
    ['DELETE', `/api/households/${T}/recipe-categories/${tag.id}`],
    ['DELETE', `/api/households/${O}/recipe-categories/${tag.id}`],
    // Receipts and prices: ours by our URL, and ours by theirs.
    ['POST', `/api/households/${O}/receipts/read`, { lines: ['BEEF 9.99'] }],
    ['POST', `/api/households/${O}/receipts`, { storeName: 'Sneaky', lines: [{ text: 'x', kind: 'ITEM', price: 1, onSale: false }] }],
    ['GET', `/api/households/${O}/receipts`],
    ['GET', `/api/households/${O}/receipts/${receipt.id}`],
    ['GET', `/api/households/${T}/receipts/${receipt.id}`],
    ['PUT', `/api/households/${O}/receipts/${receipt.id}/place`, { place: { name: 'Sneaky', latitude: 1, longitude: 1 } }],
    ['PUT', `/api/households/${T}/receipts/${receipt.id}/place`, { place: { name: 'Sneaky', latitude: 1, longitude: 1 } }],
    ['DELETE', `/api/households/${O}/receipts/${receipt.id}`],
    ['DELETE', `/api/households/${T}/receipts/${receipt.id}`],
    ['GET', `/api/households/${O}/stores`],
    ['GET', `/api/households/${O}/stores/prices`],
    ['GET', `/api/households/${O}/stores/hidden`],
    ['POST', `/api/households/${O}/stores/hidden`, { name: 'Sneaky', latitude: 1, longitude: 1 }],
    ['DELETE', `/api/households/${O}/stores/hidden/${hidden.id}`],
    ['GET', `/api/households/${O}/ingredients/${item.ingredientId}/prices`],
    ['PUT', `/api/households/${O}/grocery-list/items/${item.id}/price`, { price: 0.01 }],
    ['PUT', `/api/households/${T}/grocery-list/items/${item.id}/price`, { price: 0.01 }],
  ];

  const leaks: string[] = [];
  for (const [method, path, body] of attempts) {
    const status = await statusOf(method, path, { token: outsider.token, body });
    if (status < 400) leaks.push(`${method} ${path} → ${status}`);
  }
  expect(leaks, 'requests an outsider should not be allowed').toEqual([]);
  // Showing our hidden place through their own house's address shows nothing of ours.
  await call('DELETE', `/api/households/${T}/stores/hidden/${hidden.id}`, { token: outsider.token });
  expect((await call('GET', `/api/households/${O}/stores/hidden`, { token: owner.token })).map((h: any) => h.id))
    .toEqual([hidden.id]);

  // Everything is still ours and untouched.
  const still = await call('GET', `/api/recipes/${recipe.id}`, { token: owner.token });
  expect(still.name).toBe('Private Stew');
  expect(still.categories).toEqual([]);
  const list = await call('GET', `/api/households/${O}/grocery-list`, { token: owner.token });
  expect(list.map((i: any) => i.name)).toEqual(['beef']);
  expect(list[0].lastPrice).toMatchObject({ price: 9.99, storeName: 'Kings Food Markets', source: 'RECEIPT' });
  const receipts = await call('GET', `/api/households/${O}/receipts`, { token: owner.token });
  expect(receipts.map((r: any) => r.id)).toEqual([receipt.id]);
  expect((await call('GET', `/api/households/${O}/stores`, { token: owner.token })).map((s: any) => s.name)).toEqual(['Kings Food Markets']);
  expect(await call('GET', `/api/households/${T}/stores`, { token: owner.token })).toEqual([]);
  const house = (await call('GET', '/api/households', { token: owner.token })).find((h: any) => h.id === O);
  expect(house).toMatchObject({ planEnabled: true, cupboardEnabled: true, machines: [] });
  const after = await call('GET', `/api/households/${O}/recipe-categories`, { token: owner.token });
  expect(after.find((t: any) => t.id === tag.id)).toMatchObject({ name: 'Main', recipeCount: 0 });
  expect(after.some((t: any) => t.name === 'Sneaky')).toBe(false);
  // Nor did their list take our recipe.
  expect(await call('GET', `/api/households/${T}/grocery-list`, { token: owner.token })).toEqual([]);
});

test('signed-out requests are refused', async () => {
  const hh = await newHousehold();
  for (const path of [`/api/households/${hh.id}/recipes`, `/api/households/${hh.id}/grocery-list`, '/api/users/me', '/api/kitchen-machines',
    `/api/households/${hh.id}/receipts`, `/api/households/${hh.id}/stores`, `/api/households/${hh.id}/stores/prices`]) {
    expect(await statusOf('GET', path)).toBe(401);
  }
  const r = await newRecipe(hh.id, 'Toast', [{ name: 'bread', qty: 1 }]);
  expect(await statusOf('POST', `/api/households/${hh.id}/grocery-list/add-recipe/${r.id}`, { body: {} })).toBe(401);
  expect(await statusOf('PATCH', `/api/households/${hh.id}/kitchen`, { body: { planEnabled: false } })).toBe(401);
});

test('nobody can put an existing account into a household, or make one for somebody else', async () => {
  // Adding someone by username never asked them, and with owner password resets that was a way
  // to take an account over. The only ways in now are founding a house or the person opening
  // its invite link themselves — so the old doors are simply not there.
  const a = await newHousehold();
  const b = await newHousehold();
  const inB = await newMember(b.id);
  const member = await newMember(a.id);
  const refusals = [
    await statusOf('POST', `/api/households/${a.id}/members`, { token: member.token, body: { username: inB.username } }),
    await statusOf('POST', `/api/households/${a.id}/users`, { token: member.token, body: { username: unique('made').toLowerCase() } }),
    await statusOf('POST', '/api/users', { token: member.token, body: { username: unique('loose').toLowerCase() } }),
  ];
  for (const status of refusals) expect([404, 405]).toContain(status);
  const members = await call('GET', `/api/households/${a.id}/members`, { token: member.token });
  expect(members.some((m: { userId: string }) => m.userId === inB.userId)).toBe(false);
});

test.describe('live grocery updates', () => {
  /**
   * Speaks STOMP over the raw WebSocket that SockJS exposes at /ws/websocket, subscribes to a
   * household's topic, then has someone else change that household's list.
   */
  async function whatArrives(subscriberToken: string, householdId: string, change: () => Promise<unknown>) {
    const ws = new WebSocket(`${(process.env.API_URL ?? 'http://localhost:8080').replace(/^http/, 'ws')}/ws/websocket`);
    const frame = (cmd: string, headers: Record<string, string>) =>
      `${cmd}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n\0`;
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.onerror = () => reject(new Error('websocket failed'));
      ws.onopen = () => ws.send(frame('CONNECT', { 'accept-version': '1.2', host: 'localhost', Authorization: `Bearer ${subscriberToken}` }));
      ws.onmessage = (e) => {
        const data = String(e.data);
        if (data.startsWith('CONNECTED')) {
          ws.send(frame('SUBSCRIBE', { id: 's1', destination: `/topic/households/${householdId}/grocery-list` }));
          resolve();
        } else {
          received.push(data);
        }
      };
    });
    await new Promise((r) => setTimeout(r, 300));
    await change();
    await new Promise((r) => setTimeout(r, 1200));
    ws.close();
    return received;
  }

  test('members get changes as they happen', async () => {
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const owner = await admin();
    const got = await whatArrives(member.token, hh.id, () =>
      call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'bananas' } }),
    );
    expect(got.some((m) => m.startsWith('MESSAGE') && m.includes('bananas'))).toBe(true);
  });

  test('outsiders cannot subscribe to another household’s list', async () => {
    const hh = await newHousehold();
    const other = await newHousehold();
    const outsider = await newMember(other.id);
    const owner = await admin();
    const got = await whatArrives(outsider.token, hh.id, () =>
      call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'secret' } }),
    );
    expect(got.some((m) => m.includes('secret'))).toBe(false);
  });

  test('somebody taken out stops hearing the list, even with it still open', async () => {
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const owner = await admin();
    const add = (ingredientName: string) =>
      call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName } });
    // Subscribed while still in the house; removed with the socket open; then the list changes.
    const got = await whatArrives(member.token, hh.id, async () => {
      await add('before-removal');
      await new Promise((r) => setTimeout(r, 500));
      await call('DELETE', `/api/households/${hh.id}/members/${member.userId}`, { token: owner.token });
      await add('after-removal');
    });
    expect(got.some((m) => m.includes('before-removal'))).toBe(true);
    expect(got.some((m) => m.includes('after-removal'))).toBe(false);
  });
});
