import type { MealPlanEntry } from '../api/types';

/**
 * A planned slot names a recipe, a place, or a single item. Everything that displays the plan
 * goes through these two so another kind is one edit, not a hunt for every `recipeName`.
 */
export function entryLabel(entry: MealPlanEntry): string | null {
  return entry.recipeName ?? entry.placeName ?? entry.itemName;
}

export function isPlanned(entry: MealPlanEntry): boolean {
  return Boolean(entry.recipeName || entry.placeName || entry.itemName);
}

/** "17:00" from the server becomes "5:00 PM" — or whatever the reader's locale calls it. */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
