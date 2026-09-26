import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  admin,
  API_URL,
  call,
  inviteToken,
  isoDate,
  newHousehold,
  newMember,
  newRecipe,
  plan,
  statusOf,
  uploadImage,
  type Member,
} from '../../lib/api';

/**
 * Somebody in two households, A and B, and a third, C, that only the admin is in. The admin is
 * in every household the suite makes, so "only your own houses" is tested from this person's side.
 */
async function inTwoHouses(): Promise<{ a: string; b: string; c: string; cook: Member }> {
  const a = (await newHousehold()).id;
  const b = (await newHousehold()).id;
  const c = (await newHousehold()).id;
  const cook = await newMember(a);
  await call('POST', `/api/invites/${await inviteToken(b)}/accept`, { token: cook.token });
  return { a, b, c, cook };
}

test('a share link opens the recipe signed out, and stops when revoked', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(hh.id, 'Pancakes', [{ name: 'flour', qty: 2, unit: 'cup' }]);
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token });

  const pub = await call('GET', `/api/public/recipes/${token}`);
  expect(pub.name).toBe('Pancakes');
  expect(JSON.stringify(pub)).not.toContain(hh.id); // no household ids leak through the link

  await call('DELETE', `/api/recipes/${r.id}/link`, { token: owner.token });
  expect(await statusOf('GET', `/api/public/recipes/${token}`)).toBe(404);
});

test('sharing with a household lets them file it but not edit it', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(mine.id, 'Lasagna', [{ name: 'noodles', qty: 1, unit: 'box' }]);
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: owner.token, body: { householdIds: [theirs.id] } });

  const theirList = await call('GET', `/api/households/${theirs.id}/recipes`, { token: owner.token });
  const shared = theirList.find((x: any) => x.id === r.id);
  expect(shared).toBeTruthy();
  expect(shared.section).toBeNull();

  await call('PUT', `/api/households/${theirs.id}/recipes/${r.id}/filing`, {
    token: owner.token, body: { section: 'DINNER', categories: ['Main dish'] },
  });
  const filed = (await call('GET', `/api/households/${theirs.id}/recipes`, { token: owner.token })).find((x: any) => x.id === r.id);
  expect(filed.section).toBe('DINNER');
  // Filing in their catalog must not change how the owner filed it.
  const ownView = (await call('GET', `/api/households/${mine.id}/recipes`, { token: owner.token })).find((x: any) => x.id === r.id);
  expect(ownView.categories).toEqual([]);
});

test('deleting a shared recipe tells the other household, not just removes their plans', async () => {
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(mine.id, 'Borrowed Soup', [{ name: 'leek', qty: 2 }]);
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: owner.token, body: { householdIds: [theirs.id] } });
  await plan(mine.id, isoDate(2), 'LUNCH', { recipeId: r.id });
  await plan(theirs.id, isoDate(2), 'LUNCH', { recipeId: r.id });
  await call('DELETE', `/api/recipes/${r.id}`, { token: owner.token });
  const theirPlan = await call('GET', `/api/households/${theirs.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(7)}`, { token: owner.token });
  // What should not happen is the lunch vanishing with no trace. It stays as a named placeholder
  // marked as deleted — with no recipe id, so nothing tries to open a recipe that is gone. The
  // name rides in recipeName, so an older phone that has never heard of recipeDeleted still shows it.
  expect(theirPlan.length).toBe(1);
  expect(theirPlan[0]).toMatchObject({
    date: isoDate(2), mealType: 'LUNCH', recipeId: null, recipeName: 'Borrowed Soup', recipeDeleted: true,
  });
  // The household that deleted it was told its own meals go with it, and they do.
  const ownPlan = await call('GET', `/api/households/${mine.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(7)}`, { token: owner.token });
  expect(ownPlan).toEqual([]);

  // Changing the placeholder makes it an ordinary meal again.
  const other = await newRecipe(theirs.id, 'Own Soup', [{ name: 'carrot', qty: 3 }]);
  const changed = await call('PATCH', `/api/households/${theirs.id}/meal-plan/entries/${theirPlan[0].id}`, {
    token: owner.token, body: { recipeId: other.id },
  });
  expect(changed).toMatchObject({ recipeId: other.id, recipeName: 'Own Soup', recipeDeleted: false });
});

