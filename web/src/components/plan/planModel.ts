import type { MealPlanEntry, MealType, Recipe, RecipeSection } from '../../api/types';
import type { IconName } from '../icons';
import type { PillTone } from '../ui';
import { entryLabel, formatTime, isPlanned } from '../../utils/planEntry';
import { sectionLabel } from '../../utils/recipeMeta';
import { formatMinutes, totalMinutes } from '../../utils/recipeFormat';
import { sourceLabel } from '../../utils/savedLinks';
import type { CategoryTree } from '../../utils/categoryTree';

/*
 The Plan's shared vocabulary: dates as the server writes them, a day's meals grouped into
 slots, and what each slot means for the shopping. Every Plan screen reads these, so a slot
 looks and reads the same in the calendar's list, Upcoming, the day sheet and the add sheet.
*/

export const BASE_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
export const ALL_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** A recipe made from a slot is filed where you would go looking for it. */
export const SECTION_FOR_MEAL: Record<MealType, RecipeSection> = {
  BREAKFAST: 'BREAKFAST',
  LUNCH: 'LUNCH',
  DINNER: 'DINNER',
  SNACK: 'SNACKS',
};

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** Monday-first, as the mockup's calendar is: 0 for a Monday, 6 for a Sunday. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function mealTitle(meal: MealType): string {
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}

/** "6:30 pm": the mockup writes times in lower case, and so does the plan. */
export function slotTime(time: string | null): string | null {
  return formatTime(time)?.toLowerCase() ?? null;
}

