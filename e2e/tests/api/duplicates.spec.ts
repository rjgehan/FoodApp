import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newRecipe, statusOf } from '../../lib/api';

/*
 * A recipe the household already has is not made twice by accident: a share sheet tapped eight
 * times once made eight of the same recipe. Same link or same name → 409 saying which one,
 * unless a second copy is asked for.
 */

const body = (name: string, url?: string) => ({
  name,
  servings: 2,
  section: 'DINNER',
  categories: [],
  instructions: 'Cook it.',
  ingredients: [{ ingredientName: 'rice', quantity: 1, unit: 'cup', optional: false }],
  ...(url ? { links: [{ url, label: null }] } : {}),
});

test('the same link twice is refused and says which recipe it already is', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const first = await call('POST', `/api/households/${hh.id}/recipes`, {
    token: owner.token, body: body('Tiktok pasta', 'https://www.tiktok.com/@cook/video/123'),
  });
  // Different name, same page give or take www. and https — still the same recipe.
  const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/households/${hh.id}/recipes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body('Creamy pasta', 'http://tiktok.com/@cook/video/123/')),
  });
  expect(res.status).toBe(409);
  const refusal = await res.json();
  expect(refusal).toMatchObject({ existingRecipeId: first.id, existingName: 'Tiktok pasta' });
  expect(refusal.message).toContain('already have');
});

test('the same name twice is refused, whatever the case', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  await newRecipe(hh.id, 'Chicken Curry', [{ name: 'chicken', qty: 1 }]);
  expect(await statusOf('POST', `/api/households/${hh.id}/recipes`, { token: owner.token, body: body('  chicken curry ') }))
    .toBe(409);
});

test('a second copy is allowed when asked for', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  await newRecipe(hh.id, 'Pancakes', [{ name: 'flour', qty: 1 }]);
  const second = await call('POST', `/api/households/${hh.id}/recipes?allowDuplicate=true`, {
    token: owner.token, body: body('Pancakes'),
  });
  const all = await call('GET', `/api/households/${hh.id}/recipes`, { token: owner.token });
  expect(all.filter((r: any) => r.name === 'Pancakes')).toHaveLength(2);
  expect(second.id).toBeTruthy();
});

test('another household can have the same recipe', async () => {
  const a = await newHousehold();
  const b = await newHousehold();
  await newRecipe(a.id, 'Tacos', [{ name: 'tortillas', qty: 8 }]);
  await newRecipe(b.id, 'Tacos', [{ name: 'tortillas', qty: 8 }]);
});

test('saving a shared link twice gives back the copy already saved', async () => {
  const a = await newHousehold();
  const b = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(a.id, 'Grandma’s stew', [{ name: 'beef', qty: 1 }]);
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token });
  const first = await call('POST', `/api/public/recipes/${token}/save`, { token: owner.token, body: { householdId: b.id } });
  const again = await call('POST', `/api/public/recipes/${token}/save`, { token: owner.token, body: { householdId: b.id } });
  expect(again.id).toBe(first.id);
  const all = await call('GET', `/api/households/${b.id}/recipes`, { token: owner.token });
  expect(all.filter((x: any) => x.name === 'Grandma’s stew')).toHaveLength(1);
});
