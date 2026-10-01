package com.gehan.mealplanner.security;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A sign-in refused because of too many wrong tries: a 429 that says exactly how long is left,
 * so the sign-in screen can count down to the second instead of reading "Try again in 5 min."
 * The sentence stays the same as before for anything that only shows the message.
 */
public class SignInLockedException extends ResponseStatusException {

    private final long secondsLeft;

    public SignInLockedException(String message, long secondsLeft) {
        super(HttpStatus.TOO_MANY_REQUESTS, message);
        this.secondsLeft = secondsLeft;
    }

    public long getSecondsLeft() {
        return secondsLeft;
    }

    /** The standard way to say it, for anything that reads headers rather than the body. */
    @Override
    public HttpHeaders getHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, Long.toString(secondsLeft));
        return headers;
    }
}
