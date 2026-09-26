/*
 Working out a whole palette from the two colours somebody picked, so that any pick stays
 readable. Pure functions, no DOM: the same arithmetic runs in ios/MealPlanner/Theme.swift, step
 for step, so a custom pair looks the same on the phone as on the web. Change one, change both.

 What the two colours drive (index.css has the tokens):

   primary   --accent        the colour that means "you can act": filled buttons, links, the
                             active tab, ticks, switches, the focus ring.
             --accent-ink    text on a filled button — white, or near-black when white would
                             not read.

   secondary --secondary-soft  the tinted fills: your avatar, a notice, a badge, today on the
                               plan, a selected icon, an optional ingredient — the "this is
                               highlighted" colour, as opposed to "tap this".
             --secondary       text and icons on those fills — the secondary itself, darkened (or,
                               in dark mode, lightened) until it reads on them.

 The recipe cover tints stay as they are in every theme: they tell recipes apart, and six tints
 bent towards one colour would stop doing that.
*/

export type Rgb = readonly [number, number, number];

/** One mode's worth of derived colours, as #RRGGBB. */
export interface ModeColors {
  accent: string;
  accentInk: string;
  secondary: string;
  secondarySoft: string;
}

export interface DerivedColors {
  light: ModeColors;
  dark: ModeColors;
}

/** The surfaces the derived colours have to read against — the web's --surface in each mode. */
const WHITE: Rgb = [255, 255, 255];
const DARK_SURFACE: Rgb = [28, 28, 30];
/** Text on a light filled button in dark mode: the web's dark --accent-ink. */
const DARK_INK: Rgb = [28, 25, 23];

/*
 How much contrast each role needs. Light-mode accents only have to match what the app has
 always had (orange on white is 3.6:1), since they are mostly bold labels and filled buttons;
 dark-mode accents are lifted further, the way Apple's own dark colours are lighter than their
 light ones. Text on a tinted fill is ordinary text, so it gets the full 4.5:1.
*/
export const MIN_ACCENT_LIGHT = 3.5;
export const MIN_ACCENT_DARK = 6;
export const MIN_ON_SOFT = 4.5;
/** White text on a filled button, or near-black when white falls below this. */
export const MIN_WHITE_INK = 3;

const SOFT_LIGHTNESS_LIGHT = 0.92;
const SOFT_LIGHTNESS_DARK = 0.15;
/** A dark-mode tint any more saturated than this glows rather than sits behind the text. */
const SOFT_SATURATION_DARK = 0.75;

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

function inkOn(fill: Rgb): Rgb {
  return contrast(fill, WHITE) >= MIN_WHITE_INK ? WHITE : DARK_INK;
}

/** Both modes' colours from a primary and a secondary, each #RRGGBB. */
export function deriveColors(primaryHex: string, secondaryHex: string): DerivedColors {
  const primary = hexToRgb(primaryHex);
  const secondary = hexToRgb(secondaryHex);

  const lightAccent = untilReadable(primary, WHITE, MIN_ACCENT_LIGHT, -1);
  const lightSoft = tint(secondary, SOFT_LIGHTNESS_LIGHT);
  const darkAccent = untilReadable(primary, DARK_SURFACE, MIN_ACCENT_DARK, 1);
  const darkSoft = tint(secondary, SOFT_LIGHTNESS_DARK, SOFT_SATURATION_DARK);

  return {
    light: {
      accent: rgbToHex(lightAccent),
      accentInk: rgbToHex(inkOn(lightAccent)),
      secondary: rgbToHex(untilReadable(secondary, lightSoft, MIN_ON_SOFT, -1)),
      secondarySoft: rgbToHex(lightSoft),
    },
    dark: {
      accent: rgbToHex(darkAccent),
      accentInk: rgbToHex(inkOn(darkAccent)),
      secondary: rgbToHex(untilReadable(secondary, darkSoft, MIN_ON_SOFT, 1)),
      secondarySoft: rgbToHex(darkSoft),
    },
  };
}
