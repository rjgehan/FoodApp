package com.gehan.mealplanner.domain;

/**
 * The original twelve supermarket aisles. No longer what a household sees or edits — that's
 * {@link GroceryCategory} now — this is only the fixed vocabulary the free keyword pass and a
 * fresh {@link Ingredient}'s shared guess still use internally, and what a category's
 * {@link GroceryCategory#getSeededFrom()} points back to so that guess can still be translated
 * into one of a household's own categories for free.
 */
public enum StoreSection {
    PRODUCE,
    BAKERY,
    DRY_GOODS,
    BAKING,
    SPICES,
    DELI,
    MEAT,
    DAIRY,
    FROZEN,
    DRINKS,
    HOUSEHOLD,
    OTHER
}
