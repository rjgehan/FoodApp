package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public class PlaceDtos {

    /** Only the name is required — "Chinese" is a valid place to eat. */
    public record PlaceRequest(
            @NotBlank @Size(max = 80) String name,
            String menuUrl,
            @Size(max = 40) String phone,
            String notes,
            UUID imageId) {
    }

    public record PlaceResponse(
            UUID id, String name, String menuUrl, String phone, String notes, UUID imageId) {
    }
}
