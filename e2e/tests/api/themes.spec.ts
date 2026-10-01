import { expect, test } from '@playwright/test';
import { adminByPassword, call, newHousehold, newMember, statusOf } from '../../lib/api';

/*
 * Each person's colours: kept on the server so they follow you between devices, checked on the
 * way in, and counted on the admin page so the owner can see which colours people go for.
 */

const DEFAULT = { preset: null, primary: null, secondary: null, mode: null };

test('your colours are yours, kept as you set them and tidied on the way in', async () => {
  const hh = await newHousehold();
  const me = await newMember(hh.id);
  const other = await newMember(hh.id);
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toEqual(DEFAULT);

  const saved = await call('PUT', '/api/users/me/theme', {
    token: me.token,
    body: { preset: 'custom', primary: '#0f766e', secondary: 'f97316', mode: 'dark' },
  });
  expect(saved).toEqual({ preset: 'custom', primary: '#0F766E', secondary: '#F97316', mode: 'DARK' });
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toEqual(saved);
  // Nobody else's changes.
  expect((await call('GET', '/api/users/me', { token: other.token })).theme).toEqual(DEFAULT);

  // What an older app sends to /me — a rename — leaves them alone.
  await call('PATCH', '/api/users/me', { token: me.token, body: { displayName: 'Renamed cook' } });
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toEqual(saved);

  // A preset keeps the custom pair for when they go back to it; nothing at all is the default.
  const preset = await call('PUT', '/api/users/me/theme', {
    token: me.token,
    body: { preset: 'Matcha', primary: '#0F766E', secondary: '#F97316', mode: 'SYSTEM' },
  });
  expect(preset).toEqual({ preset: 'matcha', primary: '#0F766E', secondary: '#F97316', mode: 'SYSTEM' });
  expect(await call('PUT', '/api/users/me/theme', { token: me.token, body: {} })).toEqual(DEFAULT);
});

test('an old iPhone build sending an old colour pair gets the theme it became', async () => {
  const hh = await newHousehold();
  const me = await newMember(hh.id);
  const old: Record<string, string> = {
    classic: 'tomato',
    mocha: 'tomato',
    basil: 'matcha',
    lagoon: 'matcha',
    ocean: 'blueberry',
    blueberry: 'blueberry',
    plum: 'blueberry',
    graphite: 'nordic',
  };
  for (const [key, now] of Object.entries(old)) {
    const saved = await call('PUT', '/api/users/me/theme', { token: me.token, body: { preset: key, mode: 'DARK' } });
    expect(saved, key).toEqual({ preset: now, primary: null, secondary: null, mode: 'DARK' });
    expect((await call('GET', '/api/users/me', { token: me.token })).theme.preset, key).toBe(now);
  }

  // Custom is one colour now; an old app that still expects a pair gets the colour twice.
  expect(
    await call('PUT', '/api/users/me/theme', { token: me.token, body: { preset: 'custom', primary: '#2f6f9f' } }),
  ).toEqual({ preset: 'custom', primary: '#2F6F9F', secondary: '#2F6F9F', mode: null });
});

test('a theme that is not one is refused, with a sentence saying why', async () => {
  const hh = await newHousehold();
  const me = await newMember(hh.id);
  const refused = async (body: object) => {
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/users/me/theme`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${me.token}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, message: (await res.json()).message as string };
  };

  expect(await refused({ preset: 'neon' })).toEqual({ status: 400, message: 'There\'s no theme called "neon".' });
  expect((await refused({ preset: 'custom', primary: '#FFF', secondary: '#000000' })).message).toMatch(/main colour/);
  expect((await refused({ preset: 'custom', primary: '#FFFFFF', secondary: 'red' })).message).toMatch(/second colour/);
  expect((await refused({ preset: 'custom', secondary: '#FFFFFF' })).message).toMatch(/needs its colour/);
  expect((await refused({ mode: 'sepia' })).message).toMatch(/SYSTEM, LIGHT or DARK/);
  // Nothing refused was kept.
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toEqual(DEFAULT);
  expect(await statusOf('PUT', '/api/users/me/theme', { body: { preset: 'nordic' } })).toBe(401);
});

test('the admin sees how many pick each theme; nobody else sees there is anything to see', async () => {
  const boss = await adminByPassword();
  const before = await call('GET', '/api/admin/themes', { token: boss.token });
  const hh = await newHousehold();
  const a = await newMember(hh.id);
  const b = await newMember(hh.id);
  const c = await newMember(hh.id);

  await call('PUT', '/api/users/me/theme', { token: a.token, body: { preset: 'brunch', mode: 'DARK' } });
  await call('PUT', '/api/users/me/theme', { token: b.token, body: { preset: 'brunch' } });
  await call('PUT', '/api/users/me/theme', {
    token: c.token,
    body: { preset: 'custom', primary: '#123ABC', secondary: '#FEDCBA', mode: 'LIGHT' },
  });

  const after = await call('GET', '/api/admin/themes', { token: boss.token });
  const preset = (u: any, key: string) => u.presets.find((p: any) => p.key === key)?.count ?? 0;
  const mode = (u: any, m: string) => u.modes.find((x: any) => x.mode === m)?.count ?? 0;
  const pair = (u: any) => u.custom.find((p: any) => p.primary === '#123ABC' && p.secondary === '#FEDCBA')?.count ?? 0;

  expect(after.people - before.people).toBe(3);
  expect(preset(after, 'brunch') - preset(before, 'brunch')).toBe(2);
  expect(preset(after, 'custom') - preset(before, 'custom')).toBe(1);
  expect(pair(after) - pair(before)).toBe(1);
  expect(mode(after, 'DARK') - mode(before, 'DARK')).toBe(1);
  expect(mode(after, 'LIGHT') - mode(before, 'LIGHT')).toBe(1);
  // Every preset is listed, picked or not — today's five and custom, none of the old pairs.
  expect(after.presets.map((p: any) => p.key)).toEqual(['tomato', 'matcha', 'blueberry', 'brunch', 'nordic', 'custom']);

  // And on the People tab, each person's own.
  const people = await call('GET', `/api/admin/users?q=${encodeURIComponent(c.email)}`, { token: boss.token });
  expect(people.items[0].theme).toEqual({ preset: 'custom', primary: '#123ABC', secondary: '#FEDCBA', mode: 'LIGHT' });

  // Anyone else gets the same 404 as an address that does not exist.
  expect(await statusOf('GET', '/api/admin/themes', { token: a.token })).toBe(404);
});
