import { expect, test } from '@playwright/test';
import { admin, call, isoDate, newHousehold, newMember, newRecipe, setKitchen, statusOf, unique } from '../../lib/api';

/*
 * Suggestions that respect the kitchen: Meal ideas (POST /meal-ideas, for a household that does
 * not plan ahead) and every generated meal plan only offer recipes the household's machines can
 * make (KitchenMachines.missing). A kitchen that has not said what it has leaves nothing out; the
 * stovetop is in every kitchen; and two machines that do the same job — oven and air fryer, slow
 * cooker and Instant Pot, blender and food processor — are either-or when a recipe names both.
 *
 * Other tests publish recipes into the same Explore, and ideas may come from there too. A
 * household's own dinners always come before anybody else's, so these ask for more ideas than
 * they have recipes and look at their own.
 */

const ideas = async (householdId: string, body?: Record<string, unknown>) => {
  const { token } = await admin();
  return call('POST', `/api/households/${householdId}/meal-ideas`, { token, ...(body ? { body } : {}) });
};

const ids = (answer: any): string[] => answer.ideas.map((r: any) => r.id);

/** Every idea there is for a meal, best first, paged through as Shuffle does until none are new. */
async function everyIdea(householdId: string, meal: string): Promise<string[]> {
  let seen: string[] = [];
  for (let i = 0; i < 100; i++) {
    const next = ids(await ideas(householdId, { meal, count: 10, exclude: seen }));
    if (next.length === 0) break;
    seen = [...seen, ...next];
  }
  return seen;
}

/** A dinner with exactly these machines, picked by hand, and a method that names none. */
const dinner = (householdId: string, name: string, appliances: string[], section = 'DINNER') =>
  newRecipe(householdId, unique(name), [{ name: 'rice', qty: 200, unit: 'g' }], { appliances, section });

test('meal ideas are only what the kitchen can make, and either of two stand-ins will do', async () => {
  const hh = await newHousehold({ plan: false });
  await setKitchen(hh.id, { machines: ['oven', 'stovetop', 'air-fryer'] });
  const roast = await dinner(hh.id, 'Roast chicken', ['oven']);
  const chili = await dinner(hh.id, 'Chili', ['slow-cooker']);
  const wings = await dinner(hh.id, 'Wings', ['oven', 'air-fryer']);
  const pesto = await dinner(hh.id, 'Pesto pasta', ['blender', 'food-processor']);
  const pasta = await dinner(hh.id, 'Pan pasta', ['stovetop']);
  expect(chili.appliances).toEqual(['slow-cooker']);

  const answer = await ideas(hh.id, { meal: 'DINNER', count: 10 });
  expect(answer.meal).toBe('DINNER');
  // The household's own first, every one it can make, and none it can't.
  expect(ids(answer).slice(0, 3).sort()).toEqual([roast.id, wings.id, pasta.id].sort());
  expect(ids(answer)).not.toContain(chili.id);
  expect(ids(answer)).not.toContain(pesto.id);
  expect(answer.canMake).toBeGreaterThanOrEqual(3);
  expect(answer.leftOut).toBeGreaterThanOrEqual(2);
  // Each idea is the recipe as this household sees it, machines and all.
  expect(answer.ideas.find((r: any) => r.id === wings.id)).toMatchObject({ name: wings.name, appliances: ['oven', 'air-fryer'], shared: false });

  // A slow cooker arrives: the chili can be made now.
  await setKitchen(hh.id, { machines: ['oven', 'air-fryer', 'slow-cooker'] });
  expect(ids(await ideas(hh.id, { meal: 'DINNER', count: 10 }))).toContain(chili.id);
  // A food processor will do for "blender or food processor", where the blender alone was not there.
  await setKitchen(hh.id, { machines: ['food-processor'] });
  const processor = await ideas(hh.id, { meal: 'DINNER', count: 10 });
  expect(ids(processor)).toContain(pesto.id);
  // ...and the stovetop never stands in the way, ticked or not.
  expect(ids(processor)).toContain(pasta.id);
  expect(ids(processor)).not.toContain(roast.id);

  // A kitchen that has not said what is in it leaves nothing out.
  await setKitchen(hh.id, { machines: [] });
  const unknown = await ideas(hh.id, { meal: 'DINNER', count: 10 });
  expect(ids(unknown).slice(0, 5).sort()).toEqual([roast.id, chili.id, wings.id, pesto.id, pasta.id].sort());
  expect(unknown.leftOut).toBe(0);
});

