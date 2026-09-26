import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { useOnResume } from '../utils/useOnResume';
import { DEFAULT_THEME, getTheme, sameTheme, setTheme, subscribeTheme, type Theme } from './theme';

/**
 * Bumped by every pick made here. A /me that set off before the latest pick carries the theme
 * from before it, and putting that on the page would undo what was just tapped.
 */
let picks = 0;

/** The theme in force, re-rendering whatever reads it when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme);
}

/** A pick in Appearance: on the page at once, saved separately (see saveTheme). */
export function pickTheme(theme: Theme) {
  picks++;
  setTheme(theme);
}

/** Keeps it on the server, so it follows you to your other devices. */
export function saveTheme(theme: Theme): Promise<Theme> {
  return api<Theme>('PUT', '/api/users/me/theme', theme);
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
        const theme = { ...DEFAULT_THEME, ...me.theme };
        if (!sameTheme(theme, getTheme())) setTheme(theme);
      })
      .catch(() => {
        // Offline: the cached theme is the best guess, and it is already on.
      });
  }, [userId]);

  useEffect(load, [load]);
  useOnResume(load);
}
