import { expect, test } from '@playwright/test';
import { admin, call, inviteToken, loginWithEmail, newHousehold, newMember, statusOf, unique } from '../../lib/api';
import { quote, sql } from '../../lib/db';

/**
 * Invite links, the only way into somebody else's household: one live link per house, what it
 * tells a stranger, joining and signing up through it — and the owner taking somebody out.
 */

const address = (who: string) => `${unique(who).toLowerCase()}@example.com`;
const info = (token: string) => call('GET', `/api/public/invites/${token}`);
const signup = (inviteToken: string, email = address('new'), password = 'new-password') =>
  call('POST', '/api/auth/signup', { body: { inviteToken, displayName: 'Newcomer', email, password } });

test.describe('the link', () => {
  test('one per household, the same for everyone in it, until the owner makes a new one', async () => {
    const hh = await newHousehold();
    const first = await call('GET', `/api/households/${hh.id}/invite`, { token: hh.owner.token });
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    const lasts = new Date(first.expiresAt).getTime() - Date.now();
    expect(lasts).toBeGreaterThan(7 * 24 * 3600 * 1000 - 60_000);
    expect(lasts).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);

    const member = await newMember(hh.id);
    expect((await call('GET', `/api/households/${hh.id}/invite`, { token: member.token })).token).toBe(first.token);
    expect((await call('GET', `/api/households/${hh.id}/invite`, { token: hh.owner.token })).token).toBe(first.token);

    const outsider = await newMember((await newHousehold()).id);
    expect(await statusOf('GET', `/api/households/${hh.id}/invite`, { token: outsider.token })).toBe(403);
    expect(await statusOf('GET', `/api/households/${hh.id}/invite`)).toBe(401);

    // Only the owner throws it away — it breaks it for everyone it was sent to.
    expect(await statusOf('DELETE', `/api/households/${hh.id}/invite`, { token: member.token })).toBe(403);
    expect(await statusOf('DELETE', `/api/households/${hh.id}/invite`, { token: hh.owner.token })).toBe(200);
    expect((await info(first.token)).valid).toBe(false);
    expect(await statusOf('POST', `/api/invites/${first.token}/accept`, { token: outsider.token })).toBe(410);
    const second = await call('GET', `/api/households/${hh.id}/invite`, { token: member.token });
    expect(second.token).not.toBe(first.token);
    expect((await info(second.token)).valid).toBe(true);
  });

  test('tells a stranger the house, who asked and how many — and nothing else', async () => {
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const token = await inviteToken(hh.id);
    const said = await info(token);
    expect(Object.keys(said).sort()).toEqual(['householdName', 'invitedByName', 'memberCount', 'valid']);
    expect(said).toEqual({ householdName: hh.name, invitedByName: 'E2E Admin', memberCount: 2, valid: true });
    // No member names, emails or ids beyond the one who asked.
    const text = JSON.stringify(said);
    for (const leak of [member.displayName, member.email, member.username, member.userId, hh.id]) {
      expect(text).not.toContain(leak);
    }
    expect(await info('not-a-real-token')).toEqual({ householdName: null, invitedByName: null, memberCount: null, valid: false });
  });

  test('runs out after a week, and the next person to look gets a fresh one', async () => {
    const hh = await newHousehold();
    const token = await inviteToken(hh.id);
    // A week on. The clock cannot be wound on, so the link's expiry is wound back instead —
    // straight in the local dev database, the only one this suite ever touches.
    if (!sql(`UPDATE household_invites SET expires_at = now() - interval '1 minute' WHERE token = ${quote(token)}`)) {
      test.info().annotations.push({ type: 'skipped', description: 'No docker access to the dev database; expiry left to the backend tests.' });
      return;
    }
    expect((await info(token)).valid).toBe(false);
    expect(await statusOf('POST', '/api/auth/signup', { body: { inviteToken: token, displayName: 'Late', email: address('late'), password: 'late-password' } })).toBe(410);
    const outsider = await newMember((await newHousehold()).id);
    expect(await statusOf('POST', `/api/invites/${token}/accept`, { token: outsider.token })).toBe(410);
    expect(await inviteToken(hh.id)).not.toBe(token);
  });
});

