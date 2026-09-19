import { expect, test } from '@playwright/test';
import { admin, call, isoDate, newHousehold, newRecipe, plan, statusOf } from '../../lib/api';

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
  test.fail(true, 'KNOWN ISSUE: the other household’s planned meal silently disappears');
  const mine = await newHousehold();
  const theirs = await newHousehold();
  const owner = await admin();
  const r = await newRecipe(mine.id, 'Borrowed Soup', [{ name: 'leek', qty: 2 }]);
  await call('PUT', `/api/recipes/${r.id}/shares`, { token: owner.token, body: { householdIds: [theirs.id] } });
  await plan(theirs.id, isoDate(2), 'LUNCH', { recipeId: r.id });
  await call('DELETE', `/api/recipes/${r.id}`, { token: owner.token });
  const theirPlan = await call('GET', `/api/households/${theirs.id}/meal-plan?start=${isoDate(0)}&end=${isoDate(7)}`, { token: owner.token });
  // The desired behaviour is up for design (keep a copy? leave a named placeholder?); what should
  // not happen is the lunch vanishing with no trace.
  expect(theirPlan.length).toBe(1);
});
