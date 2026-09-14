package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class CupboardDtos {

    /** Adding something already in the cupboard says you have it again — no longer running low. */
    public record AddCupboardItemRequest(@NotBlank String name, Boolean staple) {
    }

    /**
     * All optional — send whichever is changing. A new name points the item at that ingredient,
     * the one the grocery list and recipes share; it never renames the ingredient itself.
     */
    public record UpdateCupboardItemRequest(Boolean runningLow, Boolean staple, String name) {
    }

    public record CupboardItemResponse(
            UUID id,
            UUID ingredientId,
            String name,
            boolean runningLow,
            boolean staple,
            UUID categoryId,
            /** False means neither the keyword list nor Gemini has placed it yet. */
            boolean sorted,
            /** Waiting on the grocery list, unticked. */
            boolean onList) {
    }
}
