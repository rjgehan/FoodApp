package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public class BlacklistDtos {

    public record AddBlacklistRequest(@NotBlank String ingredientName) {
    }

    public record BlacklistEntryResponse(UUID ingredientId, String name) {
    }
}
