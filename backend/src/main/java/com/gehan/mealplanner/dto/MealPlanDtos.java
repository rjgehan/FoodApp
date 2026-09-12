package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.MealType;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;
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
            Integer servings,
            String notes) {
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
            Integer servings,
            String notes) {
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
            /** For a single item: the cupboard has some. Such items stay off the grocery list. */
            boolean inCupboard,
            LocalTime time,
            Integer servings,
            String notes) {
    }
}
