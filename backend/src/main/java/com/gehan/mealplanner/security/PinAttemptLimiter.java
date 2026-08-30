package com.gehan.mealplanner.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A 4-digit PIN is only 10,000 guesses, so throttle them. Attempts are counted per username and
 * held in memory: this app runs as a single instance, and losing the counters on restart is an
 * acceptable trade for not needing shared state.
 */
@Component
public class PinAttemptLimiter {

    private final int maxAttempts;
    private final Duration lockout;
    private final Map<String, Attempts> attemptsByUser = new ConcurrentHashMap<>();

    public PinAttemptLimiter(
            @Value("${app.auth.max-pin-attempts:5}") int maxAttempts,
            @Value("${app.auth.lockout-minutes:15}") long lockoutMinutes) {
        this.maxAttempts = maxAttempts;
        this.lockout = Duration.ofMinutes(lockoutMinutes);
    }

    /** Seconds left before this user may try again, or 0 if they may try now. */
    public long secondsUntilUnlocked(String username) {
        return secondsUntilUnlocked(attemptsByUser.get(key(username)), Instant.now());
    }

    public void recordFailure(String username) {
        Instant now = Instant.now();
        attemptsByUser.merge(key(username), new Attempts(1, now), (existing, fresh) ->
                // An expired lockout starts counting over instead of locking again on the next attempt.
                secondsUntilUnlocked(existing, now) == 0 && existing.count() >= maxAttempts
                        ? fresh
                        : new Attempts(existing.count() + 1, now));
    }

    public void recordSuccess(String username) {
        attemptsByUser.remove(key(username));
    }

    private long secondsUntilUnlocked(Attempts attempts, Instant now) {
        if (attempts == null || attempts.count() < maxAttempts) {
            return 0;
        }
        return Math.max(Duration.between(now, attempts.lastFailure().plus(lockout)).toSeconds(), 0);
    }

    private static String key(String username) {
        return username.toLowerCase();
    }

    private record Attempts(int count, Instant lastFailure) {
    }
}
