import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  admin,
  call,
  login,
  loginWithEmail,
  newHousehold,
  newMember,
  statusOf,
  unique,
} from '../../lib/api';

/** A fresh address per test, so reruns against the same database never collide. */
const address = (who: string) => `${unique(who).toLowerCase()}@example.com`;

test.describe('email and password', () => {
  test('a PIN account adds an email and password once, then signs in with them', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const email = address('first');

    const before = await call('GET', '/api/users/me', { token: m.token });
    expect(before).toMatchObject({ email: null, hasPassword: false, pinSet: true });

    // The first time, being signed in with the PIN is proof enough.
    const after = await call('PUT', '/api/users/me/credentials', {
      token: m.token,
      body: { email: `  ${email.toUpperCase()} `, password: 'first-password' },
    });
    expect(after).toMatchObject({ email, hasPassword: true });

    const signedIn = await loginWithEmail(` ${email.replace('example', 'EXAMPLE')} `, 'first-password');
    expect(signedIn.userId).toBe(m.userId);
    expect(signedIn.token).toBeTruthy();
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email, password: 'not-the-password' } })).toBe(401);
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email: address('nobody'), password: 'first-password' } })).toBe(401);

    // The owner can see who has moved over.
    const members = await call('GET', `/api/households/${hh.id}/members`, { token: m.token });
    expect(members.find((x: any) => x.userId === m.userId)).toMatchObject({ hasEmail: true, hasPassword: true });
    expect(members.find((x: any) => x.userId === hh.owner.userId)).toHaveProperty('hasEmail');
  });

  test('changing them afterwards needs the current password', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email: address('chg'), password: 'first-password' } });

    const newEmail = address('chg2');
    expect(await statusOf('PUT', '/api/users/me/credentials', { token: m.token, body: { email: newEmail } })).toBe(400);
    expect(
      await statusOf('PUT', '/api/users/me/credentials', { token: m.token, body: { email: newEmail, currentPassword: 'wrong-password' } }),
    ).toBe(403);
    const changed = await call('PUT', '/api/users/me/credentials', {
      token: m.token,
      body: { email: newEmail, password: 'second-password', currentPassword: 'first-password' },
    });
    expect(changed.email).toBe(newEmail);
    expect((await loginWithEmail(newEmail, 'second-password')).userId).toBe(m.userId);
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email: newEmail, password: 'first-password' } })).toBe(401);
  });

  test('passwords need 8 to 128 characters, and emails have to look like emails', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    for (const body of [
      { email: address('short'), password: 'short' },
      { email: address('long'), password: 'x'.repeat(129) },
      { email: 'not an email', password: 'long-enough' },
    ]) {
      expect(await statusOf('PUT', '/api/users/me/credentials', { token: m.token, body })).toBe(400);
    }
    expect(await call('GET', '/api/users/me', { token: m.token })).toMatchObject({ email: null, hasPassword: false });
  });

  test('an email belongs to one account, however it is typed, even when two ask at once', async () => {
    const hh = await newHousehold();
    const a = await newMember(hh.id);
    const b = await newMember(hh.id);
    const c = await newMember(hh.id);
    const email = address('taken');
    await call('PUT', '/api/users/me/credentials', { token: a.token, body: { email, password: 'password-a' } });

    for (const typed of [email.toUpperCase(), `  ${email}  `, email.replace(/^./, (x) => x.toUpperCase())]) {
      const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/users/me/credentials`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${b.token}` },
        body: JSON.stringify({ email: typed, password: 'password-b' }),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).message).toBe('That email already has an account.');
    }

    // Two accounts racing for a fresh address: exactly one of them gets it.
    const contested = address('race');
    const statuses = await Promise.all(
      [b, c].map((who) =>
        statusOf('PUT', '/api/users/me/credentials', { token: who.token, body: { email: contested, password: 'race-password' } }),
      ),
    );
    expect(statuses.sort()).toEqual([200, 409]);
  });

  test('five wrong passwords lock the address, and the right one is refused while locked', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const email = address('lock');
    await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: 'right-password' } });
    for (let i = 0; i < 5; i++) {
      expect(await statusOf('POST', '/api/auth/login/email', { body: { email, password: 'wrong-password' } })).toBe(401);
    }
    // However it is capitalised: the counter is per address, not per spelling.
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email: email.toUpperCase(), password: 'right-password' } })).toBe(429);
    // The PIN is a separate way in with its own counter.
    expect((await login(m.username, '4321')).token).toBeTruthy();
  });

  test('the admin the suite runs as can sign in either way', async () => {
    const a = await admin();
    expect((await loginWithEmail(ADMIN_EMAIL, ADMIN_PASSWORD)).userId).toBe(a.userId);
  });
});

