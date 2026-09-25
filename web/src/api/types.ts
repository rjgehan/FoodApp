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
  /** Accounts in no household yet. They still need somewhere to tap. */
  unassigned: UserSummary[];
}

/** Top level of the catalog — the drawer a recipe is filed in. */
export type RecipeSection = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACKS' | 'DRINKS' | 'OTHER';

export interface ShareTarget {
  householdId: string;
  name: string;
  shared: boolean;
}

/** A household's recipe group. Groups nest — Chicken inside Main dish — one tree for every drawer. */
export interface RecipeCategory {
  id: string;
  name: string;
  recipeCount: number;
  /** The group this one sits inside; null at the top of a drawer. */
  parentId: string | null;
  /** The drawer it belongs to; null means it shows in every drawer. */
  section: RecipeSection | null;
  /** Which of the FoodIcons its tile wears; null (or absent, from an older server) for none. */
  iconKey?: string | null;
}

export interface Household {
  id: string;
  name: string;
  defaultServings: number;
  planningHorizonDays: number;
  /** Your role in this household, not a property of the household itself. */
  role: HouseholdRole;
  /** How many people are in it. One means you, and means leaving is really deleting. */
  memberCount: number;
}

/** A household's own grocery aisle — added, renamed, reordered and deleted from Household settings. */
export interface GroceryCategory {
  id: string;
  name: string;
  position: number;
}

/** Have it, or running low — no count. Nothing in the cupboard adds to the grocery list by itself. */
export interface CupboardItem {
  id: string;
  ingredientId: string;
  name: string;
  runningLow: boolean;
  /** Always have it — planned meals never add it to the grocery list. */
  staple: boolean;
  /** Null means nobody has placed it yet. */
  categoryId: string | null;
  sorted: boolean;
  /** Waiting on the grocery list, unticked. */
  onList: boolean;
  /** Null means this item uses the simple Have/Low toggle instead. */
  quantity: number | null;
  unit: string | null;
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
  /** Something a cook might skip — chosen per occasion when the recipe is planned. */
  optional?: boolean;
}

export interface RecipeIngredient {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  notes: string | null;
  optional: boolean;
}

/**
 * Somewhere a recipe lives on the web — the page it came from, a video of it being made. Always
 * http(s). A null label means "name it after the site" (see utils/videoLink.ts).
 */
export interface SourceLink {
  url: string;
  label: string | null;
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
  /** The first link that isn't a video. Kept for older clients; read `links`. */
  sourceUrl: string | null;
  /** The first video link. Kept for older clients; read `links`. */
  videoUrl: string | null;
  /** Every link, in the order the household put them. */
  links: SourceLink[];
  /** Where this household filed it. null means unfiled, which shows up under "Shared". */
  section: RecipeSection | null;
  /** This household's sub-categories for it, by name. */
  categories: string[];
  /** Another household owns it: you can file it in your catalog, but not edit it. */
  shared: boolean;
  /** The household it came from — worth saying on anything you don't own. */
  ownerName: string | null;
  /** In Explore, where every signed-in household can read it. Only its owner can change that. */
  published: boolean;
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
  links: SourceLink[];
  coverImageId: string | null;
  photoIds: string[];
  ingredients: PublicIngredient[];
}

export interface PublicIngredient {
  ingredientName: string;
  quantity: number;
  unit: string;
  notes: string | null;
  optional: boolean;
}

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

/** A slot holds exactly one of: a recipe you cook, a place you eat at, or a single item. */
export interface MealPlanEntry {
  id: string;
  date: string;
  mealType: MealType;
  recipeId: string | null;
  recipeName: string | null;
  /** A recipe saved with just its name — it adds nothing to the grocery list yet. */
  needsIngredients: boolean;
  placeId: string | null;
  placeName: string | null;
  /** A single food, no recipe — "eggs". */
  itemName: string | null;
  /** For a single item: whether the cupboard has it. Single items only reach the list by hand. */
  inCupboard: boolean;
  /** In the cupboard, but running low. */
  runningLow: boolean;
  /** "HH:mm" when the occasion has a time — a booking, a pickup slot. Optional. */
  time: string | null;
  servings: number | null;
  notes: string | null;
  /** Which of the recipe's optional ingredients were chosen for this occurrence. */
  includedOptionalIngredientIds: string[];
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
  /** The category, for this household. Null means nobody has placed it yet. */
  categoryId: string | null;
  /** False means nothing has placed it — the Sort button would. */
  sorted: boolean;
  /** The cupboard says you have this. Only meals put such things on the list. */
  inCupboard: boolean;
}

export type GroceryListEvent =
  | { householdId: string; type: 'UPSERTED'; item: GroceryListItem; removedItemId: null }
  | { householdId: string; type: 'REMOVED'; item: null; removedItemId: string };
