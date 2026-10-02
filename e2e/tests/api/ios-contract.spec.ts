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

test('restock reminders: set from a sheet, the question on opening, and its two answers', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}/restock`;
  // The cupboard item the phone decodes carries the ingredient a reminder hangs on.
  const coffee = await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name: 'coffee' } });
  const soap = await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name: 'dish soap' } });
  expect(coffee.ingredientId).toEqual(expect.any(String));

  // RestockPicker's Save: {everyDays}, and DELETE for Off.
  const set = await call('PUT', `${base}/${coffee.ingredientId}`, { token, body: { everyDays: 21 } });
  for (const key of ['ingredientId', 'name', 'everyDays', 'lastBoughtAt', 'dueAt', 'snoozedUntil', 'due']) {
    expect(set).toHaveProperty(key);
  }
  await call('PUT', `${base}/${soap.ingredientId}`, { token, body: { everyDays: 10 } });
  expect(await call('GET', `${base}/due`, { token })).toEqual([]);

  // RestockPrompt's answers: uuid strings in both lists.
  await call('POST', `${base}/add-due`, { token, body: { add: [coffee.ingredientId], snooze: [soap.ingredientId] } });
  await call('POST', `${base}/snooze`, { token, body: { ingredientIds: [coffee.ingredientId] } });
  const list = await call('GET', `/api/households/${hh.id}/grocery-list`, { token });
  expect(find(list, 'coffee')).toBeTruthy();

  await call('DELETE', `${base}/${coffee.ingredientId}`, { token });
  expect((await call('GET', base, { token })).map((r: any) => r.name)).toEqual(['dish soap']);
});

test('nutrition: the answers the phone decodes, and what its Apple Intelligence sends back', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  // Matches and weights are shared by every household on the server, so the lines the phone
  // changes have names of their own (digits are not words to the matcher): the real "butter"
  // and "curry paste" are left as they were.
  const stamp = Date.now();
  const butterName = `butter ${stamp}`;
  const pasteName = `curry paste ${stamp}`;
  const recipe = await newRecipe(hh.id, 'Curry for the phone', [
    { name: 'chicken thighs', qty: 800, unit: 'g' },
    { name: butterName, qty: 1, unit: 'knob' },
    { name: pasteName, qty: 2, unit: 'tbsp' },
    { name: 'parsley', qty: 1, unit: 'bunch', optional: true },
  ]);
  const line = (name: string) => recipe.ingredients.find((i: any) => i.ingredientName === name);

  // NutritionAvailability: the doors appear only when this answers.
  const status = await call('GET', '/api/nutrition', { token });
  for (const key of ['ready', 'foods', 'version']) expect(status).toHaveProperty(key);

  // RecipeNutritionScreen: servings, the household, and each optional line as its own include=.
  const path = (extra = '') => `/api/nutrition/recipes/${recipe.id}?servings=2&householdId=${hh.id}${extra}`;
  const n = await call('GET', path(`&include=${line('parsley').id}`), { token });
  expect(n.servings).toBe(2);
  for (const key of ['recipeServings', 'perServing', 'forServings', 'perRecipe', 'split', 'reference', 'percentOfReference',
    'highlights', 'summary', 'contributors', 'notCounted', 'linesCounted', 'linesTotal', 'complete', 'note']) {
    expect(n).toHaveProperty(key);
  }
  expect(n.reference.label).toEqual(expect.any(String));
  for (const c of n.contributors) {
    for (const key of ['recipeIngredientId', 'ingredientId', 'name', 'fdcId', 'foodName', 'amount', 'grams', 'gramsHow',
      'gramsBasis', 'estimated', 'kcal', 'protein', 'carbs', 'fat', 'share', 'confidence', 'matchSource', 'guess']) {
      expect(c).toHaveProperty(key);
    }
  }
  expect(n.contributors.map((c: any) => c.name)).toContain('parsley');

  // A knob is the rough kind the model is asked about: its amount reads "1 knob", the unit after the number.
  const butter = n.contributors.find((c: any) => c.name === butterName);
  expect(butter).toMatchObject({ gramsHow: 'ROUGH', amount: '1 knob', gramsBasis: 'a knob ≈ 12 g' });

  // The model's weight for ONE knob, as the phone sends it; the line is then LEARNED "(estimated)" — its ✨.
  const grams = await call('PUT', `/api/nutrition/ingredients/${butter.ingredientId}/grams`, {
    token, body: { unit: 'knob', grams: 10, source: 'ai' },
  });
  expect(grams).toMatchObject({ unitKey: 'knob', gramsEach: 10, source: 'ai' });
  const weighed = (await call('GET', path(), { token })).contributors.find((c: any) => c.name === butterName);
  expect(weighed.gramsHow).toBe('LEARNED');
  expect(weighed.gramsBasis).toMatch(/\(estimated\)$/);

  // The model's pick from the shortlist, as the phone sends it; the line then says matchSource "ai" — its ✨.
  const paste = [...n.contributors, ...n.notCounted].find((c: any) => c.name === pasteName);
  const match = await call('GET', `/api/nutrition/ingredients/${paste.ingredientId}/match`, { token });
  for (const key of ['ingredientId', 'ingredientName', 'fdcId', 'foodName', 'confidence', 'source', 'counted', 'guess', 'shortlist']) {
    expect(match).toHaveProperty(key);
  }
  expect(match.shortlist.length).toBeGreaterThan(0);
  const chosen = await call('PUT', `/api/nutrition/ingredients/${paste.ingredientId}/match`, {
    token, body: { fdcId: match.shortlist[0].fdcId, source: 'ai' },
  });
  // Counted, at the server's own confidence in that food: a guess unless it was already sure.
  expect(chosen).toMatchObject({ source: 'ai', fdcId: match.shortlist[0].fdcId, counted: true,
    guess: match.shortlist[0].confidence < 0.65 });
  const picked = (await call('GET', path(), { token })).contributors.find((c: any) => c.name === pasteName);
  expect(picked.matchSource).toBe('ai');

  // The week card and Explore's door: the next seven days.
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: recipe.id });
  const week = await call('GET', `/api/nutrition/households/${hh.id}/plan?start=${isoDate(0)}&end=${isoDate(6)}`, { token });
  expect(week.days).toHaveLength(7);
  for (const key of ['date', 'totals', 'mealsPlanned', 'mealsCounted', 'partial', 'fuller']) expect(week.days[0]).toHaveProperty(key);
  // averageDays and averageOver: what the phone's week card and Explore's door say the average is of.
  expect(week).toMatchObject({ daysCounted: 1, mealsPlanned: 1, mealsCounted: 1, averageDays: 1, averageOver: 'partial' });

  // Recent lookups: the phone writes a recipe's id in lower case, so it is one lookup with the web's.
  await call('POST', '/api/nutrition/recent', { token, body: { kind: 'RECIPE', ref: recipe.id.toLowerCase(), householdId: hh.id } });
  const recent = await call('GET', `/api/nutrition/recent?householdId=${hh.id}`, { token });
  expect(recent.filter((r: any) => r.ref === recipe.id)).toHaveLength(1);
  expect(recent.find((r: any) => r.ref === recipe.id)).toMatchObject({ kind: 'RECIPE', label: 'Curry for the phone', per: 'serving' });

  // Search as the phone types: ingredients and recipes, never packets unless asked.
  const found = await call('GET', `/api/nutrition/search?q=curry&householdId=${hh.id}`, { token });
  for (const key of ['query', 'ingredients', 'products', 'productsStatus', 'recipes']) expect(found).toHaveProperty(key);
  expect(found.recipes.map((r: any) => r.name)).toContain('Curry for the phone');
  expect(found.productsStatus).not.toBe('ok');
});

test('the cupboard sheet: the whole edit with a use-by date, clearing it, and an older build that sends none', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const item = await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name: 'baby spinach' } });
  // The phone offers the date only when the item says whether it wants using soon.
  expect(typeof item.useSoon).toBe('boolean');
  const url = `/api/households/${hh.id}/cupboard/${item.id}`;

  // CupboardItemSheet's Save, as editCupboard writes it: only what changed, useBy as yyyy-MM-dd.
  const saved = await call('PATCH', url, {
    token, body: { trackQuantity: true, quantity: 2, unit: 'bags', useBy: isoDate(2) },
  });
  expect(saved).toMatchObject({ quantity: 2, unit: 'bags', useBy: isoDate(2), useSoon: true, useSoonGuess: false });
  for (const key of ['useSoonLabel', 'ingredientId', 'categoryId', 'onList']) expect(saved).toHaveProperty(key);

  // An older build never sends useBy: the date stays. The switch turned off sends "".
  expect((await call('PATCH', url, { token, body: { staple: false } })).useBy).toBe(isoDate(2));
  expect((await call('PATCH', url, { token, body: { useBy: '' } })).useBy).toBeNull();
});

test('meal plans: the requests the phone sends, its Apple Intelligence picks, and the fields it decodes', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}/meal-plans`;
  for (const name of ['chickpeas (tin)', 'baby spinach', 'onions']) {
    await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name } });
  }
  const curry = await newRecipe(hh.id, 'Phone curry', [
    { name: 'chickpeas', qty: 2, unit: 'tins' }, { name: 'spinach', qty: 200, unit: 'g' }, { name: 'onions', qty: 1 },
  ]);
  const dal = await newRecipe(hh.id, 'Phone dal', [{ name: 'red lentils', qty: 200, unit: 'g' }, { name: 'onions', qty: 1 }]);

  // GET /api/meal-plans: the door opens, and "candidates" says the server takes the model's picks.
  expect((await call('GET', '/api/meal-plans', { token })).features).toContain('candidates');
  const home = await call('GET', base, { token });
  for (const key of ['cupboard', 'filters', 'plans', 'form']) expect(home).toHaveProperty(key);
  const setup = await call('GET', `${base}/cupboard`, { token });
  for (const key of ['items', 'useSoon', 'highlights', 'useFirst', 'days', 'defaultMeals', 'defaultDays', 'defaultBuyLimit',
    'defaultOnlyMine', 'defaultServings', 'unsure']) expect(setup).toHaveProperty(key);

  // CupboardPlanRequest as the phone encodes it: buyLimit always present (null is "any"), chosen only from the model.
  const request = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], useFirst: [], buyLimit: null, onlyMine: true, servings: 2 };
  const candidates = await call('POST', `${base}/cupboard/candidates`, { token, body: { setup: request, exclude: [] } });
  expect(candidates.recipes.map((r: any) => r.recipeId).sort()).toEqual([curry.id, dal.id].sort());
  for (const key of ['recipeId', 'name', 'section', 'yours', 'fits', 'percentFromCupboard', 'uses', 'usesSoon', 'toBuy', 'score']) {
    expect(candidates.recipes[0]).toHaveProperty(key);
  }
  const chosen = await call('POST', `${base}/cupboard`, {
    token, body: { ...request, chosen: [
      { date: isoDate(1), mealType: 'DINNER', recipeId: dal.id },
      { date: isoDate(2), mealType: 'DINNER', recipeId: curry.id },
    ] },
  });
  expect(chosen.meals.map((m: any) => m.recipeId)).toEqual([dal.id, curry.id]);
  // A swap: the setup without the picks, the draft's meals, the slot, what was seen, and the model's choice.
  const meals = chosen.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId }));
  const one = await call('POST', `${base}/cupboard/candidates`, {
    token, body: { setup: request, meals, date: isoDate(1), mealType: 'DINNER', exclude: [dal.id] },
  });
  expect(one.recipes).toEqual([]);
  const swapped = await call('POST', `${base}/cupboard/swap`, {
    token, body: { setup: request, meals, date: isoDate(1), mealType: 'DINNER', exclude: [dal.id], recipeId: curry.id },
  });
  expect(swapped.swapped).toBe(false);
  // Apply: servings on each meal, the things to buy by ingredient id.
  const applied = await call('POST', `${base}/apply`, {
    token, body: { meals: chosen.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId, servings: 2 })),
      addToGroceries: chosen.toBuy.map((t: any) => t.ingredientId) },
  });
  for (const key of ['added', 'skipped', 'groceriesAdded', 'from', 'to']) expect(applied).toHaveProperty(key);
  expect(applied.added).toBe(2);

  // Plans for health targets: the form's tiles, the candidates, a preview with the model's picks, kept exactly.
  const options = await call('GET', '/api/meal-plans/options', { token });
  expect(options.goals[0]).toMatchObject({ key: 'lose-fat' });
  const targets = await call('POST', '/api/meal-plans/targets/calculate', {
    token, body: { age: 20, heightCm: 180.3, weightKg: 74.8, activity: 'moderate', goal: 'build-muscle', sex: 'male', overrides: { kcal: 2900 } },
  });
  expect(targets).toMatchObject({ kcal: 2900, overridden: ['kcal'] });
  const details = {
    age: 20, sex: 'male', heightCm: 180.3, weightKg: 74.8, activity: 'moderate', goal: 'build-muscle', preferences: [], avoid: [],
    useMyRecipesFirst: true, onlyMyRecipes: true, days: 1, meals: ['DINNER'], description: 'Age 20 · 5 ft 11 · 165 lb', units: 'imperial',
  };
  const tc = await call('POST', `${base}/targets/candidates`, { token, body: { details } });
  for (const key of ['targets', 'length', 'mealTypes', 'aims', 'recipes']) expect(tc).toHaveProperty(key);
  const preview = await call('POST', `${base}/targets/preview`, {
    token, body: { name: 'Phone plan', details, chosen: [{ day: 0, mealType: 'DINNER', recipeId: curry.id }] },
  });
  expect(preview.days[0].meals[0].recipeId).toBe(curry.id);
  const keep = preview.days.flatMap((d: any) => d.meals.map((m: any) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })));
  const saved = await call('POST', `${base}/targets`, { token, body: { name: 'Phone plan', details, meals: keep } });
  for (const key of ['id', 'mine', 'targets', 'details', 'days', 'average', 'summary', 'tags', 'icon', 'hue', 'goalLabel']) {
    expect(saved).toHaveProperty(key);
  }
  const swappedPlan = await call('POST', `${base}/targets/${saved.id}/swap`, {
    token, body: { day: 0, mealType: 'DINNER', exclude: [curry.id], recipeId: dal.id },
  });
  expect(swappedPlan.days[0].meals[0].recipeId).toBe(dal.id);
  const renamed = await call('PUT', `${base}/targets/${saved.id}`, { token, body: { name: 'Renamed on the phone' } });
  expect(renamed.name).toBe('Renamed on the phone');
  const onPlan = await call('POST', `${base}/targets/${saved.id}/apply`, { token, body: { start: isoDate(10), servings: 2 } });
  expect(onPlan).toMatchObject({ added: 1, from: isoDate(10) });
});
