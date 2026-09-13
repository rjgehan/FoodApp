import type { StoreSection } from '../api/types';

export const STORE_SECTION_LABELS: Record<StoreSection, string> = {
  PRODUCE: 'Produce',
  BAKERY: 'Bread & bakery',
  DRY_GOODS: 'Dry goods',
  BAKING: 'Baking',
  SPICES: 'Spices',
  DELI: 'Deli',
  MEAT: 'Meat & seafood',
  DAIRY: 'Dairy & eggs',
  FROZEN: 'Frozen',
  DRINKS: 'Drinks',
  HOUSEHOLD: 'Household',
  OTHER: 'Other',
};

/** The server's default walking order — used until the household's own has loaded. */
export const DEFAULT_SECTION_ORDER: StoreSection[] = [
  'PRODUCE',
  'BAKERY',
  'DRY_GOODS',
  'BAKING',
  'SPICES',
  'DELI',
  'MEAT',
  'DAIRY',
  'FROZEN',
  'DRINKS',
  'HOUSEHOLD',
  'OTHER',
];

/** Items grouped by aisle, in the household's walking order, with empty aisles left out. */
export function groupBySection<T extends { section: StoreSection }>(
  items: T[],
  order: StoreSection[],
): { section: StoreSection; items: T[] }[] {
  const bySection = new Map<StoreSection, T[]>();
  for (const item of items) {
    const list = bySection.get(item.section) ?? [];
    list.push(item);
    bySection.set(item.section, list);
  }
  const sections = [...order, ...DEFAULT_SECTION_ORDER.filter((s) => !order.includes(s))];
  return sections.filter((s) => bySection.has(s)).map((section) => ({ section, items: bySection.get(section)! }));
}
