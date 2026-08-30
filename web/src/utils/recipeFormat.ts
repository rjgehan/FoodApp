import type { Recipe } from '../api/types';

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'], [0.5, '½'],
  [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞'],
];

/** "0.50" reads like a spreadsheet; "½" reads like a recipe. */
export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.02) return String(whole);

  const match = FRACTIONS.find(([v]) => Math.abs(rest - v) < 0.02);
  if (!match) return String(Math.round(value * 100) / 100);
  return whole ? `${whole}${match[1]}` : match[1];
}

export function totalMinutes(recipe: Recipe): number | null {
  const total = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
  return total > 0 ? total : null;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** Instructions arrive as free text; strip any numbering the writer already added. */
export function instructionSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  return instructions
    .split('\n')
    .map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s*/, ''))
    .filter(Boolean);
}

/*
 * Spelled out rather than built with a template string: Tailwind scans source for literal class
 * names and drops anything it cannot see, so `cover-${n}` would be stripped from the stylesheet.
 */
const COVERS = ['cover-0', 'cover-1', 'cover-2', 'cover-3', 'cover-4', 'cover-5'] as const;

/** Stable per-recipe tint so a card looks the same every time you scroll past it. */
export function coverClass(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[hash % COVERS.length];
}
