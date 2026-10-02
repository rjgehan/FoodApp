import type { CupboardItem, GroceryListItem, RestockReminder } from '../../api/types';
import { formatQuantity } from '../../utils/recipeFormat';
import { everyTitle } from '../../utils/restock';

/**
 * The count words a list is written in, and their plurals: "2 bags baby spinach", not "2 bag".
 * Only these — weights and measures ("2 lb", "500 g") stay as they are.
 */
const COUNT_UNITS: Record<string, string> = {
  bag: 'bags', tin: 'tins', can: 'cans', jar: 'jars', cup: 'cups', bottle: 'bottles', box: 'boxes',
  pack: 'packs', packet: 'packets', carton: 'cartons', tub: 'tubs', pot: 'pots', punnet: 'punnets',
  bunch: 'bunches', head: 'heads', clove: 'cloves', slice: 'slices', loaf: 'loaves', piece: 'pieces',
  stick: 'sticks', sprig: 'sprigs', handful: 'handfuls', pinch: 'pinches', fillet: 'fillets',
  block: 'blocks', bar: 'bars', roll: 'rolls', sheet: 'sheets', tray: 'trays', bulb: 'bulbs',
};

/** "bags" for 2 bags; a unit the list does not know, or one already plural, is left alone. */
export function unitFor(quantity: number | null, unit: string | null): string | null {
  if (!unit) return unit;
  const plural = quantity != null && quantity > 1 ? COUNT_UNITS[unit.toLowerCase()] : undefined;
  return plural ?? unit;
}

/** "2 lb", "3", "2 bags" — or null when the row has no amount. */
export function amountOf(item: { quantity: number | null; unit: string | null }): string | null {
  const quantity = item.quantity != null ? Number(item.quantity) : null;
  const parts = [quantity != null ? formatQuantity(quantity) : '', unitFor(quantity, item.unit) ?? ''].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** "Chicken thighs": a name as the title of its own sheet. */
export function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The line under a row: the recipes that put it on the list, or who typed it in. Somebody who
 * ticks a thing off is mentioned too, since two people can shop one list at once — as "you" when
 * it was you.
 */
export function rowDetail(item: GroceryListItem, myUserId?: string | null): string | null {
  const recipes = item.fromRecipes ?? [];
  const added = recipes.length ? null : item.addedByName;
  const gotBy = item.checkedByUserId && item.checkedByUserId === myUserId ? 'you' : item.checkedByName;
  const parts = [
    recipes.length ? recipes.join(', ') : added ? `Added by ${added}` : null,
    // "Added by Jo · got by Jo" says one thing twice — but only when "Added by Jo" is showing.
    item.checked && gotBy && !(added && item.checkedByName === added) ? `got by ${gotBy}` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "Cupboard says you have 1" — what the cupboard knows, for a row a meal put on the list. */
export function cupboardSays(stock: CupboardItem | undefined): string {
  if (stock?.quantity != null) {
    return `Cupboard says you have ${amountOf(stock)}`;
  }
  return 'Cupboard says you have some';
}

/** The cupboard's row in an item's sheet: "None recorded", "Always have", "Have 3 tins", "Running low". */
export function cupboardState(stock: CupboardItem | undefined): string {
  if (!stock) return 'None recorded';
  if (stock.staple) return 'Always have';
  if (stock.quantity != null) {
    return stock.quantity > 0 ? `Have ${amountOf(stock)}` : 'None left';
  }
  return stock.runningLow ? 'Running low' : 'Have some';
}

/** "Every 2 weeks · next Tue 13 Oct". */
export function reminderLine(reminder: RestockReminder): string {
  const next = new Date(reminder.dueAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${everyTitle(reminder.everyDays)} · next ${next.replace(',', '')}`;
}
