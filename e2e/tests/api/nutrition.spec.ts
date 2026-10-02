import { expect, test } from '@playwright/test';
import { admin, call, isoDate, newHousehold, newMember, newRecipe, plan, statusOf, unique } from '../../lib/api';

/**
 * Nutrition facts from the server's own data: the USDA table, recipe and plan totals, matching
 * ingredients to foods and weighing their amounts, search, and each person's recent lookups.
 *
 * Nothing here asks Open Food Facts anything — a test that phones a charity's servers is a test
 * that fails on a train — so packet lookups are only checked for refusing what isn't a barcode.
 */

const near = (actual: number, expected: number, within = 2) =>
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(within);

/** 400 g chicken breast, 2 eggs, 2 tbsp olive oil, salt to taste, optional coriander — serves 4. */
async function chickenAndEggs(householdId: string) {
  return newRecipe(householdId, unique('Chicken and eggs'), [
    { name: 'chicken breast', qty: 400, unit: 'g' },
    { name: 'eggs', qty: 2 },
    { name: 'olive oil', qty: 2, unit: 'tbsp' },
    { name: 'salt', qty: null },
    { name: 'coriander', qty: 1, unit: 'bunch', optional: true },
  ]);
}

test('the server says it has nutrition, with the USDA table loaded', async () => {
  const owner = await admin();
  const status = await call('GET', '/api/nutrition', { token: owner.token });
  expect(status.ready).toBe(true);
  expect(status.foods).toBeGreaterThan(8000);
  expect(status.attribution.map((a: any) => a.text).join(' ')).toContain('FoodData Central');
  expect(await statusOf('GET', '/api/nutrition')).toBe(401);
});

test('a USDA food comes per 100 g with its household measures', async () => {
  const owner = await admin();
  const egg = await call('GET', '/api/nutrition/foods/171287', { token: owner.token });
  expect(egg.name).toBe('Egg, whole, raw, fresh');
  expect(egg.per100g.kcal).toBe(143);
  expect(egg.portions).toContainEqual({ label: '1 large', grams: 50 });
  expect(egg.split.protein + egg.split.carbs + egg.split.fat).toBe(100);
  expect(await statusOf('GET', '/api/nutrition/foods/1', { token: owner.token })).toBe(404);
});

test('a recipe adds up per serving, says where the calories come from and what it left out', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const recipe = await chickenAndEggs(hh.id);
  const base = `/api/nutrition/recipes/${recipe.id}?householdId=${hh.id}`;

  const n = await call('GET', base, { token: owner.token });
  // 480 kcal of chicken + 143 of egg (2 large, 100 g) + 238.7 of oil (27 g) = 861.7, over 4.
  expect(n.recipeServings).toBe(4);
  near(n.perServing.kcal, 215.4);
  near(n.perServing.protein, 25.6, 0.3);
  near(n.perRecipe.kcal, 861.7, 1);
  expect(n.contributors.map((c: any) => c.name)).toEqual(['chicken breast', 'olive oil', 'eggs']);
  near(n.contributors[0].share, 0.557, 0.01);
  near(n.contributors[0].kcal, 120, 0.5);
  expect(n.contributors.find((c: any) => c.name === 'eggs').gramsBasis).toBe('1 large = 50 g');
  expect(n.notCounted.map((x: any) => `${x.name}:${x.reason}`).sort()).toEqual(['coriander:OPTIONAL', 'salt:NO_AMOUNT']);
  expect(n.note).toBe('Figures are estimates from ingredient data. Optional coriander not counted. Salt has no amount, so isn\'t counted.');
  // Not every line it should count was counted: the salt had no amount.
  expect([n.linesCounted, n.linesTotal, n.complete]).toEqual([3, 5, false]);
  expect(n.reference.kcal).toBe(2000);
  expect(n.percentOfReference.kcal).toBe(11);
  expect(n.attribution.url).toContain('fdc.nal.usda.gov');

  // Two servings is twice one; the optional bunch of coriander counts when it is included.
  const two = await call('GET', `${base}&servings=2`, { token: owner.token });
  near(two.forServings.kcal, 430.9);
  const coriander = recipe.ingredients.find((i: any) => i.ingredientName === 'coriander');
  const withIt = await call('GET', `${base}&include=${coriander.id}`, { token: owner.token });
  near(withIt.perRecipe.kcal - n.perRecipe.kcal, 30 * 0.23, 1);  // a bunch of coriander ≈ 30 g
  expect(withIt.notCounted.map((x: any) => x.reason)).toEqual(['NO_AMOUNT']);
});

