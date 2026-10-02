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
  /** "reference" (the EU/UK reference intake) or "target" (your own plan for a health target). */
  source: string;
  /** With source "target": the plan's name, e.g. "Lean bulk". Only ever sent to its owner. */
  plan?: string | null;
}

export interface Contributor {
  recipeIngredientId: string;
  ingredientId: string;
  name: string;
  fdcId: number;
  foodName: string;
  amount: string;
  /** For the servings shown, not the whole recipe. */
  grams: number;
  /** WEIGHT, PORTION, VOLUME, TYPICAL, ROUGH or LEARNED. */
  gramsHow: string;
  /** "a fillet ≈ 130 g", "1 large = 50 g", "1 knob = 15 g (estimated)". */
  gramsBasis: string;
  estimated: boolean;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Of the whole recipe's calories, 0–1. */
  share: number;
  /** auto (the server's matching), ai (an iPhone's Apple Intelligence chose it) or user. */
  matchSource: string;
  /** The food is the server's (or a model's) best guess. */
  guess: boolean;
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
  /** Two or more meals counted: one of the days the average is of. */
  fuller?: boolean;
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
  /** How many days the average is of, and which: the fuller ones, partly planned ones, or none. */
  averageDays?: number;
  averageOver?: 'fuller' | 'partial' | 'none';
}

/**
 * What the week's average is of, for the line under it: "Average of the 3 days with two or more
 * meals planned", or "Average of 2 partly planned days" when no day has more than one meal yet —
 * so a week of single dinners is not read as how much anyone eats.
 */
export function averageWords(week: PlanNutrition, short = false): string {
  const n = week.averageDays ?? week.daysCounted;
  const days = n === 1 ? 'day' : 'days';
  // An older server says nothing of fuller days: its average is of every day with a meal.
  if (week.averageOver == null) return short ? "Daily average of this week's plan" : '';
  if (week.averageOver === 'partial') {
    return short
      ? `Average of ${n} partly planned ${days}`
      : `No day has two meals planned yet, so the average is of ${n} partly planned ${days}.`;
  }
  if (short) return `Average of ${n} ${days} with 2+ meals planned`;
  const left = week.daysCounted - n;
  return `The average is of the ${n === 1 ? 'one day' : `${n} days`} with two or more meals planned${
    left > 0 ? `; ${left === 1 ? 'a day' : `${left} days`} with one meal ${left === 1 ? 'is' : 'are'} left out` : ''
  }.`;
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

/** USDA's group words: the food is the next part ("Fish, salmon" is salmon, "Nuts, coconut milk" coconut milk). */
const GROUP_ONLY = new Set([
  'fish', 'nuts', 'spices', 'seeds', 'snacks', 'cereals', 'beverages', 'alcoholic beverage', 'alcoholic beverages',
  'candies', 'crustaceans', 'mollusks', 'leavening agents', 'game meat', 'sweeteners', 'soup', 'babyfood',
]);
/** Group words that are also the end of the food's name: "Oil, olive" is olive oil, "Cheese, cheddar" cheddar cheese. */
const GROUP_AFTER = new Set(['oil', 'cheese', 'sauce', 'beans', 'vinegar', 'rice', 'milk', 'yogurt']);
/** Meats, said first: "Chicken, broilers or fryers, breast" is chicken breast. */
const GROUP_BEFORE = new Set(['beef', 'pork', 'chicken', 'lamb', 'veal', 'turkey', 'duck']);
/** Parts of a USDA name that say how it was bred, sold or cooked rather than what it is. */
const NOT_THE_FOOD = /^(raw|cooked|fresh|frozen|canned|dry|dried|boiled|roasted|fluid|mature seeds|broilers? or fryers|roasting|fryers|all classes|retail parts|all grades|composite of .*|variety meats and by-products|new zealand|australian|imported|domestic|commercial|regular|plain|whole|nfs)$/i;

/**
 * A USDA name made readable: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned,
 * drained solids" is "Chickpeas", with "mature seeds, canned, drained solids" to say which.
 * The bracketed other names and the first comma are where USDA puts the food and its kind —
 * except where the first part is only a group ("Fish, salmon, Atlantic"), when the food is the
 * next part: Salmon, Olive oil, Coconut milk, Curry powder, Cheddar cheese, Chicken breast. The
 * title is also what Add to list and Cupboard add, so it must be the food, never "Fish".
 */
export function foodTitle(name: string): { title: string; detail: string } {
  const plain = name.replace(/\s*\([^)]*\)/g, '').replace(/\s+,/g, ',').trim();
  const parts = plain.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { title: plain, detail: '' };
  const group = parts[0].toLowerCase();
  const next = parts.findIndex((p, i) => i > 0 && !NOT_THE_FOOD.test(p));
  if (next > 0 && (GROUP_ONLY.has(group) || GROUP_AFTER.has(group) || GROUP_BEFORE.has(group))) {
    const what = parts[next];
    const title = GROUP_ONLY.has(group)
      ? capitalised(what)
      : GROUP_AFTER.has(group)
        ? `${capitalised(what)} ${group}`
        : what.toLowerCase() === 'ground'
          ? `Ground ${group}`
          : `${parts[0]} ${what.toLowerCase()}`;
    return { title, detail: parts.filter((_, i) => i !== 0 && i !== next).join(', ') };
  }
  return { title: parts[0], detail: parts.slice(1).join(', ') };
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
