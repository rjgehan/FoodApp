package com.gehan.mealplanner.realtime;

import com.gehan.mealplanner.config.RedisConfig;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Publishes grocery-list events to Redis rather than pushing to STOMP directly, so the update reaches
 * clients connected to any backend instance/pod, not just the one that handled the write.
 */
@Component
public class RedisGroceryListEventPublisher implements GroceryListEventPublisher {

    private final RedisTemplate<String, Object> redisTemplate;

    public RedisGroceryListEventPublisher(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void itemChanged(UUID householdId, GroceryListItemResponse item) {
        redisTemplate.convertAndSend(
                RedisConfig.GROCERY_LIST_EVENTS_CHANNEL, GroceryListEvent.upserted(householdId, item));
    }

    @Override
    public void itemRemoved(UUID householdId, UUID itemId) {
        redisTemplate.convertAndSend(
                RedisConfig.GROCERY_LIST_EVENTS_CHANNEL, GroceryListEvent.removed(householdId, itemId));
    }
}
