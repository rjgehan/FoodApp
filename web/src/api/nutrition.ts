/*
 What the server's /api/nutrition answers with (NutritionDtos.java), and the few ways the
 Nutrition screens write its numbers down. The numbers themselves are always the server's: the
 web only rounds them for showing and scales a label to a serving.
*/

/** Where the numbers come from, worded as each source asks to be credited. */
export interface Attribution {
  text: string;
  url: string;
  licence: string;
}

/** Rounded already: whole kcal and mg, one decimal for grams. Null is "not known". */
export interface NutrientValues {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  sugars: number | null;
  satFat: number | null;
  saltG: number | null;
  sodiumMg: number | null;
  ironMg: number | null;
  calciumMg: number | null;
  vitaminCMg: number | null;
  potassiumMg: number | null;
}

/** Each macro's share of the calories, whole percents that add up to 100. */
export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/** good (herb), info (sky) or warn (mustard). */
export interface LabelBadge {
  key: string;
  label: string;
  tone: 'good' | 'info' | 'warn';
}

/** One line of a label's details, per 100 g: "Calcium · 17% of daily". */
export interface LabelDetail {
  key: string;
  label: string;
  amount: number | null;
  unit: string;
  percentDaily: number | null;
}

export interface FoodLabel {
  fdcId: number;
  name: string;
  category: string;
  dataset: string;
  per100g: NutrientValues;
  split: MacroSplit;
  details: LabelDetail[];
  badges: LabelBadge[];
  portions: { label: string; grams: number }[];
  attribution: Attribution;
}

export interface ProductLabel {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  packGrams: number | null;
  liquid: boolean;
  servingSize: string | null;
  servingGrams: number | null;
  per100g: NutrientValues;
  perServing: NutrientValues | null;
  split: MacroSplit;
  details: LabelDetail[];
  badges: LabelBadge[];
  nutriScore: string | null;
  novaGroup: number | null;
  hasNutrition: boolean;
  attribution: Attribution;
}

export interface Reference {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugars: number;
  satFat: number;
  saltG: number;
  fibre: number;
  /** "a 2,000 kcal day" */
  label: string;
  source: string;
}

export interface Contributor {
  recipeIngredientId: string;
  ingredientId: string;
  name: string;
  fdcId: number;
  foodName: string;
  amount: string;
  grams: number;
  estimated: boolean;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Of the whole recipe's calories, 0–1. */
  share: number;
}

export type NotCountedReason = 'OPTIONAL' | 'NO_AMOUNT' | 'NO_MATCH' | 'NO_WEIGHT';

export interface NotCounted {
  recipeIngredientId: string;
  ingredientId: string;
  name: string;
  reason: NotCountedReason;
  optional: boolean;
}

export interface RecipeNutrition {
  recipeId: string;
  name: string;
  recipeServings: number;
  servings: number;
  perServing: NutrientValues;
  forServings: NutrientValues;
  perRecipe: NutrientValues;
  split: MacroSplit;
  reference: Reference;
  percentOfReference: { kcal: number | null };
  highlights: string[];
  summary: string | null;
  contributors: Contributor[];
  notCounted: NotCounted[];
  linesCounted: number;
  linesTotal: number;
  complete: boolean;
  note: string;
  attribution: Attribution;
}

export interface PlanDay {
  date: string;
  totals: NutrientValues;
  mealsPlanned: number;
  mealsCounted: number;
  partial: boolean;
}

export interface PlanNutrition {
  start: string;
  end: string;
  days: PlanDay[];
  average: NutrientValues;
  daysCounted: number;
  mealsPlanned: number;
  mealsCounted: number;
  reference: Reference;
  note: string;
  attribution: Attribution;
}

export interface FoodHit {
  fdcId: number;
  name: string;
  category: string;
  kcal: number | null;
  protein: number | null;
}

export interface ProductHit {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  kcal: number | null;
}

export interface RecipeHit {
  id: string;
  name: string;
  kcalPerServing: number | null;
}

/** productsStatus: ok, cached, skipped, debounced, busy (rate limit), unavailable. */
export interface SearchAnswer {
  query: string;
  ingredients: FoodHit[];
  products: ProductHit[];
  productsStatus: string;
  recipes: RecipeHit[];
}

export type LookupKind = 'FOOD' | 'PRODUCT' | 'RECIPE';

export interface RecentLookup {
  kind: LookupKind;
  ref: string;
  label: string;
  kcal: number | null;
  protein: number | null;
  /** "100g" or "serving" */
  per: string;
  lookedAt: string;
}

/** The USDA citation, for anywhere ingredient data is shown before an answer has carried it. */
export const USDA: Attribution = {
  text: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2026. fdc.nal.usda.gov.',
  url: 'https://fdc.nal.usda.gov/',
  licence: 'CC0 1.0 (public domain)',
};

/** Something a packet's barcode could be: what the server will look up. */
export const BARCODE = /^\d{8,14}$/;

// --- Writing the numbers down ---------------------------------------------------------------

/** "2,140" */
export function kcalText(kcal: number | null | undefined): string {
  return kcal == null ? '–' : Math.round(kcal).toLocaleString('en-GB');
}

/** "17g", "6.3g", "0.7g": whole grams from 10 up, one decimal under it, no trailing ".0". */
export function gramsText(grams: number | null | undefined, unit = 'g'): string {
  if (grams == null) return '–';
  const rounded = grams >= 10 ? Math.round(grams) : Math.round(grams * 10) / 10;
  return `${rounded.toLocaleString('en-GB')}${unit}`;
}

/** "Sugars 6g", "Calcium 17% of daily": the per-cent where there is one, else the amount. */
export function detailText(detail: LabelDetail, scale = 1): string {
  if (detail.percentDaily != null) return `${Math.round(detail.percentDaily * scale)}% of daily`;
  if (detail.amount == null) return '–';
  const amount = detail.amount * scale;
  if (detail.unit === 'g') return gramsText(amount);
  return `${amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10} ${detail.unit}`;
}

/**
 * A USDA name made readable: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned,
 * drained solids" is "Chickpeas", with "mature seeds, canned, drained solids" to say which.
 * The bracketed other names and the first comma are where USDA puts the food and its kind.
 */
export function foodTitle(name: string): { title: string; detail: string } {
  const plain = name.replace(/\s*\([^)]*\)/g, '').replace(/\s+,/g, ',').trim();
  const comma = plain.indexOf(',');
  if (comma === -1) return { title: plain, detail: '' };
  return { title: plain.slice(0, comma).trim(), detail: plain.slice(comma + 1).trim() };
}

/** The first letter up: ingredient names are stored as typed ("chicken breast"). */
export function capitalised(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Monday as M, Tuesday as T…: the week chart's labels. */
export function dayLetter(iso: string): string {
  return weekday(iso).charAt(0);
}

export function weekday(iso: string, style: 'long' | 'short' = 'short'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: style });
}

/** `YYYY-MM-DD`, `days` from today on this device's clock. */
export function isoDay(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
