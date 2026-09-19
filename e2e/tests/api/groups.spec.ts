import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newRecipe, statusOf } from '../../lib/api';

const groups = async (householdId: string) => {
  const owner = await admin();
  return call('GET', `/api/households/${householdId}/recipe-categories`, { token: owner.token });
};

const inDrawer = (all: any[], section: string, parentName: string | null = null) => {
  const parent = parentName ? all.find((c) => c.name === parentName && c.section === section) : null;
  return all
    .filter((c) => c.section === section && c.parentId === (parent?.id ?? null))
    .map((c) => c.name)
    .sort();
};

test('a new household starts with groups in every drawer', async () => {
  const hh = await newHousehold();
  const all = await groups(hh.id);
  expect(inDrawer(all, 'BREAKFAST')).toEqual(['Fruit', 'Main', 'Morning drinks']);
  expect(inDrawer(all, 'LUNCH')).toEqual(['Main', 'Sandwiches', 'Side']);
  expect(inDrawer(all, 'DINNER')).toEqual(['Full meal', 'Main', 'Side', 'Veggie']);
  expect(inDrawer(all, 'DINNER', 'Main')).toEqual(['Beef', 'Chicken', 'Pork', 'Seafood']);
  expect(inDrawer(all, 'SNACKS')).toEqual(['Savoury', 'Sweet']);
  expect(inDrawer(all, 'DRINKS')).toEqual(['Cold', 'Hot']);
  expect(inDrawer(all, 'OTHER')).toEqual(['Baking', 'Sauces & dips']);
  expect(all.every((c: any) => c.section !== null)).toBe(true);
});

test('each drawer keeps its own "Main"', async () => {
  const hh = await newHousehold();
  const all = await groups(hh.id);
  const mains = all.filter((c: any) => c.name === 'Main');
  expect(mains.map((c: any) => c.section).sort()).toEqual(['BREAKFAST', 'DINNER', 'LUNCH']);
  expect(new Set(mains.map((c: any) => c.id)).size).toBe(3);
});

test('a recipe joins the group of that name in its own drawer', async () => {
  const hh = await newHousehold();
  const before = await groups(hh.id);
  const breakfast = await newRecipe(hh.id, 'Porridge', [{ name: 'oats', qty: 1, unit: 'cup' }], {
    section: 'BREAKFAST', categories: ['Main'],
  });
  const dinner = await newRecipe(hh.id, 'Roast', [{ name: 'beef', qty: 2, unit: 'lb' }], {
    section: 'DINNER', categories: ['Main'],
  });
  expect(breakfast.categories).toEqual(['Main']);
  expect(dinner.categories).toEqual(['Main']);

  const after = await groups(hh.id);
  expect(after.length).toBe(before.length); // no new group was invented for either
  const counts = Object.fromEntries(
    after.filter((c: any) => c.name === 'Main').map((c: any) => [c.section, c.recipeCount]),
  );
  expect(counts).toEqual({ BREAKFAST: 1, LUNCH: 0, DINNER: 1 });
});

test('two drawers can be given the same new group name, one drawer cannot', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const make = (name: string, section: string | null, parentId?: string) =>
    statusOf('POST', `/api/households/${hh.id}/recipe-categories`, {
      token: owner.token, body: { name, section, parentId },
    });
  expect(await make('Grill', 'DINNER')).toBe(200);
  expect(await make('Grill', 'LUNCH')).toBe(200);
  expect(await make('Grill', 'DINNER')).toBe(409);
});

test('a group made inside another joins that drawer', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const all = await groups(hh.id);
  const breakfastMain = all.find((c: any) => c.name === 'Main' && c.section === 'BREAKFAST');
  const made = await call('POST', `/api/households/${hh.id}/recipe-categories`, {
    token: owner.token, body: { name: 'Pancakes', parentId: breakfastMain.id },
  });
  expect(made).toMatchObject({ name: 'Pancakes', section: 'BREAKFAST', parentId: breakfastMain.id });
});

test('a group with no drawer shows in every drawer', async () => {
  // What every group made before drawers existed is, so old households keep working.
  const hh = await newHousehold();
  const owner = await admin();
  const made = await call('POST', `/api/households/${hh.id}/recipe-categories`, {
    token: owner.token, body: { name: "Grandma's" },
  });
  expect(made.section).toBeNull();
  const r = await newRecipe(hh.id, 'Trifle', [{ name: 'cream', qty: 1 }], { section: 'SNACKS', categories: ["Grandma's"] });
  expect(r.categories).toEqual(["Grandma's"]);
  // Still one group, not one per drawer.
  expect((await groups(hh.id)).filter((c: any) => c.name === "Grandma's")).toHaveLength(1);
});
