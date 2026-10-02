import { expect, test } from '@playwright/test';
import { admin, call, groceries, isoDate, newHousehold, newMember, newRecipe, plan, statusOf, unique } from '../../lib/api';

/**
 * Meal plans (Explore, mockup 5.7–5.11): use-by dates and "use soon" on the cupboard, a plan
 * cooked from the cupboard (draft, swap, apply), and private plans for health targets.
 *
 * Other tests publish recipes into the same Explore, so anything that may use published recipes
 * either asks for "only my recipes" or uses ingredients nobody else's recipe could have.
 * Ingredients are shared by the whole server and keep the spelling they were first made with,
 * so names here are lower case, as the rest of the suite writes them.
 */

const cupboardAdd = async (householdId: string, name: string) => {
  const owner = await admin();
  return call('POST', `/api/households/${householdId}/cupboard`, { token: owner.token, body: { name } });
};

const cupboardPatch = async (householdId: string, itemId: string, body: Record<string, unknown>) => {
  const owner = await admin();
  return call('PATCH', `/api/households/${householdId}/cupboard/${itemId}`, { token: owner.token, body });
};

test('the server says it has meal plans', async () => {
  const owner = await admin();
  const status = await call('GET', '/api/meal-plans', { token: owner.token });
  expect(status.ready).toBe(true);
  expect(status.features).toEqual(expect.arrayContaining(['cupboard', 'use-by', 'targets', 'candidates']));
});

test('a cupboard item takes a use-by date, and says when it wants using soon', async () => {
  const hh = await newHousehold();
  const onions = await cupboardAdd(hh.id, 'onions');
  expect(onions).toMatchObject({ useBy: null, useSoon: false, useSoonGuess: false, useSoonLabel: null });

  // A date two days off is soon, and says so as a fact.
  const dated = await cupboardPatch(hh.id, onions.id, { useBy: isoDate(2) });
  expect(dated).toMatchObject({ useBy: isoDate(2), useSoon: true, useSoonGuess: false });
  expect(dated.useSoonLabel).toMatch(/^by [A-Z][a-z]{2}$/);
  expect((await cupboardPatch(hh.id, onions.id, { useBy: isoDate(1) })).useSoonLabel).toBe('tomorrow');
  // Further out: labelled, not soon. Other changes leave it alone; "" clears it.
  expect((await cupboardPatch(hh.id, onions.id, { useBy: isoDate(20) })).useSoon).toBe(false);
  expect((await cupboardPatch(hh.id, onions.id, { runningLow: true })).useBy).toBe(isoDate(20));
  expect((await cupboardPatch(hh.id, onions.id, { useBy: '' })).useBy).toBeNull();
  const owner = await admin();
  expect(await statusOf('PATCH', `/api/households/${hh.id}/cupboard/${onions.id}`, {
    token: owner.token, body: { useBy: 'next tuesday' },
  })).toBe(400);

  // No date: fish bought today is guessed to want using soon, and the guess says it is one.
  const fish = await cupboardAdd(hh.id, 'salmon fillets');
  expect(fish).toMatchObject({ useSoon: true, useSoonGuess: true, useSoonLabel: 'soon' });
  // Tins keep.
  expect((await cupboardAdd(hh.id, 'chickpeas (tin)')).useSoon).toBe(false);
  // The list shows the same.
  const list = await call('GET', `/api/households/${hh.id}/cupboard`, { token: owner.token });
  expect(list.find((i: any) => i.name === 'salmon fillets').useSoon).toBe(true);
});

/** A kitchen with a curry's worth in the cupboard and salmon that wants using. */
async function stockedKitchen() {
  const hh = await newHousehold();
  for (const name of ['chickpeas (tin)', 'baby spinach', 'onions', 'salmon fillets', 'potatoes']) {
    await cupboardAdd(hh.id, name);
  }
  const curry = await newRecipe(hh.id, unique('Chickpea curry'), [
    { name: 'chickpeas', qty: 2, unit: 'tins' },
    { name: 'spinach', qty: 200, unit: 'g' },
    { name: 'onions', qty: 1 },
    { name: 'salt', qty: null },
    { name: 'coriander', qty: 1, unit: 'bunch', optional: true },
  ]);
  const traybake = await newRecipe(hh.id, unique('Salmon traybake'), [
    { name: 'salmon fillets', qty: 4 },
    { name: 'potatoes', qty: 800, unit: 'g' },
    { name: 'lemon', qty: 1 },
  ]);
  const stew = await newRecipe(hh.id, unique('Beef stew'), [
    { name: 'beef', qty: 800, unit: 'g' },
    { name: 'carrots', qty: 3 },
    { name: 'beef stock', qty: 500, unit: 'ml' },
    { name: 'red wine', qty: 250, unit: 'ml' },
    { name: 'onions', qty: 1 },
  ]);
  const porridge = await newRecipe(hh.id, unique('Porridge'), [{ name: 'oats', qty: 80, unit: 'g' }], { section: 'BREAKFAST' });
  return { hh, curry, traybake, stew, porridge };
}

