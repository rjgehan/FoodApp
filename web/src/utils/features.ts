import type { Household } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';

/*
 The two parts of the app a household can do without: planning meals ahead (the Plan tab and
 everything that puts meals on it) and keeping track of its cupboard. Recipes and the grocery
 list are always there.

 Read through these rather than the flags themselves, so "missing means on" is said once: an
 older server sends no flags and has every feature. A household not loaded yet is another
 matter — useHouseholdKnown says when it is, and until then the two parts are neither shown nor
 taken away: their tabs wait and so do their screens, rather than being drawn and then whisked off.
*/

/** The household plans meals ahead: the Plan tab, "Add to plan", Explore's meal plans. */
export function planOn(household: Household | null | undefined): boolean {
  return household?.planEnabled !== false;
}

/** The household keeps a cupboard: the Cupboard tab, and the list skipping what is at home. */
export function cupboardOn(household: Household | null | undefined): boolean {
  return household?.cupboardEnabled !== false;
}

/**
 * Nobody in the household has answered the kitchen questions yet (or skipped them). Only a
 * server that says so outright counts: an older one, sending nothing, has nothing to ask.
 */
export function needsKitchenSetup(household: Household | null | undefined): boolean {
  return household?.kitchenSetUp === false;
}

/**
 * The machines in the household's kitchen, or null while it has not said which (none saved:
 * skipped, never asked, or an older server). With null nothing is "can't make", so the Can make
 * chips stay away rather than offering a filter that filters nothing.
 */
export function kitchenOf(household: Household | null | undefined): string[] | null {
  const machines = household?.machines ?? [];
  return machines.length > 0 ? machines : null;
}

/**
 * The household on screen is known: it is in the list kept from the last visit, or today's list
 * has been fetched. Not yet, on the first open in a browser that kept no list — the first visit
 * after an update, a new phone — when what it has turned on is anybody's guess.
 */
export function useHouseholdKnown(): boolean {
  const { activeHousehold, fresh } = useHousehold();
  return activeHousehold !== null || fresh;
}

/** What the household on screen has turned on. */
export function useFeatures(): { plan: boolean; cupboard: boolean } {
  const { activeHousehold } = useHousehold();
  return { plan: planOn(activeHousehold), cupboard: cupboardOn(activeHousehold) };
}
