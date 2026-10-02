package com.gehan.mealplanner.nutrition;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

/**
 * Keeps this server inside Open Food Facts' published limits — 15 product reads and 10
 * searches a minute per IP — with room to spare for the cupboard's older barcode lookup, which
 * asks the same servers. Counted in Redis per minute, so two app servers behind one address
 * share the count; if Redis is unreachable each server counts on its own instead of not at all.
 *
 * Going over is not an option: they ban addresses that do, which would take barcode scanning
 * away from everybody.
 */
@Component
public class OffRateLimit {

    /** Product reads a minute; OFF allows 15, and BarcodeLookup also reads. */
    static final int PRODUCTS_PER_MINUTE = 10;
    /** Searches a minute; OFF allows 10. */
    static final int SEARCHES_PER_MINUTE = 8;

    private final StringRedisTemplate redis;
    private final LongSupplier clock;
    private final Map<String, AtomicInteger> local = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public OffRateLimit(StringRedisTemplate redis) {
        this(redis, System::currentTimeMillis);
    }

    OffRateLimit(StringRedisTemplate redis, LongSupplier clock) {
        this.redis = redis;
        this.clock = clock;
    }

    public boolean tryProduct() {
        return take("product", PRODUCTS_PER_MINUTE);
    }

    public boolean trySearch() {
        return take("search", SEARCHES_PER_MINUTE);
    }

    private boolean take(String bucket, int perMinute) {
        long minute = clock.getAsLong() / 60_000;
        String key = "off:rate:" + bucket + ":" + minute;
        try {
            if (redis == null) throw new IllegalStateException("No Redis");
            Long used = redis.opsForValue().increment(key);
            if (used != null && used == 1) redis.expire(key, Duration.ofMinutes(2));
            return used != null && used <= perMinute;
        } catch (RuntimeException e) {
            local.keySet().removeIf(k -> !k.endsWith(":" + minute));
            return local.computeIfAbsent(key, k -> new AtomicInteger()).incrementAndGet() <= perMinute;
        }
    }
}
