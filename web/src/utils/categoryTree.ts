import type { Recipe, RecipeCategory } from '../api/types';

/**
 * The household's groups as a tree. Recipes carry their groups by name, so lookups here are by
 * lowercased name as well as by id.
 */
export interface CategoryTree {
  byId: Map<string, RecipeCategory>;
  byName: Map<string, RecipeCategory>;
  /** The groups directly inside one, alphabetical. `null` means the top of a drawer. */
  children: (parentId: string | null) => RecipeCategory[];
  /** The group and every group inside it, at any depth, as lowercased names. */
  namesWithin: (id: string) => Set<string>;
  /** From the top of the drawer down to this group. */
  path: (id: string) => RecipeCategory[];
}

export function buildTree(categories: RecipeCategory[]): CategoryTree {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const kids = new Map<string | null, RecipeCategory[]>();
  for (const c of categories) {
    // A parent that is not in the list (deleted a moment ago on another phone) means top level.
    const parent = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    kids.set(parent, [...(kids.get(parent) ?? []), c]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const within = new Map<string, Set<string>>();
  function namesWithin(id: string): Set<string> {
    const cached = within.get(id);
    if (cached) return cached;
    const names = new Set<string>();
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const category = byId.get(current);
      if (category) names.add(category.name.toLowerCase());
      for (const child of kids.get(current) ?? []) stack.push(child.id);
    }
    within.set(id, names);
    return names;
  }

  function path(id: string): RecipeCategory[] {
    const out: RecipeCategory[] = [];
    const seen = new Set<string>();
    for (let c = byId.get(id); c && !seen.has(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) {
      seen.add(c.id);
      out.unshift(c);
    }
    return out;
  }

  return { byId, byName, children: (parentId) => kids.get(parentId) ?? [], namesWithin, path };
}

/** Whether a recipe is filed anywhere inside a group — in it, or in a group inside it. */
export function isIn(recipe: Recipe, groupId: string, tree: CategoryTree): boolean {
  const names = tree.namesWithin(groupId);
  return recipe.categories.some((c) => names.has(c.toLowerCase()));
}

/*
 * The kinds of dish a group usually splits into. Mains split by what the protein is, so those
 * are checked first — in the name, then in the ingredients — before any kind of dish: a
 * spaghetti bolognese is Beef, not Pasta, and chicken noodle soup is Chicken. The rest are
 * dish kinds for the other drawers; the `nameOnly` ones only count when the recipe's own name
 * says so, since plenty of dishes have broth, an egg or a bread roll somewhere in them.
 */
const PROTEINS: Kind[] = [
  { name: 'Chicken', words: ['chicken'] },
  { name: 'Beef', words: ['beef', 'steak', 'brisket', 'meatball'] },
  { name: 'Pork', words: ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'prosciutto', 'pancetta'] },
  {
    name: 'Seafood',
    words: ['seafood', 'shrimp', 'prawn', 'salmon', 'fish', 'cod', 'tuna', 'tilapia', 'halibut', 'crab', 'lobster',
      'scallop', 'clam', 'mussel'],
  },
  { name: 'Turkey', words: ['turkey'] },
  { name: 'Lamb', words: ['lamb'] },
  { name: 'Vegetarian', words: ['tofu', 'tempeh', 'lentil', 'chickpea', 'black bean'] },
];

const DISHES: Kind[] = [
  { name: 'Pasta', words: ['pasta', 'spaghetti', 'penne', 'macaroni', 'noodle', 'lasagna', 'linguine', 'fettuccine',
    'rigatoni', 'ravioli'] },
  { name: 'Rice & grains', words: ['rice', 'quinoa', 'couscous', 'farro', 'risotto'] },
  { name: 'Potatoes', words: ['potato'] },
  { name: 'Soup', words: ['soup', 'stew', 'chili', 'chowder'], nameOnly: true },
  { name: 'Salad', words: ['salad', 'slaw'], nameOnly: true },
  { name: 'Bread', words: ['bread', 'biscuit', 'roll', 'focaccia', 'cornbread'], nameOnly: true },
  // Breakfast.
  { name: 'Eggs', words: ['egg', 'omelet', 'omelette', 'frittata', 'scramble', 'quiche', 'shakshuka'], nameOnly: true },
  { name: 'Pancakes & waffles', words: ['pancake', 'waffle', 'crepe', 'french toast'], nameOnly: true },
  { name: 'Oats & granola', words: ['oat', 'oatmeal', 'overnight oat', 'granola', 'porridge'], nameOnly: true },
  // Snacks and sweets.
  { name: 'Baking & desserts', words: ['cookie', 'bar', 'brownie', 'cake', 'crisp', 'crumble', 'pie', 'muffin',
    'cobbler', 'tart', 'pudding'], nameOnly: true },
  // Drinks.
  { name: 'Smoothies', words: ['smoothie', 'shake'], nameOnly: true },
  { name: 'Lemonade & juice', words: ['lemonade', 'juice', 'punch', 'iced tea'], nameOnly: true },
];

interface Kind {
  name: string;
  words: string[];
  nameOnly?: boolean;
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
export function kindOf(recipe: Recipe, skip: Set<string> = new Set()): string | null {
  const name = recipe.name.toLowerCase();
  const ingredients = recipe.ingredients.map((i) => i.ingredientName.toLowerCase());
  const usable = (kinds: Kind[]) => kinds.filter((k) => !skip.has(k.name.toLowerCase()));
  const inName = (k: Kind) => k.words.some((w) => hasWord(name, w));
  const inIngredients = (k: Kind) => !k.nameOnly && ingredients.some((i) => k.words.some((w) => hasWord(i, w)));

  for (const kinds of [usable(PROTEINS), usable(DISHES)]) {
    const match = kinds.find(inName) ?? kinds.find(inIngredients);
    if (match) return match.name;
  }
  return null;
}

/**
 * For a group that has no smaller groups yet: the kinds of dish in it and which recipes are
 * which, so splitting Main dish up is one tap rather than filing every recipe by hand. `skip`
 * holds names that cannot be used — the group itself and the groups above it.
 */
export function suggestSplit(recipes: Recipe[], skip: Set<string>): { name: string; recipeIds: string[] }[] {
  const buckets = new Map<string, string[]>();
  for (const recipe of recipes) {
    const kind = kindOf(recipe, skip);
    if (kind) buckets.set(kind, [...(buckets.get(kind) ?? []), recipe.id]);
  }
  return KINDS.filter((k) => buckets.has(k.name)).map((k) => ({ name: k.name, recipeIds: buckets.get(k.name)! }));
}

/** Which of these groups a recipe most likely belongs in, for sorting by hand. */
export function suggestGroup(recipe: Recipe, groups: RecipeCategory[]): RecipeCategory | null {
  const kind = kindOf(recipe);
  const byKind = kind ? groups.find((g) => g.name.toLowerCase() === kind.toLowerCase()) : undefined;
  if (byKind) return byKind;
  // A group of their own making — "Tacos" — still matches on its name.
  const text = [recipe.name, ...recipe.ingredients.map((i) => i.ingredientName)].join(' | ').toLowerCase();
  return groups.find((g) => hasWord(text, g.name.toLowerCase().replace(/s$/, ''))) ?? null;
}
