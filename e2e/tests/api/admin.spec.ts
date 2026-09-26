import { expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  API_URL,
  admin,
  adminByPassword,
  call,
  inviteToken,
  legacyMember,
  newHousehold,
  newMember,
  newRecipe,
  statusOf,
  unique,
  type Session,
} from '../../lib/api';

/*
 * The read-only admin pages. `npm run reset` starts the backend with the e2e account as the admin
 * (ADMIN_EMAILS / ADMIN_USERNAMES in scripts/reset-local.sh), and with e2e-reserved@example.com
 * as a second admin address that no e2e account has the username for.
 */
const RESERVED_EMAIL = 'e2e-reserved@example.com';

const adminPaths = (householdId: string, recipeId: string) => [
  '/api/admin/overview',
  '/api/admin/households',
  `/api/admin/households/${householdId}`,
  '/api/admin/users',
  '/api/admin/recipes?q=a',
  `/api/admin/recipes/${recipeId}`,
];

/** The raw answer, for comparing refusals byte for byte (less the clock and the address). */
async function rawGet(path: string, token: string, method = 'GET') {
  const res = await fetch(API_URL + path, { method, headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  let shape: string[] = [];
  try {
    shape = Object.keys(JSON.parse(text)).sort();
  } catch {
    // Not JSON: compared as an empty shape, which a JSON 404 would not match.
  }
  return { status: res.status, shape };
}

test.describe('who is the admin', () => {
  test('me says admin only for the configured account', async () => {
    const me = await call('GET', '/api/users/me', { token: (await adminByPassword()).token });
    expect(me).toMatchObject({ email: ADMIN_EMAIL, admin: true });

    const hh = await newHousehold();
    const m = await newMember(hh.id);
    expect((await call('GET', '/api/users/me', { token: m.token })).admin).toBe(false);
  });

  test('anyone else gets the 404 an address that does not exist gets, on every admin endpoint', async () => {
    const hh = await newHousehold();
    const recipe = await newRecipe(hh.id, unique('Secret stew'), [{ name: 'salt', qty: 1 }]);
    const member = await newMember(hh.id);
    const pinOnly = await legacyMember(hh.id);
    const nowhere = await rawGet('/api/not-a-real-address', member.token);
    expect(nowhere.status).toBe(404);

    for (const who of [member, pinOnly] as Session[]) {
      for (const path of adminPaths(hh.id, recipe.id)) {
        expect(await rawGet(path, who.token), `${path} for a non-admin`).toEqual(nowhere);
      }
      // Other methods too: a 405 would say the address is real.
      for (const method of ['POST', 'PUT', 'DELETE']) {
        expect(await rawGet('/api/admin/overview', who.token, method), `${method} for a non-admin`).toEqual(nowhere);
      }
      expect(await rawGet('/api/admin', who.token)).toEqual(nowhere);
    }

    // Spelled so the raw address does not start /api/admin, though it routes there all the same.
    for (const path of ['/api/%61dmin/overview', '/api/%61dmin/nope', '/api/Admin/overview', '/api/admin;x=1/overview']) {
      const got = await rawGet(path, member.token);
      // The server's firewall may refuse some spellings outright; what matters is never a real answer.
      if (got.status === 400) continue;
      expect(got, `${path} for a non-admin`).toEqual(nowhere);
    }
    expect(await rawGet('/api/%61dmin/overview', member.token, 'POST')).toEqual(nowhere);

    // Signed out: the 401 any other signed-out request gets.
    expect(await statusOf('GET', '/api/admin/overview')).toBe(401);
    // And the admin is simply read-only: writing is not a thing here even for them.
    expect(await statusOf('DELETE', `/api/admin/households/${hh.id}`, { token: (await adminByPassword()).token })).toBe(405);
  });

  test("the admin's own PIN does not open the admin pages, and refreshing does not change that", async () => {
    // Four digits the family may know are enough for your own house, not for every house.
    const hh = await newHousehold();
    const recipe = await newRecipe(hh.id, unique('Pin stew'), [{ name: 'salt', qty: 1 }]);
    const byPin = await admin();
    const nowhere = await rawGet('/api/not-a-real-address', byPin.token);

    const me = await call('GET', '/api/users/me', { token: byPin.token });
    expect(me).toMatchObject({ email: ADMIN_EMAIL, hasPassword: true, pinSet: true, admin: false });
    for (const path of adminPaths(hh.id, recipe.id)) {
      expect(await rawGet(path, byPin.token), `${path} by PIN`).toEqual(nowhere);
    }

    const refreshed = await call('POST', '/api/auth/refresh', { token: byPin.token });
    expect(await rawGet('/api/admin/overview', refreshed.token)).toEqual(nowhere);

    // Signed in with the password, the same account gets in — and keeps getting in after a refresh.
    const byPassword = await adminByPassword();
    expect((await rawGet('/api/admin/overview', byPassword.token)).status).toBe(200);
    const kept = await call('POST', '/api/auth/refresh', { token: byPassword.token });
    expect((await rawGet('/api/admin/overview', kept.token)).status).toBe(200);
    expect((await call('GET', '/api/users/me', { token: kept.token })).admin).toBe(true);
  });
});

test.describe('the admin email is reserved', () => {
  test('nobody else can put it on their account, sign up with it, or take the admin username', async () => {
    const hh = await newHousehold();
    const m = await newMember(hh.id);

    let refused = await fetch(`${API_URL}/api/users/me/credentials`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${m.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: ` ${RESERVED_EMAIL.toUpperCase()} `, currentPassword: m.password }),
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).message).toBe('That email is reserved.');

    refused = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inviteToken: await inviteToken(hh.id),
        displayName: 'Squatter',
        email: RESERVED_EMAIL,
        password: 'squatter-password',
      }),
    });
    expect(refused.status).toBe(409);

    // A PIN account adding its first email goes through the same check.
    const pinOnly = await legacyMember(hh.id);
    expect(
      await statusOf('PUT', '/api/users/me/credentials', {
        token: pinOnly.token,
        body: { email: RESERVED_EMAIL, password: 'long-enough-password' },
      }),
    ).toBe(409);

    // Half of the admin's key is the username: not something to rename yourself to.
    expect(await statusOf('PATCH', '/api/users/me', { token: m.token, body: { username: 'E2E-Admin' } })).toBe(409);
    expect((await call('GET', '/api/users/me', { token: m.token })).admin).toBe(false);
  });
});

