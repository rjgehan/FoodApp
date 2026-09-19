import { expect, test } from '@playwright/test';
import { admin, call, isoDate, newHousehold, newMember, plan, statusOf, unique } from '../../lib/api';

test('household settings: sensible limits', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const settings = (defaultServings: number, planningHorizonDays: number) =>
    statusOf('PATCH', `/api/households/${hh.id}/settings`, { token: owner.token, body: { defaultServings, planningHorizonDays } });
  expect(await settings(0, 7)).toBe(400);
  expect(await settings(4, 0)).toBe(400);
  expect(await settings(4, 14)).toBe(200);
});

test('household settings: no 100000-day planning window (Plan loads that many days)', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  expect(await statusOf('PATCH', `/api/households/${hh.id}/settings`, {
    token: owner.token, body: { defaultServings: 4, planningHorizonDays: 100000 },
  })).toBe(400);
});

test('household names: blank and too long are refused cleanly', async () => {
  const owner = await admin();
  const hh = await newHousehold();
  expect(await statusOf('PATCH', `/api/households/${hh.id}/name`, { token: owner.token, body: { name: '  ' } })).toBe(400);
  expect(await statusOf('PATCH', `/api/households/${hh.id}/name`, { token: owner.token, body: { name: 'x'.repeat(61) } })).toBe(400);
});

test('creating a household with a very long name is a 400, not a 500', async () => {
  const owner = await admin();
  expect(await statusOf('POST', '/api/households', { token: owner.token, body: { name: 'x'.repeat(5000) } })).toBe(400);
});

test('the last member cannot leave', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  expect(await statusOf('DELETE', `/api/households/${hh.id}/members/me`, { token: owner.token })).toBe(409);
});

test('a member can leave when others remain, and then loses access', async () => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  expect(await statusOf('DELETE', `/api/households/${hh.id}/members/me`, { token: m.token })).toBeLessThan(300);
  expect(await statusOf('GET', `/api/households/${hh.id}/recipes`, { token: m.token })).toBe(403);
});

test('deleting a place clears the nights planned there', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const place = await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'Diner' } });
  await plan(hh.id, isoDate(2), 'LUNCH', { placeId: place.id });
  await call('DELETE', `/api/places/${place.id}`, { token: owner.token });
  const after = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(2)}&end=${isoDate(2)}`, { token: owner.token });
  expect(after).toEqual([]);
});

test('adding a place that exists (any case) returns the same place', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const a = await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'Golden Dragon' } });
  const b = await call('POST', `/api/households/${hh.id}/places`, { token: owner.token, body: { name: 'golden dragon' } });
  expect(b.id).toBe(a.id);
});

test('meal times: set, clear, and reject nonsense', async () => {
  const hh = await newHousehold();
  const owner = await admin();
  const e = await plan(hh.id, isoDate(1), 'DINNER', { itemName: 'pizza' });
  const path = `/api/households/${hh.id}/meal-plan/entries/${e.id}`;
  expect((await call('PATCH', path, { token: owner.token, body: { time: '18:30' } })).time).toBe('18:30:00');
  expect((await call('PATCH', path, { token: owner.token, body: { clearTime: true } })).time).toBeNull();
  expect(await statusOf('PATCH', path, { token: owner.token, body: { time: '25:99' } })).toBe(400);
});

test('tampered and unsigned tokens are refused', async () => {
  const { token } = await admin();
  expect(await statusOf('GET', '/api/users/me', { token: token.slice(0, -2) + 'xx' })).toBe(401);
  expect(await statusOf('GET', '/api/users/me', { token: `eyJhbGciOiJub25lIn0.${token.split('.')[1]}.` })).toBe(401);
});

test.describe('two phones at once', () => {
  test('both pressing Done shopping is not an error', async () => {
    test.fail(true, 'KNOWN BUG: the second put-away of the same item is a 500');
    // A race, so try a few rounds: one clean round proves nothing.
    const hh = await newHousehold();
    const owner = await admin();
    const statuses: number[] = [];
    for (let round = 0; round < 6; round++) {
      const it = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: owner.token, body: { ingredientName: `milk ${round}` } });
      await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${it.id}`, { token: owner.token, body: { checked: true } });
      statuses.push(...(await Promise.all([1, 2, 3].map(() =>
        statusOf('POST', `/api/households/${hh.id}/grocery-list/put-away`, { token: owner.token, body: { putAway: [it.id], leaveOut: [] } })))));
    }
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
  });

  test('a double-tapped add of a brand-new item is not an error', async () => {
    test.fail(true, 'KNOWN BUG: creating the same new ingredient twice at once hits a unique constraint (500)');
    const hh = await newHousehold();
    const owner = await admin();
    const name = unique('Brand new thing');
    const statuses = await Promise.all([1, 2, 3].map(() =>
      statusOf('POST', `/api/households/${hh.id}/cupboard`, { token: owner.token, body: { name } })));
    expect(statuses.every((s) => s < 300)).toBe(true);
  });
});
