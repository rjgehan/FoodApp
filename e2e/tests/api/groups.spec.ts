import { expect, test } from '@playwright/test';
import { admin, ApiError, call, newHousehold, newMember, newRecipe, statusOf } from '../../lib/api';

/*
 * Tags (the API still calls them recipe-categories, from when they were nested groups): flat
 * words a recipe wears inside one drawer, any number of them, each name once per drawer. The
 * drawer is required — a tag that showed in every drawer was one row, so renaming it in one
 * drawer renamed it in all of them.
 */

const base = (householdId: string) => `/api/households/${householdId}/recipe-categories`;

const tagsOf = async (householdId: string) => {
  const owner = await admin();
  return call('GET', base(householdId), { token: owner.token });
};

const inDrawer = (all: any[], section: string) =>
  all.filter((c) => c.section === section).map((c) => c.name).sort();

const tag = (all: any[], name: string, section = 'DINNER') => all.find((c) => c.name === name && c.section === section);

/** The server's own sentence for a refusal, and its status. */
async function refusal(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, message: JSON.parse(e.body).message };
    throw e;
  }
  throw new Error('expected a refusal');
}

const recipeIn = async (householdId: string, id: string) => {
  const owner = await admin();
  return call('GET', `/api/recipes/${id}?householdId=${householdId}`, { token: owner.token });
};

test('a new household starts with flat tags in every drawer', async () => {
  const hh = await newHousehold();
  const all = await tagsOf(hh.id);
  expect(inDrawer(all, 'BREAKFAST')).toEqual(['Fruit', 'Main', 'Morning drinks']);
  expect(inDrawer(all, 'LUNCH')).toEqual(['Main', 'Sandwiches', 'Side']);
  expect(inDrawer(all, 'DINNER')).toEqual(['Beef', 'Chicken', 'Full meal', 'Main', 'Pork', 'Seafood', 'Side', 'Veggie']);
  expect(inDrawer(all, 'SNACKS')).toEqual(['Savoury', 'Sweet']);
  expect(inDrawer(all, 'DRINKS')).toEqual(['Cold', 'Hot']);
  expect(inDrawer(all, 'OTHER')).toEqual(['Baking', 'Sauces & dips']);
  // Nothing nests, and nothing is in no drawer.
  expect(all.every((c: any) => c.parentId === null && c.section !== null)).toBe(true);
  expect(all.every((c: any) => c.recipeCount === 0)).toBe(true);
});

test('each drawer keeps its own "Main"', async () => {
  const hh = await newHousehold();
  const mains = (await tagsOf(hh.id)).filter((c: any) => c.name === 'Main');
  expect(mains.map((c: any) => c.section).sort()).toEqual(['BREAKFAST', 'DINNER', 'LUNCH']);
  expect(new Set(mains.map((c: any) => c.id)).size).toBe(3);
});

test('a recipe wears the tag of that name in its own drawer, and counts there', async () => {
  const hh = await newHousehold();
  const before = await tagsOf(hh.id);
  const breakfast = await newRecipe(hh.id, 'Porridge', [{ name: 'oats', qty: 1, unit: 'cup' }], {
    section: 'BREAKFAST', categories: ['Main'],
  });
  const dinner = await newRecipe(hh.id, 'Roast', [{ name: 'beef', qty: 2, unit: 'lb' }], {
    section: 'DINNER', categories: ['main', 'Beef'],
  });
  expect(breakfast.categories).toEqual(['Main']);
  // The drawer's own spelling, A to Z.
  expect(dinner.categories).toEqual(['Beef', 'Main']);

  const after = await tagsOf(hh.id);
  expect(after.length).toBe(before.length); // no new tag was invented for either
  const counts = Object.fromEntries(after.filter((c: any) => c.name === 'Main').map((c: any) => [c.section, c.recipeCount]));
  expect(counts).toEqual({ BREAKFAST: 1, LUNCH: 0, DINNER: 1 });
});