test('share targets are only your other households', async () => {
  const { a, b, cook } = await inTwoHouses();
  const r = await newRecipe(a, 'Curry', [{ name: 'rice', qty: 1, unit: 'cup' }]);

  const targets = await call('GET', `/api/recipes/${r.id}/share-targets`, { token: cook.token });
  // Not the recipe's own house, and not C, which this person has never been in.
  expect(targets.map((t: any) => t.householdId)).toEqual([b]);
  expect(targets[0].shared).toBe(false);

  // Somebody in only the one house has nowhere to share it.
  const solo = await newMember(a);
  expect(await call('GET', `/api/recipes/${r.id}/share-targets`, { token: solo.token })).toEqual([]);
});

test('changing shares leaves a share somebody else made alone', async () => {
  const { a, b, c, cook } = await inTwoHouses();
  const owner = await admin();
  const r = await newRecipe(a, 'Stew', [{ name: 'beef', qty: 1, unit: 'lb' }]);
  // The admin, who is in C, shares it there. The cook cannot see C at all.
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: owner.token, body: { householdIds: [c] } });

  let after = await call('PUT', `/api/recipes/${r.id}/shares`, { token: cook.token, body: { householdIds: [b] } });
  expect(after.sharedWith.sort()).toEqual([b, c].sort());

  after = await call('PUT', `/api/recipes/${r.id}/shares`, { token: cook.token, body: { householdIds: [] } });
  expect(after.sharedWith).toEqual([c]);

  // An older app sends back the whole list it was given, C included: still fine.
  after = await call('PUT', `/api/recipes/${r.id}/shares`, { token: cook.token, body: { householdIds: [c, b] } });
  expect(after.sharedWith.sort()).toEqual([b, c].sort());
  const targets = await call('GET', `/api/recipes/${r.id}/share-targets`, { token: cook.token });
  expect(targets).toEqual([expect.objectContaining({ householdId: b, shared: true })]);
});

test('sharing into a household you are not in is refused and changes nothing', async () => {
  const { a, b, cook } = await inTwoHouses();
  const r = await newRecipe(a, 'Chili', [{ name: 'beans', qty: 1, unit: 'can' }]);
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: cook.token, body: { householdIds: [b] } });

  const strangers = (await newHousehold()).id;
  expect(await statusOf('PUT', `/api/recipes/${r.id}/shares`, { token: cook.token, body: { householdIds: [b, strangers] } }))
    .toBe(403);
  // A household that does not exist gives nothing away either.
  expect(await statusOf('PUT', `/api/recipes/${r.id}/shares`, {
    token: cook.token, body: { householdIds: ['00000000-0000-0000-0000-000000000000'] },
  })).toBe(403);
  const still = await call('GET', `/api/recipes/${r.id}`, { token: cook.token });
  expect(still.sharedWith).toEqual([b]);
  // Their list never had it.
  const theirs = await call('GET', `/api/households/${strangers}/recipes`, { token: (await admin()).token });
  expect(theirs.find((x: any) => x.id === r.id)).toBeUndefined();
});

