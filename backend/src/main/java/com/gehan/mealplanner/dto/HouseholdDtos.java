package com.gehan.mealplanner.dto;

import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeVisibility;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public class HouseholdDtos {

    public record CreateHouseholdRequest(@NotBlank String name) {
    }

    public record HouseholdResponse(
            UUID id, String name, int defaultServings, RecipeVisibility defaultRecipeVisibility, int planningHorizonDays) {
    }

    public record UpdateHouseholdSettingsRequest(
            @NotNull @Min(1) Integer defaultServings,
            @NotNull RecipeVisibility defaultRecipeVisibility,
            @NotNull @Min(1) Integer planningHorizonDays) {
    }

    public record AddMemberRequest(@NotBlank String username) {
    }

    public record MemberResponse(UUID userId, String username, String displayName, HouseholdRole role) {
    }
}
