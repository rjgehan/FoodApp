import type { Household } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';

/**
 * Where the app opens, and where "home" is after signing in, joining or finishing something:
 * Recipes. The household's recipes and its grocery list are the app; planning and the cupboard
 * are optional, so neither can be the front door. Takes the household so that, should home ever
 * depend on what a household has turned on, every caller already asks the right question.
 */
export function homePath(_household?: Household | null): string {
  return '/recipes';
}

/** The home path for the household on screen. */
export function useHomePath(): string {
  const { activeHousehold } = useHousehold();
  return homePath(activeHousehold);
}
