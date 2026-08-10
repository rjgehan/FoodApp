package com.gehan.mealplanner.realtime;

import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;

import java.util.UUID;

/**
 * Fans out a grocery-list change to every client watching a household's list, across app instances.
 * Implemented via Redis pub/sub + STOMP so multiple people can watch the same list update live.
 */
public interface GroceryListEventPublisher {
    void itemChanged(UUID householdId, GroceryListItemResponse item);
    void itemRemoved(UUID householdId, UUID itemId);
}
