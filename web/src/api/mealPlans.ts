import type { IconName } from '../components/icons';
import type { Hue, Tone } from '../components/ui';
import type { MealType, RecipeSection } from './types';
import { weekday } from './nutrition';

/*
 What the server's meal plans answer with (CupboardPlanDtos.java, TargetPlanDtos.java), and the
 few ways the Meal plans screens write it down. Every meal and every number is the server's: the
 web never picks a recipe or works out a target itself.
*/

// --- Cook from your cupboard (5.8, 5.9) -----------------------------------------------------

/** One suggestion for "Use these up first": `label` is "by Thu", "soon", "low" or "3 tins". */
export interface UseFirstItem {
  itemId: string;
  ingredientId: string;
  name: string;
  reason: 'date' | 'guess' | 'low' | 'plenty' | 'past';
  label: string;
  useBy: string | null;
  selected: boolean;
}

export interface CupboardSetup {
  items: number;
  useSoon: number;
  highlights: string[];
  useFirst: UseFirstItem[];
  /** The coming week from today, with what is on the Plan already. */
  days: { date: string; planned: MealType[] }[];
  defaultMeals: MealType[];
  defaultDays: number;
  /** Null is "any". */
  defaultBuyLimit: number | null;
  defaultOnlyMine: boolean;
  defaultServings: number;
  /** Past the date on the packet: shown as "check it", never suggested. Absent from older servers. */
  pastDate?: UseFirstItem[];
}

export interface CupboardPlanRequest {
  dates: string[];
  meals: MealType[];
  useFirst: string[];
  buyLimit: number | null;
  onlyMine: boolean;
  servings: number;
}

export interface DraftMeal {
  date: string;
  mealType: MealType;
  recipeId: string;
  name: string;
  section: RecipeSection | null;
  yours: boolean;
  coverImageId: string | null;
  percentFromCupboard: number;
  uses: string[];
  usesSoon: string[];
  toBuy: string[];
  servings: number;
}

export interface CupboardPlan {
  dates: string[];
  mealTypes: MealType[];
  buyLimit: number | null;
  onlyMine: boolean;
  servings: number;
  percentFromCupboard: number;
  itemsUsed: number;
  summary: string;
  meals: DraftMeal[];
  /** Slots with nothing in the draft: already on the Plan, or nothing fits. */
  open: { date: string; mealType: MealType; reason: 'PLANNED' | 'NOTHING_FITS' }[];
  toBuy: { ingredientId: string; name: string; meals: number }[];
  useSoonUsed: string[];
  useSoonLeft: string[];
  recipesConsidered: number;
  /** After a swap: false when nothing else could go there. */
  swapped: boolean | null;
}

export interface ApplyResult {
  added: number;
  skipped: { date: string; mealType: MealType; recipeId: string; reason: string }[];
  groceriesAdded: number;
  from: string | null;
  to: string | null;
}

// --- Plans for health targets (5.7, 5.10, 5.11) ----------------------------------------------

export type Goal = 'lose-fat' | 'maintain' | 'build-muscle';

