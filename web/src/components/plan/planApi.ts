import { api } from '../../api/client';
import type { MealPlanEntry, MealType } from '../../api/types';
import { isoDate, type PlannedShopping, type ShoppingMap } from './planModel';

/*
 The Plan's calls, in one place. Nothing new on the server except plan-status, which only reads.
*/

/** What can go in a slot: a recipe, a single food, a saved link, or a place. */
export type Filling =
  | { recipeId: string; includedOptionalIngredientIds?: string[] }
  | { itemName: string }
  | { savedLinkId: string }
  | { placeId: string; time?: string | null };

export async function planRange(householdId: string, start: Date, end: Date): Promise<MealPlanEntry[]> {
  return api<MealPlanEntry[]>(
    'GET',
    `/api/households/${householdId}/meal-plan?start=${isoDate(start)}&end=${isoDate(end)}`,
  );
}

/** Where each meal stands with the shopping. An older server has no such call: no marks, no error. */
export async function shoppingFor(householdId: string, start: Date, end: Date): Promise<ShoppingMap | null> {
  try {
    const all = await api<PlannedShopping[]>(
      'GET',
      `/api/households/${householdId}/grocery-list/plan-status?start=${isoDate(start)}&end=${isoDate(end)}`,
    );
    return new Map(all.map((s) => [s.entryId, s]));
  } catch {
    return null;
  }
}

/** Puts something in a slot, or swaps one dish for another (`replacing`). */
export async function fillSlot(
  householdId: string,
  date: string,
  meal: MealType,
  what: Filling,
  { replacing, servings }: { replacing?: MealPlanEntry | null; servings: number },
) {
  if (replacing) {
    const body: Record<string, unknown> = { ...what };
    if ('placeId' in what) {
      body.time = what.time || null;
      body.clearTime = !what.time;
    }
    // A place or a single item has no servings; a recipe taking its place needs some.
    if ('recipeId' in what && replacing.servings == null) body.servings = servings;
    return api<MealPlanEntry>('PATCH', `/api/households/${householdId}/meal-plan/entries/${replacing.id}`, body);
  }
  return api<MealPlanEntry>('POST', `/api/households/${householdId}/meal-plan/entries`, {
    date,
    mealType: meal,
    ...what,
    servings: 'recipeId' in what ? servings : null,
  });
}

export async function patchEntry(householdId: string, entryId: string, body: Record<string, unknown>) {
  return api<MealPlanEntry>('PATCH', `/api/households/${householdId}/meal-plan/entries/${entryId}`, body);
}

export async function removeEntry(householdId: string, entryId: string) {
  await api('DELETE', `/api/households/${householdId}/meal-plan/${entryId}`);
}

/** One meal's own "Add to groceries": everything it needs, whatever happened to it before. */
export async function addMealToGroceries(householdId: string, entryId: string) {
  await api('POST', `/api/households/${householdId}/grocery-list/add-meal/${entryId}`);
}

/** The week's button, one day at a time so a day left unticked is left out. */
export async function addDaysToGroceries(householdId: string, dates: string[]) {
  for (const d of dates) {
    await api('POST', `/api/households/${householdId}/grocery-list/add-all?start=${d}&end=${d}`);
  }
}
