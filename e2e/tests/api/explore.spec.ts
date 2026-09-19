import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newMember, newRecipe, statusOf, unique } from '../../lib/api';

/**
 * Explore is server-wide on purpose, so these never assert on the whole list — other households
 * (and other tests) publish into the same place. Each test looks only for what it published.
 */
const listed = (all: any[], id: string) => all.some((r: any) => r.id === id);

const explore = async (householdId: string) => {
  const owner = await admin();
  return call('GET', `/api/households/${householdId}/explore`, { token: owner.token });
};
const publish = (recipeId: string, published: boolean, token: string) =>
  call('PUT', `/api/recipes/${recipeId}/published`, { token, body: { published } });

test('publishing puts a recipe in Explore for other households, and unpublishing takes it out', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const name = unique('Famous Chili');
  const r = await newRecipe(mine.id, name, [{ name: 'beans', qty: 2, unit: 'can' }]);

  expect(listed(await explore(theirs.id), r.id)).toBe(false);

  const published = await publish(r.id, true, owner.token);
  expect(published.published).toBe(true);

  const found = (await explore(theirs.id)).find((x: any) => x.id === r.id);
  expect(found).toMatchObject({ name, ownerName: mine.name, shared: true, section: null });

  await publish(r.id, false, owner.token);
  expect(listed(await explore(theirs.id), r.id)).toBe(false);
});

test('a published recipe can be read and saved by another household, and stays saved', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const name = unique('Travelling Stew');
  const r = await newRecipe(mine.id, name, [{ name: 'beef', qty: 1, unit: 'lb' }]);
  await publish(r.id, true, owner.token);

  // Read it without it being shared with them specifically.
  const read = await call('GET', `/api/recipes/${r.id}?householdId=${theirs.id}`, { token: owner.token });
  expect(read).toMatchObject({ name, shared: true, published: true });

  // Keep it: the same filing call "Save to my recipes" makes.
  await call('PUT', `/api/households/${theirs.id}/recipes/${r.id}/filing`, {
    token: owner.token, body: { section: 'DINNER', categories: [] },
  });
  const theirCatalog = () => call('GET', `/api/households/${theirs.id}/recipes`, { token: owner.token });
  expect((await theirCatalog()).some((x: any) => x.id === r.id)).toBe(true);

  // The owner takes it out of Explore; a household that kept it still has it.
  await publish(r.id, false, owner.token);
  expect(listed(await explore(theirs.id), r.id)).toBe(false);
  expect((await theirCatalog()).some((x: any) => x.id === r.id)).toBe(true);
  expect((await call('GET', `/api/recipes/${r.id}?householdId=${theirs.id}`, { token: owner.token })).name)
    .toBe(name);
});

test('only the household that owns a recipe can publish it', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const outsider = await newMember(theirs.id);
  const r = await newRecipe(mine.id, 'Not Yours', [{ name: 'flour', qty: 1, unit: 'cup' }]);

  expect(await statusOf('PUT', `/api/recipes/${r.id}/published`, {
    token: outsider.token, body: { published: true },
  })).toBe(403);
  expect(await statusOf('GET', `/api/recipes/${r.id}`, { token: outsider.token })).toBe(403);
});

test('publishing does not put it in anyone else’s catalog uninvited', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(mine.id, 'Optional Extra', [{ name: 'salt', qty: 1, unit: 'pinch' }]);
  await publish(r.id, true, owner.token);

  const theirCatalog = await call('GET', `/api/households/${theirs.id}/recipes`, { token: owner.token });
  expect(theirCatalog.some((x: any) => x.id === r.id)).toBe(false);
});

test('Explore searches names and ingredients', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  // Words nothing else on the server uses, so the result is only what this test published.
  const soupName = unique('Soup');
  const herb = unique('lemongrass').toLowerCase();
  const loaf = unique('sourdough').toLowerCase();
  const a = await newRecipe(mine.id, soupName, [{ name: herb, qty: 1, unit: 'stalk' }]);
  const b = await newRecipe(mine.id, unique('Toast'), [{ name: loaf, qty: 2, unit: 'slice' }]);
  await publish(a.id, true, owner.token);
  await publish(b.id, true, owner.token);

  const byName = await call('GET', `/api/households/${theirs.id}/explore?q=${encodeURIComponent(soupName)}`, { token: owner.token });
  expect(byName.map((x: any) => x.id)).toEqual([a.id]);
  const byIngredient = await call('GET', `/api/households/${theirs.id}/explore?q=${loaf}`, { token: owner.token });
  expect(byIngredient.map((x: any) => x.id)).toEqual([b.id]);
});
