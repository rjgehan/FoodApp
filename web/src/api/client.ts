/**
 * Empty means same-origin: the API is reached through /api on whatever host served the page.
 * nginx proxies that to the backend in production, and the Vite dev server does the same
 * locally, so the app needs no knowledge of where the backend lives and there is no second
 * port to publish. Set VITE_API_URL only when the API really is on another origin.
 */
const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export function apiBaseUrl(): string {
  return localStorage.getItem('mp_baseUrl') || DEFAULT_BASE_URL;
}

/** sockjs-client wants an absolute URL, which a same-origin base does not give it. */
export function absoluteUrl(path: string): string {
  const base = apiBaseUrl();
  return base ? base + path : new URL(path, window.location.origin).toString();
}

export function setApiBaseUrl(url: string) {
  localStorage.setItem('mp_baseUrl', url);
}

export function getToken(): string | null {
  return localStorage.getItem('mp_token');
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`${status}: ${JSON.stringify(body)}`);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(apiBaseUrl() + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/**
 * Image bytes are served unauthenticated — an <img> tag cannot carry a bearer token — so the
 * random id in the path is what keeps the URL private. Same idea as an unlisted link.
 */
export function imageUrl(imageId: string): string {
  return `${apiBaseUrl()}/api/images/${imageId}`;
}

/** Downscaled in the browser first; see utils/imageResize. */
export async function uploadImage(householdId: string, blob: Blob): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiBaseUrl()}/api/households/${householdId}/images`, {
    method: 'POST',
    headers,
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as { id: string };
}
