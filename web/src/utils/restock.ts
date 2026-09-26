/** The choices offered first, in days. Anything else is "every N days". */
export const RESTOCK_PRESETS = [7, 14, 21, 28];

/** "every 3 weeks", "every week", "every 10 days" — lower case, to sit in a line of detail. */
export function everyLabel(days: number): string {
  if (days === 1) return 'every day';
  if (days === 7) return 'every week';
  if (days % 7 === 0) return `every ${days / 7} weeks`;
  return `every ${days} days`;
}

/** The same, starting a sentence or a menu option. */
export function everyTitle(days: number): string {
  const label = everyLabel(days);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "last bought Sep 2" — with the year only when it is not this one. */
export function lastBoughtLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return `last bought ${date.toLocaleDateString(undefined, options)}`;
}