export interface TargetOverrides {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

/** Who a plan is for. Metric on the wire; `units` only remembers how the form showed them. */
export interface TargetDetails {
  age: number;
  sex: string | null;
  heightCm: number;
  weightKg: number;
  activity: string;
  goal: Goal;
  preferences: string[];
  avoid: string[];
  useMyRecipesFirst: boolean;
  onlyMyRecipes: boolean;
  days: number;
  meals?: MealType[] | null;
  overrides?: TargetOverrides | null;
  description?: string | null;
  units: 'imperial' | 'metric';
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  computed: { kcal: number; protein: number; carbs: number; fat: number };
  overridden: ('kcal' | 'protein' | 'carbs' | 'fat')[];
  bmr: number;
  tdee: number;
  /** Plain sentences for under the numbers: a safety floor reached, or no room left for carbs. */
  notes?: string[];
}

export interface PlanMeal {
  day: number;
  mealType: MealType;
  recipeId: string;
  name: string;
  section: RecipeSection | null;
  yours: boolean;
  coverImageId: string | null;
  portion: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Deleted, or no longer readable: its numbers are nought. */
  missing: boolean;
  /** Some ingredients couldn't be counted, so the numbers are too low. */
  partial?: boolean;
  /** One serving's kcal: `kcal` is this times `portion`. */
  kcalPerServing?: number;
}

export interface TargetPlan {
  /** Null for a ready-made plan, which is worked out fresh each time and never stored. */
  id: string | null;
  preset: string | null;
  mine: boolean;
  name: string;
  description: string | null;
  goal: Goal;
  goalLabel: string;
  length: number;
  mealTypes: MealType[];
  tags: string[];
  icon: string;
  hue: string;
  targets: Targets;
  details: TargetDetails;
  days: { day: number; kcal: number; protein: number; carbs: number; fat: number; meals: PlanMeal[] }[];
  average: { kcal: number; protein: number; carbs: number; fat: number; kcalPercent: number; proteinPercent: number };
  allowed: number;
  summary: string;
  updatedAt: string | null;
}

export interface TargetPlanCard {
  id: string | null;
  preset: string | null;
  mine: boolean;
  name: string;
  subtitle: string;
  goal: Goal;
  tags: string[];
  icon: string;
  hue: string;
  kcal: number;
  protein: number;
  length: number;
  updatedAt: string | null;
}

export interface FormOptions {
  activities: { key: string; label: string; factor: number }[];
  goals: { key: Goal; label: string }[];
  preferences: { key: string; label: string; shown: boolean }[];
  lengths: number[];
  defaultMeals: MealType[];
}

export interface MealPlansHome {
  cupboard: { items: number; useSoon: number; highlights: string[] };
  filters: { key: string; label: string }[];
  plans: TargetPlanCard[];
  form: FormOptions;
}

// --- Where things go ------------------------------------------------------------------------

export const MEAL_PLANS = '/explore/meal-plans';
export const planPath = (card: { id: string | null; preset: string | null }) =>
  card.id ? `${MEAL_PLANS}/plans/${card.id}` : `${MEAL_PLANS}/ready-made/${card.preset}`;

// --- Writing it down ------------------------------------------------------------------------

/** The server names its marks for both apps; these are the web's drawings of them. */
const ICONS: Record<string, IconName> = { bolt: 'scale', cup: 'coffee' };
export function planIcon(name: string): IconName {
  return ICONS[name] ?? (name as IconName);
}

/** The card's picture colour: the herb plans take the mockup's deeper green. */
export function planHue(hue: string): Hue {
  return (hue === 'herb' ? 'green' : hue) as Hue;
}

/** The pill tone that goes with a plan's colour (5.7's "2,900 kcal" on the tomato card). */
export function planTone(hue: string): Tone {
  switch (hue) {
    case 'tomato':
      return 'accent';
    case 'herb':
    case 'green':
      return 'herb';
    case 'sky':
      return 'sky';
    case 'plum':
      return 'plum';
    default:
      return 'mustard';
  }
}

/** "Mon 5": a day as the setup's tiles and the result's headings write it. */
export function dayAndDate(iso: string): string {
  return `${weekday(iso)} ${Number(iso.slice(8, 10))}`;
}

/** "Mon 5 to Thu 8", or just "Mon 5" for one day. */
export function dateRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort();
  const first = dayAndDate(sorted[0]);
  const last = dayAndDate(sorted[sorted.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

/** A plan day's date, with day 0 on `start`. */
export function addDaysIso(start: string, days: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "1½ servings", "1 serving": how much of the recipe a plan's numbers are for. */
export function portionText(portion: number): string {
  const whole = Math.floor(portion);
  const half = portion - whole >= 0.5;
  const quarter = Math.abs(portion - whole - 0.25) < 0.01 ? '¼' : Math.abs(portion - whole - 0.75) < 0.01 ? '¾' : null;
  const number = quarter ? `${whole || ''}${quarter}` : `${whole || ''}${half ? '½' : ''}` || '0';
  return `${number} ${portion === 1 ? 'serving' : 'servings'}`;
}

const FEET_PER_CM = 1 / 30.48;

/** 180.3 cm as 5 ft 11. */
export function feetInches(cm: number): { ft: number; inches: number } {
  let ft = Math.floor(cm * FEET_PER_CM);
  let inches = Math.round(cm / 2.54 - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, inches };
}

export const cmFrom = (ft: number, inches: number) => Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
export const lbFrom = (kg: number) => Math.round(kg / 0.45359237);
export const kgFrom = (lb: number) => Math.round(lb * 0.45359237 * 10) / 10;

/** "20 · 5 ft 11 · 165 lb · Active 3–5x a week": who a plan of your own is for, in a line. */
export function whoLine(d: TargetDetails, activityLabel: string | undefined): string {
  const height = d.units === 'metric' ? `${Math.round(d.heightCm)} cm` : (({ ft, inches }) => `${ft} ft ${inches}`)(feetInches(d.heightCm));
  const weight = d.units === 'metric' ? `${Math.round(d.weightKg)} kg` : `${lbFrom(d.weightKg)} lb`;
  return [`Age ${d.age}`, height, weight, activityLabel].filter(Boolean).join(' · ');
}