test('something past its use-by is never pushed to be eaten, and a dated thing is used by its date or not at all', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const fish = unique('pastfish');
  const leaf = unique('dateleaf');
  const salmon = await cupboardAdd(hh.id, fish);
  const spinach = await cupboardAdd(hh.id, leaf);
  await cupboardAdd(hh.id, 'potatoes');
  await cupboardPatch(hh.id, salmon.id, { useBy: isoDate(-1) });
  await cupboardPatch(hh.id, spinach.id, { useBy: isoDate(1) });
  const dish = await newRecipe(hh.id, unique('Fish, leaves and potatoes'), [
    { name: fish, qty: 2 }, { name: leaf, qty: 100, unit: 'g' }, { name: 'potatoes', qty: 500, unit: 'g' },
  ]);

  const setup = await call('GET', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token });
  // Past its date: a warning to check it, never a suggestion, a pre-tick or a highlight.
  expect(setup.useFirst.map((u: any) => u.itemId)).not.toContain(salmon.id);
  expect(setup.pastDate).toEqual([expect.objectContaining({ itemId: salmon.id, reason: 'past', label: 'past its date', selected: false })]);
  expect(setup.highlights.map((h: string) => h.toLowerCase())).not.toContain(fish);
  expect(setup.useSoon).toBe(1);
  expect(setup.useFirst.find((u: any) => u.itemId === spinach.id)).toMatchObject({ reason: 'date', selected: true });

  // Even if an older app ticks it: the fish isn't in the cupboard for any meal, so it is to buy.
  const body = { dates: [isoDate(4)], meals: ['DINNER'], buyLimit: 5, onlyMine: true, servings: 2,
    useFirst: [salmon.ingredientId, spinach.ingredientId] };
  const late = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token, body });
  expect(late.meals.map((m: any) => m.recipeId)).toEqual([dish.id]);
  // Four days out the leaves are past their date too: neither is used, and nothing claims to save them.
  expect(late.meals[0].uses.map((u: string) => u.toLowerCase())).toEqual(['potatoes']);
  expect(late.meals[0].usesSoon).toEqual([]);
  expect(late.useSoonUsed).toEqual([]);
  expect(late.summary).not.toContain('before they go off');
  expect(late.summary).not.toContain('before it goes off');

  // Tomorrow, the leaves are still good: used, and said to be used in time. The fish never is.
  const soon = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { ...body, dates: [isoDate(1)] },
  });
  expect(soon.meals[0].usesSoon.map((u: string) => u.toLowerCase())).toEqual([leaf]);
  expect(soon.useSoonUsed.map((u: string) => u.toLowerCase())).toEqual([leaf]);
  expect(soon.meals[0].toBuy.map((u: string) => u.toLowerCase())).toEqual([fish]);

  // Days that have been are not planned.
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { ...body, dates: [isoDate(-1)] },
  })).toBe(400);
});

test('a cupboard plan needs something from the cupboard, and never puts a snack at lunch', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const berry = unique('snackberry');
  await cupboardAdd(hh.id, berry);
  await newRecipe(hh.id, unique('Berry pot'), [{ name: berry, qty: 100, unit: 'g' }], { section: 'SNACKS' });
  await newRecipe(hh.id, unique('Nothing in'), [{ name: unique('absentroot'), qty: 2 }], { section: 'LUNCH' });
  const draft = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { dates: [isoDate(1)], meals: ['LUNCH'], buyLimit: null, onlyMine: true, servings: 2 },
  });
  expect(draft.meals).toEqual([]);
  expect(draft.open).toEqual([{ date: isoDate(1), mealType: 'LUNCH', reason: 'NOTHING_FITS' }]);
});

test('the cupboard setup lists what wants using first and the coming week', async () => {
  const { hh } = await stockedKitchen();
  const owner = await admin();
  const setup = await call('GET', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token });
  expect(setup.items).toBe(5);
  // Salmon (fish, two days) and spinach (leaves, three) are guessed to want using soon.
  expect(setup.useSoon).toBe(2);
  expect(setup.useFirst.filter((u: any) => u.selected).map((u: any) => u.name).sort()).toEqual(['Baby spinach', 'Salmon fillets']);
  expect(setup.useFirst.find((u: any) => u.name === 'Salmon fillets')).toMatchObject({ reason: 'guess', label: 'soon' });
  expect(setup.highlights.slice(0, 2).sort()).toEqual(['Baby spinach', 'Salmon fillets']);
  expect(setup.days).toHaveLength(7);
  expect(setup.days[0].date).toBe(isoDate(0));
  expect(setup).toMatchObject({ defaultMeals: ['LUNCH', 'DINNER'], defaultBuyLimit: 5, defaultOnlyMine: true, defaultServings: 4 });
});

test('cook from the cupboard: a draft from existing recipes, cupboard first, within the buy limit', async () => {
  const { hh, curry, traybake } = await stockedKitchen();
  const owner = await admin();
  const setup = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], buyLimit: 5, onlyMine: true, servings: 2 };
  const draft = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token, body: setup });

  // The curry is all cupboard and uses the spinach; the traybake uses the salmon and needs a lemon.
  expect(draft.meals.map((m: any) => [m.date, m.mealType, m.recipeId])).toEqual([
    [isoDate(1), 'DINNER', curry.id],
    [isoDate(2), 'DINNER', traybake.id],
  ]);
  expect(draft.meals[0]).toMatchObject({ percentFromCupboard: 100, yours: true, section: 'DINNER', servings: 2, toBuy: [] });
  expect(draft.meals[1]).toMatchObject({ percentFromCupboard: 67, toBuy: ['Lemon'] });
  expect(draft.meals[1].usesSoon).toEqual(['Salmon fillets']);
  // Salt doesn't count either way; the optional coriander isn't needed.
  expect(draft.percentFromCupboard).toBe(83);
  expect(draft.toBuy.map((t: any) => t.name)).toEqual(['Lemon']);
  expect(draft.itemsUsed).toBe(5);
  expect(draft.summary).toBe('Uses 5 items, 1 to buy. Baby spinach and salmon fillets get used before they go off.');
  expect(draft.useSoonLeft).toEqual([]);
  expect(draft.open).toEqual([]);

  // Nothing to buy at all: only the curry fits, and Tuesday says nothing fits.
  const none = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { ...setup, buyLimit: 0 },
  });
  expect(none.meals.map((m: any) => m.recipeId)).toEqual([curry.id]);
  expect(none.open).toEqual([{ date: isoDate(2), mealType: 'DINNER', reason: 'NOTHING_FITS' }]);

  // A slot already on the Plan is left alone, and its recipe isn't repeated.
  await plan(hh.id, isoDate(1), 'DINNER', { recipeId: curry.id });
  const around = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token, body: setup });
  expect(around.open).toEqual([{ date: isoDate(1), mealType: 'DINNER', reason: 'PLANNED' }]);
  expect(around.meals.map((m: any) => m.recipeId)).toEqual([traybake.id]);
});