test('a planned meal counts the optional bits that occasion includes', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const recipe = await chickenAndEggs(hh.id);
  const coriander = recipe.ingredients.find((i: any) => i.ingredientName === 'coriander');
  const entry = await plan(hh.id, isoDate(1), 'DINNER', { recipeId: recipe.id, includedOptionalIngredientIds: [coriander.id] });

  const n = await call('GET', `/api/nutrition/recipes/${recipe.id}?householdId=${hh.id}&entryId=${entry.id}`, { token: owner.token });
  expect(n.notCounted.map((x: any) => x.reason)).toEqual(['NO_AMOUNT']);
  // Somebody else's meal, or a meal of a different recipe, is not a way in.
  const other = await newRecipe(hh.id, 'Toast', [{ name: 'bread', qty: 2, unit: 'slices' }]);
  expect(await statusOf('GET', `/api/nutrition/recipes/${other.id}?householdId=${hh.id}&entryId=${entry.id}`, { token: owner.token })).toBe(404);
});

test('the plan adds up per person per day, and says which meals it could not count', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const recipe = await chickenAndEggs(hh.id);
  const coriander = recipe.ingredients.find((i: any) => i.ingredientName === 'coriander');
  const mystery = await newRecipe(hh.id, 'Mystery', [{ name: unique('zzqx'), qty: 1 }]);
  const place = await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'Diner' } });

  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: recipe.id, servings: 3, includedOptionalIngredientIds: [coriander.id] });
  await plan(hh.id, isoDate(1), 'LUNCH', { placeId: place.id });
  await plan(hh.id, isoDate(2), 'BREAKFAST', { itemName: 'eggs' });
  await plan(hh.id, isoDate(2), 'DINNER', { recipeId: mystery.id });

  const week = await call('GET', `/api/nutrition/households/${hh.id}/plan?start=${isoDate(0)}&end=${isoDate(6)}`, { token: owner.token });
  expect(week.days).toHaveLength(7);
  const [, day1, day2] = week.days;
  // One serving whatever the slot's servings: this is one person's share.
  near(day1.totals.kcal, 215.4 + 1.7);
  expect([day1.mealsPlanned, day1.mealsCounted, day1.partial]).toEqual([2, 1, true]);
  // One egg on its own is one large egg.
  near(day2.totals.kcal, 71.5);
  expect(week.daysCounted).toBe(2);
  near(week.average.kcal, (217.1 + 71.5) / 2);
  expect([week.mealsPlanned, week.mealsCounted]).toEqual([4, 2]);
  expect(week.notCounted.map((m: any) => `${m.name}:${m.reason}`).sort()).toEqual(['Diner:PLACE', 'Mystery:NO_DATA']);
  expect(week.note).toContain('2 of 4 planned meals counted');

  // With no dates it is the household's planning window, from today.
  const window = await call('GET', `/api/nutrition/households/${hh.id}/plan`, { token: owner.token });
  expect(window.days).toHaveLength(7);
  expect(await statusOf('GET', `/api/nutrition/households/${hh.id}/plan?start=${isoDate(0)}&end=${isoDate(60)}`, { token: owner.token })).toBe(400);
});

