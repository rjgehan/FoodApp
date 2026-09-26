package com.gehan.mealplanner.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Throttles guesses at anything that signs you in: a 4-digit PIN is only 10,000 guesses, and a
 * password is only as good as the person who chose it. Attempts are counted per key and held in
 * memory: this app runs as a single instance, and losing the counters on restart is an
 * acceptable trade for not needing shared state.
 *
 * Callers namespace their keys ("pin:ryan", "email:ryan@example.com") so that a run of wrong
 * PINs for one name does not lock out an email address that happens to spell the same thing.
 */
@Component
public class SignInAttemptLimiter {

    private final int maxAttempts;
    private final Duration lockout;
    private final Map<String, Attempts> attemptsByKey = new ConcurrentHashMap<>();

    public SignInAttemptLimiter(
            @Value("${app.auth.max-pin-attempts:5}") int maxAttempts,
            @Value("${app.auth.lockout-minutes:15}") long lockoutMinutes) {
        this.maxAttempts = maxAttempts;
        this.lockout = Duration.ofMinutes(lockoutMinutes);
    }

    /** Seconds left before this key may try again, or 0 if it may try now. */
    public long secondsUntilUnlocked(String key) {
        return secondsUntilUnlocked(attemptsByKey.get(normalise(key)), Instant.now());
    }

    /** "Try again in 12 min." — the same wording wherever a lockout is explained. */
    public static String tryAgainIn(long seconds) {
        return "Try again in " + Math.max(seconds / 60, 1) + " min.";
    }

    public void recordFailure(String key) {
        Instant now = Instant.now();
        attemptsByKey.merge(normalise(key), new Attempts(1, now), (existing, fresh) ->
                // An expired lockout starts counting over instead of locking again on the next attempt.
                secondsUntilUnlocked(existing, now) == 0 && existing.count() >= maxAttempts
                        ? fresh
                        : new Attempts(existing.count() + 1, now));
    }

    public void recordSuccess(String key) {
        attemptsByKey.remove(normalise(key));
    }

    private long secondsUntilUnlocked(Attempts attempts, Instant now) {
        if (attempts == null || attempts.count() < maxAttempts) {
            return 0;
        }
        return Math.max(Duration.between(now, attempts.lastFailure().plus(lockout)).toSeconds(), 0);
    }

    private static String normalise(String key) {
        return key.toLowerCase(java.util.Locale.ROOT);
    }

    private record Attempts(int count, Instant lastFailure) {
    }
}