test('swapping a meal keeps the rest and moves on to the next best, until nothing else fits', async () => {
  const { hh, curry, traybake, stew } = await stockedKitchen();
  const owner = await admin();
  const setup = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], buyLimit: 5, onlyMine: true };
  const draft = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token, body: setup });
  const meals = draft.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId }));

  const swapped = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard/swap`, {
    token: owner.token, body: { setup, meals, date: isoDate(1), mealType: 'DINNER', exclude: [] },
  });
  expect(swapped.swapped).toBe(true);
  // The stew needs four things and the traybake a lemon: five, which is the limit.
  expect(swapped.meals.map((m: any) => m.recipeId)).toEqual([stew.id, traybake.id]);
  expect(swapped.toBuy).toHaveLength(5);

  // Again, having seen the curry: nothing else is a dinner, so the stew stays.
  const again = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard/swap`, {
    token: owner.token,
    body: {
      setup, date: isoDate(1), mealType: 'DINNER', exclude: [curry.id],
      meals: swapped.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId })),
    },
  });
  expect(again.swapped).toBe(false);
  expect(again.meals.map((m: any) => m.recipeId)).toEqual([stew.id, traybake.id]);
});

test('applying a draft plans its meals and puts the missing things on the grocery list, once', async () => {
  const { hh, curry, traybake } = await stockedKitchen();
  const owner = await admin();
  const setup = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], buyLimit: 5, onlyMine: true, servings: 3 };
  const draft = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token, body: setup });
  const body = {
    meals: draft.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId, servings: m.servings })),
    addToGroceries: draft.toBuy.map((t: any) => t.ingredientId),
  };
  const applied = await call('POST', `/api/households/${hh.id}/meal-plans/apply`, { token: owner.token, body });
  expect(applied).toMatchObject({ added: 2, skipped: [], groceriesAdded: 1, from: isoDate(1), to: isoDate(2) });

  const planned = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(2)}`, { token: owner.token });
  expect(planned.map((e: any) => [e.date, e.mealType, e.recipeId, e.servings])).toEqual([
    [isoDate(1), 'DINNER', curry.id, 3],
    [isoDate(2), 'DINNER', traybake.id, 3],
  ]);
  expect((await groceries(hh.id)).map((g: any) => g.name.toLowerCase())).toEqual(['lemon']);

  // Again: both slots are taken now, so nothing is planned twice, and the lemon is one lemon.
  const twice = await call('POST', `/api/households/${hh.id}/meal-plans/apply`, { token: owner.token, body });
  expect(twice.added).toBe(0);
  expect(twice.skipped.map((s: any) => s.reason)).toEqual(['PLANNED', 'PLANNED']);
  expect(await groceries(hh.id)).toHaveLength(1);
});

// ---- What a phone's Apple Intelligence chooses from, and how its choices are checked

test('candidates for a phone to choose a cupboard plan from, best first, only what the rules allow', async () => {
  const { hh, curry, traybake, stew, porridge } = await stockedKitchen();
  const owner = await admin();
  const setup = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], buyLimit: 5, onlyMine: true };
  const base = `/api/households/${hh.id}/meal-plans/cupboard`;
  const all = await call('POST', `${base}/candidates`, { token: owner.token, body: { setup } });
  expect(all.slots).toEqual([{ date: isoDate(1), mealType: 'DINNER' }, { date: isoDate(2), mealType: 'DINNER' }]);
  // No porridge for dinner; the all-cupboard curry with the spinach in it first.
  expect(all.recipes.map((r: any) => r.recipeId)).toEqual([curry.id, traybake.id, stew.id]);
  expect(all.recipes[0]).toMatchObject({ fits: ['DINNER'], percentFromCupboard: 100, yours: true, toBuy: [], usesSoon: ['Baby spinach'] });
  expect(all.recipes[1].toBuy).toEqual(['Lemon']);
  expect(all.recipes.map((r: any) => r.recipeId)).not.toContain(porridge.id);

  // One slot: with Tuesday's traybake kept and Monday's curry being swapped, only the stew is left.
  const meals = [
    { date: isoDate(1), mealType: 'DINNER', recipeId: curry.id },
    { date: isoDate(2), mealType: 'DINNER', recipeId: traybake.id },
  ];
  const one = await call('POST', `${base}/candidates`, {
    token: owner.token, body: { setup, meals, date: isoDate(1), mealType: 'DINNER' },
  });
  expect(one.slots).toEqual([{ date: isoDate(1), mealType: 'DINNER' }]);
  expect(one.recipes.map((r: any) => r.recipeId)).toEqual([stew.id]);
  expect(await statusOf('POST', `${base}/candidates`, { token: owner.token, body: { setup, date: isoDate(1) } })).toBe(400);
  const outsider = await newMember((await newHousehold()).id);
  expect(await statusOf('POST', `${base}/candidates`, { token: outsider.token, body: { setup } })).toBe(403);
});

test('a plan a phone chose goes through the same rules: allowed picks are kept, the rest get the server\'s best', async () => {
  const { hh, curry, traybake, stew, porridge } = await stockedKitchen();
  const owner = await admin();
  const setup = { dates: [isoDate(1), isoDate(2)], meals: ['DINNER'], buyLimit: 5, onlyMine: true };
  const base = `/api/households/${hh.id}/meal-plans/cupboard`;
  const chosen = await call('POST', base, {
    token: owner.token,
    body: { ...setup, chosen: [
      { date: isoDate(1), mealType: 'DINNER', recipeId: traybake.id },
      { date: isoDate(2), mealType: 'DINNER', recipeId: curry.id },
    ] },
  });
  expect(chosen.meals.map((m: any) => m.recipeId)).toEqual([traybake.id, curry.id]);
  expect(chosen.percentFromCupboard).toBe(83);

  // Porridge for dinner and a recipe from another household: refused, and filled by the server.
  const secret = await newRecipe((await newHousehold()).id, unique('Secret'), [{ name: 'beef', qty: 1, unit: 'kg' }]);
  const refused = await call('POST', base, {
    token: owner.token,
    body: { ...setup, chosen: [
      { date: isoDate(1), mealType: 'DINNER', recipeId: porridge.id },
      { date: isoDate(2), mealType: 'DINNER', recipeId: secret.id },
    ] },
  });
  expect(refused.meals.map((m: any) => m.recipeId)).toEqual([curry.id, traybake.id]);

  // A swap may name the one it wants; it is used when the rules allow it there.
  const meals = chosen.meals.map((m: any) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId }));
  const swapped = await call('POST', `${base}/swap`, {
    token: owner.token, body: { setup, meals, date: isoDate(2), mealType: 'DINNER', exclude: [], recipeId: stew.id },
  });
  expect(swapped.swapped).toBe(true);
  expect(swapped.meals.map((m: any) => m.recipeId)).toEqual([traybake.id, stew.id]);
  // The traybake is on Monday already, so naming it for Tuesday falls back to the server's next best.
  const notTwice = await call('POST', `${base}/swap`, {
    token: owner.token, body: { setup, meals, date: isoDate(2), mealType: 'DINNER', exclude: [], recipeId: traybake.id },
  });
  expect(notTwice.meals.map((m: any) => m.recipeId)).toEqual([traybake.id, stew.id]);
});

test('the cupboard setup offers a phone the things the use-soon rule cannot judge', async () => {
  const hh = await newHousehold();
  const odd = unique('zorbleberry');
  await cupboardAdd(hh.id, odd);
  await cupboardAdd(hh.id, 'salmon fillets');
  await cupboardAdd(hh.id, 'chickpeas (tin)');
  const dated = await cupboardAdd(hh.id, unique('quibblefruit'));
  await cupboardPatch(hh.id, dated.id, { useBy: isoDate(10) });
  const owner = await admin();
  const setup = await call('GET', `/api/households/${hh.id}/meal-plans/cupboard`, { token: owner.token });
  // Salmon is judged (soon), the tin keeps, the dated one has its date: only the odd one is asked about.
  expect(setup.unsure).toHaveLength(1);
  expect(setup.unsure[0]).toMatchObject({ arrivedOn: isoDate(0) });
  expect(setup.unsure[0].name.toLowerCase()).toBe(odd.toLowerCase());
  expect(setup.unsure[0].ingredientId).toBeTruthy();
});

test('only members can plan from a cupboard, and only with recipes the household can read', async () => {
  const { hh, curry } = await stockedKitchen();
  const outsider = await newMember((await newHousehold()).id);
  const setup = { dates: [isoDate(1)], meals: ['DINNER'], buyLimit: 5, onlyMine: true };
  expect(await statusOf('GET', `/api/households/${hh.id}/meal-plans/cupboard`, { token: outsider.token })).toBe(403);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token: outsider.token, body: setup })).toBe(403);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plans/apply`, {
    token: outsider.token, body: { meals: [{ date: isoDate(1), mealType: 'DINNER', recipeId: curry.id }] },
  })).toBe(403);
  expect(await statusOf('GET', `/api/households/${hh.id}/meal-plans/cupboard`)).toBe(401);

  // A member can't plan another household's private recipe through apply, and nothing is written.
  const elsewhere = await newHousehold();
  const secret = await newRecipe(elsewhere.id, unique('Secret'), [{ name: 'beef', qty: 1, unit: 'kg' }]);
  const member = await newMember(hh.id);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plans/apply`, {
    token: member.token,
    body: { meals: [
      { date: isoDate(3), mealType: 'DINNER', recipeId: curry.id },
      { date: isoDate(4), mealType: 'DINNER', recipeId: secret.id },
    ] },
  })).toBe(403);
  const owner = await admin();
  expect(await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(3)}&end=${isoDate(4)}`, { token: owner.token })).toEqual([]);
});

