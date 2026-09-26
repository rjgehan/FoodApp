package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class AuthDtos {

    /** Digits only, and exactly as long as the keypad on the login screen. Keep in sync with web/src/auth/pin.ts. */
    public static final String PIN_REGEX = "\\d{4}";

    /**
     * Long enough to be worth having. The upper limit is only a sanity bound: BCrypt reads 72
     * bytes at most, and AccountService boils anything longer down first, so a long passphrase
     * still counts in full.
     */
    public static final int PASSWORD_MIN = 8;
    public static final int PASSWORD_MAX = 128;
    public static final String PASSWORD_RULE = "Passwords need at least 8 characters.";

    /**
     * `householdId` is the house they tapped on the way to their name. Optional — older apps do
     * not send it — and when sent it becomes the house they land in and are remembered in.
     */
    public record LoginRequest(
            @NotBlank String username,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin,
            UUID householdId) {
    }

    /** First sign-in for an account that was created for someone else and has no PIN yet. */
    public record SetPinRequest(
            @NotBlank String username,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin,
            UUID householdId) {
    }

    /** The sign-in everyone moves to. Checked loosely here; a wrong one is just "incorrect". */
    public record EmailLoginRequest(
            @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = PASSWORD_MAX) String password) {
    }

    /**
     * Only accepted while the app has no users at all. Normally accounts are made from inside a
     * household, but that leaves a brand new database with no way in — this is that way in.
     *
     * Today's form sends a name, an email and a password. The PIN shape (username + pin) is
     * still taken so scripts and anything written before email sign-in keep working; one or
     * the other has to be there, which AuthService checks.
     */
    public record SetupRequest(
            @NotBlank @Size(max = 50) String householdName,
            @Size(min = 2, max = 50) String username,
            @Size(max = 50) String displayName,
            @Pattern(regexp = PIN_REGEX, message = "PIN must be 4 digits") String pin,
            @Size(max = 254) String email,
            @Size(max = PASSWORD_MAX) String password) {
    }

    /**
     * `lastHouseholdId` is where they were last, if they are still in it — the house to open.
     * Null means pick one yourself (the one tapped on the way in, or else the first).
     */
    public record AuthResponse(String token, UUID userId, String displayName, UUID lastHouseholdId) {
    }

    /**
     * Everything the login screen needs to draw its first page. `unassigned` are accounts in no
     * household yet — they still need somewhere to tap. With `legacyPinLogin` off there is no
     * name-and-PIN screen to draw, so both lists come back empty and nothing is given away.
     */
    public record LandingResponse(
            boolean needsSetup, List<HouseholdSummary> households, List<UserSummary> unassigned,
            boolean legacyPinLogin) {
    }

    public record HouseholdSummary(UUID id, String name, int memberCount) {
    }

    /** pinSet=false means this account has never been signed into and will pick a PIN on first use. */
    public record UserSummary(String username, String displayName, boolean pinSet) {
    }

    /** What a reset link says before it is used. Nothing more than whose it is, so they know it is theirs. */
    public record PasswordResetInfo(boolean valid, String displayName, boolean hasEmail) {
    }

    /**
     * Using a reset link. `email` is only for someone who never added one — without it the new
     * password would have nothing to sign in with.
     */
    public record UsePasswordResetRequest(
            @NotBlank String token,
            @NotBlank @Size(max = PASSWORD_MAX) String password,
            @Size(max = 254) String email) {
    }

    /** The link an owner hands over. The token is shown once; only its hash is kept. */
    public record PasswordResetLinkResponse(String token, Instant expiresAt) {
    }
}
