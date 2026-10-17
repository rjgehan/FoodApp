import { quote, sqlQuery } from './db';

/**
 * A thin client for the backend, used to arrange state quickly so UI tests only click through
 * the part they are actually about.
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:8080';
export const INTEGRATION_KEY = process.env.INTEGRATION_API_KEY ?? 'e2e-integration-key';
export const ADMIN_USER = process.env.E2E_USER ?? 'e2e-admin';
export const ADMIN_PIN = process.env.E2E_PIN ?? '1234';
export const ADMIN_EMAIL = process.env.E2E_EMAIL ?? 'e2e-admin@example.com';
export const ADMIN_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-admin-password';

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, method: string, path: string) {
    super(`${method} ${path} → ${status} ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export type Json = any;

export async function call(
  method: string,
  path: string,
  { token, body, headers }: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Json> {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text, method, path);
  return text ? JSON.parse(text) : null;
}

/** The status a call ends with, for tests that expect a refusal. Any success comes back as 200. */
export async function statusOf(
  method: string,
  path: string,
  opts: Parameters<typeof call>[2] = {},
): Promise<number> {
  try {
    await call(method, path, opts);
    return 200;
  } catch (e) {
    if (e instanceof ApiError) return e.status;
    throw e;
  }
}

export type Session = { token: string; userId: string; displayName: string };


export const login = (username: string, pin: string): Promise<Session> =>
  call('POST', '/api/auth/login', { body: { username, pin } });

export const loginWithEmail = (email: string, password: string): Promise<Session & { lastHouseholdId: string | null }> =>
  call('POST', '/api/auth/login/email', { body: { email, password } });

let adminSession: Session | undefined;

/** The account every test builds from. Created by global setup on a fresh database. */
export async function admin(): Promise<Session> {
  adminSession ??= await login(ADMIN_USER, ADMIN_PIN);
  return adminSession;
}

let adminPasswordSession: Session | undefined;

/**
 * The same account signed in with its email and password: the only kind of session the admin
 * pages open for. Its PIN session (`admin()`) is turned away from them like anybody else's.
 */
export async function adminByPassword(): Promise<Session> {
  adminPasswordSession ??= await loginWithEmail(ADMIN_EMAIL, ADMIN_PASSWORD);
  return adminPasswordSession;
}

let counter = 0;
/** Unique enough to never collide across runs against the same database. */
export const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * What a test household has turned on. A household the server makes starts with the cupboard
 * off, the Plan on and its kitchen questions unanswered; the suite's world is a household that
 * has both and has answered them, so that is what `newHousehold()` gives unless a test says.
 */
export type KitchenOptions = {
  /** Keeps a cupboard. Default on. */
  cupboard?: boolean;
  /** Plans meals ahead. Default on. */
  plan?: boolean;
  /**
   * The kitchen questions have been answered. Default true. `false` leaves the household as the
   * server made it — only the flags a test names are changed — so its defaults can be tested.
   */
  setUp?: boolean;
};

/**
 * Turns a household's features on or off and marks its kitchen questions answered or not, as a
 * person would from Household → Kitchen & features (`PATCH /kitchen`).
 */
export async function setKitchen(
  householdId: string,
  body: { cupboardEnabled?: boolean; planEnabled?: boolean; machines?: string[]; setUp?: boolean },
  as?: Session,
): Promise<Json> {
  const who = as ?? (await admin());
  return call('PATCH', `/api/households/${householdId}/kitchen`, { token: who.token, body });
}

/**
 * A brand new household owned by the admin, so tests never see each other's data. It keeps a
 * cupboard, plans meals and has had its kitchen set up, unless `opts` says otherwise.
 */
export async function newHousehold(
  nameOrOpts: string | KitchenOptions = unique('House'),
  maybeOpts: KitchenOptions = {},
): Promise<{ id: string; name: string; owner: Session; household: Json }> {
  const name = typeof nameOrOpts === 'string' ? nameOrOpts : unique('House');
  const opts = typeof nameOrOpts === 'string' ? maybeOpts : nameOrOpts;
  const owner = await admin();
  let household = await call('POST', '/api/households', { token: owner.token, body: { name } });
  if (opts.setUp === false) {
    // As the server made it, bar what the test names.
    const body: { cupboardEnabled?: boolean; planEnabled?: boolean } = {};
    if (opts.cupboard !== undefined) body.cupboardEnabled = opts.cupboard;
    if (opts.plan !== undefined) body.planEnabled = opts.plan;
    if (Object.keys(body).length) household = await setKitchen(household.id, body, owner);
  } else {
    household = await setKitchen(
      household.id,
      { cupboardEnabled: opts.cupboard ?? true, planEnabled: opts.plan ?? true, setUp: true },
      owner,
    );
  }
  return { id: household.id, name, owner, household };
}

