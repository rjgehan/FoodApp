import type { RecipeCategory, RecipeSection } from '../api/types';

/** The fixed top level of the catalog, in the order the chooser lists them. */
export const SECTION_OPTIONS: { value: RecipeSection; label: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'SNACKS', label: 'Snacks' },
  { value: 'DRINKS', label: 'Drinks' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Not a real section — recipes another household shared with you have no filing of yours yet,
 * so the catalog gathers them here until you move them somewhere.
 */
export const SHARED_KEY = 'shared';

export function sectionLabel(section: RecipeSection | null): string {
  if (!section) return 'Shared';
  return SECTION_OPTIONS.find((s) => s.value === section)?.label ?? 'Other';
}

/** URL segment <-> section, so /recipes/section/breakfast reads properly. */
export function sectionSlug(section: RecipeSection): string {
  return section.toLowerCase();
}

export function sectionFromSlug(slug: string | undefined): RecipeSection | null {
  const match = SECTION_OPTIONS.find((s) => sectionSlug(s.value) === slug);
  return match ? match.value : null;
}

export interface Filing {
  section: RecipeSection;
  categories: string[];
}

export const DEFAULT_FILING: Filing = { section: 'DINNER', categories: [] };

/**
 * Moving a recipe to another drawer before it is saved. Groups belong to a drawer, and the
 * server files a recipe by group name, making any it cannot find — so a ticked group left behind
 * in the old drawer would quietly become a new, empty group of the same name in this one. Those
 * are set aside in `parked` instead, and ticked again if the recipe moves back to a drawer that
 * has them. A name the household has no group for anywhere was typed in as a new group, and
 * goes wherever the recipe goes.
 */
export function moveToDrawer(
  filing: Filing,
  section: RecipeSection,
  known: RecipeCategory[],
  parked: string[],
): { filing: Filing; parked: string[] } {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const inDrawer = (name: string) =>
    known.some((c) => same(c.name, name) && (c.section === null || c.section === section));
  const isKnown = (name: string) => known.some((c) => same(c.name, name));

  const kept = filing.categories.filter((name) => !isKnown(name) || inDrawer(name));
  const setAside = filing.categories.filter((name) => !kept.includes(name));
  const back = parked.filter((name) => inDrawer(name) && !kept.some((k) => same(k, name)));
  return {
    filing: { section, categories: [...kept, ...back] },
    parked: [...parked.filter((name) => !back.includes(name)), ...setAside].filter(
      (name, i, all) => all.findIndex((other) => same(other, name)) === i,
    ),
  };
}
