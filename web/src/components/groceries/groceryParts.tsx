import type { CupboardItem, GroceryListItem, RestockReminder } from '../../api/types';
import { formatQuantity } from '../../utils/recipeFormat';
import { everyTitle } from '../../utils/restock';

/** "2 lb", "3", "1 bag" — or null when the row has no amount. */
export function amountOf(item: { quantity: number | null; unit: string | null }): string | null {
  const parts = [item.quantity != null ? formatQuantity(Number(item.quantity)) : '', item.unit ?? ''].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** "Chicken thighs": a name as the title of its own sheet. */
export function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The line under a row: the recipes that put it on the list, or who typed it in. Somebody who
 * ticks a thing off is mentioned too, since two people can shop one list at once.
 */
export function rowDetail(item: GroceryListItem): string | null {
  const recipes = item.fromRecipes ?? [];
  const parts = [
    recipes.length ? recipes.join(', ') : item.addedByName ? `Added by ${item.addedByName}` : null,
    // "Added by Jo · got by Jo" says one thing twice.
    item.checked && item.checkedByName && item.checkedByName !== item.addedByName ? `got by ${item.checkedByName}` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "Cupboard says you have 1" — what the cupboard knows, for a row a meal put on the list. */
export function cupboardSays(stock: CupboardItem | undefined): string {
  if (stock?.quantity != null) {
    return `Cupboard says you have ${formatQuantity(stock.quantity)}${stock.unit ? ` ${stock.unit}` : ''}`;
  }
  return 'Cupboard says you have some';
}

/** The cupboard's row in an item's sheet: "None recorded", "Always have", "3 tins", "Running low". */
export function cupboardState(stock: CupboardItem | undefined): string {
  if (!stock) return 'None recorded';
  if (stock.staple) return 'Always have';
  if (stock.quantity != null) {
    return stock.quantity > 0 ? `${formatQuantity(stock.quantity)}${stock.unit ? ` ${stock.unit}` : ''}` : 'None left';
  }
  return stock.runningLow ? 'Running low' : 'Have some';
}

/** "Every 2 weeks · next Tue 13 Oct". */
export function reminderLine(reminder: RestockReminder): string {
  const next = new Date(reminder.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${everyTitle(reminder.everyDays)} · next ${next.replace(',', '')}`;
}
