export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

export type RecipeVisibility = 'PRIVATE' | 'GLOBAL';

export interface Household {
  id: string;
  name: string;
  defaultServings: number;
  defaultRecipeVisibility: RecipeVisibility;
  planningHorizonDays: number;
}

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdMember {
  userId: string;
  username: string;
  displayName: string;
  role: HouseholdRole;
}

export interface RecipeIngredientInput {
  ingredientName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface RecipeIngredient {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

/** Ingredient quantities are written for `servings` people, as the recipe actually makes them. */
export interface Recipe {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  instructions: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  sourceUrl: string | null;
  visibility: RecipeVisibility;
  ingredients: RecipeIngredient[];
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface MealPlanEntry {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  recipeName: string | null;
  servings: number | null;
  notes: string | null;
}

export interface GroceryListItem {
  id: string;
  householdId: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  checkedByUserId: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
}

export interface BlacklistEntry {
  ingredientId: string;
  name: string;
}

export type GroceryListEvent =
  | { householdId: string; type: 'UPSERTED'; item: GroceryListItem; removedItemId: null }
  | { householdId: string; type: 'REMOVED'; item: null; removedItemId: string };
