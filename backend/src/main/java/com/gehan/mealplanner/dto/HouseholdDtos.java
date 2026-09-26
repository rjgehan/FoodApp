package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.HouseholdRole;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class HouseholdDtos {

    public record CreateHouseholdRequest(@NotBlank @Size(max = 60) String name) {
    }

    /** `role` is the *requesting* user's role in this household, not a property of the household. */
    /**
     * `memberCount` is here so a screen can tell whether you are the last one in without
     * fetching the member list first — which is the difference between offering to leave a
     * household and offering to delete it.
     */
    public record HouseholdResponse(
            UUID id, String name, int defaultServings, int planningHorizonDays, HouseholdRole role,
            int memberCount) {
    }

    public record RenameHouseholdRequest(@NotBlank @Size(max = 60) String name) {
    }

    public record UpdateHouseholdSettingsRequest(
            @NotNull @Min(1) @Max(MAX_SERVINGS) Integer defaultServings,
            // Today and the Plan tab load this many days ahead, so it has to stay sensible.
            @NotNull @Min(1) @Max(MAX_PLANNING_DAYS) Integer planningHorizonDays) {
        public static final int MAX_SERVINGS = 50;
        public static final int MAX_PLANNING_DAYS = 60;
    }

    /** Adds an account that already exists — including one belonging to another household. */
    public record AddMemberRequest(@NotBlank String username) {
    }

    /** Makes a brand new account inside this household. It has no PIN until its owner first signs in. */
    public record CreateUserRequest(
            @NotBlank @Size(min = 2, max = 50) String username,
            @Size(max = 50) String displayName) {
    }

    /**
     * Renaming yourself. Both optional — send whichever you are changing. The username is what
     * you sign in with, so changing it changes how you find yourself on the login screen.
     */
    public record UpdateProfileRequest(
            @Size(min = 2, max = 50) String username,
            @Size(max = 50) String displayName) {
    }

    /**
     * `hasEmail` is there for the owner: once everybody has one, the name-and-PIN screens can be
     * switched off. The address itself is not — nobody else in the house needs it.
     */
    public record MemberResponse(
            UUID userId, String username, String displayName, HouseholdRole role, boolean pinSet,
            boolean hasEmail, boolean hasPassword) {
    }

    /** You, as the settings screen and the "add an email" prompt need you. */
    public record MeResponse(
            UUID userId, String username, String displayName, boolean pinSet,
            String email, boolean hasPassword, UUID lastHouseholdId) {
    }

    /**
     * Adding or changing how you sign in. Either field may be left out to keep it as it is.
     * `currentPassword` is needed once there is a password to protect — the very first time,
     * the PIN you signed in with is the proof.
     */
    public record CredentialsRequest(
            @Size(max = 254) String email,
            @Size(max = AuthDtos.PASSWORD_MAX) String password,
            @Size(max = AuthDtos.PASSWORD_MAX) String currentPassword) {
    }

    public record ActiveHouseholdRequest(@NotNull UUID householdId) {
    }
}
