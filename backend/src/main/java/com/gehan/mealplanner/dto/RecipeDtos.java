package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.RecipeSection;
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
            String videoUrl,
            RecipeSection section,
            List<String> categories,
            UUID coverImageId,
            List<UUID> photoIds,
            @NotEmpty @Valid List<RecipeIngredientRequest> ingredients) {
    }

    /** A blank or null url clears the video. */
    public record UpdateVideoRequest(String videoUrl) {
    }

    /** Sets the cover picture and the photo strip on a recipe the household owns. */
    public record UpdateImagesRequest(UUID coverImageId, List<UUID> photoIds) {
    }

    /**
     * Files a recipe into one household's catalog. Works for a recipe another household shared
     * with you — that is how it moves out of "Shared". Category names that do not exist yet are
     * created in the household on the spot, which is how new categories come into being at all.
     */
    public record FilingRequest(
            RecipeSection section,
            List<String> categories) {
    }

    /** What a guest with a link gets back: the recipe, and deliberately nothing else. */
    public record PublicRecipeResponse(
            String name,
            String description,
            String instructions,
            Integer prepTimeMinutes,
            Integer cookTimeMinutes,
            int servings,
            String sourceUrl,
            String videoUrl,
            UUID coverImageId,
            List<UUID> photoIds,
            List<PublicIngredientResponse> ingredients) {
    }

    public record PublicIngredientResponse(
            String ingredientName, BigDecimal quantity, String unit, String notes) {
    }

    /** The share link for a recipe. A null token means no link exists yet. */
    public record RecipeLinkResponse(String token) {
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
            String videoUrl,
            /** Where this household filed it. Null means unfiled, which the UI shows as "Shared". */
            RecipeSection section,
            List<String> categories,
            /** True when another household owns it — you can file it, but not edit it. */
            boolean shared,
            /** Households this recipe is shared with. Only meaningful to the owner. */
            List<UUID> sharedWith,
            UUID coverImageId,
            List<UUID> photoIds,
            List<RecipeIngredientResponse> ingredients) {
    }

    public record RecipeCategoryResponse(UUID id, String name, int recipeCount) {
    }

    /** Replaces the set of households this recipe is shared with. An empty list unshares it. */
    public record UpdateSharesRequest(List<UUID> householdIds) {
    }

    /** A household you could share with, and whether this recipe already is. */
    public record ShareTargetResponse(UUID householdId, String name, boolean shared) {
    }
}