test('with only-my-recipes off, a published recipe can be chosen and is marked as not yours', async () => {
  const hh = await newHousehold();
  const fruit = unique('moonfruit');
  const nut = unique('starnut');
  await cupboardAdd(hh.id, fruit);
  await cupboardAdd(hh.id, nut);
  const elsewhere = await newHousehold();
  const owner = await admin();
  const theirs = await newRecipe(elsewhere.id, unique('Moon salad'), [{ name: fruit, qty: 2 }, { name: nut, qty: 50, unit: 'g' }]);
  await call('PUT', `/api/recipes/${theirs.id}/published`, { token: owner.token, body: { published: true } });

  const setup = { dates: [isoDate(1)], meals: ['DINNER'], buyLimit: 0 };
  const mine = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { ...setup, onlyMine: true },
  });
  expect(mine.meals).toEqual([]);
  const global = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, {
    token: owner.token, body: { ...setup, onlyMine: false },
  });
  expect(global.meals.map((m: any) => [m.recipeId, m.yours, m.percentFromCupboard])).toEqual([[theirs.id, false, 100]]);
});

// ---- Plans for health targets

const buildMuscle = {
  age: 20, sex: 'male', heightCm: 180.3, weightKg: 74.8, activity: 'moderate', goal: 'build-muscle',
};

