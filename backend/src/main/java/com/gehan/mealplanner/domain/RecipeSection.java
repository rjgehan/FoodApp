package com.gehan.mealplanner.domain;

import java.util.Locale;

/** Top level of the recipe catalog — the drawer a recipe is filed in. */
public enum RecipeSection {
    BREAKFAST,
    LUNCH,
    DINNER,
    SNACKS,
    DRINKS,
    OTHER;

    /** The drawer as the apps name it — "Dinner" — for a sentence that mentions one. */
    public String label() {
        return name().charAt(0) + name().substring(1).toLowerCase(Locale.ROOT);
    }
}
