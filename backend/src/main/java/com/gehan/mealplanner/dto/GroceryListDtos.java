package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotNull;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class GroceryListDtos {

    public record AddItemRequest(
            String ingredientName,
            BigDecimal quantity,
            String unit) {
    }

    /**
     * "Done shopping". Everything in either list comes off the grocery list; only `putAway` goes
     * into the cupboard. The split is for the things you bought for someone else.
     */
    public record PutAwayRequest(List<UUID> putAway, List<UUID> leaveOut) {
    }

    public record MoveCategoryRequest(@NotNull UUID categoryId) {
    }

    /** `left` is what Gemini could not place either — rare, and those can be moved by hand. */
    public record SortResponse(int sorted, int left) {
    }

    public record GroceryListItemResponse(
            UUID id,
            UUID householdId,
            UUID ingredientId,
            String name,
            BigDecimal quantity,
            String unit,
            boolean checked,
            UUID checkedByUserId,
            String checkedByName,
            Instant checkedAt,
            /** The category, for this household. Null means nobody has placed it yet. */
            UUID categoryId,
            /** False means neither the keyword list nor Gemini has placed it — Sort would. */
            boolean sorted,
            /** The cupboard says you have this. Only meals put such things on the list. */
            boolean inCupboard) implements Serializable {
    }
}
