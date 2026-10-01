import { deriveCustom, type AccentColors } from './colors';
import {
  DANGER,
  DEFAULT_THEME_KEY,
  LEGACY_PRESETS,
  THEMES,
  themeNamed,
  TOKEN_KEYS,
  TOMATO,
  type Palette,
  type ThemeDef,
  type TitleFont,
} from './themes';

/**
 * Each person's theme. Everything null is the default: Tomato, following the phone's light or
 * dark setting. The server keeps it (PUT /api/users/me/theme) so it follows you to another
 * device; this browser keeps a copy so the first paint is already right.
 */
export interface Theme {
  /** A theme's key (themes.ts), "custom", or null for Tomato. */
  preset: string | null;
  /** Custom's accent, #RRGGBB. Kept while a preset is on, so going back to Custom finds it. */
  primary: string | null;
  /**
   * Only for old iPhone builds, which drew custom from a pair: the server fills it in with the
   * primary when it is missing. The web never reads it.
   */
  secondary: string | null;
  mode: ThemeMode | null;
}

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

export const DEFAULT_THEME: Theme = { preset: null, primary: null, secondary: null, mode: null };

export const CUSTOM = 'custom';

/** What a key means today: an old colour pair's key becomes the theme it was folded into. */
export function currentKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return LEGACY_PRESETS[key] ?? key;
}

/** Which theme is on, as a key: "tomato" by default, "custom" for your own accent. */
export function activeKey(theme: Theme): string {
  const key = currentKey(theme.preset);
  if (key === CUSTOM && theme.primary) return CUSTOM;
  return themeNamed(key) ? key! : DEFAULT_THEME_KEY;
}

/** The name people see: "Tomato", "Matcha"… or "Custom". */
export function themeName(theme: Theme): string {
  const key = activeKey(theme);
  return key === CUSTOM ? 'Custom' : themeNamed(key)!.name;
}

export const MODE_NAMES: Record<ThemeMode, string> = { SYSTEM: 'System', LIGHT: 'Light', DARK: 'Dark' };

/** "Tomato · System" — the Settings row's summary. */
export function themeSummary(theme: Theme): string {
  return `${themeName(theme)} · ${MODE_NAMES[theme.mode ?? 'SYSTEM']}`;
}

/** Every token of both modes, and the title font, for the theme in force. */
export function paletteOf(theme: Theme): { light: Palette; dark: Palette; title: TitleFont } {
  const key = activeKey(theme);
  if (key === CUSTOM) {
    const custom = deriveCustom(theme.primary!);
    const merge = (p: Palette, a: AccentColors): Palette => ({ ...p, ...a });
    return { light: merge(TOMATO.light, custom.light), dark: merge(TOMATO.dark, custom.dark), title: TOMATO.title };
  }
  const def = themeNamed(key)!;
  return { light: def.light, dark: def.dark, title: def.title };
}

/** The accent of the theme in force, light mode: where Custom starts from, and its swatch. */
export function accentOf(theme: Theme): string {
  return activeKey(theme) === CUSTOM ? theme.primary! : paletteOf(theme).light.accent;
}

export { THEMES, type ThemeDef };

// --- Putting it on the page ---------------------------------------------------------------

const STYLE_ID = 'mp-theme';
/**
 * What index.html reads before anything else runs — see the script there. A new name for the
 * redesign: a stylesheet cached by the old app sets variables that mean something else now.
 */
const CSS_KEY = 'mp_themeStyle';
const OLD_CSS_KEY = 'mp_themeCss';
const MODE_KEY = 'mp_themeMode';
const THEME_KEY = 'mp_theme';

/** "#D4512E" → "212 81 46", the form index.css keeps colours in so Tailwind can add alpha. */
export const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const kebab = (key: string) => key.replace(/[A-Z0-9]/g, (c) => '-' + c.toLowerCase()).replace('surface-2', 'surface2');

