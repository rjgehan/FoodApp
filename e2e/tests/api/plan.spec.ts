import { expect, test } from '@playwright/test';
import { INTEGRATION_KEY, admin, call, isoDate, newHousehold, newRecipe, plan, statusOf } from '../../lib/api';

test('the plan comes back in eating order, mains before their sides', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const main = await newRecipe(hh.id, 'Zucchini Lasagna', [{ name: 'zucchini', qty: 2 }]);
  const side = await newRecipe(hh.id, 'Apple Salad', [{ name: 'apple', qty: 1 }]);
  const lunch = await newRecipe(hh.id, 'Soup', [{ name: 'leek', qty: 1 }]);
  // Added out of order on purpose; names chosen so alphabetical order is wrong too.
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: main.id });
  await plan(hh.id, isoDate(1), 'SNACK', { itemName: 'almonds' });
  await plan(hh.id, isoDate(1), 'LUNCH', { recipeId: lunch.id });
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: side.id });
  await plan(hh.id, isoDate(1), 'BREAKFAST', { itemName: 'toast' });

  const entries = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(1)}`, { token: owner.token });
  expect(entries.map((e: any) => `${e.mealType}:${e.recipeName ?? e.itemName}`)).toEqual([
    'BREAKFAST:toast', 'LUNCH:Soup', 'DINNER:Zucchini Lasagna', 'DINNER:Apple Salad', 'SNACK:almonds',
  ]);

  // The kiosk sees the same order — when the integration API is switched on at all.
  if ((await statusOf('GET', '/api/integration/households', { headers: { 'x-api-key': INTEGRATION_KEY } })) !== 503) {
    const [day] = await call('GET', `/api/integration/households/${hh.id}/plan?start=${isoDate(1)}&days=1`, {
      headers: { 'x-api-key': INTEGRATION_KEY },
    });
    const dinner = day.meals.find((m: any) => m.mealType === 'DINNER');
    expect(dinner.items.map((i: any) => i.name)).toEqual(['Zucchini Lasagna', 'Apple Salad']);
  }
});
