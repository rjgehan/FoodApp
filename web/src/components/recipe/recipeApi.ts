import { api, ApiError } from '../../api/client';
import type { GroceryListItem } from '../../api/types';

/*
 The recipe page's own calls, beside it — like the Plan's planApi.
*/

/** What Add to groceries came back with: the rows it put on the list, or "it's there already". */
export type AddedToGroceries = { added: GroceryListItem[] } | { alreadyOnList: true };

/**
 * A recipe's ingredients straight onto the list, no meal planned: scaled to `servings`, with the
 * optional extras that were ticked. The server answers 409 `{alreadyOnList}` when unticked rows
 * already carry this recipe, because a second press doubles the amounts — so that comes back as
 * a question for the person, and `again` is their yes.
 */
export async function addRecipeToGroceries(
  householdId: string,
  recipeId: string,
  { servings, extras, again = false }: { servings: number; extras: string[]; again?: boolean },
): Promise<AddedToGroceries> {
  try {
    const added = await api<GroceryListItem[]>(
      'POST',
      `/api/households/${householdId}/grocery-list/add-recipe/${recipeId}`,
      { servings, includedOptionalIngredientIds: extras, ...(again ? { again: true } : {}) },
    );
    return { added };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && (err.body as { alreadyOnList?: boolean } | null)?.alreadyOnList) {
      return { alreadyOnList: true };
    }
    throw err;
  }
}