test('targets are worked out from who the plan is for, and can be set by hand', async () => {
  const owner = await admin();
  const t = await call('POST', '/api/meal-plans/targets/calculate', { token: owner.token, body: buildMuscle });
  // Mifflin–St Jeor 1,780 × 1.55 × 1.15; 1.8 g/kg protein, 1 g/kg fat, the rest carbs.
  expect(t).toMatchObject({ kcal: 3170, protein: 135, carbs: 489, fat: 75, bmr: 1780, tdee: 2759, overridden: [] });

  const set = await call('POST', '/api/meal-plans/targets/calculate', {
    token: owner.token, body: { ...buildMuscle, overrides: { kcal: 2500 } },
  });
  expect(set).toMatchObject({ kcal: 2500, protein: 135, carbs: 321, fat: 75, overridden: ['kcal'] });
  expect(set.computed.kcal).toBe(3170);

  const lose = await call('POST', '/api/meal-plans/targets/calculate', {
    token: owner.token, body: { age: 30, sex: 'female', heightCm: 165, weightKg: 60, activity: 'sedentary', goal: 'lose-fat' },
  });
  expect(lose).toMatchObject({ kcal: 1270, protein: 120, fat: 35 });

  expect(lose.notes).toEqual([]);

  // A small, older woman: her whole day is 986 kcal, so the 1,200 floor would be a surplus. The
  // cut stops at maintenance, and says why.
  const small = await call('POST', '/api/meal-plans/targets/calculate', {
    token: owner.token, body: { age: 75, sex: 'female', heightCm: 150, weightKg: 42, activity: 'sedentary', goal: 'lose-fat' },
  });
  expect(small).toMatchObject({ tdee: 986, kcal: 990 });
  expect(small.notes).toEqual([expect.stringContaining("won't plan below 1,200 kcal")]);
  // Protein and fat by hand that already take more than the energy set: said plainly.
  const tight = await call('POST', '/api/meal-plans/targets/calculate', {
    token: owner.token, body: { ...buildMuscle, overrides: { kcal: 800, protein: 172, fat: 56 } },
  });
  expect(tight.carbs).toBe(0);
  expect(tight.notes).toEqual([expect.stringContaining('1,192 kcal')]);

  expect(await statusOf('POST', '/api/meal-plans/targets/calculate', { token: owner.token, body: { ...buildMuscle, goal: 'bulk' } })).toBe(400);
  expect(await statusOf('POST', '/api/meal-plans/targets/calculate', { token: owner.token, body: { ...buildMuscle, age: 12 } })).toBe(400);
  expect(await statusOf('POST', '/api/meal-plans/targets/calculate', { body: buildMuscle })).toBe(401);

  const options = await call('GET', '/api/meal-plans/options', { token: owner.token });
  expect(options.goals.map((g: any) => g.key)).toEqual(['lose-fat', 'maintain', 'build-muscle']);
  expect(options.activities.map((a: any) => a.factor)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  expect(options.preferences.filter((p: any) => p.shown).map((p: any) => p.label))
    .toEqual(['No pork', 'Dairy ok', 'Under 30 min', 'Vegetarian', 'Budget']);
});

/** A household with a week's worth of recipes that USDA data can count. Serves 1 unless said. */
async function kitchenWithNutrition() {
  const hh = await newHousehold();
  const r = async (name: string, section: string, servings: number, ingredients: any[]) =>
    newRecipe(hh.id, unique(name), ingredients, { section, servings });
  const recipes = {
    oats: await r('Protein oats', 'BREAKFAST', 1, [
      { name: 'oats', qty: 80, unit: 'g' }, { name: 'milk', qty: 250, unit: 'ml' }, { name: 'banana', qty: 1 }]),
    eggs: await r('Eggs on toast', 'BREAKFAST', 1, [
      { name: 'eggs', qty: 3 }, { name: 'bread', qty: 2, unit: 'slices' }]),
    bowl: await r('Chicken rice bowl', 'LUNCH', 1, [
      { name: 'chicken breast', qty: 200, unit: 'g' }, { name: 'rice', qty: 75, unit: 'g' }, { name: 'olive oil', qty: 1, unit: 'tbsp' }]),
    soup: await r('Lentil soup', 'LUNCH', 2, [
      { name: 'red lentils', qty: 150, unit: 'g' }, { name: 'carrots', qty: 2 }, { name: 'onion', qty: 1 }]),
    salmon: await r('Salmon and potatoes', 'DINNER', 1, [
      { name: 'salmon', qty: 180, unit: 'g' }, { name: 'potatoes', qty: 300, unit: 'g' }, { name: 'olive oil', qty: 1, unit: 'tbsp' }]),
    chilli: await r('Beef chilli', 'DINNER', 2, [
      { name: 'beef mince', qty: 400, unit: 'g' }, { name: 'kidney beans', qty: 400, unit: 'g' },
      { name: 'chopped tomatoes', qty: 400, unit: 'g' }, { name: 'onion', qty: 1 }]),
    pork: await r('Pork chops', 'DINNER', 2, [
      { name: 'pork chops', qty: 400, unit: 'g' }, { name: 'potatoes', qty: 400, unit: 'g' }]),
    yogurt: await r('Greek yogurt and honey', 'SNACKS', 1, [
      { name: 'greek yogurt', qty: 200, unit: 'g' }, { name: 'honey', qty: 1, unit: 'tbsp' }]),
  };
  return { hh, recipes };
}

const mine = { ...buildMuscle, preferences: ['no-pork'], onlyMyRecipes: true, useMyRecipesFirst: true };

test('a vegetarian plan keeps kidney beans, and leaves out recipes counted only in part', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const r = (name: string, section: string, ingredients: any[], servings = 2) =>
    newRecipe(hh.id, unique(name), ingredients, { section, servings });
  const chilli = await r('Three-bean veggie chilli', 'DINNER', [
    { name: 'kidney beans', qty: 2, unit: 'tins' }, { name: 'onion', qty: 1 }, { name: 'chopped tomatoes', qty: 400, unit: 'g' },
    { name: 'rice', qty: 200, unit: 'g' }]);
  const bacon = await r('Pea soup', 'DINNER', [
    { name: 'frozen peas', qty: 500, unit: 'g' }, { name: 'onion', qty: 1 }, { name: 'bacon', qty: 100, unit: 'g', optional: true }]);
  const pudding = await r('Strawberry thing', 'DINNER', [
    { name: 'strawberries', qty: 1, unit: 'punnet' }, { name: 'double cream', qty: 300, unit: 'ml' },
    { name: 'caster sugar', qty: 3, unit: 'heaped tsp' }], 1);
  const preview = await call('POST', `/api/households/${hh.id}/meal-plans/targets/preview`, {
    token: owner.token,
    body: { details: { ...buildMuscle, preferences: ['vegetarian'], onlyMyRecipes: true, days: 3, meals: ['DINNER'] } },
  });
  const chosen = preview.days.flatMap((d: any) => d.meals.map((m: any) => m.recipeId));
  expect(chosen).toContain(chilli.id);
  // Optional bacon is still bacon; the pudding's numbers are its cream alone.
  expect(chosen).not.toContain(bacon.id);
  expect(chosen).not.toContain(pudding.id);
  const nutrition = await call('GET', `/api/nutrition/recipes/${pudding.id}?householdId=${hh.id}`, { token: owner.token });
  expect(nutrition.highlights).not.toContain('Low carb');
});