/** One mode's tokens as CSS custom properties: colours as channels, the two glass colours whole. */
export function tokenBlock(p: Palette, mode: 'light' | 'dark'): string {
  const colors = TOKEN_KEYS.map((k) =>
    k === 'tab' || k === 'scrim' ? `--${k}:${p[k]};` : `--${kebab(k)}:${channels(p[k])};`,
  ).join('');
  const danger = DANGER[mode];
  return colors + `--danger:${channels(danger.danger)};--danger-soft:${channels(danger.dangerSoft)};`;
}

export function titleBlock(t: TitleFont): string {
  return `--title-font:${t.family};--title-var:${t.variation};--title-ls:${t.letterSpacing};--title-w:${t.weight};`;
}

/**
 * The theme as a stylesheet, or nothing for Tomato (index.css is Tomato). `html:root` outranks
 * index.css's `:root` wherever the two land in the page, which matters: this is first put in by
 * index.html, before the app's own CSS.
 */
export function themeCss(theme: Theme): string {
  if (activeKey(theme) === DEFAULT_THEME_KEY) return '';
  const { light, dark, title } = paletteOf(theme);
  return (
    `html:root{${tokenBlock(light, 'light')}${titleBlock(title)}}` +
    `html:root[data-theme='dark']{${tokenBlock(dark, 'dark')}}`
  );
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Light or dark right now: the forced one, or else the system's. */
export function effectiveMode(mode: ThemeMode | null): 'light' | 'dark' {
  if (mode === 'LIGHT') return 'light';
  if (mode === 'DARK') return 'dark';
  return systemDark().matches ? 'dark' : 'light';
}

function paintMode(theme: Theme) {
  const effective = effectiveMode(theme.mode);
  document.documentElement.dataset.theme = effective;
  // The browser's own bar, which on a phone is the strip above the page: the page's paper.
  const bg = paletteOf(theme)[effective].bg;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg));
}

function paint(theme: Theme) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = themeCss(theme);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
  paintMode(theme);
}

function remember(theme: Theme) {
  try {
    localStorage.removeItem(OLD_CSS_KEY);
    if (activeKey(theme) === DEFAULT_THEME_KEY && !theme.mode && !theme.primary) {
      localStorage.removeItem(THEME_KEY);
      localStorage.removeItem(CSS_KEY);
      localStorage.removeItem(MODE_KEY);
      return;
    }
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    localStorage.setItem(CSS_KEY, themeCss(theme));
    localStorage.setItem(MODE_KEY, theme.mode ?? 'SYSTEM');
  } catch {
    // Storage blocked: the theme still applies, it just loads a moment later next time.
  }
}

/** A theme as it arrives — from the server or an old cache — with any old key brought up to date. */
export function tidyTheme(theme: Partial<Theme>): Theme {
  const t = { ...DEFAULT_THEME, ...theme };
  return { ...t, preset: currentKey(t.preset) };
}

function cached(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return tidyTheme(JSON.parse(raw));
  } catch {
    // Unreadable or blocked: the default until the server says otherwise.
  }
  return DEFAULT_THEME;
}

// --- The one theme in force, for anything that wants to follow it --------------------------

let current: Theme = DEFAULT_THEME;
const listeners = new Set<() => void>();

export const getTheme = () => current;

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Puts a theme on the page, and keeps it for the next launch. */
export function setTheme(theme: Theme) {
  current = theme;
  paint(theme);
  remember(theme);
  listeners.forEach((l) => l());
}

/** Signing out: the next person gets the default until theirs loads. */
export function resetTheme() {
  setTheme(DEFAULT_THEME);
}

/**
 * Called once, before the first render: the cached theme, and a watch on the system setting so
 * System follows the phone switching to dark at sunset.
 */
export function startTheme() {
  current = cached();
  paint(current);
  systemDark().addEventListener('change', () => {
    paintMode(current);
    listeners.forEach((l) => l());
  });
}

/** Two themes that look the same, whatever their spare custom colours. */
export function sameTheme(a: Theme, b: Theme) {
  return a.preset === b.preset && a.primary === b.primary && a.secondary === b.secondary && a.mode === b.mode;
}

