import type { RecipeSection } from '../api/types';

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