test('a name the drawer has not got becomes a tag in that drawer only', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  // Veggie is a Dinner tag. A Lunch recipe asking for it gets a Lunch Veggie of its own.
  const soup = await newRecipe(hh.id, 'Leek soup', [{ name: 'leeks', qty: 2 }], { section: 'LUNCH', categories: ['Veggie'] });
  let all = await tagsOf(hh.id);
  expect(tag(all, 'Veggie', 'LUNCH')).toMatchObject({ recipeCount: 1, parentId: null });
  expect(tag(all, 'Veggie', 'DINNER').recipeCount).toBe(0);

  // Moved to Dinner, the name is looked up again there: Dinner's Veggie, no new tag.
  const moved = await call('PUT', `/api/households/${hh.id}/recipes/${soup.id}/filing`, {
    token: owner.token, body: { section: 'DINNER', categories: ['Veggie'] },
  });
  expect(moved).toMatchObject({ section: 'DINNER', categories: ['Veggie'] });
  all = await tagsOf(hh.id);
  expect(all.filter((c: any) => c.name === 'Veggie')).toHaveLength(2);
  expect(tag(all, 'Veggie', 'DINNER').recipeCount).toBe(1);
  expect(tag(all, 'Veggie', 'LUNCH').recipeCount).toBe(0);
});

test('two drawers can have the same new tag, one drawer cannot, and the 409 says where', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const make = (name: string, section: string) => call('POST', base(hh.id), { token, body: { name, section } });
  expect(await make('Grill', 'DINNER')).toMatchObject({ name: 'Grill', section: 'DINNER', parentId: null });
  expect(await make('Grill', 'LUNCH')).toMatchObject({ name: 'Grill', section: 'LUNCH' });
  // Case and the spaces around it do not make it a different name.
  expect(await refusal(make(' grill ', 'DINNER'))).toEqual({ status: 409, message: "There's already a tag called Grill in Dinner." });
});

test('a tag needs a drawer: one asked for in no drawer is refused', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  expect(await refusal(call('POST', base(hh.id), { token, body: { name: "Grandma's" } }))).toEqual({
    status: 400,
    message: 'Pick a drawer for this tag.',
  });
  expect((await tagsOf(hh.id)).some((c: any) => c.name === "Grandma's")).toBe(false);
});

test("an old phone's split, by a parent's id alone, makes a flat tag in the parent's drawer", async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const breakfastMain = tag(await tagsOf(hh.id), 'Main', 'BREAKFAST');
  const made = await call('POST', base(hh.id), { token, body: { name: 'Pancakes', parentId: breakfastMain.id } });
  expect(made).toMatchObject({ name: 'Pancakes', section: 'BREAKFAST', parentId: null });
});

test('a tag can be made with its recipes in one request, only those filed in its drawer', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const stew = await newRecipe(hh.id, 'Stew', [{ name: 'beef', qty: 1 }], { categories: ['Beef'] });
  const chili = await newRecipe(hh.id, 'Chili', [{ name: 'beans', qty: 1 }]);
  const wrap = await newRecipe(hh.id, 'Wrap', [{ name: 'tortilla', qty: 1 }], { section: 'LUNCH' });
  const made = await call('POST', base(hh.id), {
    token, body: { name: 'Batch cook', section: 'DINNER', recipeIds: [stew.id, chili.id, wrap.id] },
  });
  expect(made).toMatchObject({ name: 'Batch cook', section: 'DINNER', recipeCount: 2 });
  expect((await recipeIn(hh.id, stew.id)).categories).toEqual(['Batch cook', 'Beef']);
  expect((await recipeIn(hh.id, chili.id)).categories).toEqual(['Batch cook']);
  // In Lunch, so skipped without a fuss.
  expect((await recipeIn(hh.id, wrap.id)).categories).toEqual([]);
});

