import { expect, test } from '@playwright/test';
import {
  addRangeToGroceries, admin, call, find, groceries, isoDate, newHousehold, newRecipe, plan, statusOf,
} from '../../lib/api';

/**
 * The core loop: planned meals → grocery list → shopping → cupboard. These are the numbers the
 * household has to be able to trust.
 */

test('planned meals add up, scaled to the servings planned', async () => {
  const hh = await newHousehold();
  const tacos = await newRecipe(hh.id, 'Tacos', [
    { name: 'steak', qty: 2, unit: 'lb' },
    { name: 'garlic', qty: 2, unit: 'clove' },
  ]); // serves 4
  const frites = await newRecipe(hh.id, 'Frites', [
    { name: 'steak', qty: 1, unit: 'lb' },
    { name: 'garlic', qty: 3, unit: 'clove' },
  ], { servings: 2 });

  await plan(hh.id, isoDate(2), 'DINNER', { recipeId: tacos.id, servings: 4 });
  await plan(hh.id, isoDate(3), 'DINNER', { recipeId: frites.id, servings: 4 }); // doubled

  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  const list = await groceries(hh.id);
  expect(Number(find(list, 'steak').quantity)).toBe(4);
  expect(Number(find(list, 'garlic').quantity)).toBe(8);
});

test('a planned meal with no servings uses the household default', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('PATCH', `/api/households/${hh.id}/settings`, { token: owner.token, body: { defaultServings: 2, planningHorizonDays: 7 } });
  const r = await newRecipe(hh.id, 'Soup', [{ name: 'leek', qty: 4 }]);
  const entry = await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id });
  expect(entry.servings).toBe(2);
});

test('adding the same week twice does not double the list', async () => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Chili', [{ name: 'beans', qty: 2, unit: 'can' }]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id, servings: 4 });
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  expect(Number(find(await groceries(hh.id), 'beans').quantity)).toBe(2);
});

test('adding the week again after shopping brings only a meal planned since', async () => {
  // The weekly routine: add the week, shop, Done shopping, plan one more dinner, add again.
  const hh = await newHousehold();
  const owner = await admin();
  const chili = await newRecipe(hh.id, 'Chili', [{ name: 'beans', qty: 2, unit: 'can' }]);
  const pasta = await newRecipe(hh.id, 'Pasta', [{ name: 'penne', qty: 1, unit: 'box' }]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: chili.id, servings: 4 });
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  const bought = (await groceries(hh.id)).map((i) => i.id);
  await call('POST', `/api/households/${hh.id}/grocery-list/put-away`, {
    token: owner.token, body: { putAway: bought, leaveOut: [] },
  });

  await plan(hh.id, isoDate(3), 'DINNER', { recipeId: pasta.id, servings: 4 });
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));

  const list = await groceries(hh.id);
  expect(list).toHaveLength(1);
  expect(Number(find(list, 'penne').quantity)).toBe(1);
});

test('adding the week again after changing servings adds or takes off only the difference', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(hh.id, 'Chili', [{ name: 'beans', qty: 2, unit: 'can' }]); // serves 4
  const entry = await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id, servings: 4 });
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  const servings = (n: number) => call('PATCH', `/api/households/${hh.id}/meal-plan/entries/${entry.id}`, {
    token: owner.token, body: { servings: n },
  });

  await servings(8);
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  expect(Number(find(await groceries(hh.id), 'beans').quantity)).toBe(4);

  await servings(2);
  await addRangeToGroceries(hh.id, isoDate(0), isoDate(6));
  expect(Number(find(await groceries(hh.id), 'beans').quantity)).toBe(1);
});

test('optional ingredients only go on when chosen for that meal', async () => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Steak', [
    { name: 'ribeye', qty: 1, unit: 'lb' },
    { name: 'parsley', qty: 1, unit: 'bunch', optional: true },
  ]);
  const parsleyId = r.ingredients.find((i: any) => i.ingredientName === 'parsley').id;

  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id, servings: 4 });
  await addRangeToGroceries(hh.id, isoDate(1), isoDate(1));
  expect(find(await groceries(hh.id), 'parsley')).toBeUndefined();

  await plan(hh.id, isoDate(2), 'DINNER', { recipeId: r.id, servings: 4, includedOptionalIngredientIds: [parsleyId] });
  await addRangeToGroceries(hh.id, isoDate(2), isoDate(2));
  expect(find(await groceries(hh.id), 'parsley')).toBeTruthy();
});

test('"always have" staples never go on from a meal', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'salt', staple: true } });
  const r = await newRecipe(hh.id, 'Eggs', [{ name: 'salt', qty: 1, unit: 'pinch' }, { name: 'egg', qty: 2 }]);
  await plan(hh.id, isoDate(1), 'BREAKFAST', { recipeId: r.id });
  await addRangeToGroceries(hh.id, isoDate(1), isoDate(1));
  const list = await groceries(hh.id);
  expect(find(list, 'salt')).toBeUndefined();
  expect(find(list, 'egg')).toBeTruthy();
});

test('things in the cupboard still go on, flagged', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'rice' } });
  const r = await newRecipe(hh.id, 'Rice bowl', [{ name: 'rice', qty: 1, unit: 'cup' }]);
  await plan(hh.id, isoDate(1), 'LUNCH', { recipeId: r.id });
  await addRangeToGroceries(hh.id, isoDate(1), isoDate(1));
  expect(find(await groceries(hh.id), 'rice').inCupboard).toBe(true);
});

