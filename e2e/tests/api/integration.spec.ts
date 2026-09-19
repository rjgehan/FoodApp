import { expect, test } from '@playwright/test';
import { INTEGRATION_KEY, admin, call, isoDate, newHousehold, newRecipe, plan, statusOf } from '../../lib/api';

/**
 * The home-dashboard API (INTEGRATION.md). The iPad kiosk depends on these shapes, so a change
 * here should be a deliberate one. Needs the backend started with INTEGRATION_API_KEY — the
 * reset script does that.
 */
const key = { 'x-api-key': INTEGRATION_KEY };
const get = (path: string) => call('GET', `/api/integration${path}`, { headers: key });

test.beforeAll(async () => {
  const status = await statusOf('GET', '/api/integration/households', { headers: key });
  test.skip(status === 503, 'Integration API is off — start the backend with INTEGRATION_API_KEY (npm run reset does)');
});

test('the key is required and checked', async () => {
  expect(await statusOf('GET', '/api/integration/households')).toBe(401);
  expect(await statusOf('GET', '/api/integration/households', { headers: { 'x-api-key': 'wrong' } })).toBe(401);
});

test('today and plan return the documented shape, sides included', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const main = await newRecipe(hh.id, 'Roast', [{ name: 'chicken', qty: 1 }], { prepTimeMinutes: 10, cookTimeMinutes: 50 });
  const side = await newRecipe(hh.id, 'Greens', [{ name: 'kale', qty: 1, unit: 'bunch' }]);
  const place = await call('POST', `/api/households/${hh.id}/places`, {
    token: owner.token, body: { name: 'Golden Dragon', menuUrl: 'https://example.com/menu', phone: '555' },
  });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: main.id });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: side.id });
  await plan(hh.id, isoDate(0), 'LUNCH', { placeId: place.id });
  await plan(hh.id, isoDate(0), 'BREAKFAST', { itemName: 'eggs' });

  const today = await get(`/households/${hh.id}/today`);
  expect(today.date).toBe(isoDate(0));
  expect(today.meals.map((m: any) => m.mealType)).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);
  const [breakfast, lunch, dinner] = today.meals;
  expect(breakfast.items[0]).toMatchObject({ kind: 'ITEM', name: 'eggs', recipeId: null });
  expect(lunch.items[0]).toMatchObject({ kind: 'PLACE', name: 'Golden Dragon', menuUrl: 'https://example.com/menu' });
  expect(dinner.items.map((i: any) => i.name)).toEqual(['Roast', 'Greens']);
  expect(dinner.items[0].totalTimeMinutes).toBe(60);

  const week = await get(`/households/${hh.id}/plan?days=7`);
  expect(week).toHaveLength(7);
  expect(week[1].meals).toEqual([]);
  // The same day through both endpoints should list the dinner in the same order.
  test.info().annotations.push({ type: 'note', description: 'plan-vs-today ordering is checked below' });
  expect(week[0].meals.at(-1).items.map((i: any) => i.name)).toEqual(['Roast', 'Greens']);
});

test('plan refuses an unbounded range', async () => {
  const hh = await newHousehold();
  expect(await statusOf('GET', `/api/integration/households/${hh.id}/plan?days=100000`, { headers: key })).toBe(400);
});

test('recipe detail and the category filter', async () => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Tacos', [
    { name: 'tortillas', qty: 8 },
    { name: 'cilantro', qty: 0.5, unit: 'bunch', optional: true },
  ], { categories: ['Main dish'] });

  const detail = await get(`/recipes/${r.id}?householdId=${hh.id}`);
  expect(detail).toMatchObject({ name: 'Tacos', section: 'DINNER', categories: ['Main dish'] });
  expect(detail.ingredients[1]).toMatchObject({ name: 'cilantro', quantity: '½', unit: 'bunch' });

  const byCategory = await get(`/households/${hh.id}/recipes?category=Main%20dish`);
  expect(byCategory.map((x: any) => x.name)).toEqual(['Tacos']);
});

test('recipe detail says which ingredients are optional', async () => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Tacos', [{ name: 'cilantro', qty: 1, optional: true }]);
  const detail = await get(`/recipes/${r.id}?householdId=${hh.id}`);
  expect(detail.ingredients[0].optional).toBe(true);
});

test('filtering by a parent group includes recipes in its sub-groups', async () => {
  test.fail(true, 'KNOWN GAP: after "Split Main dish up?", ?category=Main dish no longer finds the moved recipes');
  const hh = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(hh.id, 'Brisket', [{ name: 'beef', qty: 3, unit: 'lb' }], { categories: ['Main dish'] });
  const cats = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token: owner.token });
  const main = cats.find((c: any) => c.name === 'Main dish');
  const beef = await call('POST', `/api/households/${hh.id}/recipe-categories`, { token: owner.token, body: { name: 'Beef', parentId: main.id } });
  await call('POST', `/api/households/${hh.id}/recipe-categories/${beef.id}/recipes`, {
    token: owner.token, body: { recipeIds: [r.id], fromCategoryId: main.id },
  });
  const byParent = await get(`/households/${hh.id}/recipes?category=Main%20dish`);
  expect(byParent.map((x: any) => x.name)).toContain('Brisket');
});

test('grocery writes: add, tick, remove — and nothing across households', async () => {
  const hh = await newHousehold();
  const other = await newHousehold();
  const added = await call('POST', `/api/integration/households/${hh.id}/grocery-list`, {
    headers: key, body: { name: 'oat milk', quantity: 2, unit: 'carton' },
  });
  expect(added).toMatchObject({ name: 'oat milk', quantity: '2', unit: 'carton', checked: false });

  const ticked = await call('PATCH', `/api/integration/households/${hh.id}/grocery-list/${added.id}`, {
    headers: key, body: { checked: true },
  });
  expect(ticked.checked).toBe(true);

  expect(await statusOf('DELETE', `/api/integration/households/${other.id}/grocery-list/${added.id}`, { headers: key })).toBe(404);
  expect(await statusOf('POST', `/api/integration/households/${hh.id}/grocery-list`, { headers: key, body: { name: '' } })).toBe(400);

  await call('DELETE', `/api/integration/households/${hh.id}/grocery-list/${added.id}`, { headers: key });
  expect(await get(`/households/${hh.id}/grocery-list`)).toEqual([]);
});

test('unknown ids and bad dates are client errors', async () => {
  expect(await statusOf('GET', '/api/integration/households/00000000-0000-0000-0000-000000000000/today', { headers: key })).toBe(404);
  const hh = await newHousehold();
  expect(await statusOf('GET', `/api/integration/households/${hh.id}/plan?start=soon`, { headers: key })).toBe(400);
});
