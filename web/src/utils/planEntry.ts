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

/** "17:00" from the server becomes "5:00 PM" — or whatever the reader's locale calls it. */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
