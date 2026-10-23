import { api } from './client';
import type { MealType, Recipe } from './types';

/*
 Meal ideas (POST /api/households/{id}/meal-ideas): a few recipes this household's kitchen can
 make, for the house that does not plan ahead. Nothing is saved; they go on the grocery list one
 recipe at a time, as the recipe page's Add to groceries puts them.
*/

export const MEAL_IDEAS = '/explore/meal-ideas';

/** The meals ideas are offered for, in the order the chips show them. */
export const IDEA_MEALS: { value: MealType; label: string; plural: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast', plural: 'breakfasts' },
  { value: 'LUNCH', label: 'Lunch', plural: 'lunches' },
  { value: 'DINNER', label: 'Dinner', plural: 'dinners' },
];

export interface MealIdeas {
  meal: MealType;
  /** Best first: the household's own, then what other households have published. */
  ideas: Recipe[];
  /** How many recipes for this meal the kitchen can make: what the ideas are chosen from. */
  canMake: number;
  /** How many recipes for this meal need a machine the kitchen doesn't have. */
  leftOut: number;
}

export function fetchMealIdeas(
  householdId: string,
  { meal, count, exclude }: { meal: MealType; count: number; exclude: string[] },
): Promise<MealIdeas> {
  return api<MealIdeas>('POST', `/api/households/${householdId}/meal-ideas`, { meal, count, exclude });
}
