package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.RecipeVisibility;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public class RecipeDtos {

    public record RecipeIngredientRequest(
            @NotBlank String ingredientName,
            @NotNull BigDecimal quantity,
            String unit,
            String notes) {
    }

    /** Ingredient quantities are for the given servings count, as written — not normalized to 1 person. */
    public record RecipeRequest(
            @NotBlank String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            @NotNull @Min(1) Integer servings,
            String sourceUrl,
            @NotEmpty @Valid List<RecipeIngredientRequest> ingredients) {
    }

    public record RecipeIngredientResponse(
            UUID id, String ingredientName, BigDecimal quantity, String unit, String notes) {
    }

    public record RecipeResponse(
            UUID id,
            UUID householdId,
            String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            String sourceUrl,
            RecipeVisibility visibility,
            List<RecipeIngredientResponse> ingredients) {
    }

    public record UpdateRecipeVisibilityRequest(@NotNull RecipeVisibility visibility) {
    }
}