test('a private target plan is chosen from existing recipes, near the day\'s targets, honouring preferences', async () => {
  const { hh, recipes } = await kitchenWithNutrition();
  const owner = await admin();
  const plan = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Lean bulk', details: { ...mine, days: 3, description: 'Lifting 4x a week.' } },
  });
  expect(plan).toMatchObject({
    mine: true, name: 'Lean bulk', description: 'Lifting 4x a week.', goal: 'build-muscle', goalLabel: 'Build muscle',
    length: 3, mealTypes: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], tags: ['build-muscle'], preset: null,
  });
  expect(plan.targets).toMatchObject({ kcal: 3170, protein: 135 });
  expect(plan.days).toHaveLength(3);

  const ours = new Set(Object.values(recipes).map((r: any) => r.id));
  const meals = plan.days.flatMap((d: any) => d.meals);
  expect(meals.length).toBe(12);
  for (const m of meals) {
    expect(ours.has(m.recipeId)).toBe(true);
    expect(m.yours).toBe(true);
    expect(m.missing).toBe(false);
    expect(m.recipeId).not.toBe(recipes.pork.id);
    expect([0.5, 1, 1.5, 2, 2.5, 3]).toContain(m.portion);
    expect(m.kcal).toBeGreaterThan(0);
  }
  // Breakfast recipes at breakfast, the snack at snack time.
  expect(meals.filter((m: any) => m.mealType === 'BREAKFAST').every((m: any) => m.section === 'BREAKFAST')).toBe(true);
  expect(meals.filter((m: any) => m.mealType === 'SNACK').every((m: any) => ['SNACKS', 'BREAKFAST'].includes(m.section))).toBe(true);
  expect(meals.find((m: any) => m.mealType === 'SNACK').section).toBe('SNACKS');
  // Never the same recipe twice in a day, nor the same lunch or dinner the next day (one
  // snack every day is fine: it's the only one there is).
  for (const d of plan.days) expect(new Set(d.meals.map((m: any) => m.recipeId)).size).toBe(d.meals.length);
  const daysOf = new Map<string, number[]>();
  for (const d of plan.days) {
    for (const m of d.meals) {
      if (m.mealType === 'LUNCH' || m.mealType === 'DINNER') daysOf.set(m.recipeId, [...(daysOf.get(m.recipeId) ?? []), d.day]);
    }
  }
  for (const days of daysOf.values()) for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(2);
  // Each day adds up to its meals, and the average is near the target.
  for (const d of plan.days) {
    expect(Math.abs(d.kcal - d.meals.reduce((s: number, m: any) => s + m.kcal, 0))).toBeLessThanOrEqual(d.meals.length);
  }
  expect(plan.average.kcalPercent).toBeGreaterThan(70);
  expect(plan.average.kcalPercent).toBeLessThan(130);
  expect(plan.summary).toMatch(/^About [\d,]+ kcal and \d+ g protein a day: \d+% and \d+% of the targets\. Every meal is one of your recipes\.$/);

  // Read back the same, and listed as mine.
  const again = await call('GET', `/api/households/${hh.id}/meal-plans/targets/${plan.id}`, { token: owner.token });
  expect(again.days).toEqual(plan.days);
  const list = await call('GET', `/api/households/${hh.id}/meal-plans/targets`, { token: owner.token });
  expect(list.map((c: any) => [c.id, c.name, c.kcal, c.protein, c.mine])).toEqual([[plan.id, 'Lean bulk', 3170, 135, true]]);
});

test('a target plan is private: anybody but its owner is told there is no such plan', async () => {
  const { hh } = await kitchenWithNutrition();
  const owner = await admin();
  const plan = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Mine alone', details: { ...mine, days: 2 } },
  });
  const base = `/api/households/${hh.id}/meal-plans/targets/${plan.id}`;

  // Someone else in the same house.
  const housemate = await newMember(hh.id);
  expect(await statusOf('GET', base, { token: housemate.token })).toBe(404);
  expect(await statusOf('PUT', base, { token: housemate.token, body: { name: 'Hijacked' } })).toBe(404);
  expect(await statusOf('POST', `${base}/swap`, { token: housemate.token, body: { day: 0, mealType: 'DINNER' } })).toBe(404);
  expect(await statusOf('POST', `${base}/regenerate`, { token: housemate.token })).toBe(404);
  expect(await statusOf('POST', `${base}/apply`, { token: housemate.token, body: { start: isoDate(20) } })).toBe(404);
  expect(await statusOf('DELETE', base, { token: housemate.token })).toBe(404);
  expect(await call('GET', `/api/households/${hh.id}/meal-plans/targets`, { token: housemate.token })).toEqual([]);
  const home = await call('GET', `/api/households/${hh.id}/meal-plans`, { token: housemate.token });
  expect(home.plans.some((c: any) => c.id === plan.id)).toBe(false);
  expect(home.plans.every((c: any) => !c.mine)).toBe(true);

  // Someone from another house, and nobody at all.
  const outsider = await newMember((await newHousehold()).id);
  expect(await statusOf('GET', base, { token: outsider.token })).toBe(404);
  expect(await statusOf('GET', base)).toBe(401);
  // Even the owner, asking through another of their households.
  const other = await newHousehold();
  expect(await statusOf('GET', `/api/households/${other.id}/meal-plans/targets/${plan.id}`, { token: owner.token })).toBe(404);

  // Still there, unchanged, for its owner.
  expect((await call('GET', base, { token: owner.token })).name).toBe('Mine alone');
});

