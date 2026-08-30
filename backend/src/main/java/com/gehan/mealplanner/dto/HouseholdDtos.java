package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.HouseholdRole;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class HouseholdDtos {

    public record CreateHouseholdRequest(@NotBlank String name) {
    }

    public record HouseholdResponse(
            UUID id, String name, int defaultServings, int planningHorizonDays) {
    }

    public record UpdateHouseholdSettingsRequest(
            @NotNull @Min(1) Integer defaultServings,
            @NotNull @Min(1) Integer planningHorizonDays) {
    }

    /** Adds an account that already exists — including one belonging to another household. */
    public record AddMemberRequest(@NotBlank String username) {
    }

    /** Makes a brand new account inside this household. It has no PIN until its owner first signs in. */
    public record CreateUserRequest(
            @NotBlank @Size(min = 2, max = 50) String username,
            @Size(max = 50) String displayName) {
    }

    public record MemberResponse(
            UUID userId, String username, String displayName, HouseholdRole role, boolean pinSet) {
    }
}