test.describe('joining', () => {
  test('saying yes twice is just being in already, and the house opens next time', async () => {
    const hh = await newHousehold();
    const elsewhere = await newHousehold();
    const joiner = await newMember(elsewhere.id);
    const token = await inviteToken(hh.id);

    expect(await statusOf('POST', `/api/invites/${token}/accept`)).toBe(401);
    const joined = await call('POST', `/api/invites/${token}/accept`, { token: joiner.token });
    expect(joined).toMatchObject({ id: hh.id, name: hh.name, role: 'MEMBER', memberCount: 2 });
    expect((await call('POST', `/api/invites/${token}/accept`, { token: joiner.token })).memberCount).toBe(2);

    const members = await call('GET', `/api/households/${hh.id}/members`, { token: hh.owner.token });
    expect(members.filter((m: { userId: string }) => m.userId === joiner.userId)).toHaveLength(1);
    expect((await loginWithEmail(joiner.email, joiner.password)).lastHouseholdId).toBe(hh.id);
    // Still in the house they were already in.
    const mine = await call('GET', '/api/households', { token: joiner.token });
    expect(mine.map((h: { id: string }) => h.id).sort()).toEqual([hh.id, elsewhere.id].sort());
  });

  test('a new account needs a link that works, and lands in that house signed in', async () => {
    const hh = await newHousehold();
    const token = await inviteToken(hh.id);

    expect(await statusOf('POST', '/api/auth/signup', { body: { displayName: 'No link', email: address('nolink'), password: 'long-enough' } })).toBe(400);
    expect(await statusOf('POST', '/api/auth/signup', { body: { inviteToken: 'made-up', displayName: 'Made up', email: address('madeup'), password: 'long-enough' } })).toBe(404);

    const email = address('Fresh');
    const auth = await call('POST', '/api/auth/signup', {
      body: { inviteToken: token, displayName: '  Fresh Face ', email: `  ${email.toUpperCase()} `, password: 'fresh-password' },
    });
    expect(auth).toMatchObject({ displayName: 'Fresh Face', lastHouseholdId: hh.id });
    expect((await call('GET', '/api/users/me', { token: auth.token })).email).toBe(email);
    expect((await call('GET', '/api/households', { token: auth.token })).map((h: { id: string }) => h.id)).toEqual([hh.id]);
    expect((await loginWithEmail(email, 'fresh-password')).userId).toBe(auth.userId);

    // One account per address, however it is typed; and the usual password rule.
    const taken = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteToken: token, displayName: 'Again', email: email.replace(/^./, (c) => c.toUpperCase()), password: 'again-password' }),
    });
    expect(taken.status).toBe(409);
    expect((await taken.json()).message).toBe('That email already has an account.');
    expect(await statusOf('POST', '/api/auth/signup', { body: { inviteToken: token, displayName: 'Short', email: address('short'), password: 'short' } })).toBe(400);

    await call('DELETE', `/api/households/${hh.id}/invite`, { token: hh.owner.token });
    expect(await statusOf('POST', '/api/auth/signup', { body: { inviteToken: token, displayName: 'Late', email: address('revoked'), password: 'long-enough' } })).toBe(410);
    const members = await call('GET', `/api/households/${hh.id}/members`, { token: hh.owner.token });
    expect(members).toHaveLength(2);
  });

  test('signing up through a link counts as asked, so the owner can reset a forgotten password', async () => {
    const hh = await newHousehold();
    const auth = await signup(await inviteToken(hh.id));
    const link = await call('POST', `/api/households/${hh.id}/members/${auth.userId}/password-reset`, { token: hh.owner.token });
    expect(link.token).toBeTruthy();
  });

  test('signed in, a link says whether you are in its house already', async () => {
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const outsider = await newMember((await newHousehold()).id);
    const token = await inviteToken(hh.id);
    expect(await call('GET', `/api/invites/${token}`, { token: member.token })).toEqual({ alreadyMember: true, householdId: hh.id });
    // No house id for somebody who is not in it.
    expect(await call('GET', `/api/invites/${token}`, { token: outsider.token })).toEqual({ alreadyMember: false, householdId: null });
    expect(await statusOf('GET', `/api/invites/${token}`)).toBe(401);
    expect(await statusOf('GET', '/api/invites/not-a-real-token', { token: member.token })).toBe(404);
  });

  test('saying yes several times at once lets them in once, with no errors', async () => {
    const hh = await newHousehold();
    const joiner = await newMember((await newHousehold()).id);
    const token = await inviteToken(hh.id);
    const statuses = await Promise.all(
      Array.from({ length: 4 }, () => statusOf('POST', `/api/invites/${token}/accept`, { token: joiner.token })),
    );
    expect(statuses).toEqual([200, 200, 200, 200]);
    const members = await call('GET', `/api/households/${hh.id}/members`, { token: hh.owner.token });
    expect(members.filter((m: { userId: string }) => m.userId === joiner.userId)).toHaveLength(1);
  });

  test('an invite signup is not listed on the public name-and-PIN screens', async () => {
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const roster = await call('GET', `/api/auth/households/${hh.id}/users`);
    expect(roster.map((u: { username: string }) => u.username)).not.toContain(member.username);
    expect(roster.map((u: { displayName: string }) => u.displayName)).toContain('E2E Admin');
    // Nor, taken out of their only house, among the people in none.
    await call('DELETE', `/api/households/${hh.id}/members/${member.userId}`, { token: hh.owner.token });
    const landing = await call('GET', '/api/auth/landing');
    expect(JSON.stringify(landing)).not.toContain(member.username);
  });
});

