import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { useOnResume } from '../utils/useOnResume';
import { takeModeToSave } from './deviceMode';
import { getTheme, sameTheme, setTheme, subscribeTheme, tidyTheme, type Theme } from './theme';

/**
 * Bumped by every pick made here. A /me that set off before the latest pick carries the theme
 * from before it, and putting that on the page would undo what was just tapped.
 */
let picks = 0;

/** The theme in force, re-rendering whatever reads it when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme);
}

/** A pick on the Theme screen: on the page at once, saved separately (see saveTheme). */
export function pickTheme(theme: Theme) {
  picks++;
  setTheme(theme);
}

/**
 * Keeps it on the server, so it follows you to your other devices. Custom goes with its colour
 * twice: old iPhone builds draw custom from a pair, and the web only ever picks one.
 */
export function saveTheme(theme: Theme): Promise<Theme> {
  const body = theme.primary ? { ...theme, secondary: theme.primary } : theme;
  return api<Theme>('PUT', '/api/users/me/theme', body);
}

/**
 * Your colours from the server: once per sign-in, and again whenever the app comes back into
 * view, since they may have been changed on another device in the meantime.
 */
export function useThemeSync(userId: string | undefined) {
  const load = useCallback(() => {
    if (!userId) return;
    const before = picks;
    api<Me>('GET', '/api/users/me')
      .then((me) => {
        // An older server has no theme at all; that says nothing, so the cached one stays.
        if (!me.theme || picks !== before) return;
        let theme = tidyTheme(me.theme);
        // Light or dark as answered on this device's first run goes on an account that has
        // never said either — once, and only to the first account signed in afterwards.
        const asked = takeModeToSave();
        if (asked && !theme.mode) {
          theme = { ...theme, mode: asked };
          // Counts as a pick: a second /me already on its way (React runs this effect twice in
          // development, and coming back into view runs it again) still has no light or dark, and
          // would put the phone's back over the one just chosen.
          picks++;
          saveTheme(theme).catch(() => {
            // Offline: it is on the page all the same, and the Theme screen can save it later.
          });
        }
        if (!sameTheme(theme, getTheme())) setTheme(theme);
      })
      .catch(() => {
        // Offline: the cached theme is the best guess, and it is already on.
      });
  }, [userId]);

  useEffect(load, [load]);
  useOnResume(load);
}
