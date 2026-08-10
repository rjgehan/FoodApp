package com.gehan.mealplanner.realtime;

import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Receives grocery-list events from Redis and pushes them to the STOMP clients connected to this instance. */
@Component
public class GroceryListRedisSubscriber implements MessageListener {

    private final RedisTemplate<String, Object> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;

    public GroceryListRedisSubscriber(RedisTemplate<String, Object> redisTemplate,
                                       SimpMessagingTemplate messagingTemplate) {
        this.redisTemplate = redisTemplate;
        this.messagingTemplate = messagingTemplate;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        Object payload = redisTemplate.getValueSerializer().deserialize(message.getBody());
        if (payload instanceof GroceryListEvent event) {
            messagingTemplate.convertAndSend(
                    "/topic/households/" + event.householdId() + "/grocery-list", event);
        }
    }
}
