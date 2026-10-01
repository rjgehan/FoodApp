/*
 The five themes, exactly as the designer's mockup defines them (its THEMES array): each a whole
 palette for light and for dark, plus how its titles are set. Tomato is the default, and is also
 what index.css paints before any of this runs — keep the two in step.

 The keys are what the server stores and counts (ThemeSettings.java) and what the iPhone app
 knows them by (ios/MealPlanner/Theme.swift). Custom is not here: it is Tomato with your own
 accent, worked out in colors.ts.

 What each token is for:

   bg            the page                       surface      cards, rows, inputs
   surface2      wells: search, segmented, chips' tray, quiet fills
   text          body text (Tailwind: `ink`)    muted        secondary text
   faint         placeholder, idle icons        border       hairlines and card edges
   accent        "you can act": filled buttons, the active tab, ticks in boxes, links' colour family
   accentSoft    soft buttons, your initial, today, selected things
   onAccent      text and icons on a filled accent
   accentInk     accent-coloured text and icons on bg / surface / accentSoft (links, back buttons)
   herb(+Soft)   good / done / "have it" / switches on      mustard(+Soft)  warnings, "not on list"
   plum(+Soft)   eating out, places                          sky(+Soft)      cupboard, info
   tab           the tab bar's glass                         scrim           behind sheets
*/

