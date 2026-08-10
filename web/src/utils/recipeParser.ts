import type { RecipeIngredientInput } from '../api/types';

export interface ParsedRecipe {
  name: string;
  description?: string;
  instructions?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  ingredients: RecipeIngredientInput[];
}

export class RecipeParseError extends Error {}

const HEADER_KEYS: Record<string, keyof ParsedRecipe | 'skip'> = {
  name: 'name',
  description: 'description',
  'prep time': 'prepTimeMinutes',
  'cook time': 'cookTimeMinutes',
  servings: 'servings',
  'source url': 'sourceUrl',
};

/**
 * Parses the fixed "Name: / Ingredients: / Instructions:" text format (see RECIPE_PROMPT_TEMPLATE)
 * into the same shape the manual recipe form submits. Deliberately structured/delimited rather than
 * freeform, so it parses the same way every time regardless of which LLM produced the text.
 */
export function parseRecipeText(raw: string): ParsedRecipe {
  let lines = raw.split('\n').map((l) => l.trimEnd());

  // Be forgiving if someone pastes the raw ```-fenced block instead of using the copy button.
  const nonEmpty = lines.map((l, i) => [i, l.trim()] as const).filter(([, l]) => l);
  if (nonEmpty.length >= 2) {
    const [firstIdx, first] = nonEmpty[0];
    const [lastIdx, last] = nonEmpty[nonEmpty.length - 1];
    if (first.startsWith('```') && last === '```' && lastIdx > firstIdx) {
      lines = lines.slice(firstIdx + 1, lastIdx);
    }
  }

  const result: ParsedRecipe = { name: '', ingredients: [] };
  const instructionLines: string[] = [];

  let section: 'header' | 'ingredients' | 'instructions' = 'header';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (lower === 'ingredients:') {
      section = 'ingredients';
      continue;
    }
    if (lower === 'instructions:') {
      section = 'instructions';
      continue;
    }

    if (section === 'header') {
      const match = trimmed.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (!match) {
        throw new RecipeParseError(`Line ${i + 1}: expected "Key: value", got "${trimmed}"`);
      }
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      const field = HEADER_KEYS[key];
      if (!field) continue; // ignore unknown headers rather than failing the whole paste

      if (field === 'prepTimeMinutes' || field === 'cookTimeMinutes' || field === 'servings') {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n)) result[field] = n;
      } else if (field === 'name' || field === 'description' || field === 'sourceUrl') {
        result[field] = value;
      }
    } else if (section === 'ingredients') {
      // Accept "-" and "*" bullets — LLMs default to "*" for markdown lists even when told otherwise.
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        throw new RecipeParseError(`Line ${i + 1}: expected an ingredient starting with "-", got "${trimmed}"`);
      }
      result.ingredients.push(parseIngredientLine(trimmed.slice(1).trim(), i + 1));
    } else {
      instructionLines.push(line);
    }
  }

  if (!result.name.trim()) {
    throw new RecipeParseError('Missing "Name:" line.');
  }
  if (result.ingredients.length === 0) {
    throw new RecipeParseError('No ingredients found under "Ingredients:".');
  }

  const instructions = instructionLines.join('\n').trim();
  if (instructions) result.instructions = instructions;

  return result;
}

function parseIngredientLine(text: string, lineNumber: number): RecipeIngredientInput {
  const parts = text.split('|').map((p) => p.trim());
  if (parts.length < 2) {
    throw new RecipeParseError(
      `Line ${lineNumber}: expected "quantity | unit | name", got "- ${text}"`,
    );
  }

  const [qtyRaw, unitOrName, maybeName] = parts;
  const quantity = parseQuantity(qtyRaw);
  if (quantity === null) {
    throw new RecipeParseError(`Line ${lineNumber}: could not read quantity "${qtyRaw}"`);
  }

  // Supports both "qty | unit | name" and "qty | name" (no unit).
  const unit = maybeName !== undefined ? unitOrName : '';
  const name = maybeName !== undefined ? maybeName : unitOrName;
  if (!name) {
    throw new RecipeParseError(`Line ${lineNumber}: missing ingredient name`);
  }

  return { ingredientName: name, quantity, unit };
}

function parseQuantity(token: string): number | null {
  if (/^\d+\/\d+$/.test(token)) {
    const [num, denom] = token.split('/').map(Number);
    return denom === 0 ? null : num / denom;
  }
  const n = parseFloat(token);
  return Number.isNaN(n) ? null : n;
}

/**
 * Builds the copy-to-ChatGPT prompt for a specific serving count. Asking for ingredient amounts at the
 * servings the user actually wants (rather than forcing a fixed base like "per person") means whole-unit
 * ingredients like "1 egg" stay whole instead of getting divided into awkward fractions.
 */
export function buildRecipePrompt(servings: number): string {
  return `Write a recipe that serves exactly ${servings} in exactly this format. Put your entire reply inside a
single code block (triple backticks) so it stays as plain text — do not use any markdown formatting
inside it (no **bold**, no "*" bullets, no auto-numbered lists). Use "-" for every ingredient line
exactly as shown, and nothing before or after the code block.

Name: <recipe name>
Servings: ${servings}
Prep Time: <minutes, number only>
Cook Time: <minutes, number only>
Description: <one sentence>
Ingredients:
- <quantity> | <unit> | <ingredient name>
- <quantity> | <unit> | <ingredient name>
Instructions:
1. <step>
2. <step>

Rules:
- Ingredient quantities must be the amount needed to serve ${servings} people, as you'd naturally write
  the recipe — don't force fractional amounts of whole items (e.g. write "1 | | egg", not "0.125 | | egg").
- Quantity must be a plain number or simple fraction like 1/2 (no "1 1/2", write 1.5 instead).
- Unit can be blank (e.g. "- 3 | | eggs") but the two "|" characters must stay.
- Recipe: `;
}
