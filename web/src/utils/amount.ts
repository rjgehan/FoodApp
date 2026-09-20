/**
 * Splits "2 lb chicken" into an amount, a unit and a name, so adding something is one box
 * rather than three. Only a leading number is taken, and only a word that really is a unit —
 * "2 large eggs" keeps "large eggs" as the name. Anything it does not recognise stays in the
 * name untouched, so the worst case is exactly what you typed.
 */

export interface Amount {
  quantity: number | null;
  unit: string;
  name: string;
}

/** Spellings people type, mapped to the unit list the unit picker offers. */
const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  pint: 'pint', pints: 'pint', quart: 'quart', quarts: 'quart', gallon: 'gallon', gallons: 'gallon',
  ct: 'ct', can: 'can', cans: 'can', clove: 'clove', cloves: 'clove', stick: 'stick', sticks: 'stick',
  bunch: 'bunch', bunches: 'bunch', head: 'head', heads: 'head', slice: 'slice', slices: 'slice',
  package: 'package', packages: 'package', pkg: 'package',
  pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash', sprig: 'sprig', sprigs: 'sprig',
  // How a cook measures out loud. These arrive from recipes read off a video transcript,
  // and the three parsers — here, IngredientLine.java and Amount.swift — have to agree.
  handful: 'handful', handfuls: 'handful', knob: 'knob', knobs: 'knob',
  wedge: 'wedge', wedges: 'wedge', block: 'block', blocks: 'block',
  packet: 'packet', packets: 'packet', jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle', shot: 'shot', shots: 'shot',
  glug: 'glug', glugs: 'glug', spoonful: 'spoonful', spoonfuls: 'spoonful',
  sprinkling: 'sprinkling', drizzle: 'drizzle', splash: 'splash', tin: 'can', tins: 'can',
};

const FRACTION_CHARS: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8 };

// "1 1/2", "1/2", "1.5", "1,5", "1½", "½" — then whatever follows.
const LEADING_AMOUNT = /^(\d+ \d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?[½⅓⅔¼¾⅛]?|[½⅓⅔¼¾⅛])\s*(.*)$/;

export function splitAmount(text: string): Amount {
  const typed = text.trim().replace(/\s+/g, ' ');
  const match = typed.match(LEADING_AMOUNT);
  const quantity = match ? parseQuantity(match[1]) : null;
  // A bare number is not an item. Neither is "0 eggs".
  if (!match || !match[2] || quantity === null || quantity <= 0) {
    return { quantity: null, unit: '', name: typed };
  }

  const words = match[2].split(' ');
  let unit = '';
  let rest = words;
  if (words.length > 2 && `${words[0]} ${words[1]}`.toLowerCase() === 'fl oz') {
    unit = 'fl oz';
    rest = words.slice(2);
  } else if (words.length > 1 && UNIT_ALIASES[words[0].toLowerCase().replace(/\.$/, '')]) {
    unit = UNIT_ALIASES[words[0].toLowerCase().replace(/\.$/, '')];
    rest = words.slice(1);
  }

  // "2 cups of flour" is flour.
  const name = rest.join(' ').replace(/^of /i, '');
  return { quantity, unit, name };
}

/** "1 1/2", "1/2", "1.5", "1,5", "1½", "½" as a number; null for anything else. */
export function parseQuantity(raw: string): number | null {
  if (raw in FRACTION_CHARS) return FRACTION_CHARS[raw];
  const glyph = raw.slice(-1);
  if (glyph in FRACTION_CHARS) return Number(raw.slice(0, -1)) + FRACTION_CHARS[glyph];
  if (raw.includes('/')) {
    const [whole, fraction] = raw.includes(' ') ? raw.split(' ') : ['0', raw];
    const [top, bottom] = fraction.split('/').map(Number);
    return bottom ? Number(whole) + top / bottom : null;
  }
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
