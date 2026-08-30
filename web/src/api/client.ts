// Default the API URL to whatever host served this page (works the same from localhost, a LAN
// IP, or a hostname), not a hardcoded "localhost" that would break when opened from another device.
const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_URL ?? `${location.protocol}//${location.hostname}:8080`;

export function apiBaseUrl(): string {
  return localStorage.getItem('mp_baseUrl') || DEFAULT_BASE_URL;
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
