import type { Recipe, RecipeCategory, RecipeSection } from '../api/types';
import { sectionLabel } from './recipeMeta';

/*
 * Tags: the words a household's recipes wear inside a drawer — "Chicken", "Quick". Flat, any
 * number per recipe, one name once per drawer. Recipes carry them by name, so everything here
 * matches names the way the server does: ignoring case and the spaces around them.
 */

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A to Z ignoring case, the order the server sends a recipe's tags in. */
export function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** One drawer's tags, A to Z. */
export function tagsIn(tags: RecipeCategory[], section: RecipeSection): RecipeCategory[] {
  return tags.filter((t) => t.section === section).sort((a, b) => byName(a.name, b.name));
}

/** The drawer's tag of that name, if it has one. */
export function tagNamed(tags: RecipeCategory[], section: RecipeSection, name: string): RecipeCategory | undefined {
  return tags.find((t) => t.section === section && sameName(t.name, name));
}

/** Whether a recipe wears a tag: filed in the tag's drawer, under the tag's name. */
export function wears(recipe: Recipe, tag: Pick<RecipeCategory, 'name' | 'section'>): boolean {
  return recipe.section === tag.section && recipe.categories.some((c) => sameName(c, tag.name));
}

/**
 * Where a recipe is filed, in a line: "Dinner · Chicken, Quick" — the drawer, then its tags. A
 * recipe shared with you and not filed yet says who it is from instead.
 */
export function filingLine(recipe: Recipe): string {
  if (!recipe.section) return recipe.ownerName ? `Shared by ${recipe.ownerName}` : 'Shared with you';
  const tags = recipe.categories.join(', ');
  return tags ? `${sectionLabel(recipe.section)} · ${tags}` : sectionLabel(recipe.section);
}

const MAIN = /\bmain/i;
const SIDE = /\bside/i;

/*
 * The kinds of dish a recipe usually is. Mains are told apart by their protein, so those are
 * checked first — in the name, then in the ingredients — before any kind of dish: a spaghetti
 * bolognese is Beef, not Pasta, and chicken noodle soup is Chicken. The rest are dish kinds for
 * the other drawers; the `nameOnly` ones only count when the recipe's own name says so, since
 * plenty of dishes have broth, an egg or a bread roll somewhere in them. `also` lists the names a
 * household is likely to have given the kind already ("Veggie" for Vegetarian), so a suggestion
 * lands on the tag that is there rather than making a near-copy of it.
 */
const PROTEINS: Kind[] = [
  { name: 'Chicken', words: ['chicken'] },
  { name: 'Beef', words: ['beef', 'steak', 'brisket', 'meatball'] },
  { name: 'Pork', words: ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'prosciutto', 'pancetta'] },
  {
    name: 'Seafood',
    words: ['seafood', 'shrimp', 'prawn', 'salmon', 'fish', 'cod', 'tuna', 'tilapia', 'halibut', 'crab', 'lobster',
      'scallop', 'clam', 'mussel'],
    also: ['Fish'],
  },
  { name: 'Turkey', words: ['turkey'] },
  { name: 'Lamb', words: ['lamb'] },
  { name: 'Vegetarian', words: ['tofu', 'tempeh', 'lentil', 'chickpea', 'black bean'], also: ['Veggie', 'Veg', 'Vegan'] },
];

const DISHES: Kind[] = [
  { name: 'Pasta', words: ['pasta', 'spaghetti', 'penne', 'macaroni', 'noodle', 'lasagna', 'linguine', 'fettuccine',
    'rigatoni', 'ravioli'] },
  { name: 'Rice & grains', words: ['rice', 'quinoa', 'couscous', 'farro', 'risotto'], also: ['Rice', 'Grains'] },
  { name: 'Potatoes', words: ['potato'] },
  { name: 'Soup', words: ['soup', 'stew', 'chili', 'chowder'], nameOnly: true },
  { name: 'Salad', words: ['salad', 'slaw'], nameOnly: true },
  { name: 'Bread', words: ['bread', 'biscuit', 'roll', 'focaccia', 'cornbread'], nameOnly: true },
  // Breakfast.
  { name: 'Eggs', words: ['egg', 'omelet', 'omelette', 'frittata', 'scramble', 'quiche', 'shakshuka'], nameOnly: true },
  { name: 'Pancakes & waffles', words: ['pancake', 'waffle', 'crepe', 'french toast'], nameOnly: true, also: ['Pancakes'] },
  { name: 'Oats & granola', words: ['oat', 'oatmeal', 'overnight oat', 'granola', 'porridge'], nameOnly: true, also: ['Oats'] },
  // Snacks and sweets.
  { name: 'Baking & desserts', words: ['cookie', 'bar', 'brownie', 'cake', 'crisp', 'crumble', 'pie', 'muffin',
    'cobbler', 'tart', 'pudding'], nameOnly: true, also: ['Baking', 'Desserts', 'Sweet'] },
  // Drinks.
  { name: 'Smoothies', words: ['smoothie', 'shake'], nameOnly: true },
  { name: 'Lemonade & juice', words: ['lemonade', 'juice', 'punch', 'iced tea'], nameOnly: true, also: ['Juice'] },
];

