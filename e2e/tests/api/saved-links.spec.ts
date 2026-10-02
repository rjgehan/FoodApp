import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  addRangeToGroceries,
  admin,
  call,
  groceries,
  isoDate,
  newHousehold,
  newMember,
  newRecipe,
  plan,
  statusOf,
  uploadImage,
} from '../../lib/api';

/*
 * Saved links: recipes kept as just a link, a name and a picture. Every link here comes with its
 * name and picture, or points at a reserved address that never resolves, so the suite never
 * reaches out to TikTok or anybody else.
 */

const COVER_JPEG = readFileSync(new URL('../fixtures/cover-8px.jpg', import.meta.url));
const REEL = 'https://www.instagram.com/reel/e2e-pasta/';
const TIKTOK = 'https://www.tiktok.com/@e2ecook/video/42';

const base = (householdId: string) => `/api/households/${householdId}/saved-links`;

async function save(householdId: string, token: string, body: Record<string, unknown>) {
  return call('POST', base(householdId), { token, body });
}

test('only the household sees its links, and a "just me" one only whoever saved it', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const partner = await newMember(hh.id);
  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  const picture = await uploadImage(hh.id, COVER_JPEG);

  const shared = await save(hh.id, owner.token, { url: REEL, name: 'Pasta bake', coverImageId: picture });
  const mine = await save(hh.id, owner.token, {
    url: TIKTOK, name: 'Secret cake', personal: true, coverImageId: await uploadImage(hh.id, COVER_JPEG),
  });
  expect(shared).toMatchObject({ name: 'Pasta bake', source: 'INSTAGRAM', personal: false, mine: true, coverImageId: picture });
  expect(mine).toMatchObject({ source: 'TIKTOK', personal: true });

  const seen = async (token: string) => (await call('GET', base(hh.id), { token })).map((l: any) => l.name);
  expect(await seen(owner.token)).toEqual(expect.arrayContaining(['Pasta bake', 'Secret cake']));
  expect(await seen(partner.token)).toEqual(['Pasta bake']);

  // Someone else's "just me" link is not there at all for the partner — a 404, not a 403.
  expect(await statusOf('PATCH', `${base(hh.id)}/${mine.id}`, { token: partner.token, body: { name: 'x' } })).toBe(404);
  expect(await statusOf('DELETE', `${base(hh.id)}/${mine.id}`, { token: partner.token })).toBe(404);
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plan/entries`, {
    token: partner.token, body: { date: isoDate(1), mealType: 'DINNER', savedLinkId: mine.id },
  })).toBe(404);

  // Outside the household: nothing, whichever way in.
  expect(await statusOf('GET', base(hh.id), { token: outsider.token })).toBe(403);
  expect(await statusOf('POST', base(hh.id), { token: outsider.token, body: { url: REEL, name: 'x' } })).toBe(403);
  expect(await statusOf('PATCH', `${base(hh.id)}/${shared.id}`, { token: outsider.token, body: { name: 'x' } })).toBe(403);
  expect(await statusOf('DELETE', `${base(hh.id)}/${shared.id}`, { token: outsider.token })).toBe(403);
  // Nor through another household's path.
  expect(await statusOf('DELETE', `${base(elsewhere.id)}/${shared.id}`, { token: owner.token })).toBe(404);
  expect(await statusOf('GET', base(hh.id))).toBe(401);

  // Only whoever saved it can hide it from everyone; anyone in the house can rename or file it.
  expect(await statusOf('PATCH', `${base(hh.id)}/${shared.id}`, { token: partner.token, body: { personal: true } })).toBe(403);
  const filed = await call('PATCH', `${base(hh.id)}/${shared.id}`, {
    token: partner.token, body: { name: '  Pasta   bake, the good one ', section: 'DINNER' },
  });
  expect(filed).toMatchObject({ name: 'Pasta bake, the good one', section: 'DINNER', mine: false });
  const unfiled = await call('PATCH', `${base(hh.id)}/${shared.id}`, { token: owner.token, body: { clearSection: true } });
  expect(unfiled.section).toBeNull();
  expect(unfiled.name).toBe('Pasta bake, the good one');

  // Only whoever saved it can delete it, and the list says so to everyone else.
  const partnerView = (await call('GET', base(hh.id), { token: partner.token })).find((l: any) => l.id === shared.id);
  expect(partnerView).toMatchObject({ mine: false, canDelete: false });
  expect((await call('GET', base(hh.id), { token: owner.token })).find((l: any) => l.id === shared.id))
    .toMatchObject({ mine: true, canDelete: true });
  expect(await statusOf('DELETE', `${base(hh.id)}/${shared.id}`, { token: partner.token })).toBe(403);
  const theirs = await save(hh.id, partner.token, { url: TIKTOK, name: 'Partner cake' });
  expect(theirs.canDelete).toBe(true);
  await call('DELETE', `${base(hh.id)}/${theirs.id}`, { token: partner.token });
  expect((await call('GET', base(hh.id), { token: partner.token })).map((l: any) => l.id)).not.toContain(theirs.id);
});

test('saving the same link again updates the one already saved', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const partner = await newMember(hh.id);

  const cover = () => uploadImage(hh.id, COVER_JPEG);
  const first = await save(hh.id, owner.token, { url: `${REEL}?igsh=first`, name: 'Pasta bake', coverImageId: await cover() });
  expect(first.url).toBe(REEL);
  // Shared again from Instagram by somebody else: another tracking code, no www, no slash.
  const again = await save(hh.id, partner.token, {
    url: 'Look! instagram.com/reel/e2e-pasta?igsh=second', section: 'DINNER',
  });
  expect(again.id).toBe(first.id);
  expect(again.alreadySaved).toBe(true);
  expect(again).toMatchObject({ name: 'Pasta bake', section: 'DINNER' });
  expect(await call('GET', base(hh.id), { token: owner.token })).toHaveLength(1);

  // A link nobody else can see is no reason to refuse theirs: they get their own.
  const hidden = await save(hh.id, owner.token, { url: TIKTOK, name: 'Mine', personal: true, coverImageId: await cover() });
  const theirs = await save(hh.id, partner.token, { url: TIKTOK, name: 'Theirs', coverImageId: await cover() });
  expect(theirs.id).not.toBe(hidden.id);
});

test('a link whose page says nothing is saved under its site, and a non-link is refused', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const saved = await save(hh.id, owner.token, { url: 'https://www.nothing.invalid/best-soup' });
  expect(saved).toMatchObject({ name: 'nothing.invalid', source: 'WEB', coverImageId: null, alreadySaved: false });

  expect(await statusOf('POST', base(hh.id), { token: owner.token, body: { url: 'javascript:alert(1)' } })).toBe(400);
  expect(await statusOf('POST', base(hh.id), { token: owner.token, body: { url: '' } })).toBe(400);
  expect(await statusOf('PATCH', `${base(hh.id)}/${saved.id}`, { token: owner.token, body: { name: '   ' } })).toBe(400);
});

test('a planned link opens from the plan and adds nothing to Groceries', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const picture = await uploadImage(hh.id, COVER_JPEG);
  const link = await save(hh.id, owner.token, { url: TIKTOK, name: 'Crispy gnocchi', coverImageId: picture });
  const soup = await newRecipe(hh.id, 'Leek soup', [{ name: 'leek', qty: 3 }]);

  const day = isoDate(2);
  const planned = await plan(hh.id, day, 'DINNER', { savedLinkId: link.id } as any);
  expect(planned).toMatchObject({
    savedLinkId: link.id,
    savedLinkName: 'Crispy gnocchi',
    savedLinkUrl: TIKTOK,
    savedLinkSource: 'TIKTOK',
    savedLinkImageId: picture,
    // For the phones from before saved links: a meal by that name, with nothing to open.
    recipeName: 'Crispy gnocchi',
    recipeId: null,
    servings: null,
    recipeDeleted: false,
  });
  // The same link twice on one meal is refused like a recipe twice.
  expect(await statusOf('POST', `/api/households/${hh.id}/meal-plan/entries`, {
    token: owner.token, body: { date: day, mealType: 'DINNER', savedLinkId: link.id },
  })).toBe(409);
  // A side alongside it is fine.
  await plan(hh.id, day, 'DINNER', { recipeId: soup.id });

  await addRangeToGroceries(hh.id, day, day);
  expect((await groceries(hh.id)).map((i: any) => i.name)).toEqual(['leek']);
  // Pressed again, and on the one meal, still nothing from the link.
  await addRangeToGroceries(hh.id, day, day);
  await call('POST', `/api/households/${hh.id}/grocery-list/add-meal/${planned.id}`, { token: owner.token });
  expect((await groceries(hh.id)).map((i: any) => i.name)).toEqual(['leek']);

  // An old phone swapping the slot for something else leaves no link behind.
  const swapped = await call('PATCH', `/api/households/${hh.id}/meal-plan/entries/${planned.id}`, {
    token: owner.token, body: { itemName: 'toast' },
  });
  expect(swapped).toMatchObject({ savedLinkId: null, itemName: 'toast', recipeName: null });
  const back = await call('PATCH', `/api/households/${hh.id}/meal-plan/entries/${planned.id}`, {
    token: owner.token, body: { savedLinkId: link.id },
  });
  expect(back).toMatchObject({ savedLinkId: link.id, itemName: null });
});

test('deleting a planned link keeps the meal on the plan by name', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const picture = await uploadImage(hh.id, COVER_JPEG);
  const link = await save(hh.id, owner.token, { url: REEL, name: 'Pasta bake', coverImageId: picture });
  const day = isoDate(1);
  await plan(hh.id, day, 'LUNCH', { savedLinkId: link.id } as any);

  await call('DELETE', `${base(hh.id)}/${link.id}`, { token: owner.token });
  expect(await call('GET', base(hh.id), { token: owner.token })).toEqual([]);
  const [entry] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${day}&end=${day}`, { token: owner.token });
  expect(entry).toMatchObject({
    recipeName: 'Pasta bake', recipeDeleted: true, savedLinkDeleted: true, savedLinkId: null, recipeId: null,
  });
  // Its picture went with it: nothing else was showing it.
  expect((await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/images/${picture}`)).status).toBe(404);
});

test('making a planned link into a recipe moves the meal to the recipe and takes the link off the list', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const picture = await uploadImage(hh.id, COVER_JPEG);
  const link = await save(hh.id, owner.token, { url: TIKTOK, name: 'Crispy gnocchi', coverImageId: picture });
  const day = isoDate(3);
  const entry = await plan(hh.id, day, 'DINNER', { savedLinkId: link.id } as any);

  const recipe = await newRecipe(hh.id, 'Crispy gnocchi', [{ name: 'gnocchi', qty: 500, unit: 'g' }], {
    coverImageId: picture,
    links: [{ url: TIKTOK, label: null }],
    savedLinkId: link.id,
  });
  expect(recipe.coverImageId).toBe(picture);
  expect(await call('GET', base(hh.id), { token: owner.token })).toEqual([]);
  const [after] = await call('GET', `/api/households/${hh.id}/meal-plan?start=${day}&end=${day}`, { token: owner.token });
  expect(after).toMatchObject({ id: entry.id, recipeId: recipe.id, savedLinkId: null, recipeDeleted: false });
  expect(after.servings).toBeGreaterThan(0);
  // The picture is the recipe's now, so it stays.
  expect((await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/images/${picture}`)).status).toBe(200);

  // Now it is a recipe, it shops like one.
  await addRangeToGroceries(hh.id, day, day);
  expect((await groceries(hh.id)).map((i: any) => i.name)).toEqual(['gnocchi']);
});

test('deleting the household takes its saved links with it', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const picture = await uploadImage(hh.id, COVER_JPEG);
  const link = await save(hh.id, owner.token, { url: REEL, name: 'Pasta bake', coverImageId: picture });
  await plan(hh.id, isoDate(1), 'DINNER', { savedLinkId: link.id } as any);

  await call('DELETE', `/api/households/${hh.id}`, { token: owner.token });
  expect((await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/images/${picture}`)).status).toBe(404);
});