test('applying a target plan puts its meals on the shared Plan from a start date; the plan stays private', async () => {
  const { hh } = await kitchenWithNutrition();
  const owner = await admin();
  const plan = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Two days', details: { ...mine, days: 2, meals: ['LUNCH', 'DINNER'] } },
  });
  const meals = plan.days.flatMap((d: any) => d.meals);
  expect(meals).toHaveLength(4);
  const base = `/api/households/${hh.id}/meal-plans/targets/${plan.id}`;

  const applied = await call('POST', `${base}/apply`, { token: owner.token, body: { start: isoDate(30), servings: 2 } });
  expect(applied).toMatchObject({ added: 4, skipped: [], from: isoDate(30), to: isoDate(31) });
  const housemate = await newMember(hh.id);
  const onPlan = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(30)}&end=${isoDate(31)}`, { token: housemate.token });
  // Cooked for two: the plan's portion for its owner, plus one serving for the other person.
  expect(onPlan.map((e: any) => [e.date, e.mealType, e.recipeId, e.servings])).toEqual(
    meals.map((m: any) => [isoDate(30 + m.day), m.mealType, m.recipeId, 1 + Math.ceil(m.portion)]));
  // Each meal says one serving's energy, so the portion behind the number can be shown.
  for (const m of meals) expect(Math.abs(m.kcal - m.kcalPerServing * m.portion)).toBeLessThanOrEqual(1);
  expect(await statusOf('GET', base, { token: housemate.token })).toBe(404);

  // Again: every slot is taken, so nothing is doubled. One day of it, elsewhere, works.
  const again = await call('POST', `${base}/apply`, { token: owner.token, body: { start: isoDate(30) } });
  expect(again.added).toBe(0);
  expect(again.skipped).toHaveLength(4);
  const oneDay = await call('POST', `${base}/apply`, { token: owner.token, body: { start: isoDate(40), days: [1] } });
  expect(oneDay).toMatchObject({ added: 2, from: isoDate(41), to: isoDate(41) });
});

test('swapping a meal in a saved plan keeps it, and nothing else changes', async () => {
  const { hh, recipes } = await kitchenWithNutrition();
  const owner = await admin();
  const plan = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'One dinner', details: { ...mine, days: 1, meals: ['BREAKFAST', 'DINNER'] } },
  });
  const base = `/api/households/${hh.id}/meal-plans/targets/${plan.id}`;
  const before = plan.days[0].meals;
  const dinner = before.find((m: any) => m.mealType === 'DINNER');

  const swapped = await call('POST', `${base}/swap`, { token: owner.token, body: { day: 0, mealType: 'DINNER' } });
  const after = swapped.days[0].meals;
  expect(after.find((m: any) => m.mealType === 'BREAKFAST')).toEqual(before.find((m: any) => m.mealType === 'BREAKFAST'));
  const newDinner = after.find((m: any) => m.mealType === 'DINNER');
  expect(newDinner.recipeId).not.toBe(dinner.recipeId);
  expect(newDinner.recipeId).not.toBe(recipes.pork.id);
  expect((await call('GET', base, { token: owner.token })).days[0].meals).toEqual(after);

  // Everything else that could go there already seen: the dinner stays as it is.
  const all = Object.values(recipes).map((r: any) => r.id).filter((id) => id !== newDinner.recipeId);
  const stuck = await call('POST', `${base}/swap`, { token: owner.token, body: { day: 0, mealType: 'DINNER', exclude: all } });
  expect(stuck.days[0].meals.find((m: any) => m.mealType === 'DINNER').recipeId).toBe(newDinner.recipeId);
  expect(await statusOf('POST', `${base}/swap`, { token: owner.token, body: { day: 5, mealType: 'DINNER' } })).toBe(400);
});

test('previews and ready-made plans are worked out fresh and never stored; a preview can be kept exactly', async () => {
  const { hh, recipes } = await kitchenWithNutrition();
  const owner = await admin();
  const home = await call('GET', `/api/households/${hh.id}/meal-plans`, { token: owner.token });
  expect(home.filters.map((f: any) => f.label)).toEqual(['All', 'Build muscle', 'Lose fat', 'Healthy', 'Budget']);
  expect(home.plans.map((c: any) => c.preset)).toEqual(['build-muscle', 'heart-healthy', 'veggie-high-protein', 'student-budget', 'lose-fat']);
  expect(home.plans[0]).toMatchObject({ name: 'The 20-year-old guy', subtitle: 'Build muscle · 7 days', kcal: 3170, protein: 135, mine: false, id: null });
  expect(home.cupboard).toMatchObject({ items: 0, useSoon: 0 });
  expect(home.form.lengths).toEqual([3, 5, 7, 14]);

  const preset = await call('GET', `/api/households/${hh.id}/meal-plans/presets/heart-healthy`, { token: owner.token });
  expect(preset).toMatchObject({ id: null, preset: 'heart-healthy', mine: false, name: 'Heart healthy', length: 7, goal: 'maintain' });
  expect(preset.days).toHaveLength(7);
  expect(await statusOf('GET', `/api/households/${hh.id}/meal-plans/presets/nope`, { token: owner.token })).toBe(404);

  const details = { ...mine, days: 2, meals: ['BREAKFAST', 'DINNER'] };
  const preview = await call('POST', `/api/households/${hh.id}/meal-plans/targets/preview`, {
    token: owner.token, body: { details },
  });
  expect(preview).toMatchObject({ id: null, mine: false, name: 'Build muscle plan' });
  expect(await call('GET', `/api/households/${hh.id}/meal-plans/targets`, { token: owner.token })).toEqual([]);

  // Swap in the preview, then keep it exactly as shown.
  const shown = preview.days.flatMap((d: any) => d.meals.map((m: any) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })));
  const swapped = await call('POST', `/api/households/${hh.id}/meal-plans/targets/preview/swap`, {
    token: owner.token, body: { details, meals: shown, day: 0, mealType: 'BREAKFAST' },
  });
  const keep = swapped.days.flatMap((d: any) => d.meals.map((m: any) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })));
  expect(keep.find((m: any) => m.day === 0 && m.mealType === 'BREAKFAST').recipeId)
    .not.toBe(shown.find((m: any) => m.day === 0 && m.mealType === 'BREAKFAST').recipeId);
  const kept = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Kept', details, meals: keep },
  });
  expect(kept.days).toEqual(swapped.days);

  // Only recipes the household can use can be kept.
  const secret = await newRecipe((await newHousehold()).id, unique('Secret'), [{ name: 'beef', qty: 1, unit: 'kg' }]);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Sneaky', details, meals: [{ day: 0, mealType: 'DINNER', recipeId: secret.id, portion: 1 }] },
  })).toBe(400);
  expect(recipes.oats.id).toBeTruthy();
});

test('changing a plan\'s details chooses again; renaming keeps the meals; deleting removes it', async () => {
  const { hh } = await kitchenWithNutrition();
  const owner = await admin();
  const plan = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, {
    token: owner.token, body: { name: 'Before', details: { ...mine, days: 2 } },
  });
  const base = `/api/households/${hh.id}/meal-plans/targets/${plan.id}`;
  const renamed = await call('PUT', base, { token: owner.token, body: { name: 'After' } });
  expect(renamed.name).toBe('After');
  expect(renamed.days).toEqual(plan.days);

  const veggie = await call('PUT', base, {
    token: owner.token, body: { details: { ...mine, days: 2, goal: 'lose-fat', preferences: ['vegetarian'], overrides: { kcal: 2000 } } },
  });
  expect(veggie.targets).toMatchObject({ kcal: 2000, overridden: ['kcal'] });
  expect(veggie.tags).toEqual(['lose-fat', 'healthy']);
  const names = veggie.days.flatMap((d: any) => d.meals.map((m: any) => m.name)).join(' ');
  expect(names).not.toMatch(/chicken|salmon|beef|pork/i);

  expect(await statusOf('PUT', base, { token: owner.token, body: { details: { ...mine, age: 10 } } })).toBe(400);
  expect(await statusOf('DELETE', base, { token: owner.token })).toBe(200);
  expect(await statusOf('GET', base, { token: owner.token })).toBe(404);
});

test('a phone chooses a target plan from candidates; the server portions it and checks every pick', async () => {
  const { hh, recipes } = await kitchenWithNutrition();
  const owner = await admin();
  const details = { ...mine, days: 2 };
  const base = `/api/households/${hh.id}/meal-plans/targets`;
  const c = await call('POST', `${base}/candidates`, { token: owner.token, body: { details } });
  expect(c).toMatchObject({ length: 2, mealTypes: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] });
  expect(c.targets).toMatchObject({ kcal: 3170, protein: 135 });
  // The day shared 25/30/35/10.
  expect(c.aims.map((a: any) => a.kcal)).toEqual([793, 951, 1110, 317]);
  const ids = c.recipes.map((r: any) => r.recipeId);
  expect(ids).not.toContain(recipes.pork.id);
  expect(ids).toEqual(expect.arrayContaining([recipes.oats.id, recipes.chilli.id, recipes.yogurt.id]));
  const chilli = c.recipes.find((r: any) => r.recipeId === recipes.chilli.id);
  expect(chilli).toMatchObject({ yours: true, fits: ['LUNCH', 'DINNER'] });
  expect(chilli.kcal).toBeGreaterThan(100);

  const preview = await call('POST', `${base}/preview`, {
    token: owner.token,
    body: { details, chosen: [
      { day: 0, mealType: 'DINNER', recipeId: recipes.chilli.id },
      { day: 0, mealType: 'LUNCH', recipeId: recipes.soup.id },
      { day: 1, mealType: 'DINNER', recipeId: recipes.pork.id },
      { day: 1, mealType: 'BREAKFAST', recipeId: recipes.chilli.id },
    ] },
  });
  const at = (day: number, meal: string) => preview.days[day].meals.find((m: any) => m.mealType === meal);
  expect(at(0, 'DINNER').recipeId).toBe(recipes.chilli.id);
  expect(at(0, 'LUNCH').recipeId).toBe(recipes.soup.id);
  expect([0.5, 1, 1.5, 2, 2.5, 3]).toContain(at(0, 'DINNER').portion);
  // No pork, and no chilli for breakfast: the server's own choices go there instead.
  expect(at(1, 'DINNER').recipeId).not.toBe(recipes.pork.id);
  expect(at(1, 'BREAKFAST').recipeId).not.toBe(recipes.chilli.id);
  expect(preview.days.flatMap((d: any) => d.meals)).toHaveLength(8);

  // Kept as the phone chose it: created, then "choose again" sends the next choice back exactly.
  const asSent = (p: any) => p.days.flatMap((d: any) => d.meals.map((m: any) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })));
  const saved = await call('POST', base, { token: owner.token, body: { name: 'Phone plan', details, meals: asSent(preview) } });
  expect(saved.days).toEqual(preview.days);
  const regenerated = await call('POST', `${base}/preview`, {
    token: owner.token, body: { details, chosen: [{ day: 0, mealType: 'DINNER', recipeId: recipes.salmon.id }] },
  });
  const updated = await call('PUT', `${base}/${saved.id}`, { token: owner.token, body: { meals: asSent(regenerated) } });
  expect(updated.days).toEqual(regenerated.days);
  expect(updated.name).toBe('Phone plan');
  expect((await call('GET', `${base}/${saved.id}`, { token: owner.token })).days).toEqual(regenerated.days);

  // A swap may name the one it wants, in a saved plan and in a preview.
  const dinnerOnly = { ...mine, days: 1, meals: ['DINNER'] };
  const one = await call('POST', base, { token: owner.token, body: { name: 'One dinner', details: dinnerOnly } });
  const current = one.days[0].meals[0].recipeId;
  const wanted = c.recipes.find((r: any) => r.fits.includes('DINNER') && r.recipeId !== current).recipeId;
  const swapped = await call('POST', `${base}/${one.id}/swap`, {
    token: owner.token, body: { day: 0, mealType: 'DINNER', recipeId: wanted },
  });
  expect(swapped.days[0].meals[0].recipeId).toBe(wanted);
  const previewSwap = await call('POST', `${base}/preview/swap`, {
    token: owner.token, body: { details: dinnerOnly, meals: asSent(swapped), day: 0, mealType: 'DINNER', recipeId: current },
  });
  expect(previewSwap.days[0].meals[0].recipeId).toBe(current);
  // Pork is never allowed, named or not.
  const noPork = await call('POST', `${base}/preview/swap`, {
    token: owner.token, body: { details: dinnerOnly, meals: asSent(swapped), day: 0, mealType: 'DINNER', recipeId: recipes.pork.id },
  });
  expect(noPork.days[0].meals[0].recipeId).not.toBe(recipes.pork.id);

  const outsider = await newMember((await newHousehold()).id);
  expect(await statusOf('POST', `${base}/candidates`, { token: outsider.token, body: { details } })).toBe(403);
});