test.describe('remembering the household', () => {
  test('signing in opens the house you were last in, or the one you tapped', async () => {
    const first = await newHousehold();
    const second = await newHousehold();
    const m = await newMember(first.id);
    await call('POST', `/api/households/${second.id}/members`, { token: second.owner.token, body: { username: m.username } });

    await call('PUT', '/api/users/me/active-household', { token: m.token, body: { householdId: second.id } });
    expect((await login(m.username, '4321')).lastHouseholdId).toBe(second.id);

    // Tapping a house on the way to your name is choosing it, and it is remembered.
    const picked = await call('POST', '/api/auth/login', { body: { username: m.username, pin: '4321', householdId: first.id } });
    expect(picked.lastHouseholdId).toBe(first.id);
    expect((await call('POST', '/api/auth/refresh', { token: picked.token })).lastHouseholdId).toBe(first.id);

    const email = address('last');
    await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: 'last-password' } });
    expect((await loginWithEmail(email, 'last-password')).lastHouseholdId).toBe(first.id);

    // Only a house you are in can be remembered; one you have left is forgotten.
    const elsewhere = await newHousehold();
    expect(await statusOf('PUT', '/api/users/me/active-household', { token: m.token, body: { householdId: elsewhere.id } })).toBe(403);
    await call('DELETE', `/api/households/${first.id}/members/me`, { token: m.token });
    expect((await loginWithEmail(email, 'last-password')).lastHouseholdId).toBeNull();
  });
});

test.describe('owner password reset', () => {
  const resetOf = (owner: string, householdId: string, userId: string) =>
    call('POST', `/api/households/${householdId}/members/${userId}/password-reset`, { token: owner });

  test('the link works once, signs them in, and says nothing more than whose it is', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const link = await resetOf(hh.owner.token, hh.id, m.userId);
    expect(link.token.length).toBeGreaterThanOrEqual(43);
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600 * 1000);

    const info = await call('GET', `/api/public/password-resets/${link.token}`);
    expect(Object.keys(info).sort()).toEqual(['displayName', 'hasEmail', 'valid']);
    expect(info).toMatchObject({ valid: true, hasEmail: false });

    // No email on the account yet, so the link has to add one.
    expect(await statusOf('POST', '/api/auth/password-reset', { body: { token: link.token, password: 'reset-password' } })).toBe(400);
    const email = address('reset');
    const auth = await call('POST', '/api/auth/password-reset', { body: { token: link.token, password: 'reset-password', email } });
    expect(auth.userId).toBe(m.userId);
    expect((await loginWithEmail(email, 'reset-password')).userId).toBe(m.userId);

    expect((await call('GET', `/api/public/password-resets/${link.token}`)).valid).toBe(false);
    expect(await statusOf('POST', '/api/auth/password-reset', { body: { token: link.token, password: 'again-password' } })).toBe(410);
    expect((await call('GET', '/api/public/password-resets/not-a-real-token')).valid).toBe(false);
    expect(await statusOf('POST', '/api/auth/password-reset', { body: { token: 'not-a-real-token', password: 'x-password' } })).toBe(404);
  });

  test('only the owner makes them, a newer link retires the older one, and they run out', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const other = await newMember(hh.id);
    const outsider = await newHousehold();

    expect(await statusOf('POST', `/api/households/${hh.id}/members/${other.userId}/password-reset`, { token: m.token })).toBe(403);
    expect(await statusOf('POST', `/api/households/${hh.id}/members/${outsider.owner.userId}/password-reset`, { token: hh.owner.token }))
      .toBeGreaterThanOrEqual(400);
    expect(await statusOf('POST', `/api/households/${hh.id}/members/${m.userId}/password-reset`)).toBe(401);

    const older = await resetOf(hh.owner.token, hh.id, m.userId);
    const newer = await resetOf(hh.owner.token, hh.id, m.userId);
    expect((await call('GET', `/api/public/password-resets/${older.token}`)).valid).toBe(false);
    expect((await call('GET', `/api/public/password-resets/${newer.token}`)).valid).toBe(true);

    // A day later. The clock cannot be wound on, so the link's expiry is wound back instead —
    // straight in the local dev database, the only one this suite ever touches.
    const hash = createHash('sha256').update(newer.token).digest('hex');
    if (!sql(`UPDATE password_resets SET expires_at = now() - interval '1 minute' WHERE token_hash = '${hash}'`)) {
      test.info().annotations.push({ type: 'skipped', description: 'No docker access to the dev database; expiry left to the backend tests.' });
      return;
    }
    expect((await call('GET', `/api/public/password-resets/${newer.token}`)).valid).toBe(false);
    expect(await statusOf('POST', '/api/auth/password-reset', { body: { token: newer.token, password: 'too-late-pw', email: address('late') } })).toBe(410);
  });
});

