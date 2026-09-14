import type { GroceryCategory } from '../api/types';

/** Items grouped by category, in the household's own order. Unsorted items (no category) come last. */
export function groupByCategory<T extends { categoryId: string | null }>(
  items: T[],
  categories: GroceryCategory[],
): { category: GroceryCategory | null; items: T[] }[] {
  const byCategory = new Map<string, T[]>();
  const unsorted: T[] = [];
  for (const item of items) {
    if (item.categoryId == null) {
      unsorted.push(item);
      continue;
    }
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  const groups: { category: GroceryCategory | null; items: T[] }[] = [...categories]
    .sort((a, b) => a.position - b.position)
    .filter((c) => byCategory.has(c.id))
    .map((category) => ({ category, items: byCategory.get(category.id)! }));

  if (unsorted.length > 0) {
    groups.push({ category: null, items: unsorted });
  }
  return groups;
}
