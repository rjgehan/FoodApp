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
    // Every API error arrives as {status, message} from ApiExceptionHandler, and that message
    // is written for a person. Using it as the Error's message means anything that renders
    // err.message — which is most things — says the useful thing instead of dumping JSON.
    super(messageIn(body) ?? `${status}: ${JSON.stringify(body)}`);
  }
}

/** The server's own sentence, when it sent one. */
function messageIn(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

/**
 * What to do when the server says the session is over. AuthContext registers it; a plain
 * callback so this module needs no React.
 */
let signedOutHandler: (() => void) | null = null;

export function onSignedOut(handler: (() => void) | null) {
  signedOutHandler = handler;
}

/**
 * A 401 on a request that carried a token means the token is no good any more. Before this, the
 * app kept showing you as signed in while the server quietly refused every change, and the only
 * way out was signing out by hand. The sign-in endpoints are excluded: a wrong PIN is also a 401.
 */
function noticeSignedOut(status: number, sentToken: boolean, path: string) {
  const signInCall = path.startsWith('/api/auth/') && path !== '/api/auth/refresh';
  if (status === 401 && sentToken && !signInCall) signedOutHandler?.();
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

  if (!res.ok) {
    noticeSignedOut(res.status, Boolean(token), path);
    throw new ApiError(res.status, data);
  }
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

  const path = `/api/households/${householdId}/images`;
  const res = await fetch(apiBaseUrl() + path, {
    method: 'POST',
    headers,
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    noticeSignedOut(res.status, Boolean(token), path);
    throw new ApiError(res.status, data);
  }
  return data as { id: string };
}
