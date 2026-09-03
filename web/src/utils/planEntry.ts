import type { MealPlanEntry } from '../api/types';

/**
 * A planned slot names either a recipe or a place. Everything that displays the plan goes
 * through these two so adding a third kind later is one edit, not a hunt for every `recipeName`.
 */
export function entryLabel(entry: MealPlanEntry): string | null {
  return entry.recipeName ?? entry.placeName;
}

export function isPlanned(entry: MealPlanEntry): boolean {
  return Boolean(entry.recipeName || entry.placeName);
}
