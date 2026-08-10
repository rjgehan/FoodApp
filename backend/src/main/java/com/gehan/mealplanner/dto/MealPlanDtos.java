package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.MealType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.UUID;

public class MealPlanDtos {

    /** Assigns or substitutes the meal for a given date + meal-type slot. A null recipeId clears the slot. */
    public record UpsertMealPlanEntryRequest(
            @NotNull LocalDate date,
            @NotNull MealType mealType,
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
