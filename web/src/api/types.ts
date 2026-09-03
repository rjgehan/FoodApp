export interface AuthResponse {
  token: string;
  userId: string;
  displayName: string;
}

export interface UserSummary {
  username: string;
  displayName: string;
  /** false = never signed in; they choose a PIN on first use. */
  pinSet: boolean;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface LandingResponse {
  /** No accounts exist at all, so the login screen offers first-time setup instead. */
  needsSetup: boolean;
  households: HouseholdSummary[];
}

/** Top level of the catalog — the drawer a recipe is filed in. */
export type RecipeSection = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACKS' | 'DRINKS' | 'OTHER';

export interface ShareTarget {
  householdId: string;
  name: string;
  shared: boolean;
}

export interface RecipeCategory {
  id: string;
  name: string;
  recipeCount: number;
}

export interface Household {
  id: string;
  name: string;
  defaultServings: number;
  planningHorizonDays: number;
  /** Your role in this household, not a property of the household itself. */
  role: HouseholdRole;
}

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdMember {
  userId: string;
  username: string;
  displayName: string;
  role: HouseholdRole;
  pinSet: boolean;
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
  /** Link to a video of it being made, usually TikTok. Guaranteed http(s) by the server. */
  videoUrl: string | null;
  /** Where this household filed it. null means unfiled, which shows up under "Shared". */
  section: RecipeSection | null;
  /** This household's sub-categories for it, by name. */
  categories: string[];
  /** Another household owns it: you can file it in your catalog, but not edit it. */
  shared: boolean;
  /** Households this recipe is shared with. Only meaningful when you own it. */
  sharedWith: string[];
  /** Optional single picture shown at the top of the recipe. */
  coverImageId: string | null;
  /** Everything else, in order. */
  photoIds: string[];
  ingredients: RecipeIngredient[];
}

/** What someone with a share link sees. No household, no sharing state, no filing. */
export interface PublicRecipe {
  name: string;
  description: string | null;
  instructions: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  sourceUrl: string | null;
  videoUrl: string | null;
  coverImageId: string | null;
  photoIds: string[];
  ingredients: PublicIngredient[];
}

export interface PublicIngredient {
  ingredientName: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

/** A slot holds either a recipe you cook or a place you eat at — never both. */
export interface MealPlanEntry {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  recipeName: string | null;
  placeId: string | null;
  placeName: string | null;
  /** "HH:mm" when the occasion has a time — a booking, a pickup slot. Optional. */
  time: string | null;
  servings: number | null;
  notes: string | null;
}

/** Somewhere you eat instead of cooking. Only the name is required. */
export interface Place {
  id: string;
  name: string;
  menuUrl: string | null;
  phone: string | null;
  notes: string | null;
  imageId: string | null;
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