test('a public link can be saved as a copy in your own household', async () => {
  const { a, b, cook } = await inTwoHouses();
  const owner = await admin();
  const cover = await uploadImage(a, readFileSync(new URL('../fixtures/cover-8px.jpg', import.meta.url)));
  const r = await newRecipe(a, 'Shared Pie', [
    { name: 'apples', qty: 6 },
    { name: 'cream', qty: 1, unit: 'cup', optional: true },
  ], {
    description: 'Grandma’s',
    section: 'SNACKS',
    categories: ['Sweet'],
    links: [{ url: 'https://example.com/pie', label: null }],
    coverImageId: cover,
    photoIds: [cover],
  });
  const { token } = await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token });
  const path = `/api/public/recipes/${token}/save`;

  // Reading needs no account; saving does.
  expect(await statusOf('POST', path, { body: { householdId: b } })).toBe(401);
  // Only into a household you are in.
  const strangers = (await newHousehold()).id;
  expect(await statusOf('POST', path, { token: cook.token, body: { householdId: strangers } })).toBe(403);
  expect(await statusOf('POST', path, { token: cook.token, body: {} })).toBe(400);

  const copy = await call('POST', path, { token: cook.token, body: { householdId: b } });
  expect(copy.id).not.toBe(r.id);
  expect(copy.householdId).toBe(b);
  expect(copy.shared).toBe(false);
  expect(copy.name).toBe('Shared Pie');
  expect(copy.description).toBe('Grandma’s · Saved from a shared link');
  expect(copy.instructions).toBe('Cook it.\nEat it.');
  expect(copy.servings).toBe(4);
  expect(copy.links).toEqual([{ url: 'https://example.com/pie', label: null }]);
  expect(copy.ingredients.map((i: any) => [i.ingredientName, Number(i.quantity), i.optional])).toEqual([
    ['apples', 6, false],
    ['cream', 1, true],
  ]);
  // Its drawer comes along; the sender's groups, named for their kitchen, do not.
  expect(copy.section).toBe('SNACKS');
  expect(copy.categories).toEqual([]);
  // Its own pictures, so the sender tidying theirs away cannot take them from the copy.
  expect(copy.coverImageId).toBeTruthy();
  expect(copy.coverImageId).not.toBe(cover);
  expect(copy.photoIds).toEqual([copy.coverImageId]);
  expect((await fetch(`${API_URL}/api/images/${copy.coverImageId}`)).status).toBe(200);

  // It is B's own recipe now — B can edit it — and A's original is untouched.
  const inB = await call('GET', `/api/households/${b}/recipes`, { token: cook.token });
  expect(inB.find((x: any) => x.id === copy.id)?.section).toBe('SNACKS');
  const original = await call('GET', `/api/recipes/${r.id}`, { token: owner.token });
  expect(original.description).toBe('Grandma’s');
  expect(original.coverImageId).toBe(r.coverImageId);

  // Saving twice makes a second copy.
  const again = await call('POST', path, { token: cook.token, body: { householdId: b } });
  expect(again.id).not.toBe(copy.id);

  // A revoked link saves nothing.
  await call('DELETE', `/api/recipes/${r.id}/link`, { token: owner.token });
  expect(await statusOf('POST', path, { token: cook.token, body: { householdId: b } })).toBe(404);
});

test('publishing answers with the recipe still in its drawer and groups', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(hh.id, 'Pancakes', [{ name: 'flour', qty: 1, unit: 'cup' }], {
    section: 'BREAKFAST',
    categories: ['Weekend'],
  });
  // The apps put this answer back on screen and edit from it: an empty filing here would be
  // saved as Dinner with no groups by the next Edit.
  const on = await call('PUT', `/api/recipes/${r.id}/published`, { token: owner.token, body: { published: true } });
  expect(on.published).toBe(true);
  expect(on.section).toBe('BREAKFAST');
  expect(on.categories).toEqual(['Weekend']);
  const off = await call('PUT', `/api/recipes/${r.id}/published`, { token: owner.token, body: { published: false } });
  expect(off.section).toBe('BREAKFAST');
});

test('a copy of a copy says where it came from once', async () => {
  const { a, b, cook } = await inTwoHouses();
  const owner = await admin();
  const r = await newRecipe(a, 'Mum’s Lasagna', [{ name: 'noodles', qty: 1, unit: 'box' }], {
    description: 'Mum’s Sunday lasagna.',
  });
  const first = await call('POST', `/api/public/recipes/${(await call('POST', `/api/recipes/${r.id}/link`, { token: owner.token })).token}/save`, {
    token: cook.token, body: { householdId: b },
  });
  expect(first.description).toBe('Mum’s Sunday lasagna · Saved from a shared link');
  const { token } = await call('POST', `/api/recipes/${first.id}/link`, { token: cook.token });
  const second = await call('POST', `/api/public/recipes/${token}/save`, { token: cook.token, body: { householdId: a } });
  expect(second.description).toBe('Mum’s Sunday lasagna · Saved from a shared link');
});
