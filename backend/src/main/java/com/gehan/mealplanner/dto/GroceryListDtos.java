package com.gehan.mealplanner.dto;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public class GroceryListDtos {

    public record AddItemRequest(
            String ingredientName,
            BigDecimal quantity,
            String unit) {
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
            Instant checkedAt) implements Serializable {
    }
}
