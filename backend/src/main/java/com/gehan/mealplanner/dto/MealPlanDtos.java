package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.MealType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

public class MealPlanDtos {

    /**
     * Adds one recipe to a date + meal-type slot. Called once for the main and again for each
     * side, so "mac and cheese with dinner" is just a slot holding a single side.
     */
    public record AddMealPlanEntryRequest(
            @NotNull LocalDate date,
            @NotNull MealType mealType,
            @NotNull UUID recipeId,
            Integer servings,
            String notes) {
    }

    /** Swaps the recipe or changes the servings on one dish already in a slot. */
    public record UpdateMealPlanEntryRequest(
            UUID recipeId,
            Integer servings,
            String notes) {
    }

    public record MealPlanEntryResponse(
            UUID id,
            LocalDate date,
            MealType mealType,
            UUID recipeId,
            String recipeName,
            Integer servings,
            String notes) {
    }
}