/** "Tue 29" */
export function shortDay(d: Date): string {
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`;
}

/** "Thursday" — or "Today" and "Tomorrow", which is how anyone says them. */
export function relativeDay(d: Date, today: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

/** One meal of one day: a main and the sides planned with it, in the order they were added. */
export interface Slot {
  meal: MealType;
  dishes: MealPlanEntry[];
}

/** A day's planned meals, breakfast to snack. Empty slots are left out. */
export function slotsOf(entries: MealPlanEntry[]): Slot[] {
  return ALL_MEALS.map((meal) => ({ meal, dishes: entries.filter((e) => e.mealType === meal && isPlanned(e)) })).filter(
    (s) => s.dishes.length > 0,
  );
}

/** A side goes with something cooked; a night out or a single food takes none. */
export function takesSides(dishes: MealPlanEntry[]): boolean {
  return dishes.some((d) => d.recipeId || d.recipeDeleted || d.savedLinkId);
}

/** The time a slot is at: the first of its dishes that has one. */
export function timeOf(dishes: MealPlanEntry[]): string | null {
  return dishes.find((d) => d.time)?.time ?? null;
}

/** What the server says a meal means for the shopping (GET …/grocery-list/plan-status). */
export interface PlannedShopping {
  entryId: string;
  status: 'ON_LIST' | 'NOT_ON_LIST' | 'IN_CUPBOARD' | 'NO_INGREDIENTS' | 'EAT_OUT' | 'LINK' | 'DELETED';
  toAdd: string[];
  needs: number;
  inCupboard: number;
}

export type ShoppingMap = Map<string, PlannedShopping>;

/** Whether the week's button would put anything on the list for this dish. */
export function contributes(entry: MealPlanEntry): boolean {
  return Boolean(entry.recipeId) && !entry.needsIngredients;
}

export interface SlotMark {
  label: string;
  tone: PillTone;
  icon: IconName;
  /** "+ Add" beside it: something is still to buy. */
  canAdd: boolean;
}

/**
 * The one pill a slot gets on the plan: eating out, still to shop for, on the list already, or
 * all in the cupboard. Worst news first — a dinner with one side still to buy is "Not on list".
 * Null while the shopping is still being worked out, or for a slot with nothing to say.
 */
export function slotMark(dishes: MealPlanEntry[], shopping: ShoppingMap | null): SlotMark | null {
  if (dishes.some((d) => d.placeId)) return { label: 'Eat out', tone: 'plum', icon: 'utensils', canAdd: false };
  if (!shopping) return null;
  const cooked = dishes.filter(contributes);
  const states = cooked.map((d) => shopping.get(d.id)?.status).filter(Boolean);
  if (states.includes('NOT_ON_LIST')) return { label: 'Not on list', tone: 'mustard', icon: 'alert', canAdd: true };
  if (states.length > 0 && states.every((s) => s === 'IN_CUPBOARD'))
    return { label: 'All in cupboard', tone: 'sky', icon: 'cupboard', canAdd: false };
  if (states.length > 0) return { label: 'On grocery list', tone: 'herb', icon: 'check', canAdd: false };
  if (dishes.some((d) => d.needsIngredients)) return { label: 'No ingredients yet', tone: 'mustard', icon: 'pen', canAdd: false };
  if (dishes.some((d) => d.savedLinkId && !d.recipeDeleted)) return { label: 'Saved link', tone: 'neutral', icon: 'link', canAdd: false };
  // A single food: whether it is waiting on the list, or in the cupboard.
  const item = dishes.find((d) => d.itemName);
  if (item) {
    const s = shopping.get(item.id)?.status;
    if (s === 'ON_LIST') return { label: 'On grocery list', tone: 'herb', icon: 'check', canAdd: false };
    if (s === 'IN_CUPBOARD') return { label: 'In the cupboard', tone: 'sky', icon: 'cupboard', canAdd: false };
    return { label: 'Not on list', tone: 'mustard', icon: 'alert', canAdd: false };
  }
  return null;
}

/** The icon a recipe's placeholder picture carries: what kind of meal it is. */
export function mealIcon(section: RecipeSection | null | undefined, meal?: MealType): IconName {
  switch (section ?? (meal ? SECTION_FOR_MEAL[meal] : null)) {
    case 'BREAKFAST':
      return 'coffee';
    case 'LUNCH':
      return 'sandwich';
    case 'DINNER':
      return 'soup';
    case 'SNACKS':
      return 'cookie';
    case 'DRINKS':
      return 'cup';
    default:
      return 'utensils';
  }
}

const GREENS = /\b(salads?|slaw|greens|veg|veggies?|vegetables?)\b/i;
const SPOON = /\b(soups?|curry|curries|stews?|chil[il]i|ramen|pho|broth|dh?al|laksa|chowder|gumbo|risotto|porridge|oats)\b/i;

/**
 * The icon on a recipe's drawn plate: what kind of dish it is, so a dinner of chicken, potatoes
 * and a salad is three different plates rather than three soup bowls. Its name first (a curry
 * is eaten from a bowl whatever drawer it is in), then its groups (a Side is a fork and knife),
 * then its drawer — a dinner's main gets the chef's hat, as the mockup draws one.
 */
export function dishIcon(
  dish: { name?: string | null; section?: RecipeSection | null; categories?: string[] } | undefined,
  meal?: MealType,
): IconName {
  const name = dish?.name ?? '';
  const groups = (dish?.categories ?? []).join(' ');
  if (GREENS.test(name)) return 'leaf';
  if (SPOON.test(name)) return 'soup';
  if (/\begg/i.test(name)) return 'egg';
  if (/\bside/i.test(groups)) return 'utensils';
  if (GREENS.test(groups)) return 'leaf';
  const section = dish?.section ?? (meal ? SECTION_FOR_MEAL[meal] : null);
  return section === 'DINNER' ? 'chef' : mealIcon(section);
}

/** The line under a dish in the day sheet: what kind of thing it is, and what it means. */
export function dishDetail(entry: MealPlanEntry, recipe: Recipe | undefined): string {
  if (entry.recipeDeleted) return entry.savedLinkDeleted ? 'Saved link was deleted' : 'Recipe was deleted';
  if (entry.placeId) return 'Eat out';
  if (entry.savedLinkId) return `Saved link · ${sourceLabel({ source: entry.savedLinkSource, url: entry.savedLinkUrl })}`;
  if (entry.itemName) return entry.runningLow ? 'Running low' : entry.inCupboard ? 'In the cupboard' : 'Not in the cupboard';
  if (entry.needsIngredients) return 'No ingredients yet';
  const minutes = recipe ? totalMinutes(recipe) : null;
  return minutes ? `Recipe · ${formatMinutes(minutes)}` : 'Recipe';
}

/**
 * "Dinner › Main dish › Chicken": where a recipe is filed, as the path you would tap down in
 * Recipes. A recipe carries its groups by name and in no order, so the household's tree (when it
 * has loaded) puts them in their nesting: the deepest group's path, and any group not on that
 * path beside it ("… › Chicken · Quick").
 */
export function filingLine(recipe: Recipe, tree?: CategoryTree | null): string {
  const drawer = recipe.section ? sectionLabel(recipe.section) : null;
  if (!tree || recipe.categories.length === 0) {
    return [drawer, recipe.categories.join(' · ')].filter(Boolean).join(' › ');
  }
  const paths = recipe.categories
    .map((name) => {
      const group = tree.byName.get(name.toLowerCase());
      return group ? tree.path(group.id).map((g) => g.name) : [name];
    })
    .sort((a, b) => b.length - a.length);
  const [deepest, ...others] = paths;
  const onPath = new Set(deepest.map((n) => n.toLowerCase()));
  const beside = others.map((p) => p[p.length - 1]).filter((n) => !onPath.has(n.toLowerCase()));
  const groups = [...deepest.slice(0, -1), [deepest[deepest.length - 1], ...beside].join(' · ')];
  return [drawer, ...groups].filter(Boolean).join(' › ');
}

/** The sides, as the line under a slot's main: "+ Roasted potatoes, Green salad". */
export function sidesLine(dishes: MealPlanEntry[]): string | null {
  const sides = dishes.slice(1).map((d) => entryLabel(d)).filter(Boolean);
  return sides.length ? `+ ${sides.join(', ')}` : null;
}

/** How a slot's dishes are counted on its tile in the day sheet. */
export function dishCount(dishes: MealPlanEntry[]): string {
  if (dishes.length === 0) return 'Empty';
  if (dishes.some((d) => d.placeId)) return 'Eat out';
  return dishes.length === 1 ? '1 dish' : `${dishes.length} dishes`;
}
