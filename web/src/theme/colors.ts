/*
 The Custom theme: Tomato with an accent you picked, worked out so that any pick stays readable.
 Pure functions, no DOM. ios/MealPlanner/Theme.swift has to do the same arithmetic step for step,
 so a custom colour looks the same on the phone as on the web: change one, change both.

 Only the four accent tokens come from the pick (themes.ts says what each is for):

   accent      filled buttons, the active tab, ticks — darkened in light mode (lightened in dark)
               until it stands out from the surface
   accentSoft  the same hue as a pale (in dark mode, deep) tint
   onAccent    text on a filled accent: white, or the page's ink when white would not read
   accentInk   accent-coloured text — the accent again, pushed further until it reads as text on
               its own soft tint (and so on the paler page and surface too)

 Everything else — paper, ink, herb, mustard, plum, sky — is Tomato's, so the meaning of the
 other colours never changes with your pick.
*/

import { TOMATO } from './themes';

export type Rgb = readonly [number, number, number];

/** The four accent tokens of one mode, as #RRGGBB. */
export interface AccentColors {
  accent: string;
  accentSoft: string;
  onAccent: string;
  accentInk: string;
}

export interface CustomColors {
  light: AccentColors;
  dark: AccentColors;
}

/*
 How much contrast each role needs. A filled accent only has to stand out as a shape with a bold
 label on it, so 3:1 against the surface does; dark mode lifts it further, the way Apple's dark
 colours are lighter than their light ones. Accent text is ordinary text, so it gets the full
 4.5:1 against its own tint.
*/
export const MIN_ACCENT_LIGHT = 3;
export const MIN_ACCENT_DARK = 4.5;
export const MIN_INK = 4.5;
/** White on a filled accent, or the page's ink when white falls below this. */
export const MIN_WHITE_ON_ACCENT = 3;

const SOFT_LIGHTNESS_LIGHT = 0.92;
const SOFT_LIGHTNESS_DARK = 0.18;
/** A dark-mode tint any more saturated than this glows rather than sits behind the text. */
const SOFT_SATURATION_DARK = 0.45;

export const HEX = /^#[0-9A-F]{6}$/;

/** "#ea580c" or "ea580c" → "#EA580C"; anything else → null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toUpperCase();
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX.test(withHash) ? withHash : null;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue in degrees, saturation and lightness 0–1. */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

/**
 * The colour, made darker (towards: -1) or lighter (+1) a percent of lightness at a time until
 * it has `min` contrast against `against`. Hue and saturation stay, so it is still recognisably
 * the colour that was picked. Gives up at black or white, which is as far as it can go.
 */
export function untilReadable(color: Rgb, against: Rgb, min: number, towards: -1 | 1): Rgb {
  const [h, s, l0] = rgbToHsl(color);
  let out = color;
  for (let step = 1; step <= 100 && contrast(out, against) < min; step++) {
    const l = Math.min(1, Math.max(0, l0 + (towards * step) / 100));
    out = hslToRgb(h, s, l);
    if (l === 0 || l === 1) break;
  }
  return out;
}

/** The same hue, at a set lightness: a tint to put text on. */
function tint(color: Rgb, lightness: number, maxSaturation = 1): Rgb {
  const [h, s] = rgbToHsl(color);
  return hslToRgb(h, Math.min(s, maxSaturation), lightness);
}

const WHITE: Rgb = [255, 255, 255];

function onAccent(fill: Rgb, ink: Rgb): Rgb {
  return contrast(fill, WHITE) >= MIN_WHITE_ON_ACCENT ? WHITE : ink;
}

/** Both modes' accent tokens from the one colour picked, #RRGGBB, on Tomato's neutrals. */
export function deriveCustom(accentHex: string): CustomColors {
  const picked = hexToRgb(accentHex);
  const mode = (dark: boolean): AccentColors => {
    const p = dark ? TOMATO.dark : TOMATO.light;
    const surface = hexToRgb(p.surface);
    const accent = untilReadable(picked, surface, dark ? MIN_ACCENT_DARK : MIN_ACCENT_LIGHT, dark ? 1 : -1);
    const soft = dark ? tint(picked, SOFT_LIGHTNESS_DARK, SOFT_SATURATION_DARK) : tint(picked, SOFT_LIGHTNESS_LIGHT);
    const ink = untilReadable(accent, soft, MIN_INK, dark ? 1 : -1);
    return {
      accent: rgbToHex(accent),
      accentSoft: rgbToHex(soft),
      onAccent: rgbToHex(onAccent(accent, hexToRgb(dark ? p.bg : p.text))),
      accentInk: rgbToHex(ink),
    };
  };
  return { light: mode(false), dark: mode(true) };
}
