import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { admin, call, newHousehold, newMember, statusOf } from '../../lib/api';

/*
 * Drawer and group icons. The art is drawn twice — in the web app and in the iPhone app's asset
 * catalog — and the server keeps the list of keys it will store, so they are checked against
 * each other here: a key on one and not the others draws as nothing somewhere. The phone has
 * two lists of its own, the drawings and `FoodIcon.all`, which is what it actually looks keys up
 * in and offers in its picker, so both are checked.
 */

const webKeys = [
  ...readFileSync(new URL('../../../web/src/components/FoodIcons.tsx', import.meta.url), 'utf8')
    .matchAll(/\{ key: '([a-z-]+)', label:/g),
].map((m) => m[1]);

const iosKeys = readdirSync(new URL('../../../ios/MealPlanner/Assets.xcassets/FoodIcons/', import.meta.url))
  .filter((f) => f.endsWith('.imageset'))
  .map((f) => f.replace(/\.imageset$/, ''));

const swiftKeys = [
  ...readFileSync(new URL('../../../ios/MealPlanner/Features/FoodIcons.swift', import.meta.url), 'utf8')
    .matchAll(/FoodIcon\(key: "([a-z-]+)"/g),
].map((m) => m[1]);

test('the web and the phone draw the same icons, and the server takes every one', async () => {
  expect(webKeys.length).toBeGreaterThanOrEqual(24);
  for (const key of ['full-meal', 'meat', 'veggie', 'side']) expect(webKeys).toContain(key);
  expect([...iosKeys].sort()).toEqual([...webKeys].sort());
  // In the same order too, so the two pickers read alike.
  expect(swiftKeys).toEqual(webKeys);

  const hh = await newHousehold();
  const { token } = await admin();
  const group = await call('POST', `/api/households/${hh.id}/recipe-categories`, {
    token, body: { name: 'Every icon', section: 'DINNER' },
  });
  for (const iconKey of webKeys) {
    const saved = await call('PATCH', `/api/households/${hh.id}/recipe-categories/${group.id}`, { token, body: { iconKey } });
    expect(saved.iconKey).toBe(iconKey);
    const drawers = await call('PUT', `/api/households/${hh.id}/section-icons/LUNCH`, { token, body: { iconKey } });
    expect(drawers.LUNCH).toBe(iconKey);
  }
});

test('a group keeps its icon through edits that do not mention it', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}/recipe-categories`;

  const made = await call('POST', base, { token, body: { name: 'Tacos', section: 'DINNER', iconKey: 'taco' } });
  expect(made).toMatchObject({ name: 'Tacos', section: 'DINNER', iconKey: 'taco' });

  // What a phone from before icons sends to rename a group.
  const renamed = await call('PATCH', `${base}/${made.id}`, { token, body: { name: 'Taco night' } });
  expect(renamed).toMatchObject({ name: 'Taco night', iconKey: 'taco' });
  expect((await call('GET', base, { token })).find((c: any) => c.id === made.id).iconKey).toBe('taco');

  const cleared = await call('PATCH', `${base}/${made.id}`, { token, body: { iconKey: '' } });
  expect(cleared.iconKey).toBeNull();

  // A group made without one is a plain tile.
  const plain = await call('POST', base, { token, body: { name: 'Plain', section: 'DINNER' } });
  expect(plain.iconKey).toBeNull();
});

test('an icon nobody can draw is refused, for groups and drawers alike', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}/recipe-categories`;
  expect(await statusOf('POST', base, { token, body: { name: 'Odd', section: 'DINNER', iconKey: 'unicorn' } })).toBe(400);
  const group = await call('POST', base, { token, body: { name: 'Odd', section: 'DINNER' } });
  expect(await statusOf('PATCH', `${base}/${group.id}`, { token, body: { iconKey: 'unicorn' } })).toBe(400);
  expect(await statusOf('PUT', `/api/households/${hh.id}/section-icons/DINNER`, { token, body: { iconKey: 'unicorn' } })).toBe(400);
  // Blank still means "back to the default".
  expect(await call('PUT', `/api/households/${hh.id}/section-icons/DINNER`, { token, body: { iconKey: '' } })).toEqual({});
});

test('a new household starts with pictures on the groups that have an obvious one', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const all = await call('GET', `/api/households/${hh.id}/recipe-categories`, { token });
  const icon = (name: string) => all.find((c: any) => c.name === name && c.section === 'DINNER')?.iconKey;
  expect(icon('Full meal')).toBe('full-meal');
  expect(icon('Veggie')).toBe('veggie');
  expect(icon('Side')).toBe('side');
  expect(icon('Main')).toBeNull();
});

test('someone from another household cannot change a group icon', async () => {
  const hh = await newHousehold();
  const theirs = await newHousehold();
  const outsider = await newMember(theirs.id);
  const { token } = await admin();
  const group = (await call('GET', `/api/households/${hh.id}/recipe-categories`, { token }))[0];
  expect(await statusOf('PATCH', `/api/households/${hh.id}/recipe-categories/${group.id}`, {
    token: outsider.token, body: { iconKey: 'taco' },
  })).toBe(403);
  expect(await statusOf('PUT', `/api/households/${hh.id}/section-icons/DINNER`, {
    token: outsider.token, body: { iconKey: 'taco' },
  })).toBe(403);
});
