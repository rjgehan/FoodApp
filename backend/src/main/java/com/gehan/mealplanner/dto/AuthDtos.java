package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public class AuthDtos {

    /** Digits only, and exactly as long as the keypad on the login screen. Keep in sync with web/src/auth/pin.ts. */
    public static final String PIN_REGEX = "\\d{4}";

    public record LoginRequest(
            @NotBlank String username,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin) {
    }

    /** First sign-in for an account that was created for someone else and has no PIN yet. */
    public record SetPinRequest(
            @NotBlank String username,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin) {
    }

    /**
     * Only accepted while the app has no users at all. Normally accounts are made from inside a
     * household, but that leaves a brand new database with no way in — this is that way in.
     */
    public record SetupRequest(
            @NotBlank @Size(max = 50) String householdName,
            @NotBlank @Size(min = 2, max = 50) String username,
            @Size(max = 50) String displayName,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin) {
    }

    public record AuthResponse(String token, UUID userId, String displayName) {
    }

    /** Everything the login screen needs to draw its first page. */
    public record LandingResponse(boolean needsSetup, List<HouseholdSummary> households) {
    }

    public record HouseholdSummary(UUID id, String name, int memberCount) {
    }

    /** pinSet=false means this account has never been signed into and will pick a PIN on first use. */
    public record UserSummary(String username, String displayName, boolean pinSet) {
    }
}
