import { expect, test } from '@playwright/test';
import { ApiError, admin, call, find, groceries, newHousehold, newMember, newRecipe, statusOf } from '../../lib/api';

/*
 * A recipe's ingredients straight onto the grocery list, no meal planned
 * (POST /api/households/{h}/grocery-list/add-recipe/{recipeId}) — the recipe page's Add to
 * groceries, and the only way a house that does not plan meals gets a recipe onto its list.
 * The amounts are the plan's: scaled to the servings asked for, optional extras only when
 * ticked, "some" for an ingredient with no amount.
 */

const path = (hh: string, recipe: string) => `/api/households/${hh}/grocery-list/add-recipe/${recipe}`;

/** The refusal's status and parsed body. */
async function refusal(promise: Promise<unknown>): Promise<{ status: number; body: any }> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: JSON.parse(e.body) };
    throw e;
  }
  throw new Error('should have been refused');
}

test('a recipe goes straight on, scaled to the servings asked for, and says which recipe it is for', async () => {
  // A house that does not plan meals: this is its way in.
  const hh = await newHousehold({ plan: false });
  const { token, displayName } = await admin();
  const tacos = await newRecipe(hh.id, 'Tacos', [
    { name: 'steak', qty: 2, unit: 'lb' },
    { name: 'garlic', qty: 3, unit: 'clove' },
    { name: 'tortillas', qty: 8 },
  ]); // serves 4

  const added = await call('POST', path(hh.id, tacos.id), { token, body: { servings: 6 } });
  expect(added).toHaveLength(3);
  expect(find(added, 'steak')).toMatchObject({ quantity: 3, unit: 'lb', checked: false, fromRecipes: ['Tacos'], addedByName: displayName });
  expect(find(added, 'garlic').quantity).toBe(4.5);
  expect(find(added, 'tortillas').quantity).toBe(12);
  // What it answered is what the list now has.
  const list = await groceries(hh.id);
  expect(list.map((i: any) => i.name).sort()).toEqual(['garlic', 'steak', 'tortillas']);

  // An odd number of servings rounds to two places, as a planned meal's does.
  const soup = await newRecipe(hh.id, 'Soup', [{ name: 'stock', qty: 1, unit: 'l' }], { servings: 3 });
  const [stock] = await call('POST', path(hh.id, soup.id), { token, body: { servings: 1 } });
  expect(stock.quantity).toBe(0.33);
});

test('with no servings sent the recipe’s own are used, and a call with no body at all works', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Frites', [{ name: 'potatoes', qty: 1, unit: 'kg' }], { servings: 2 });
  const added = await call('POST', path(hh.id, r.id), { token });
  expect(find(added, 'potatoes').quantity).toBe(1);
});

test('optional extras go on only when ticked, and an ingredient with no amount goes on as "some"', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Eggs on toast', [
    { name: 'eggs', qty: 2 },
    { name: 'black pepper', qty: null },
    { name: 'chives', qty: 1, unit: 'tbsp', optional: true },
    { name: 'hot sauce', qty: 1, unit: 'tsp', optional: true },
  ]);
  const chives = r.ingredients.find((i: any) => i.ingredientName === 'chives').id;

  const added = await call('POST', path(hh.id, r.id), { token, body: { servings: 8, includedOptionalIngredientIds: [chives] } });
  expect(added.map((i: any) => i.name).sort()).toEqual(['black pepper', 'chives', 'eggs']);
  expect(find(added, 'chives').quantity).toBe(2);
  // "Some" pepper, never "0" of it — however many are coming.
  expect(find(added, 'black pepper').quantity).toBeNull();

  // A recipe that needs nothing unless its extras are bought adds nothing, and says so with [].
  const garnish = await newRecipe(hh.id, 'Garnish', [{ name: 'parsley', qty: 1, unit: 'bunch', optional: true }]);
  expect(await call('POST', path(hh.id, garnish.id), { token, body: { servings: 4 } })).toEqual([]);
});

