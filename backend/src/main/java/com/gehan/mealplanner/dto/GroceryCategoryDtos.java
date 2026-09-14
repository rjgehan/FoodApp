package com.gehan.mealplanner.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public class GroceryCategoryDtos {

    public record GroceryCategoryResponse(UUID id, String name, int position) {
    }

    public record CreateGroceryCategoryRequest(@NotBlank @Size(max = 60) String name) {
    }

    public record RenameGroceryCategoryRequest(@NotBlank @Size(max = 60) String name) {
    }

    /** The category ids in the new walking order — every category, exactly once. */
    public record ReorderGroceryCategoriesRequest(@NotNull @NotEmpty List<UUID> order) {
    }
}
