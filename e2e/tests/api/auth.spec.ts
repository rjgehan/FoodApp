import { expect, test } from '@playwright/test';
import { call, legacyMember, login, newHousehold, statusOf, unique, admin } from '../../lib/api';

test.describe('sign-in', () => {
  test('an account nobody has signed into picks a PIN once, then signs in with it', async () => {
    // Made for somebody before invite links, and never used: the PIN screens still let them in.
    const hh = await newHousehold();
    const { username } = await legacyMember(hh.id, null);

    const before = await call('GET', `/api/auth/users/${username}`);
    expect(before.pinSet).toBe(false);

    await call('POST', '/api/auth/pin', { body: { username, pin: '2468' } });
    expect((await login(username, '2468')).token).toBeTruthy();

    // Choosing a PIN is a one-time thing; afterwards the endpoint must refuse.
    expect(await statusOf('POST', '/api/auth/pin', { body: { username, pin: '1111' } })).toBeGreaterThanOrEqual(400);
    expect(await statusOf('POST', '/api/auth/login', { body: { username, pin: '1111' } })).toBe(401);
  });

  test('five wrong PINs lock the account, and the right PIN is refused while locked', async () => {
    const hh = await newHousehold();
    const m = await legacyMember(hh.id, '7777');
    for (let i = 0; i < 5; i++) {
      expect(await statusOf('POST', '/api/auth/login', { body: { username: m.username, pin: '0000' } })).toBe(401);
    }
    expect(await statusOf('POST', '/api/auth/login', { body: { username: m.username, pin: '0000' } })).toBe(429);
    expect(await statusOf('POST', '/api/auth/login', { body: { username: m.username, pin: '7777' } })).toBe(429);
  });

  test('PINs must be exactly four digits', async () => {
    for (const pin of ['123', '12345', 'abcd', '']) {
      expect(await statusOf('POST', '/api/auth/login', { body: { username: 'nobody', pin } })).toBe(400);
    }
  });

  test('the first-run setup is closed once any account exists', async () => {
    const status = await statusOf('POST', '/api/auth/setup', {
      body: { householdName: 'Sneaky', username: unique('sneak'), pin: '1234' },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('refresh swaps a valid token and refuses without one', async () => {
    const a = await admin();
    const fresh = await call('POST', '/api/auth/refresh', { token: a.token });
    expect(fresh.token).toBeTruthy();
    expect(await statusOf('POST', '/api/auth/refresh')).toBe(401);
  });

  test('usernames are matched regardless of case', async () => {
    // iOS capitalises the first letter of a text field, so "Ryan" is what people will type.
    const hh = await newHousehold();
    const m = await legacyMember(hh.id, '5555');
    const capitalised = m.username[0].toUpperCase() + m.username.slice(1);
    expect((await login(capitalised, '5555')).token).toBeTruthy();
  });
});

test.describe('what the sign-in screen exposes', () => {
  test('landing lists households without signing in (by design, but worth knowing)', async () => {
    const landing = await call('GET', '/api/auth/landing');
    expect(Array.isArray(landing.households)).toBe(true);
    // Documented rather than asserted as a bug: this is what makes the tap-your-name screen work,
    // and it is also what hands household ids and usernames to anyone who loads the site.
    test.info().annotations.push({
      type: 'exposure',
      description: `${landing.households.length} households visible to anonymous callers`,
    });
  });
});
