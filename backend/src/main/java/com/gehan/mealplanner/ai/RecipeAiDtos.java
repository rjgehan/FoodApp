package com.gehan.mealplanner.ai;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

public class RecipeAiDtos {

    public record GenerateRecipeRequest(
            @NotBlank String name,
            @NotNull @Min(1) Integer servings) {
    }

    /**
     * A draft, not a saved recipe. It has no id because nothing has been written — it goes into
     * the form so a person can look at the quantities before any of it reaches the catalog.
     */
    public record GeneratedRecipe(
            String name,
            String description,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            List<GeneratedIngredient> ingredients,
            /** Already joined one step per line, the way the app stores instructions. */
            String instructions) {
    }

    public record GeneratedIngredient(String ingredientName, BigDecimal quantity, String unit) {
    }
}