export type Member = Session & { username: string; email: string; password: string };

/** The household's invite link token, as anyone in it would see it on the Invite card. */
export async function inviteToken(householdId: string, as?: Session): Promise<string> {
  const who = as ?? (await admin());
  return (await call('GET', `/api/households/${householdId}/invite`, { token: who.token })).token;
}

/**
 * Somebody new, the only way there is now: they open the household's invite link and make an
 * account with an email and password, which signs them in.
 */
export async function newMember(householdId: string): Promise<Member> {
  const email = `${unique('member').toLowerCase()}@example.com`;
  const password = 'member-password';
  const session: Session = await call('POST', '/api/auth/signup', {
    body: { inviteToken: await inviteToken(householdId), displayName: unique('Cook'), email, password },
  });
  const me = await call('GET', '/api/users/me', { token: session.token });
  return { ...session, username: me.username, email, password };
}

/**
 * An account the way they were made before invite links: somebody in the house created it,
 * and it signs in with a name and PIN — or, with `pin: null`, has never been signed into at all.
 * The API no longer makes these, so it is written straight into the local database; plenty are
 * still about on the real server, and the PIN screens have to keep working for them.
 */
export async function legacyMember(householdId: string, pin: string | null = '4321'): Promise<Session & { username: string }> {
  const username = unique('u').toLowerCase();
  sqlQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  const hash = pin === null ? 'NULL' : `crypt(${quote(pin)}, gen_salt('bf', 4))`;
  const userId = sqlQuery(
    `INSERT INTO users (id, username, display_name, password_hash, created_at) ` +
      `VALUES (gen_random_uuid(), ${quote(username)}, ${quote(username)}, ${hash}, now()) RETURNING id`,
  );
  if (!userId) throw new Error('legacyMember needs docker access to the local dev database.');
  sqlQuery(
    `INSERT INTO household_members (id, household_id, user_id, role, joined_at) ` +
      `VALUES (gen_random_uuid(), ${quote(householdId)}, ${quote(userId)}, 'MEMBER', now())`,
  );
  if (pin === null) return { token: '', userId, displayName: username, username };
  return { ...(await login(username, pin)), username };
}

/** `qty: null` is an ingredient with no amount — "salt and pepper". */
export type IngredientInput = { name: string; qty: number | null; unit?: string; optional?: boolean };

export async function newRecipe(
  householdId: string,
  name: string,
  ingredients: IngredientInput[],
  extra: Record<string, unknown> = {},
): Promise<Json> {
  const owner = await admin();
  return call('POST', `/api/households/${householdId}/recipes`, {
    token: owner.token,
    body: {
      name,
      servings: 4,
      section: 'DINNER',
      categories: [],
      instructions: 'Cook it.\nEat it.',
      ingredients: ingredients.map((i) => ({
        ingredientName: i.name,
        quantity: i.qty,
        unit: i.unit ?? null,
        optional: i.optional ?? false,
      })),
      ...extra,
    },
  });
}

export async function plan(
  householdId: string,
  date: string,
  mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK',
  what: { recipeId?: string; placeId?: string; itemName?: string; servings?: number; includedOptionalIngredientIds?: string[] },
): Promise<Json> {
  const owner = await admin();
  return call('POST', `/api/households/${householdId}/meal-plan/entries`, {
    token: owner.token,
    body: { date, mealType, ...what },
  });
}

export async function groceries(householdId: string): Promise<Json[]> {
  const owner = await admin();
  return call('GET', `/api/households/${householdId}/grocery-list`, { token: owner.token });
}

export async function addRangeToGroceries(householdId: string, start: string, end: string): Promise<Json[]> {
  const owner = await admin();
  return call('POST', `/api/households/${householdId}/grocery-list/add-all?start=${start}&end=${end}`, {
    token: owner.token,
  });
}

export const find = (items: Json[], name: string) => items.find((i) => i.name === name);

/** `YYYY-MM-DD`, `days` from today in local time — the same clock the backend uses. */
export function isoDate(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Uploads a JPEG to a household the way the web app does, and returns its image id. */
export async function uploadImage(householdId: string, jpeg: Buffer): Promise<string> {
  const owner = await admin();
  const form = new FormData();
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
  const res = await fetch(`${API_URL}/api/households/${householdId}/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text(), 'POST', `/api/households/${householdId}/images`);
  return (await res.json()).id;
}
