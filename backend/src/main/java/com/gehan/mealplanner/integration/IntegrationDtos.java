package com.gehan.mealplanner.integration;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Shapes built for something that renders a screen, not for something that edits data. Values
 * arrive ready to display — times summed, fractions formatted, steps split — so a consumer never
 * has to reimplement the app's own formatting and drift out of step with it.
 */
public class IntegrationDtos {

    public record HouseholdSummary(UUID id, String name, int defaultServings) {
    }

    /** One day of the plan. Meals come in eating order, empty ones omitted. */
    public record DayResponse(LocalDate date, List<MealResponse> meals) {
    }

    public record MealResponse(MealType mealType, List<PlannedItem> items) {
    }

    /**
     * A dish being cooked or a place being visited. `kind` says which, and the fields for the
     * other are null, so a consumer can switch on one value.
     */
    public record PlannedItem(
            String kind,
            String name,
            Integer servings,
            String notes,
            UUID recipeId,
            String imageUrl,
            Integer totalTimeMinutes,
            UUID placeId,
            String menuUrl,
            String phone) {
    }

    public record RecipeSummary(
            UUID id,
            String name,
            String description,
            RecipeSection section,
            List<String> categories,
            int servings,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            Integer totalTimeMinutes,
            String imageUrl) {
    }

    public record RecipeDetail(
            UUID id,
            String name,
            String description,
            RecipeSection section,
            List<String> categories,
            int servings,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            Integer totalTimeMinutes,
            String imageUrl,
            List<String> photoUrls,
            String sourceUrl,
            String videoUrl,
            List<IngredientLine> ingredients,
            /** Instructions split one step per line, numbering already stripped. */
            List<String> steps) {
    }

    /**
     * `text` is the whole line pre-rendered — "1½ cup flour, sifted" — because a dashboard
     * almost always wants to print it rather than lay out three columns.
     */
    public record IngredientLine(String name, String quantity, String unit, String notes, String text) {
    }

    public record GroceryItem(UUID id, String name, String quantity, String unit, boolean checked) {
    }

    /** `name` is free text — it does not have to match an ingredient the app already knows. */
    public record AddGroceryItemRequest(String name, BigDecimal quantity, String unit) {
    }

    public record SetCheckedRequest(Boolean checked) {
    }

    public record PlaceSummary(UUID id, String name, String menuUrl, String phone, String notes, String imageUrl) {
    }
}
