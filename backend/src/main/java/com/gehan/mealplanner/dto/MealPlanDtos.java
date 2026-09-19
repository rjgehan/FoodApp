package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.MealType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public class MealPlanDtos {

    /**
     * Adds one thing to a date + meal-type slot. Called once for the main and again for each
     * side, so "mac and cheese with dinner" is just a slot holding a single side. Send exactly
     * one of recipeId, placeId or itemName.
     */
    public record AddMealPlanEntryRequest(
            @NotNull LocalDate date,
            @NotNull MealType mealType,
            UUID recipeId,
            /** Send this instead of recipeId to plan a night out or a takeaway. */
            UUID placeId,
            /** Or a single food by name — "eggs", "strawberries". Made on the spot if new. */
            String itemName,
            /** Optional "HH:mm". Null simply means no particular time. */
            LocalTime time,
            @Min(1) Integer servings,
            String notes,
            /**
             * Which of the recipe's optional ingredients to buy this time — asked for once, when
             * the recipe is planned onto this slot. Omitted or null means none of them.
             */
            List<UUID> includedOptionalIngredientIds) {
    }

    /** Swaps what is in the slot, or changes the servings on one dish already in it. */
    public record UpdateMealPlanEntryRequest(
            UUID recipeId,
            UUID placeId,
            String itemName,
            LocalTime time,
            /**
             * Set a time by sending `time`; remove one by sending `clearTime: true`. A null
             * `time` on its own means "leave it alone", which is what every other field here
             * means, and there is no way for JSON to tell that apart from "set it to nothing".
             */
            Boolean clearTime,
            @Min(1) Integer servings,
            String notes,
            /** Same meaning as on {@link AddMealPlanEntryRequest}; null leaves it unchanged. */
            List<UUID> includedOptionalIngredientIds) {
    }

    public record MealPlanEntryResponse(
            UUID id,
            LocalDate date,
            MealType mealType,
            UUID recipeId,
            String recipeName,
            /** A recipe saved with just its name, so it adds nothing to the grocery list yet. */
            boolean needsIngredients,
            UUID placeId,
            String placeName,
            String itemName,
            /**
             * For a single item: whether the cupboard has it, shown so you can decide whether to
             * put it on the grocery list — nothing adds a single item to the list by itself.
             */
            boolean inCupboard,
            /** In the cupboard, but running low. */
            boolean runningLow,
            LocalTime time,
            Integer servings,
            String notes,
            /** Which of the recipe's optional ingredients were chosen for this occurrence. */
            List<UUID> includedOptionalIngredientIds) {
    }
}
