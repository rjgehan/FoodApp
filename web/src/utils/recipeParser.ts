import type { RecipeDraft } from '../components/RecipeForm';
import { parseQuantity, splitAmount } from './amount';

export class RecipeParseError extends Error {}

/**
 * The question to paste into ChatGPT. It asks for a fixed layout because that is the easiest
 * thing to read back — but the parser below no longer depends on the reply following it to the
 * letter, so there is no begging the model not to use bold or numbered lists.
 *
 * Amounts are asked for at the serving count you want, so whole things stay whole: "1 egg" for
 * two people rather than a quarter of an egg scaled from a recipe for eight.
 */
export function buildRecipePrompt(dish: string, servings: number): string {
  return `Write a recipe for ${dish || 'the dish I name at the end'} that serves exactly ${servings}, in this format:

Name: <recipe name>
Servings: ${servings}
Prep Time: <minutes, number only>
Cook Time: <minutes, number only>
Description: <one sentence>
Ingredients:
- <quantity> | <unit> | <ingredient name>
Instructions:
1. <step>

Amounts are for ${servings} people, written the way a person would — "1 | | egg", never "0.125 | | egg". Leave the unit empty for things you count, but keep both "|".${dish ? '' : '\n\nRecipe: '}`;
}

const HEADERS: Record<string, 'name' | 'description' | 'prep' | 'cook' | 'servings'> = {
  name: 'name',
  title: 'name',
  recipe: 'name',
  description: 'description',
  'prep time': 'prep',
  prep: 'prep',
  'cook time': 'cook',
  cook: 'cook',
  servings: 'servings',
  serves: 'servings',
  yield: 'servings',
};

const INGREDIENTS_HEADING = /^(ingredients?)\s*:?$/i;
const STEPS_HEADING = /^(instructions?|method|directions|steps|preparation)\s*:?$/i;

/** Markdown and chat decoration, gone: **bold**, _italics_, `code`, "## headings", "> quotes". */
function clean(line: string): string {
  return line
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*>\s?/, '')
    .trim();
}

/** A bullet or a step number at the start of a line: "-", "*", "•", "1.", "2)", "Step 3:". */
function stripMarker(line: string): string {
  return line.replace(/^([-*•–]|\d+[.)]|step \d+:?)\s*/i, '').trim();
}

/**
 * Reads a recipe pasted from ChatGPT — or from anywhere — into the recipe form's shape. It
 * takes what it can find and ignores the rest: code fences, bold, bullets of any kind, numbered
 * steps, a chatty line before or after. The recipe goes into the form, not straight into the
 * catalog, so anything it gets wrong is fixed there before saving.
 */
export function parseRecipeText(raw: string): RecipeDraft {
  let text = raw.replace(/\r/g, '');
  // If the reply came in a code block, what matters is inside it.
  const fenced = text.match(/```[^\n]*\n([\s\S]*?)```/);
  if (fenced) text = fenced[1];

  let name = '';
  let description: string | null = null;
  let prep: number | null = null;
  let cook: number | null = null;
  let servings: number | null = null;
  let firstLine = '';
  const ingredients: RecipeDraft['ingredients'] = [];
  const steps: string[] = [];
  let section: 'header' | 'ingredients' | 'steps' = 'header';

  for (const rawLine of text.split('\n')) {
    const line = clean(rawLine);
    if (!line) continue;

    if (INGREDIENTS_HEADING.test(line)) {
      section = 'ingredients';
      continue;
    }
    if (STEPS_HEADING.test(line)) {
      section = 'steps';
      continue;
    }

    if (section === 'header') {
      const match = line.match(/^([A-Za-z ]+):\s*(.+)$/);
      const field = match ? HEADERS[match[1].trim().toLowerCase()] : undefined;
      if (!match || !field) {
        // A pasted web recipe often opens with its title on a line of its own.
        if (!firstLine) firstLine = line;
        continue;
      }
      const value = match[2].trim();
      const number = parseInt(value, 10);
      if (field === 'name') name = value;
      else if (field === 'description') description = value;
      else if (!Number.isNaN(number)) {
        if (field === 'prep') prep = number;
        else if (field === 'cook') cook = number;
        else servings = number;
      }
    } else if (section === 'ingredients') {
      const item = stripMarker(line);
      // "For the sauce:" — a heading inside the list, not an ingredient.
      if (!item || /:$/.test(item)) continue;
      ingredients.push(readIngredient(item));
    } else {
      const step = stripMarker(line);
      if (step) steps.push(step);
    }
  }

  name = name || firstLine;
  if (!name) {
    throw new RecipeParseError('Couldn’t find the recipe’s name — is there a “Name:” line?');
  }
  if (ingredients.length === 0) {
    throw new RecipeParseError('Couldn’t find any ingredients — they should be under an “Ingredients:” line.');
  }

  return {
    name,
    description,
    instructions: steps.length ? steps.join('\n') : null,
    prepTimeMinutes: prep,
    cookTimeMinutes: cook,
    servings: servings ?? 4,
    ingredients,
  };
}

/** "2 | cup | flour", "3 | | eggs", or plain "2 cups flour" — whichever came back. */
function readIngredient(item: string): RecipeDraft['ingredients'][number] {
  if (item.includes('|')) {
    const parts = item.split('|').map((p) => p.trim());
    const quantity = parseQuantity(parts[0]);
    // "qty | unit | name", or "qty | name" with the unit left out altogether.
    const [unit, name] = parts.length >= 3 ? [parts[1], parts.slice(2).join(' ')] : ['', parts[1] ?? ''];
    if (name) return { ingredientName: name, quantity, unit };
  }
  const amount = splitAmount(item);
  return { ingredientName: amount.name, quantity: amount.quantity, unit: amount.unit };
}