test('a second press asks first, "again" puts the amounts on top, and what is in the cart never asks', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const chili = await newRecipe(hh.id, 'Chili', [
    { name: 'beef mince', qty: 500, unit: 'g' },
    { name: 'kidney beans', qty: 1, unit: 'can' },
  ]);
  await call('POST', path(hh.id, chili.id), { token, body: { servings: 4 } });

  // Pressed again: a 409 whose body says why, in words and as a flag, and nothing changes.
  const asked = await refusal(call('POST', path(hh.id, chili.id), { token, body: { servings: 4 } }));
  expect(asked.status).toBe(409);
  expect(asked.body).toMatchObject({ alreadyOnList: true, message: '“Chili” is already on the list.' });
  expect(find(await groceries(hh.id), 'beef mince').quantity).toBe(500);

  // Yes, again: the same unit adds up.
  const again = await call('POST', path(hh.id, chili.id), { token, body: { servings: 4, again: true } });
  expect(find(again, 'beef mince').quantity).toBe(1000);
  expect(find(again, 'kidney beans').quantity).toBe(2);

  // Everything ticked off (in the cart): the next shop's chili goes on without a question.
  for (const item of await groceries(hh.id)) {
    await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${item.id}`, { token, body: { checked: true } });
  }
  const nextShop = await call('POST', path(hh.id, chili.id), { token, body: { servings: 2 } });
  expect(find(nextShop, 'beef mince')).toMatchObject({ quantity: 250, checked: false });
  const list = await groceries(hh.id);
  expect(list.filter((i: any) => i.name === 'beef mince').map((i: any) => [i.checked, i.quantity])).toEqual(
    expect.arrayContaining([[true, 1000], [false, 250]]),
  );
});

test('a recipe shared with the household can go on its list; one it cannot see cannot', async () => {
  const ours = await newHousehold();
  const theirs = await newHousehold();
  const { token } = await admin();
  // Only in their house. (Somebody in both may add their own recipe to either list, as they may
  // plan it in either — the same rule as the Plan's.)
  const cook = await newMember(theirs.id);
  const r = await newRecipe(ours.id, 'Shared stew', [{ name: 'carrots', qty: 3 }]);

  // Not shared yet: they cannot see it, so their list cannot take it.
  expect(await statusOf('POST', path(theirs.id, r.id), { token: cook.token, body: {} })).toBe(403);

  await call('PUT', `/api/recipes/${r.id}/shares`, { token, body: { householdIds: [theirs.id] } });
  const added = await call('POST', path(theirs.id, r.id), { token: cook.token, body: { servings: 4 } });
  expect(find(added, 'carrots')).toMatchObject({ householdId: theirs.id, fromRecipes: ['Shared stew'] });
  // Their list, not ours.
  expect(await groceries(ours.id)).toEqual([]);
});

test('fewer than one serving is refused in words; strangers and unknown recipes are refused', async () => {
  const hh = await newHousehold();
  const other = await newHousehold();
  const outsider = await newMember(other.id);
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Porridge', [{ name: 'oats', qty: 1, unit: 'cup' }]);

  const zero = await refusal(call('POST', path(hh.id, r.id), { token, body: { servings: 0 } }));
  expect(zero).toMatchObject({ status: 400, body: { message: 'Buy for at least one person.' } });
  // Somebody else's household, by its own URL or by theirs.
  expect(await statusOf('POST', path(hh.id, r.id), { token: outsider.token, body: {} })).toBe(403);
  expect(await statusOf('POST', path(other.id, r.id), { token: outsider.token, body: {} })).toBe(403);
  expect(await statusOf('POST', path(hh.id, '00000000-0000-0000-0000-000000000000'), { token, body: {} })).toBe(404);
  expect(await statusOf('POST', path(hh.id, r.id), { body: {} })).toBe(401);
  expect(await groceries(hh.id)).toEqual([]);
});

test('with a cupboard, "always have" staples stay off and what is at home is flagged; without one, all of it goes on', async () => {
  const { token } = await admin();
  const ingredients = [
    { name: 'salt', qty: 1, unit: 'pinch' },
    { name: 'rice', qty: 1, unit: 'cup' },
    { name: 'eggs', qty: 2 },
  ];
  const stock = async (hhId: string) => {
    await call('POST', `/api/households/${hhId}/cupboard`, { token, body: { name: 'salt', staple: true } });
    await call('POST', `/api/households/${hhId}/cupboard`, { token, body: { name: 'rice' } });
  };

  const keeps = await newHousehold();
  await stock(keeps.id);
  const fried = await newRecipe(keeps.id, 'Fried rice', ingredients);
  const added = await call('POST', path(keeps.id, fried.id), { token, body: { servings: 4 } });
  expect(find(added, 'salt')).toBeUndefined();
  expect(find(added, 'rice').inCupboard).toBe(true);
  expect(find(added, 'eggs').inCupboard).toBe(false);

  // The same cupboard rows, but the house has turned its cupboard off: they mean nothing to the list.
  const doesNot = await newHousehold({ cupboard: false });
  await stock(doesNot.id);
  const same = await newRecipe(doesNot.id, 'Fried rice', ingredients);
  const all = await call('POST', path(doesNot.id, same.id), { token, body: { servings: 4 } });
  expect(all.map((i: any) => i.name).sort()).toEqual(['eggs', 'rice', 'salt']);
  expect(all.every((i: any) => i.inCupboard === false)).toBe(true);
});
