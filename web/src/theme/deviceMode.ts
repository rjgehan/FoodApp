import type { ThemeMode } from './theme';

/*
 Light or dark as answered on this device — the first-run tutorial's "Light or dark?" — kept apart
 from the signed-in person's theme. Their theme is theirs and leaves with them at sign-out; this
 belongs to the device, so the sign-in screen keeps it for whoever picks the phone up next.
*/

const DEVICE_MODE_KEY = 'mp_deviceThemeMode';
/**
 * The same answer, still to be put on the account: saved the first time somebody signs in here
 * whose account has no light or dark of its own yet, then forgotten.
 */
const MODE_TO_SAVE_KEY = 'mp_deviceThemeModeToSave';

const MODES: ThemeMode[] = ['SYSTEM', 'LIGHT', 'DARK'];

function read(key: string): ThemeMode | null {
  try {
    const value = localStorage.getItem(key);
    return value && (MODES as string[]).includes(value) ? (value as ThemeMode) : null;
  } catch {
    return null;
  }
}

/** This device's own light or dark, if it was ever asked. */
export function deviceMode(): ThemeMode | null {
  return read(DEVICE_MODE_KEY);
}

export function setDeviceMode(mode: ThemeMode) {
  try {
    localStorage.setItem(DEVICE_MODE_KEY, mode);
    localStorage.setItem(MODE_TO_SAVE_KEY, mode);
  } catch {
    // Storage blocked: the choice still applies now, it just is not remembered.
  }
}

/** The answer waiting to go on an account, taken once: whoever signs in next gets it or not. */
export function takeModeToSave(): ThemeMode | null {
  const mode = read(MODE_TO_SAVE_KEY);
  try {
    localStorage.removeItem(MODE_TO_SAVE_KEY);
  } catch {
    // Nothing kept, nothing to forget.
  }
  return mode;
}