export const TOKEN_KEYS = [
  'bg', 'surface', 'surface2', 'text', 'muted', 'faint', 'border',
  'accent', 'accentSoft', 'onAccent', 'accentInk',
  'herb', 'herbSoft', 'mustard', 'mustardSoft', 'plum', 'plumSoft', 'sky', 'skySoft',
  'tab', 'scrim',
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type Palette = Record<TokenKey, string>;

/** How a theme sets its titles: the font, its variable axes, tracking and weight. */
export interface TitleFont {
  /** A CSS font-family list. */
  family: string;
  /** font-variation-settings, or "normal". */
  variation: string;
  letterSpacing: string;
  weight: number;
}

export interface ThemeDef {
  key: 'tomato' | 'matcha' | 'blueberry' | 'brunch' | 'nordic';
  /** The short name on the Theme screen's tiles. */
  name: string;
  /** The mockup's full name and one line about it. */
  longName: string;
  tagline: string;
  title: TitleFont;
  light: Palette;
  dark: Palette;
}

const palette = (values: string[]): Palette =>
  Object.fromEntries(TOKEN_KEYS.map((k, i) => [k, values[i]])) as Palette;

const FRAUNCES = "'Fraunces Variable', Georgia, serif";
const NUNITO = "'Nunito Variable', ui-rounded, system-ui, sans-serif";
const INTER = "'Inter Variable', system-ui, sans-serif";

export const THEMES: ThemeDef[] = [
  {
    key: 'tomato',
    name: 'Tomato',
    longName: 'Tomato Kitchen',
    tagline: 'Warm and homey. Cream paper, tomato red, a soft serif. Feels like a family cookbook.',
    title: { family: FRAUNCES, variation: '"SOFT" 100, "WONK" 0', letterSpacing: '-0.01em', weight: 600 },
    light: palette(['#FBF6EE', '#FFFFFF', '#F4ECDF', '#2B211A', '#7C6B5C', '#B3A596', '#EADFCF', '#D4512E', '#FBE4DA', '#FFFFFF', '#C2461F', '#4F7F43', '#E2EEDA', '#A87A0E', '#FAF0D3', '#8A4B78', '#F4E3EF', '#3F76A3', '#E1EDF6', 'rgba(255,253,249,.94)', 'rgba(43,33,26,.38)']),
    dark: palette(['#17120F', '#231C17', '#2E251E', '#F6EDE3', '#A99A8B', '#6E6155', '#3A3029', '#EE6D4A', '#42251C', '#FFFFFF', '#F2825F', '#8FBC7C', '#243220', '#E6B64B', '#3A2F14', '#D08FBE', '#35212F', '#86B6DD', '#1C2B38', 'rgba(30,24,20,.94)', 'rgba(0,0,0,.55)']),
  },
  {
    key: 'matcha',
    name: 'Matcha',
    longName: 'Matcha Café',
    tagline: 'Calm and fresh. Sage paper, deep matcha green, terracotta for eating out. Crisp serif with no softening.',
    title: { family: FRAUNCES, variation: '"SOFT" 0, "WONK" 0, "opsz" 72', letterSpacing: '-0.02em', weight: 500 },
    light: palette(['#F4F4EC', '#FFFFFF', '#E8EBDC', '#1E2A1F', '#5E6A5B', '#A2AB9B', '#DCE0CE', '#3D6B39', '#DDE9D6', '#FFFFFF', '#35602F', '#2C7E6C', '#D5ECE5', '#A3730D', '#F4EACD', '#B0553E', '#F6E0D8', '#4B6E91', '#DFE8F0', 'rgba(252,252,247,.94)', 'rgba(20,30,20,.36)']),
    dark: palette(['#111510', '#1A2019', '#242C22', '#EDF1E5', '#9CA794', '#5D6757', '#2E372C', '#8CC47E', '#233520', '#0F1F0D', '#9ED091', '#6CC6B1', '#152F29', '#E0B74D', '#342B11', '#E68E73', '#3A2018', '#8EB3D8', '#192633', 'rgba(22,28,21,.94)', 'rgba(0,0,0,.55)']),
  },
  {
    key: 'blueberry',
    name: 'Blueberry',
    longName: 'Blueberry Pancake',
    tagline: 'Playful and friendly. Lavender cream, blueberry indigo, maple amber. Rounded, chunky headings.',
    title: { family: NUNITO, variation: 'normal', letterSpacing: '-0.01em', weight: 800 },
    light: palette(['#F6F4FC', '#FFFFFF', '#ECE8F7', '#211C3B', '#6B6589', '#AAA5C4', '#E1DCF1', '#4F46D8', '#E4E2FB', '#FFFFFF', '#453DC4', '#2D8A5E', '#DBF0E4', '#B5741A', '#F8E9D1', '#C0457E', '#F8DEEA', '#2C7DB2', '#DCEDF8', 'rgba(252,251,255,.94)', 'rgba(30,24,60,.36)']),
    dark: palette(['#110F22', '#1B1832', '#252140', '#EEEBFB', '#A29EC2', '#615C84', '#2E2A4D', '#8F89FF', '#29255A', '#13113A', '#A39EFF', '#6FD4A2', '#16302A', '#F1B55B', '#382914', '#F28FBC', '#3B1C2E', '#7DC0EB', '#15283A', 'rgba(22,20,42,.94)', 'rgba(0,0,0,.55)']),
  },
  {
    key: 'brunch',
    name: 'Brunch',
    longName: 'Sunday Brunch',
    tagline: 'Sunny and bold. Butter yellow, egg-yolk buttons with dark text, a quirky wonky serif. Loud in a good way.',
    title: { family: FRAUNCES, variation: '"SOFT" 100, "WONK" 1', letterSpacing: '-0.02em', weight: 700 },
    light: palette(['#FFF8E6', '#FFFFFF', '#FBEFCC', '#2A2112', '#7B6A45', '#BAA982', '#F0E1B9', '#F5B800', '#FDECB0', '#2A2112', '#8F6A00', '#3C8A4D', '#DCF0DC', '#C5480F', '#FDE2D2', '#1E708C', '#D8ECF3', '#5A63D3', '#E3E5FA', 'rgba(255,252,242,.94)', 'rgba(42,33,18,.36)']),
    dark: palette(['#16120A', '#211B0F', '#2C2414', '#FBF1D8', '#B4A37E', '#6D6146', '#3A301C', '#F7C521', '#3B3010', '#221A04', '#F7C521', '#7DCB8A', '#1A2F1E', '#F59A5B', '#3A2214', '#6CC4DE', '#142F39', '#9CA6F6', '#1D2140', 'rgba(28,23,13,.94)', 'rgba(0,0,0,.55)']),
  },
  {
    key: 'nordic',
    name: 'Nordic',
    longName: 'Nordic Pantry',
    tagline: 'Quiet and premium. Warm greyscale, near-black buttons, sage and clay as the only colour. Tight sans headings.',
    title: { family: INTER, variation: 'normal', letterSpacing: '-0.035em', weight: 700 },
    light: palette(['#F6F6F3', '#FFFFFF', '#EDEDE9', '#141413', '#6A6A66', '#ADADA7', '#E3E3DE', '#1A1A19', '#EAEAE6', '#FFFFFF', '#1A1A19', '#4A7A5E', '#E1ECE4', '#9A6A14', '#F4EAD6', '#8C5B45', '#F1E5DF', '#46708F', '#E2EBF1', 'rgba(250,250,248,.94)', 'rgba(20,20,19,.34)']),
    dark: palette(['#0D0D0C', '#171716', '#222220', '#F2F2EF', '#9A9A94', '#5A5A55', '#2A2A28', '#F2F2EF', '#272725', '#111110', '#F2F2EF', '#82C29E', '#15271D', '#E2B15C', '#2F2412', '#D39D84', '#2E211B', '#8EB8D5', '#162430', 'rgba(20,20,19,.94)', 'rgba(0,0,0,.6)']),
  },
];

export const DEFAULT_THEME_KEY = 'tomato';

export const TOMATO = THEMES[0];

export const themeNamed = (key: string | null | undefined): ThemeDef | undefined => THEMES.find((t) => t.key === key);

/**
 * The colour pairs from before the five themes, and the theme each became. The server moves
 * stored values over and accepts these on the way in; this is for a copy cached in the browser
 * by the old app.
 */
export const LEGACY_PRESETS: Record<string, ThemeDef['key']> = {
  classic: 'tomato',
  mocha: 'tomato',
  basil: 'matcha',
  lagoon: 'matcha',
  ocean: 'blueberry',
  plum: 'blueberry',
  graphite: 'nordic',
};

/**
 * Danger is not one of the mockup's tokens — its destructive buttons are tomato text — so every
 * theme borrows Tomato's own: a red that reads on all five papers, rather than a "danger" that is
 * green in Matcha and black in Nordic.
 */
export const DANGER = {
  light: { danger: '#C2461F', dangerSoft: '#FBE4DA' },
  dark: { danger: '#F2825F', dangerSoft: '#42251C' },
};
