package com.gehan.mealplanner.realtime;

import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;

import java.io.Serializable;
import java.util.UUID;

/** Wire format published to Redis and fanned out to STOMP subscribers of a household's grocery list. */
public record GroceryListEvent(UUID householdId, String type, GroceryListItemResponse item, UUID removedItemId)
        implements Serializable {

    public static GroceryListEvent upserted(UUID householdId, GroceryListItemResponse item) {
        return new GroceryListEvent(householdId, "UPSERTED", item, null);
    }

    public static GroceryListEvent removed(UUID householdId, UUID itemId) {
        return new GroceryListEvent(householdId, "REMOVED", null, itemId);
    }
}