test('someone outside the household sees neither its recipes\' nutrition nor its plan', async () => {
  const hh = await newHousehold();
  const recipe = await chickenAndEggs(hh.id);
  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  expect(await statusOf('GET', `/api/nutrition/recipes/${recipe.id}?householdId=${elsewhere.id}`, { token: outsider.token })).toBe(403);
  expect(await statusOf('GET', `/api/nutrition/recipes/${recipe.id}`, { token: outsider.token })).toBe(403);
  expect(await statusOf('GET', `/api/nutrition/households/${hh.id}/plan`, { token: outsider.token })).toBe(403);
  expect(await statusOf('GET', `/api/nutrition/search?q=chicken&householdId=${hh.id}`, { token: outsider.token })).toBe(403);
});

test('an ingredient\'s food can be chosen from its shortlist — by a model, then a person who outranks it', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  // A name of its own (digits are not words to the matcher), so the shared "greek yogurt" is untouched.
  const name = `greek yogurt ${Date.now()}`;
  const recipe = await newRecipe(hh.id, 'Yogurt bowl', [{ name, qty: 1, unit: 'knob' }]);
  const n = await call('GET', `/api/nutrition/recipes/${recipe.id}?householdId=${hh.id}`, { token: owner.token });
  const line = [...n.contributors, ...n.notCounted].find((c: any) => c.name === name);
  const path = `/api/nutrition/ingredients/${line.ingredientId}/match`;

  const before = await call('GET', path, { token: owner.token });
  expect([before.source, before.fdcId, before.counted]).toEqual(['auto', 171304, true]);
  expect(before.shortlist).toHaveLength(8);
  expect(before.shortlist[0].fdcId).toBe(171304);
  const second = before.shortlist[1].fdcId;

  // Only foods from the shortlist; chicken is not one of them.
  expect(await statusOf('PUT', path, { token: owner.token, body: { fdcId: 171077, source: 'ai' } })).toBe(400);
  expect(await statusOf('PUT', path, { token: owner.token, body: { fdcId: null, source: 'ai' } })).toBe(400);
  expect(await statusOf('PUT', path, { token: owner.token, body: { fdcId: second, source: 'robot' } })).toBe(400);

  const byModel = await call('PUT', path, { token: owner.token, body: { fdcId: second, source: 'ai' } });
  expect([byModel.fdcId, byModel.source, byModel.counted]).toEqual([second, 'ai', true]);
  const byPerson = await call('PUT', path, { token: owner.token, body: { fdcId: before.shortlist[0].fdcId, source: 'user' } });
  expect(byPerson.source).toBe('user');
  expect(await statusOf('PUT', path, { token: owner.token, body: { fdcId: second, source: 'ai' } })).toBe(409);

  // Everyone's recipes use it: it is the ingredient's food, not this household's.
  const again = await call('GET', `/api/nutrition/recipes/${recipe.id}?householdId=${hh.id}`, { token: owner.token });
  expect(again.contributors[0].fdcId).toBe(before.shortlist[0].fdcId);
  expect(again.contributors[0].matchSource).toBe('user');
});

test('what a vague amount weighs can be learned, within sense', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const name = `butter ${Date.now()}`;
  const recipe = await newRecipe(hh.id, 'Buttered toast', [{ name, qty: 2, unit: 'knobs' }]);
  const url = `/api/nutrition/recipes/${recipe.id}?householdId=${hh.id}&servings=4`;
  const rough = (await call('GET', url, { token: owner.token })).contributors[0];
  expect([rough.gramsHow, rough.grams, rough.estimated]).toEqual(['ROUGH', 24, true]);

  const path = `/api/nutrition/ingredients/${rough.ingredientId}/grams`;
  for (const bad of [{ unit: 'knob', grams: 0 }, { unit: 'knob', grams: 9000 }, { unit: 'g', grams: 1 }]) {
    expect(await statusOf('PUT', path, { token: owner.token, body: { ...bad, source: 'ai' } })).toBe(400);
  }
  const learned = await call('PUT', path, { token: owner.token, body: { unit: 'knob', grams: 15, source: 'ai' } });
  expect(learned).toMatchObject({ unitKey: 'knob', gramsEach: 15, source: 'ai' });
  const after = (await call('GET', url, { token: owner.token })).contributors[0];
  expect([after.gramsHow, after.grams, after.estimated]).toEqual(['LEARNED', 30, false]);

  await call('PUT', path, { token: owner.token, body: { unit: 'knob', grams: 10, source: 'user' } });
  expect(await statusOf('PUT', path, { token: owner.token, body: { unit: 'knob', grams: 15, source: 'ai' } })).toBe(409);
});

