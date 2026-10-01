package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.ThemeMode;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.service.ThemeSettings;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public class HouseholdDtos {

    public record CreateHouseholdRequest(@NotBlank @Size(max = 60) String name) {
    }

    /** `role` is the *requesting* user's role in this household, not a property of the household. */
    /**
     * `memberCount` is here so a screen can tell whether you are the last one in without
     * fetching the member list first — which is the difference between offering to leave a
     * household and offering to delete it. `recipeCount` is what a "which household?" picker
     * says under each name (saving a shared recipe), since that is what tells two houses apart
     * when the question is where a recipe should go.
     */
    public record HouseholdResponse(
            UUID id, String name, int defaultServings, int planningHorizonDays, HouseholdRole role,
            int memberCount, int recipeCount) {
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

    /**
     * The household's invite link as a member sees it. The token goes on the end of
     * `<web origin>/invite/`; the app builds the address, since only it knows its own origin.
     */
    public record InviteResponse(String token, Instant expiresAt) {
    }

    /**
     * What an invite link says to somebody who is not signed in yet: whose house, who asked, and
     * how many are in it and how many recipes it has — no names, nothing else. All null but
     * `valid` when the link does not work, so a dead or made-up token tells nobody anything.
     */
    public record InviteInfo(String householdName, String invitedByName, Integer memberCount, boolean valid,
                             Integer recipeCount) {
    }

    /** A signed-in person's place in the house a link is for: in it already, and if so which. */
    public record InviteStanding(boolean alreadyMember, UUID householdId) {
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

    /**
     * You, as the settings screen and the "add an email" prompt need you. `admin` is whether the
     * admin pages will open for you — decided on the server (AdminAccess); the app only uses it
     * to show the way in. `theme` is always there, its fields null for the app's own colours.
     * `ideasBoard` is whether the beta's ideas board is open (IDEAS_BOARD): the apps only show
     * its button when it is, and an app from before the board never asks.
     */
    public record MeResponse(
            UUID userId, String username, String displayName, boolean pinSet,
            String email, boolean hasPassword, UUID lastHouseholdId, boolean admin, ThemeResponse theme,
            boolean ideasBoard) {

        /**
         * The admin pages only open for a session that began with a password, so an admin
         * signed in with their PIN is told admin=false and shown no way in to pages that would
         * turn them away.
         */
        public MeResponse forSession(boolean signedInWithPassword) {
            return signedInWithPassword || !admin ? this
                    : new MeResponse(userId, username, displayName, pinSet, email, hasPassword, lastHouseholdId, false,
                            theme, ideasBoard);
        }
    }

    /**
     * Your colours. `preset` is a key from ThemeSettings.PRESETS or "custom"; `primary` and
     * `secondary` are the custom colour as #RRGGBB (the second one is only for old apps, which
     * drew custom as a pair); `mode` is SYSTEM, LIGHT or DARK. Null throughout is the default:
     * Tomato, following the system. A row still holding one of the old pairs' keys is answered
     * with the theme it became.
     */
    public record ThemeResponse(String preset, String primary, String secondary, ThemeMode mode) {
        public static ThemeResponse of(User user) {
            return new ThemeResponse(ThemeSettings.current(user.getThemePreset()), user.getThemePrimary(),
                    user.getThemeSecondary(), user.getThemeMode());
        }
    }

    /**
     * Setting your colours, all four at once. Strings rather than an enum so a wrong value is
     * answered with a sentence rather than a parse error; ThemeSettings checks them.
     */
    public record ThemeRequest(
            @Size(max = 20) String preset,
            @Size(max = 7) String primary,
            @Size(max = 7) String secondary,
            @Size(max = 10) String mode) {
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