interface Kind {
  name: string;
  words: string[];
  nameOnly?: boolean;
  also?: string[];
}

const KINDS: Kind[] = [...PROTEINS, ...DISHES];

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}(e?s)?\\b`).test(text);
}

/**
 * The kind of dish a recipe looks like, or null. Four passes, first match wins: a protein in
 * the name, a protein in the ingredients, a dish in the name, a dish in the ingredients.
 */
export function kindOf(recipe: Recipe): string | null {
  const name = recipe.name.toLowerCase();
  const ingredients = recipe.ingredients.map((i) => i.ingredientName.toLowerCase());
  const inName = (k: Kind) => k.words.some((w) => hasWord(name, w));
  const inIngredients = (k: Kind) => !k.nameOnly && ingredients.some((i) => k.words.some((w) => hasWord(i, w)));

  for (const kinds of [PROTEINS, DISHES]) {
    const match = kinds.find(inName) ?? kinds.find(inIngredients);
    if (match) return match.name;
  }
  return null;
}

export interface TagSuggestion {
  /** The tag's name: the drawer's own spelling when it has one already. */
  name: string;
  recipeIds: string[];
  /** The drawer has this tag already (a seeded "Chicken"): tagging them is all there is to do. */
  existing: boolean;
}

/**
 * For the recipes in a drawer that wear no tag yet: the kinds of dish among them and which
 * recipes are which, so tagging them is one tap rather than a recipe at a time. Read from the
 * names and ingredients, so it costs nothing. Only kinds two or more recipes share — one recipe
 * is quicker to tag by hand than a card is to read — biggest first.
 */
export function suggestTags(untagged: Recipe[], existingNames: string[]): TagSuggestion[] {
  const singular = (s: string) => s.trim().toLowerCase().replace(/e?s$/, '');
  const buckets = new Map<string, string[]>();
  for (const recipe of untagged) {
    const kind = kindOf(recipe);
    if (kind) buckets.set(kind, [...(buckets.get(kind) ?? []), recipe.id]);
  }
  return KINDS.filter((k) => (buckets.get(k.name)?.length ?? 0) >= 2)
    .map((k) => {
      const names = [k.name, ...(k.also ?? [])].map(singular);
      const there = existingNames.find((n) => names.includes(singular(n)));
      return { name: there ?? k.name, recipeIds: buckets.get(k.name)!, existing: there !== undefined };
    })
    .sort((a, b) => b.recipeIds.length - a.recipeIds.length);
}

/**
 * A main, for the plan picker's Mains chip and what a recipe planned into a slot becomes: a tag
 * that says so ("Main", "Mains", "Main dish"), or one of the proteins mains are told apart by — a
 * recipe tagged Chicken is a main whether or not it is also tagged Main.
 */
export function isMain(tagNames: string[]): boolean {
  return tagNames.some((t) => MAIN.test(t) || PROTEINS.some((p) => sameName(p.name, t)));
}

/** A side: a tag that says so ("Side", "Sides"). */
export function isSide(tagNames: string[]): boolean {
  return tagNames.some((t) => SIDE.test(t));
}

/** A tag that only says main or side — the plan picker has its own chips for those. */
export function isMainOrSideTag(name: string): boolean {
  return MAIN.test(name) || SIDE.test(name);
}

/**
 * Tag names as an address carries them: "Chicken,Quick". A name with a comma of its own ("Quick,
 * easy") is put back together when it is one of `known`, the drawer's tags.
 */
export function readTagNames(raw: string | null, known: string[] = []): string[] {
  if (!raw) return [];
  const parts = raw.split(',');
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    // The longest run of parts that is a known name wins.
    let end = i + 1;
    for (let j = parts.length; j > i + 1; j--) {
      if (known.some((k) => sameName(k, parts.slice(i, j).join(',')))) {
        end = j;
        break;
      }
    }
    const name = parts.slice(i, end).join(',').trim();
    if (name) names.push(name);
    i = end - 1;
  }
  return names;
}