test.describe('the owner removes someone', () => {
  test('only the owner, never themselves, and only someone who is there', async () => {
    const hh = await newHousehold();
    const member = { ...(await newMember(hh.id)), inviteSeen: await inviteToken(hh.id) };
    const other = await newMember(hh.id);
    const remove = (userId: string, token?: string) =>
      statusOf('DELETE', `/api/households/${hh.id}/members/${userId}`, { token });

    expect(await remove(other.userId)).toBe(401);
    expect(await remove(other.userId, member.token)).toBe(403);
    expect(await remove(hh.owner.userId, member.token)).toBe(403);
    expect(await remove(hh.owner.userId, hh.owner.token)).toBe(409);
    const outsider = await newMember((await newHousehold()).id);
    expect(await remove(outsider.userId, hh.owner.token)).toBe(404);
    expect(await remove('00000000-0000-0000-0000-000000000000', hh.owner.token)).toBe(404);

    expect(await remove(member.userId, hh.owner.token)).toBe(200);
    // Gone: the house turns them away, is off their list, and has one fewer in it.
    expect(await statusOf('GET', `/api/households/${hh.id}/recipes`, { token: member.token })).toBe(403);
    expect(await call('GET', '/api/households', { token: member.token })).toEqual([]);
    const list = await call('GET', '/api/households', { token: hh.owner.token });
    expect(list.find((h: { id: string }) => h.id === hh.id).memberCount).toBe(2);
    expect((await loginWithEmail(member.email, member.password)).lastHouseholdId).toBeNull();
    // Their account is theirs still, and only a link somebody sends them brings them back.
    expect(await statusOf('POST', `/api/invites/${member.inviteSeen}/accept`, { token: member.token })).toBe(410);
    expect(await statusOf('GET', `/api/households/${hh.id}/recipes`, { token: member.token })).toBe(403);
    const fresh = await inviteToken(hh.id);
    expect(fresh).not.toBe(member.inviteSeen);
    await call('POST', `/api/invites/${fresh}/accept`, { token: member.token });
    expect(await statusOf('GET', `/api/households/${hh.id}/recipes`, { token: member.token })).toBe(200);
  });

  test('the link everyone in the house could see stops working for the one taken out', async () => {
    // Anyone in a house can open its Invite card, so the person removed has the link as well.
    const hh = await newHousehold();
    const member = await newMember(hh.id);
    const seen = await inviteToken(hh.id, member);
    await call('DELETE', `/api/households/${hh.id}/members/${member.userId}`, { token: hh.owner.token });
    expect((await info(seen)).valid).toBe(false);
    expect(await statusOf('POST', `/api/invites/${seen}/accept`, { token: member.token })).toBe(410);
    expect(await call('GET', '/api/households', { token: member.token })).toEqual([]);
  });

  test('leaving yourself still works the old way', async () => {
    const hh = await newHousehold();
    const owner = await admin();
    const member = await newMember(hh.id);
    expect(await statusOf('DELETE', `/api/households/${hh.id}/members/me`, { token: member.token })).toBe(200);
    expect(await statusOf('DELETE', `/api/households/${hh.id}/members/me`, { token: owner.token })).toBe(409);
  });
});