test.describe('what the admin sees', () => {
  test('households, people and recipes across the whole server, with no secrets in any of it', async () => {
    const boss = await adminByPassword();
    const hh = await newHousehold(unique('Admin view'));
    const other = await newHousehold(unique('Admin other'));
    const member = await newMember(hh.id);
    const recipeName = unique('Admin pie');
    const recipe = await newRecipe(hh.id, recipeName, [{ name: 'flour', qty: 200, unit: 'g' }], {
      categories: ['Full meal'],
      links: [{ url: 'https://example.com/pie', label: null }],
      instructions: 'Mix.\nBake.',
    });

    // The things whose keys must never show up: a share link, the invite, a reset link, a session.
    const shareToken = (await call('POST', `/api/recipes/${recipe.id}/link`, { token: boss.token })).token;
    await call('PUT', `/api/recipes/${recipe.id}/shares`, { token: boss.token, body: { householdIds: [other.id] } });
    const invite = await inviteToken(hh.id);
    const reset = (
      await call('POST', `/api/households/${hh.id}/members/${member.userId}/password-reset`, { token: boss.token })
    ).token;

    // Somebody in no house at all: in one, then taken out of it.
    const loner = await newMember(other.id);
    await call('DELETE', `/api/households/${other.id}/members/${loner.userId}`, { token: boss.token });

    const bodies: string[] = [];
    const get = async (path: string) => {
      const res = await fetch(API_URL + path, { headers: { authorization: `Bearer ${boss.token}` } });
      expect(res.status, path).toBe(200);
      const text = await res.text();
      bodies.push(text);
      return JSON.parse(text);
    };

    const overview = await get('/api/admin/overview');
    for (const key of ['users', 'usersWithEmail', 'usersWithPassword', 'usersWithPin', 'households', 'recipes',
      'publishedRecipes', 'shares', 'publicLinks', 'liveInvites']) {
      expect(typeof overview[key], key).toBe('number');
    }
    expect(overview.households).toBeGreaterThanOrEqual(2);
    expect(overview.publicLinks).toBeGreaterThanOrEqual(1);
    expect(overview.shares).toBeGreaterThanOrEqual(1);

    // Every household, sortable; this one has two people and one recipe.
    const all = await get('/api/admin/households?size=200');
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.items.find((h: any) => h.id === hh.id)).toMatchObject({
      name: hh.name, memberCount: 2, recipeCount: 1, ownerName: 'E2E Admin',
    });
    const byMembers = await get('/api/admin/households?sort=members&dir=desc&size=200');
    const counts = byMembers.items.map((h: any) => h.memberCount);
    expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));
    const paged = await get('/api/admin/households?size=1&page=1');
    expect(paged).toMatchObject({ page: 1, size: 1 });
    expect(paged.items).toHaveLength(1);

    const detail = await get(`/api/admin/households/${hh.id}`);
    expect(detail).toMatchObject({ id: hh.id, name: hh.name, inviteLive: true });
    expect(detail.members.find((m: any) => m.userId === member.userId)).toMatchObject({
      email: member.email, username: member.username, role: 'MEMBER', hasPassword: true, hasPin: false, lastHousehold: true,
    });
    expect(detail.members.find((m: any) => m.userId === boss.userId)).toMatchObject({ role: 'OWNER', email: ADMIN_EMAIL });
    expect(detail.recipes).toEqual([
      expect.objectContaining({ id: recipe.id, name: recipeName, section: 'DINNER', published: false,
        sharedWith: [other.name], hasPublicLink: true }),
    ]);

    // People: everyone, including somebody in no house.
    const people = await get(`/api/admin/users?q=${encodeURIComponent(loner.email)}`);
    expect(people.items).toEqual([
      expect.objectContaining({ userId: loner.userId, email: loner.email, hasPassword: true, hasPin: false,
        admin: false, households: [] }),
    ]);
    const me = (await get(`/api/admin/users?q=${encodeURIComponent(ADMIN_EMAIL)}`)).items[0];
    expect(me).toMatchObject({ userId: boss.userId, admin: true });
    expect(me.households.find((h: any) => h.householdId === hh.id)).toMatchObject({ name: hh.name, role: 'OWNER' });

    // Recipes: search by name, narrowed to a house.
    const found = await get(`/api/admin/recipes?q=${encodeURIComponent(recipeName.toUpperCase())}&householdId=${hh.id}`);
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({
      id: recipe.id, householdId: hh.id, householdName: hh.name, section: 'DINNER', groups: ['Full meal'],
      sharedWith: [other.name], linkCount: 1, hasPublicLink: true, published: false,
    });
    expect((await get(`/api/admin/recipes?q=${encodeURIComponent(recipeName)}&householdId=${other.id}`)).total).toBe(0);
    // A literal % is a percent sign, not "anything".
    expect((await get('/api/admin/recipes?q=%25%25%25')).total).toBe(0);

    const full = await get(`/api/admin/recipes/${recipe.id}`);
    expect(full).toMatchObject({ householdName: hh.name, sharedWith: [other.name], hasPublicLink: true });
    expect(full.recipe).toMatchObject({ id: recipe.id, name: recipeName, instructions: 'Mix.\nBake.', section: 'DINNER' });
    expect(full.recipe.ingredients[0]).toMatchObject({ ingredientName: 'flour', unit: 'g' });
    expect(full.recipe.links).toEqual([expect.objectContaining({ url: 'https://example.com/pie' })]);
    expect(await statusOf('GET', `/api/admin/recipes/${crypto.randomUUID()}`, { token: boss.token })).toBe(404);
    expect(await statusOf('GET', `/api/admin/households/${crypto.randomUUID()}`, { token: boss.token })).toBe(404);

    // Nothing that would let the reader act as somebody.
    const everything = bodies.join('\n');
    for (const secret of [shareToken, invite, reset, boss.token, member.token, loner.token]) {
      expect(everything).not.toContain(secret);
    }
    expect(everything).not.toMatch(/\$2[aby]\$/); // a BCrypt hash
    expect(everything).not.toMatch(/"(passwordHash|pinHash|password|pin|token|tokenHash)"\s*:/i);
  });
});