test('PUT …/recipes tags and untags many at once, in the tag’s drawer only', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const a = await newRecipe(hh.id, 'Tacos', [{ name: 'tortillas', qty: 8 }]);
  const b = await newRecipe(hh.id, 'Omelette', [{ name: 'eggs', qty: 3 }]);
  const c = await newRecipe(hh.id, 'Toastie', [{ name: 'bread', qty: 2 }], { section: 'LUNCH' });
  const quick = await call('POST', base(hh.id), { token, body: { name: 'Quick', section: 'DINNER' } });

  const tagged = await call('PUT', `${base(hh.id)}/${quick.id}/recipes`, { token, body: { add: [a.id, b.id, c.id] } });
  expect(tagged).toMatchObject({ id: quick.id, name: 'Quick', recipeCount: 2 });
  expect((await recipeIn(hh.id, c.id)).categories).toEqual([]);

  // One in both lists ends up tagged; one only in remove comes off.
  const changed = await call('PUT', `${base(hh.id)}/${quick.id}/recipes`, { token, body: { add: [b.id], remove: [a.id, b.id] } });
  expect(changed.recipeCount).toBe(1);
  expect((await recipeIn(hh.id, a.id)).categories).toEqual([]);
  expect((await recipeIn(hh.id, b.id)).categories).toEqual(['Quick']);
  // Either list can be left out.
  expect((await call('PUT', `${base(hh.id)}/${quick.id}/recipes`, { token, body: { remove: [b.id] } })).recipeCount).toBe(0);
});

test("the old phones' move-into-group only adds the tag: fromCategoryId takes nothing off", async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Pot pie', [{ name: 'chicken', qty: 1 }], { categories: ['Main'] });
  const all = await tagsOf(hh.id);
  expect(
    await statusOf('POST', `${base(hh.id)}/${tag(all, 'Chicken').id}/recipes`, {
      token, body: { recipeIds: [r.id], fromCategoryId: tag(all, 'Main').id },
    }),
  ).toBe(200);
  expect((await recipeIn(hh.id, r.id)).categories).toEqual(['Chicken', 'Main']);
});

test('renaming is checked against its own drawer; deleting untags and leaves the recipe filed', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Chips', [{ name: 'potatoes', qty: 1 }], { categories: ['Side'] });
  const all = await tagsOf(hh.id);
  const side = tag(all, 'Side');

  // Main is taken in Dinner; Sandwiches is a Lunch tag, so Dinner may have one too.
  expect(await refusal(call('PATCH', `${base(hh.id)}/${side.id}`, { token, body: { name: 'main' } }))).toEqual({
    status: 409,
    message: "There's already a tag called Main in Dinner.",
  });
  expect(await refusal(call('PATCH', `${base(hh.id)}/${side.id}`, { token, body: { name: '  ' } }))).toEqual({
    status: 400,
    message: 'A tag needs a name.',
  });
  // What an old phone sends to move a group is ignored: a tag sits inside nothing.
  const renamed = await call('PATCH', `${base(hh.id)}/${side.id}`, {
    token, body: { name: 'Sandwiches', parentId: tag(all, 'Main').id, toTop: false },
  });
  expect(renamed).toMatchObject({ name: 'Sandwiches', section: 'DINNER', parentId: null });
  expect((await recipeIn(hh.id, r.id)).categories).toEqual(['Sandwiches']);

  expect(await statusOf('DELETE', `${base(hh.id)}/${side.id}`, { token })).toBe(200);
  expect(await recipeIn(hh.id, r.id)).toMatchObject({ section: 'DINNER', categories: [] });
  expect((await tagsOf(hh.id)).some((c: any) => c.id === side.id)).toBe(false);
});

test("another household's tag is not found here, and an outsider cannot tag", async () => {
  const hh = await newHousehold();
  const theirs = await newHousehold();
  const outsider = await newMember(theirs.id);
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'beef', qty: 1 }]);
  const mine = tag(await tagsOf(hh.id), 'Beef');
  const other = tag(await tagsOf(theirs.id), 'Beef');

  expect(await refusal(call('PUT', `${base(hh.id)}/${other.id}/recipes`, { token, body: { add: [r.id] } }))).toEqual({
    status: 404,
    message: 'Tag not found',
  });
  expect(await statusOf('PUT', `${base(hh.id)}/${mine.id}/recipes`, { token: outsider.token, body: { add: [r.id] } })).toBe(403);
  expect((await recipeIn(hh.id, r.id)).categories).toEqual([]);
});