test.describe('nobody can take over somebody else\'s account', () => {
  test('an account with a password cannot be given a PIN by whoever finds it on the roster', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const username = unique('pwonly').toLowerCase();
    const made = await call('POST', `/api/households/${hh.id}/users`, { token: owner.token, body: { username } });
    const link = await call('POST', `/api/households/${hh.id}/members/${made.userId}/password-reset`, { token: owner.token });
    await call('POST', '/api/auth/password-reset', { body: { token: link.token, password: 'their-password', email: address('pwonly') } });

    expect(await statusOf('POST', '/api/auth/pin', { body: { username, pin: '0000' } })).toBe(409);
    const roster = await call('GET', `/api/auth/households/${hh.id}/users`);
    expect(roster.find((u: any) => u.username === username).pinSet).toBe(true);
    // And the PIN sign-in says what to use instead.
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, pin: '0000' }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/email and password/);
  });

  test('making a house and pulling somebody into it does not let you reset their password', async () => {
    const theirs = await newHousehold();
    const victim = await newMember(theirs.id);
    const victimEmail = address('victim');
    await call('PUT', '/api/users/me/credentials', { token: victim.token, body: { email: victimEmail, password: 'victim-password' } });

    const attacker = await newMember((await newHousehold()).id);
    const den = await call('POST', '/api/households', { token: attacker.token, body: { name: unique('Den') } });
    await call('POST', `/api/households/${den.id}/members`, { token: attacker.token, body: { username: victim.username } });
    expect(await statusOf('POST', `/api/households/${den.id}/members/${victim.userId}/password-reset`, { token: attacker.token })).toBe(403);
    expect((await loginWithEmail(victimEmail, 'victim-password')).userId).toBe(victim.userId);
  });

  // Somebody left in no house is the easy target: a house of the attacker's own would be the
  // only one they are in. Both ways of ending up there — the house deleted, or walking out of it.
  for (const howTheyLeft of ['their house was deleted', 'they left their only house'] as const) {
    test(`nor when ${howTheyLeft} and they are in no house at all`, async () => {
      const theirs = await newHousehold();
      const victim = await newMember(theirs.id);
      const victimEmail = address('homeless');
      await call('PUT', '/api/users/me/credentials', { token: victim.token, body: { email: victimEmail, password: 'victim-password' } });
      if (howTheyLeft === 'their house was deleted') {
        await call('DELETE', `/api/households/${theirs.id}`, { token: theirs.owner.token });
      } else {
        await call('DELETE', `/api/households/${theirs.id}/members/me`, { token: victim.token });
      }
      expect(await call('GET', '/api/households', { token: victim.token })).toEqual([]);

      const attacker = await newMember((await newHousehold()).id);
      const den = await call('POST', '/api/households', { token: attacker.token, body: { name: unique('Den') } });
      await call('POST', `/api/households/${den.id}/members`, { token: attacker.token, body: { username: victim.username } });
      expect(await statusOf('POST', `/api/households/${den.id}/members/${victim.userId}/password-reset`, { token: attacker.token })).toBe(403);
      expect((await loginWithEmail(victimEmail, 'victim-password')).userId).toBe(victim.userId);
    });
  }

  test('a reset link cannot move an account to another email', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const email = address('keep');
    await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: 'first-password' } });
    const link = await call('POST', `/api/households/${hh.id}/members/${m.userId}/password-reset`, { token: hh.owner.token });
    await call('POST', '/api/auth/password-reset', { body: { token: link.token, password: 'second-password', email: address('other') } });
    expect((await loginWithEmail(email, 'second-password')).userId).toBe(m.userId);
  });

  test('two people using one reset link at once: only one gets in', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const link = await call('POST', `/api/households/${hh.id}/members/${m.userId}/password-reset`, { token: hh.owner.token });
    const statuses = await Promise.all(
      ['racer-one-pw', 'racer-two-pw'].map((password) =>
        statusOf('POST', '/api/auth/password-reset', { body: { token: link.token, password, email: address(password) } }),
      ),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
  });

  test('a long passphrase is kept in full, past what BCrypt reads', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);
    const email = address('long');
    const passphrase = 'correct horse battery staple '.repeat(4);
    await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: passphrase } });
    expect((await loginWithEmail(email, passphrase)).userId).toBe(m.userId);
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email, password: passphrase.slice(0, 80) } })).toBe(401);
  });
});

test.describe('the name-and-PIN screens', () => {
  test('are on by default, and the landing page says so', async () => {
    // Switched off with LEGACY_PIN_LOGIN=false, which the backend tests cover (410s, empty roster):
    // this suite runs against one backend, and that backend keeps them on.
    const landing = await call('GET', '/api/auth/landing');
    expect(landing.legacyPinLogin).toBe(true);
    expect(landing.households.length).toBeGreaterThan(0);
  });
});

/** Runs SQL against the local dev Postgres. False when there is no docker to run it with. */
function sql(statement: string): boolean {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    const container = execFileSync('docker', ['compose', '-f', join(root, 'docker-compose.dev.yml'), 'ps', '-q', 'postgres'])
      .toString()
      .trim();
    if (!container) return false;
    execFileSync('docker', ['exec', container, 'psql', '-q', '-U', 'mealplanner', '-d', 'mealplanner', '-c', statement]);
    return true;
  } catch {
    return false;
  }
}
