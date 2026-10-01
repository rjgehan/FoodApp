/**
 * What a browser the suite opens knows before its first page: that this device has already had
 * the first-run tutorial (web/src/tutorial), so tests start where they always did — the sign-in
 * screen, an invite, the app. The projects in playwright.config.ts start from it; a test that
 * opens a second phone with `browser.newContext` passes it too (see `phoneContext` in ui.ts).
 * The tutorial's own tests start from a device that has not had it instead.
 */
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

export const TUTORIAL_SEEN = {
  cookies: [],
  origins: [{ origin: new URL(WEB_URL).origin, localStorage: [{ name: 'mp_tutorialSeen', value: '1' }] }],
};

/** A device that has never opened the app: no tutorial seen, nothing stored. */
export const FRESH_DEVICE = { cookies: [], origins: [] };
