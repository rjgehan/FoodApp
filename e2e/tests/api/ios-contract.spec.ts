import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  API_URL, addRangeToGroceries, admin, call, find, isoDate, newHousehold, newRecipe, plan,
} from '../../lib/api';

/*
 * The requests the iPhone app sends, byte for byte where it matters. The phone has no test suite
 * of its own that talks to a server, and an old build stays on somebody's phone for months, so
 * the shapes it depends on are pinned here.
 */

const COVER_JPEG = readFileSync(new URL('../fixtures/cover-8px.jpg', import.meta.url));

test('the day sheet: plan with extras, step the servings, change the dish, remove it', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const parmentier = await newRecipe(hh.id, 'Chicken Parmentier', [
    { name: 'potatoes', qty: 1500, unit: 'g' },
    { name: 'parsley', qty: 2, unit: 'tbsp', optional: true },
    { name: 'gruyere', qty: 50, unit: 'g', optional: true },
  ]);
  const lasagne = await newRecipe(hh.id, 'Lasagne', [{ name: 'lasagne sheets', qty: 250, unit: 'g' }]);
  const parsley = parmentier.ingredients.find((i: any) => i.ingredientName === 'parsley').id;

  // Add to plan (DaySheet and AddToPlanSheet): servings and the chosen extras ride along.
  const entry = await plan(hh.id, isoDate(1), 'DINNER', {
    recipeId: parmentier.id,
    servings: 3,
    includedOptionalIngredientIds: [parsley],
  });
  expect(entry.servings).toBe(3);
  expect(entry.includedOptionalIngredientIds).toEqual([parsley]);
  // Every field the phone's MealPlanEntry decodes is there.
  for (const key of ['needsIngredients', 'placeId', 'inCupboard', 'runningLow', 'notes', 'recipeDeleted']) {
    expect(entry).toHaveProperty(key);
  }

  // Only the ticked extra reaches the list.
  const list = await addRangeToGroceries(hh.id, isoDate(1), isoDate(1));
  expect(find(list, 'parsley')).toBeTruthy();
  expect(find(list, 'gruyere')).toBeUndefined();

  // The Serves stepper sends servings on their own and nothing else changes.
  const path = `/api/households/${hh.id}/meal-plan/entries/${entry.id}`;
  const stepped = await call('PATCH', path, { token, body: { servings: 7 } });
  expect(stepped).toMatchObject({ servings: 7, recipeName: 'Chicken Parmentier', includedOptionalIngredientIds: [parsley] });

  // Change: the new recipe and its extras (none), keeping day, meal and servings.
  const changed = await call('PATCH', path, { token, body: { recipeId: lasagne.id, includedOptionalIngredientIds: [] } });
  expect(changed).toMatchObject({ recipeName: 'Lasagne', servings: 7, mealType: 'DINNER', date: isoDate(1), includedOptionalIngredientIds: [] });

  // A single item changed into a recipe gets servings from the phone, since it had none.
  const item = await plan(hh.id, isoDate(1), 'LUNCH', { itemName: 'strawberries' });
  expect(item.servings).toBeNull();
  const nowARecipe = await call('PATCH', `/api/households/${hh.id}/meal-plan/entries/${item.id}`, {
    token, body: { recipeId: parmentier.id, includedOptionalIngredientIds: [], servings: 4 },
  });
  expect(nowARecipe).toMatchObject({ recipeName: 'Chicken Parmentier', itemName: null, servings: 4 });

  // Remove.
  await call('DELETE', `/api/households/${hh.id}/meal-plan/${entry.id}`, { token });
  const left = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(1)}`, { token });
  expect(left.map((e: any) => e.id)).toEqual([item.id]);

  // View recipe fetches one it has not got, with the household for its filing.
  const one = await call('GET', `/api/recipes/${lasagne.id}?householdId=${hh.id}`, { token });
  expect(one.name).toBe('Lasagne');
});

test('a cover photo goes up as a JPEG, in the multipart shape the phone writes by hand', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const boundary = `mp-${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="photo.jpg"\r\n'),
    Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
    COVER_JPEG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${API_URL}/api/households/${hh.id}/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  expect(res.status).toBe(200);
  const { id, byteSize } = await res.json();
  expect(byteSize).toBe(COVER_JPEG.length);

  const served = await fetch(`${API_URL}/api/images/${id}`);
  expect(served.headers.get('content-type')).toContain('image/jpeg');
  expect(Buffer.from(await served.arrayBuffer()).equals(COVER_JPEG)).toBe(true);
});