test.describe('deleting an account', () => {
  /** Somebody new who makes a house of their own, with a recipe in it. */
  async function withOwnHouse() {
    const hh = await newHousehold();
    const person = await newMember(hh.id);
    const own = await call('POST', '/api/households', { token: person.token, body: { name: unique('Theirs') } });
    await call('POST', `/api/households/${own.id}/recipes`, {
      token: person.token,
      body: { name: 'Toast', servings: 2, section: 'BREAKFAST', categories: [], instructions: 'Toast it.', ingredients: [{ ingredientName: 'bread', quantity: 2, unit: null, optional: false }] },
    });
    return { hh, person, own };
  }

  test('the preview says what happens to each house, and the delete does exactly that', async () => {
    const boss = await adminByPassword();
    const { hh, person, own } = await withOwnHouse();

    const preview = await call('GET', `/api/admin/users/${person.userId}/deletion-preview`, { token: boss.token });
    const byId = Object.fromEntries(preview.households.map((h: any) => [h.householdId, h]));
    expect(byId[hh.id].outcome).toBe('LEAVES');
    expect(byId[own.id]).toMatchObject({ outcome: 'DELETES_HOUSEHOLD', recipes: 1 });

    const done = await call('DELETE', `/api/admin/users/${person.userId}`, { token: boss.token });
    expect(done.households).toEqual(preview.households);

    expect(await statusOf('GET', `/api/admin/households/${own.id}`, { token: boss.token })).toBe(404);
    const members = await call('GET', `/api/households/${hh.id}/members`, { token: boss.token });
    expect(members.some((m: any) => m.userId === person.userId)).toBe(false);

    // Their token still looks valid, so everything must turn it away cleanly, never with a 500.
    expect(await statusOf('POST', '/api/auth/refresh', { token: person.token })).toBe(401);
    for (const path of ['/api/users/me', '/api/households', `/api/households/${hh.id}/grocery-list`]) {
      expect(await statusOf('GET', path, { token: person.token })).toBeLessThan(500);
    }
    expect(await statusOf('POST', '/api/auth/login/email', { body: { email: person.email, password: person.password } })).toBe(401);
  });

  test('a house they own with others in it passes to whoever has been in it longest', async () => {
    const boss = await adminByPassword();
    const { person, own } = await withOwnHouse();
    const token = await inviteToken(own.id, person);
    const second: Session = await call('POST', '/api/auth/signup', {
      body: { inviteToken: token, displayName: unique('Heir'), email: `${unique('heir').toLowerCase()}@example.com`, password: 'heir-password' },
    });

    const preview = await call('GET', `/api/admin/users/${person.userId}/deletion-preview`, { token: boss.token });
    expect(preview.households.find((h: any) => h.householdId === own.id)).toMatchObject({
      outcome: 'HANDS_OVER',
      newOwnerName: second.displayName,
    });

    await call('DELETE', `/api/admin/users/${person.userId}`, { token: boss.token });
    const members = await call('GET', `/api/households/${own.id}/members`, { token: second.token });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: second.userId, role: 'OWNER' });
    expect((await call('GET', `/api/households/${own.id}/recipes`, { token: second.token })).length).toBe(1);
  });

  test('only the admin can, and not on themselves', async () => {
    const hh = await newHousehold();
    const person = await newMember(hh.id);
    const bystander = await newMember(hh.id);
    const boss = await adminByPassword();

    for (const token of [bystander.token, (await admin()).token]) {
      expect(await statusOf('GET', `/api/admin/users/${person.userId}/deletion-preview`, { token })).toBe(404);
      expect(await statusOf('DELETE', `/api/admin/users/${person.userId}`, { token })).toBe(404);
    }
    expect(await statusOf('DELETE', `/api/admin/users/${boss.userId}`, { token: boss.token })).toBe(409);
    expect(await statusOf('DELETE', '/api/admin/users/00000000-0000-0000-0000-000000000000', { token: boss.token })).toBe(404);
    // Still there after all of that.
    expect((await call('GET', '/api/users/me', { token: person.token })).userId).toBe(person.userId);
  });
});
