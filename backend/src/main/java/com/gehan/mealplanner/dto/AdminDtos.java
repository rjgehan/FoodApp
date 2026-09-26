package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What the server's owner sees on the admin pages. Read-only, and deliberately short of anything
 * that would let the reader act as somebody: no password or PIN hashes, no sign-in tokens, and
 * no invite, reset or share-link tokens — only whether such a thing exists.
 */
public class AdminDtos {

    /** One page of a longer list. `page` counts from 0. */
    public record AdminPage<T>(List<T> items, int page, int size, long total) {
    }

    /**
     * The whole server at a glance. `usersWithPin` is there for switching the PIN screens off:
     * once everyone with a PIN also has a password, nobody needs them.
     */
    public record Overview(
            long users, long usersWithEmail, long usersWithPassword, long usersWithPin,
            long households, long recipes, long publishedRecipes, long shares, long publicLinks,
            long liveInvites) {
    }

    /** `ownerName` is null for a house whose owner has left it with nobody promoted. */
    public record HouseholdRow(
            UUID id, String name, Instant createdAt, long memberCount, long recipeCount, String ownerName) {
    }

    /**
     * `lastHousehold` is whether signing in opens this house for them — the house they were last
     * looking at.
     */
    public record HouseholdMemberRow(
            UUID userId, String displayName, String username, String email, HouseholdRole role,
            Instant joinedAt, boolean hasPassword, boolean hasPin, boolean lastHousehold) {
    }

    /** One of the house's own recipes. `sharedWith` are the names of the houses it is shared with. */
    public record HouseholdRecipeRow(
            UUID id, String name, RecipeSection section, Instant createdAt, boolean published,
            List<String> sharedWith, boolean hasPublicLink) {
    }

    /** `inviteLive` says whether the house has a working invite link, never what it is. */
    public record HouseholdDetail(
            UUID id, String name, Instant createdAt, int defaultServings, int planningHorizonDays,
            boolean inviteLive, List<HouseholdMemberRow> members, List<HouseholdRecipeRow> recipes) {
    }

    public record UserHousehold(UUID householdId, String name, HouseholdRole role) {
    }

    /** Every account, including ones in no house at all. */
    public record UserRow(
            UUID userId, String displayName, String username, String email, boolean hasPassword,
            boolean hasPin, boolean admin, Instant createdAt, List<UserHousehold> households) {
    }

    /**
     * A recipe in the search across every house. `groups` are the owning house's own groups for
     * it; `linkCount` is how many web links it keeps (its sources and videos).
     */
    public record RecipeRow(
            UUID id, String name, UUID householdId, String householdName, RecipeSection section,
            List<String> groups, Instant createdAt, boolean published, List<String> sharedWith,
            int linkCount, boolean hasPublicLink) {
    }

    /** The recipe as its own house sees it, plus what the admin list already said about it. */
    public record RecipeDetail(
            RecipeResponse recipe, String householdName, Instant createdAt, List<String> sharedWith,
            boolean hasPublicLink) {
    }

    /**
     * What deleting an account does to each house it is in, worked out before anything is
     * deleted so the admin page can say it first. The delete returns the same thing, as done.
     */
    public record AccountDeletion(UUID userId, String displayName, List<HouseholdOutcome> households) {
    }

    /**
     * One house's fate: `LEAVES` (everyone else stays), `HANDS_OVER` (it was theirs, and
     * `newOwnerName` has been in it longest, so it passes to them), or `DELETES_HOUSEHOLD` (nobody
     * else is in it, so it goes with everything in it — `recipes` and `plannedMeals` say how much).
     */
    public record HouseholdOutcome(
            UUID householdId, String name, String outcome, String newOwnerName, long recipes, long plannedMeals) {
    }
}
