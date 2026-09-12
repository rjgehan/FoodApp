package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.StockStatus;
import com.gehan.mealplanner.domain.StoreSection;
import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class CupboardDtos {

    /** Adding something you already have in the cupboard just marks it as HAVE again. */
    public record AddCupboardItemRequest(@NotBlank String name, Boolean staple) {
    }

    /** Both optional — send whichever is changing. */
    public record UpdateCupboardItemRequest(StockStatus status, Boolean staple) {
    }

    public record CupboardItemResponse(
            UUID id,
            UUID ingredientId,
            String name,
            StockStatus status,
            boolean staple,
            StoreSection section,
            /** False means neither the keyword list nor Gemini has placed it yet. */
            boolean sorted,
            /** Waiting on the grocery list, unticked. */
            boolean onList) {
    }
}
