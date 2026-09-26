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

let counter = 0;
/** Unique enough to never collide across runs against the same database. */
export const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A brand new household owned by the admin, so tests never see each other's data. */
export async function newHousehold(name = unique('House')): Promise<{ id: string; name: string; owner: Session }> {
  const owner = await admin();
  const hh = await call('POST', '/api/households', { token: owner.token, body: { name } });
  return { id: hh.id, name, owner };
}

/** A new account inside a household, with its PIN already chosen. */
export async function newMember(householdId: string, pin = '4321'): Promise<Session & { username: string }> {
  const owner = await admin();
  const username = unique('u').toLowerCase();
  await call('POST', `/api/households/${householdId}/users`, { token: owner.token, body: { username } });
  const session = await call('POST', '/api/auth/pin', { body: { username, pin } });
  return { ...session, username };
}

export type IngredientInput = { name: string; qty: number; unit?: string; optional?: boolean };

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
