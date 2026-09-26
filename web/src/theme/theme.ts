import { deriveColors, type DerivedColors, type ModeColors } from './colors';

/**
 * Each person's colours. Everything null is the app as it has always looked: Classic, following
 * the phone's light or dark setting. The server keeps it (PUT /api/users/me/theme) so it follows
 * you to another device; this browser keeps a copy so the first paint is already right.
 */
export interface Theme {
  /** A preset's key, "custom", or null for Classic. */
  preset: string | null;
  /** The custom pair, #RRGGBB. Kept while a preset is on, so going back to Custom finds them. */
  primary: string | null;
  secondary: string | null;
  mode: ThemeMode | null;
}

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

export const DEFAULT_THEME: Theme = { preset: null, primary: null, secondary: null, mode: null };

export const CUSTOM = 'custom';

export interface Preset {
  key: string;
  name: string;
  primary: string;
  secondary: string;
}

/*
 Eight pairs, each checked in both modes by the arithmetic in colors.ts: every accent is at least
 3.5:1 on white and 6:1 on dark grey, and the secondary's text at least 4.5:1 on its own tint.
 The keys are what the server stores and counts — the same list is in ThemeSettings.java and
 ios/MealPlanner/Theme.swift, and a key once shipped is never renamed.

 Classic's colours are only for its swatch: Classic itself is index.css untouched, the orange
 the app has always had.
*/
export const PRESETS: Preset[] = [
  { key: 'classic', name: 'Classic', primary: '#EA580C', secondary: '#FDBA74' },
  { key: 'basil', name: 'Basil', primary: '#15803D', secondary: '#EAB308' },
  { key: 'lagoon', name: 'Lagoon', primary: '#0F766E', secondary: '#F97316' },
  { key: 'ocean', name: 'Ocean', primary: '#0369A1', secondary: '#14B8A6' },
  { key: 'blueberry', name: 'Blueberry', primary: '#4F46E5', secondary: '#EC4899' },
  { key: 'plum', name: 'Plum', primary: '#7E22CE', secondary: '#F472B6' },
  { key: 'mocha', name: 'Mocha', primary: '#7C4A2D', secondary: '#D4A373' },
  { key: 'graphite', name: 'Graphite', primary: '#334155', secondary: '#0EA5E9' },
];

export const presetNamed = (key: string | null) => PRESETS.find((p) => p.key === key);

/** Which preset is on, as a key: "classic" for the default, "custom" for your own pair. */
export function activeKey(theme: Theme): string {
  if (theme.preset === CUSTOM && theme.primary && theme.secondary) return CUSTOM;
  return presetNamed(theme.preset) ? theme.preset! : 'classic';
}

/** The two colours in force, for a swatch. */
export function pairOf(theme: Theme): { primary: string; secondary: string } {
  const key = activeKey(theme);
  if (key === CUSTOM) return { primary: theme.primary!, secondary: theme.secondary! };
  const preset = presetNamed(key)!;
  return { primary: preset.primary, secondary: preset.secondary };
}

/** Classic is the stylesheet itself; anything else is worked out from its pair. */
export function colorsOf(theme: Theme): DerivedColors | null {
  if (activeKey(theme) === 'classic') return null;
  const { primary, secondary } = pairOf(theme);
  return deriveColors(primary, secondary);
}

/** The stylesheet's own Classic values, for previews that draw both modes side by side. */
export const CLASSIC_COLORS: DerivedColors = {
  light: { accent: '#EA580C', accentInk: '#FFFFFF', secondary: '#EA580C', secondarySoft: '#FFEDD5' },
  dark: { accent: '#FF9F40', accentInk: '#1C1917', secondary: '#FF9F40', secondarySoft: '#402008' },
};

// --- Putting it on the page ---------------------------------------------------------------

const STYLE_ID = 'mp-theme';
/** What index.html reads before anything else runs — see the script there. */
const CSS_KEY = 'mp_themeCss';
const MODE_KEY = 'mp_themeMode';
const THEME_KEY = 'mp_theme';

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const block = (c: ModeColors) =>
  `--accent:${channels(c.accent)};--accent-ink:${channels(c.accentInk)};` +
  `--secondary:${channels(c.secondary)};--secondary-soft:${channels(c.secondarySoft)};`;

/**
 * The theme as a stylesheet. `html:root` outranks index.css's `:root` wherever the two land in
 * the page, which matters: this is first put in by index.html, before the app's own CSS.
 */
export function themeCss(theme: Theme): string {
  const colors = colorsOf(theme);
  if (!colors) return '';
  return `html:root{${block(colors.light)}}html:root[data-theme='dark']{${block(colors.dark)}}`;
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Light or dark right now: the forced one, or else the system's. */
export function effectiveMode(mode: ThemeMode | null): 'light' | 'dark' {
  if (mode === 'LIGHT') return 'light';
  if (mode === 'DARK') return 'dark';
  return systemDark().matches ? 'dark' : 'light';
}

function paintMode(mode: ThemeMode | null) {
  const effective = effectiveMode(mode);
  document.documentElement.dataset.theme = effective;
  // The browser's own bar, which on a phone is the strip above the page.
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => (m.content = effective === 'dark' ? '#000000' : '#ffffff'));
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
  paintMode(theme.mode);
}

function remember(theme: Theme) {
  try {
    if (activeKey(theme) === 'classic' && !theme.mode && !theme.primary) {
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

function cached(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
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

/** Signing out: the next person gets the app's own colours until theirs load. */
export function resetTheme() {
  setTheme(DEFAULT_THEME);
}

/**
 * Called once, before the first render: the cached theme, and a watch on the system setting so
 * Auto follows the phone switching to dark at sunset.
 */
export function startTheme() {
  current = cached();
  paint(current);
  systemDark().addEventListener('change', () => paintMode(current.mode));
}

/** Two themes that look the same, whatever their spare custom colours. */
export function sameTheme(a: Theme, b: Theme) {
  return a.preset === b.preset && a.primary === b.primary && a.secondary === b.secondary && a.mode === b.mode;
}