test('search finds USDA foods and the household\'s recipes, and only asks for packets when told to', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const curry = unique('Chickpea curry');
  await newRecipe(hh.id, curry, [{ name: 'chickpeas', qty: 400, unit: 'g' }, { name: 'onion', qty: 1 }]);

  const found = await call('GET', `/api/nutrition/search?q=${encodeURIComponent('chickpeas')}&householdId=${hh.id}`, { token: owner.token });
  expect(found.ingredients[0].name).toMatch(/^Chickpeas/);
  expect(found.productsStatus).toBe('skipped');
  expect(found.products).toEqual([]);

  const mine = await call('GET', `/api/nutrition/search?q=${encodeURIComponent(curry)}&householdId=${hh.id}`, { token: owner.token });
  expect(mine.recipes).toHaveLength(1);
  // 400 g canned chickpeas (556) + 1 onion (44), serves 4.
  near(mine.recipes[0].kcalPerServing, (556 + 44) / 4, 2);

  expect(await statusOf('GET', '/api/nutrition/products/12ab', { token: owner.token })).toBe(400);
});

test('recent lookups are each person\'s own, newest first', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const member = await newMember(hh.id);
  const recipe = await chickenAndEggs(hh.id);
  await call('DELETE', '/api/nutrition/recent', { token: member.token });

  const food = await call('POST', '/api/nutrition/recent', { token: member.token, body: { kind: 'food', ref: '173800', label: 'Chickpeas, tinned' } });
  expect(food).toMatchObject({ kind: 'FOOD', label: 'Chickpeas, tinned', kcal: 139, per: '100g' });
  const dish = await call('POST', '/api/nutrition/recent', { token: member.token, body: { kind: 'recipe', ref: recipe.id, householdId: hh.id } });
  expect(dish).toMatchObject({ kind: 'RECIPE', label: recipe.name, per: 'serving' });
  near(dish.kcal, 215);

  const list = await call('GET', '/api/nutrition/recent', { token: member.token });
  expect(list.map((l: any) => l.kind)).toEqual(['RECIPE', 'FOOD']);
  // Looking at it again moves it up rather than listing it twice.
  await call('POST', '/api/nutrition/recent', { token: member.token, body: { kind: 'food', ref: '173800' } });
  expect((await call('GET', '/api/nutrition/recent', { token: member.token })).map((l: any) => l.kind)).toEqual(['FOOD', 'RECIPE']);

  expect((await call('GET', '/api/nutrition/recent', { token: owner.token })).map((l: any) => l.ref)).not.toContain(recipe.id);
  expect(await statusOf('POST', '/api/nutrition/recent', { token: member.token, body: { kind: 'shoe', ref: '1' } })).toBe(400);
  expect(await statusOf('POST', '/api/nutrition/recent', { token: member.token, body: { kind: 'food', ref: '1' } })).toBe(404);

  const outsider = await newMember((await newHousehold()).id);
  expect(await statusOf('POST', '/api/nutrition/recent', { token: outsider.token, body: { kind: 'recipe', ref: recipe.id } })).toBe(403);

  await call('DELETE', '/api/nutrition/recent', { token: member.token });
  expect(await call('GET', '/api/nutrition/recent', { token: member.token })).toEqual([]);
});
