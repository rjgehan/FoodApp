
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

/** Structural, not `Recipe`: a share-link recipe has these two fields and nothing else in common. */
export function totalMinutes(recipe: { prepTimeMinutes: number | null; cookTimeMinutes: number | null }): number | null {
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
 * names and drops anything it cannot see, so `hue-${name}` would be stripped from the stylesheet.
 */
const COVERS = ['bg-accent-soft', 'bg-herb-soft', 'bg-mustard-soft', 'bg-plum-soft', 'bg-sky-soft'] as const;
const PHOTOS = [
  'photo hue-tomato',
  'photo hue-herb',
  'photo hue-mustard',
  'photo hue-plum',
  'photo hue-sky',
  'photo hue-bread',
  'photo hue-choc',
  'photo hue-green',
  'photo hue-berry',
  'photo hue-cream',
] as const;

function hashOf(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * A soft tint of one of the theme's colours, stable per id — for a group or drawer tile, so it
 * looks the same every time you pass it. Put the matching ink on it yourself, or leave it neutral.
 */
export function coverClass(id: string): string {
  return COVERS[hashOf(id) % COVERS.length];
}

/**
 * A recipe's (or a saved link's) picture when it has none: one of the mockup's food-coloured
 * gradients, stable per id, with white for whatever is drawn on it (index.css `.photo`). Put a
 * faint icon in it — the Photo component in ui.tsx does it all.
 */
export function photoClass(id: string): string {
  return PHOTOS[hashOf(id) % PHOTOS.length];
}