test('a counted cupboard item at zero is not "in the cupboard"', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const item = await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'steak' } });
  await call('PATCH', `/api/households/${hh.id}/cupboard/${item.id}`, {
    token: owner.token, body: { trackQuantity: true, quantity: 0, unit: 'lb' },
  });
  const r = await newRecipe(hh.id, 'Steak night', [{ name: 'steak', qty: 1, unit: 'lb' }]);
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: r.id });
  await addRangeToGroceries(hh.id, isoDate(1), isoDate(1));
  expect(find(await groceries(hh.id), 'steak').inCupboard).toBe(false);
});

test('done shopping stocks the cupboard and clears the list', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const a = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'apples' } });
  const b = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: 'gift wrap' } });
  for (const i of [a, b]) {
    await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${i.id}`, { token: owner.token, body: { checked: true } });
  }
  await call('POST', `/api/households/${hh.id}/grocery-list/put-away`, {
    token: owner.token, body: { putAway: [a.id], leaveOut: [b.id] },
  });
  expect(await groceries(hh.id)).toEqual([]);
  const cupboard = await call('GET', `/api/households/${hh.id}/cupboard`, { token: owner.token });
  expect(cupboard.map((c: any) => c.name)).toEqual(['apples']);
});

test('buying something tracked by amount adds to the amount', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const cup = await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'chicken' } });
  await call('PATCH', `/api/households/${hh.id}/cupboard/${cup.id}`, {
    token: owner.token, body: { trackQuantity: true, quantity: 1, unit: 'lb' },
  });
  const item = await call('POST', `/api/households/${hh.id}/grocery-list/items`, {
    token: owner.token, body: { ingredientName: 'chicken', quantity: 2, unit: 'lb' },
  });
  await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${item.id}`, { token: owner.token, body: { checked: true } });
  await call('POST', `/api/households/${hh.id}/grocery-list/put-away`, { token: owner.token, body: { putAway: [item.id], leaveOut: [] } });
  const after = (await call('GET', `/api/households/${hh.id}/cupboard`, { token: owner.token }))[0];
  expect(Number(after.quantity)).toBe(3);
});

test('cupboard amounts step up and down but never below zero', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const cup = await call('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name: 'cans' } });
  await call('PATCH', `/api/households/${hh.id}/cupboard/${cup.id}`, { token: owner.token, body: { trackQuantity: true, quantity: 2 } });
  let r = await call('POST', `/api/households/${hh.id}/cupboard/${cup.id}/adjust`, { token: owner.token, body: { delta: 1 } });
  expect(Number(r.quantity)).toBe(3);
  r = await call('POST', `/api/households/${hh.id}/cupboard/${cup.id}/adjust`, { token: owner.token, body: { delta: -10 } });
  expect(Number(r.quantity)).toBe(0);
  r = await call('PATCH', `/api/households/${hh.id}/cupboard/${cup.id}`, { token: owner.token, body: { trackQuantity: false } });
  expect(r.quantity).toBeNull();
});

test('manual items with the same name merge', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  for (const n of ['milk', 'Milk']) {
    await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: n } });
  }
  expect((await groceries(hh.id)).filter((i) => i.name.toLowerCase() === 'milk')).toHaveLength(1);
});

test('a client from before "optional" existed can still save a recipe', async () => {
  // After a deploy, phones with the app already open keep running the old build for a while.
  const hh = await newHousehold();
  const owner = await admin();
  const status = await statusOf('POST', `/api/households/${hh.id}/recipes`, {
    token: owner.token,
    body: { name: 'Old client', servings: 2, ingredients: [{ ingredientName: 'flour', quantity: 1, unit: 'cup' }] },
  });
  expect(status).toBe(200);
});

test.describe('input validation', () => {
  test('negative quantities are refused', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const status = await statusOf('POST', `/api/households/${hh.id}/grocery-list/items`, {
      token: owner.token, body: { ingredientName: 'x', quantity: -3, unit: 'cup' },
    });
    expect(status).toBe(400);
  });

  test('a very long name is a 400, not a 500', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const status = await statusOf('POST', `/api/households/${hh.id}/grocery-list/items`, {
      token: owner.token, body: { ingredientName: 'a'.repeat(5000) },
    });
    expect(status).toBe(400);
  });

  test('zero servings is refused', async () => {
    const hh = await newHousehold();
    const r = await newRecipe(hh.id, 'Toast', [{ name: 'bread', qty: 2, unit: 'slice' }]);
    const owner = await admin();
    const status = await statusOf('POST', `/api/households/${hh.id}/meal-plan/entries`, {
      token: owner.token, body: { date: isoDate(1), mealType: 'BREAKFAST', recipeId: r.id, servings: 0 },
    });
    expect(status).toBe(400);
  });

  test('a meal needs exactly one of recipe, place or item', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const status = await statusOf('POST', `/api/households/${hh.id}/meal-plan/entries`, {
      token: owner.token, body: { date: isoDate(1), mealType: 'LUNCH' },
    });
    expect(status).toBe(400);
  });

  test('place links must be web links', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const place = await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'Diner' } });
    expect(await statusOf('PUT', `/api/places/${place.id}`, {
      token: owner.token, body: { name: 'Diner', menuUrl: 'javascript:alert(1)' },
    })).toBe(400);
  });
});