test('meal ideas suit the meal, leave out what is on screen or on the list already, and are for members only', async () => {
  const hh = await newHousehold({ plan: false });
  const { token } = await admin();
  const soup = await dinner(hh.id, 'Soup', [], 'LUNCH');
  const curry = await dinner(hh.id, 'Curry', []);
  const stew = await dinner(hh.id, 'Stew', []);
  const porridge = await dinner(hh.id, 'Porridge', [], 'BREAKFAST');
  const brownies = await dinner(hh.id, 'Brownies', [], 'SNACKS');

  // No body: five dinners, the household's own dinners first.
  const plain = await ideas(hh.id);
  expect(plain.meal).toBe('DINNER');
  expect(plain.ideas.length).toBeLessThanOrEqual(5);
  expect(ids(plain).slice(0, 2).sort()).toEqual([curry.id, stew.id].sort());
  expect(ids(await ideas(hh.id, { meal: 'DINNER', count: 1 }))).toHaveLength(1);
  // A lunch will do for a dinner; breakfast and a snack won't.
  const dinners = await everyIdea(hh.id, 'DINNER');
  expect(dinners).toContain(soup.id);
  expect(dinners).not.toContain(porridge.id);
  expect(dinners).not.toContain(brownies.id);
  expect((await everyIdea(hh.id, 'BREAKFAST'))[0]).toBe(porridge.id);
  expect(await everyIdea(hh.id, 'LUNCH')).not.toContain(brownies.id);

  // The way the page swaps one: everything on screen left out.
  const swapped = await ideas(hh.id, { meal: 'DINNER', count: 1, exclude: [soup.id, curry.id] });
  expect(ids(swapped)).toEqual([stew.id]);

  // A recipe whose things are waiting on the list is being shopped for already.
  await call('POST', `/api/households/${hh.id}/grocery-list/add-recipe/${stew.id}`, { token, body: { servings: 2 } });
  expect(ids(await ideas(hh.id, { meal: 'DINNER', count: 10 }))).not.toContain(stew.id);

  // Too many asked for, or a meal that isn't one, is refused.
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-ideas`, { token, body: { count: 50 } })).toBe(400);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-ideas`, { token, body: { meal: 'SUPPER' } })).toBe(400);

  // Members only.
  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-ideas`, { token: outsider.token, body: {} })).toBe(403);
});

test('a published recipe can be an idea, after the household\'s own, and only if the kitchen can make it', async () => {
  const hh = await newHousehold({ plan: false });
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  const { token } = await admin();
  const mine = await dinner(hh.id, 'Our curry', []);
  // Somebody else's, published: one this kitchen can make (an ingredient nobody else's recipe has,
  // so it can be found among everyone's), one it can't.
  const other = await newHousehold();
  const traybake = await newRecipe(other.id, unique('Their traybake'), [{ name: unique('traybakeveg').toLowerCase(), qty: 1 }], {
    appliances: ['oven'],
  });
  const slow = await newRecipe(other.id, unique('Their slow stew'), [{ name: 'rice', qty: 1, unit: 'cup' }], {
    appliances: ['slow-cooker'],
  });
  for (const r of [traybake, slow]) await call('PUT', `/api/recipes/${r.id}/published`, { token, body: { published: true } });

  // Everything there is, so the published one is in it somewhere — after this household's own.
  const seen = await everyIdea(hh.id, 'DINNER');
  expect(seen[0]).toBe(mine.id);
  expect(seen).toContain(traybake.id);
  expect(seen).not.toContain(slow.id);
  // As this household sees it: somebody else's, in none of its drawers.
  const theirs = (await ideas(hh.id, { meal: 'DINNER', count: 10, exclude: seen.filter((id) => id !== traybake.id) })).ideas[0];
  expect(theirs).toMatchObject({ id: traybake.id, shared: true, section: null, appliances: ['oven'] });
});

const buildMuscle = { age: 20, sex: 'male', heightCm: 180.3, weightKg: 74.8, activity: 'moderate', goal: 'build-muscle' };

test('a plan for health targets never chooses a recipe the kitchen cannot make', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  const chilli = (name: string, appliances: string[]) =>
    newRecipe(hh.id, unique(name), [
      { name: 'kidney beans', qty: 2, unit: 'tins' }, { name: 'onion', qty: 1 },
      { name: 'chopped tomatoes', qty: 400, unit: 'g' }, { name: 'rice', qty: 200, unit: 'g' },
    ], { appliances, servings: 2 });
  const baked = await chilli('Baked chilli', ['oven']);
  const slow = await chilli('Slow cooker chilli', ['slow-cooker']);

  const details = { ...buildMuscle, onlyMyRecipes: true, days: 4, meals: ['DINNER'] };
  const chosen = async () => {
    const preview = await call('POST', `/api/households/${hh.id}/meal-plans/targets/preview`, { token, body: { details } });
    return preview.days.flatMap((d: any) => d.meals.map((m: any) => m.recipeId));
  };
  expect(await chosen()).toContain(baked.id);
  expect(await chosen()).not.toContain(slow.id);
  // What a phone's Apple Intelligence may choose from is the same.
  const candidates = await call('POST', `/api/households/${hh.id}/meal-plans/targets/candidates`, { token, body: { details } });
  expect(candidates.recipes.map((c: any) => c.recipeId)).toEqual([baked.id]);

  // Saved before the slow cooker went, a plan keeps its meals; choosing again leaves it out.
  await setKitchen(hh.id, { machines: ['oven', 'stovetop', 'slow-cooker'] });
  expect(await chosen()).toContain(slow.id);
  const saved = await call('POST', `/api/households/${hh.id}/meal-plans/targets`, { token, body: { name: 'Chilli week', details } });
  const savedIds = saved.days.flatMap((d: any) => d.meals.map((m: any) => m.recipeId));
  expect(savedIds).toContain(slow.id);
  await setKitchen(hh.id, { machines: ['oven', 'stovetop'] });
  const again = await call('GET', `/api/households/${hh.id}/meal-plans/targets/${saved.id}`, { token });
  expect(again.days.flatMap((d: any) => d.meals.map((m: any) => m.recipeId))).toEqual(savedIds);
  const regenerated = await call('POST', `/api/households/${hh.id}/meal-plans/targets/${saved.id}/regenerate`, { token });
  expect(regenerated.days.flatMap((d: any) => d.meals.map((m: any) => m.recipeId))).not.toContain(slow.id);
});

test('cooking from the cupboard never chooses a recipe the kitchen cannot make', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  for (const name of ['chickpeas (tin)', 'baby spinach', 'onions']) {
    await call('POST', `/api/households/${hh.id}/cupboard`, { token, body: { name } });
  }
  const curry = (name: string, appliances: string[]) =>
    newRecipe(hh.id, unique(name), [
      { name: 'chickpeas', qty: 2, unit: 'tins' }, { name: 'spinach', qty: 200, unit: 'g' }, { name: 'onions', qty: 1 },
    ], { appliances });
  const hob = await curry('Chickpea curry', ['stovetop']);
  const pot = await curry('Instant Pot curry', ['pressure-cooker']);
  await setKitchen(hh.id, { machines: ['oven', 'microwave'] });

  const setup = { dates: [isoDate(1), isoDate(2), isoDate(3)], meals: ['DINNER'], buyLimit: 5, onlyMine: true, servings: 2 };
  const draft = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token, body: setup });
  const chosen = draft.meals.map((m: any) => m.recipeId);
  expect(chosen).toContain(hob.id);
  expect(chosen).not.toContain(pot.id);

  // An Instant Pot arrives.
  await setKitchen(hh.id, { machines: ['oven', 'microwave', 'pressure-cooker'] });
  const after = await call('POST', `/api/households/${hh.id}/meal-plans/cupboard`, { token, body: setup });
  expect(after.meals.map((m: any) => m.recipeId)).toContain(pot.id);
});
