package com.gehan.mealplanner.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * A new recipe that the household already has — the same link, or the same name. Carries which
 * one, so the app can offer to open it instead of only saying no.
 */
public class DuplicateRecipeException extends ResponseStatusException {

    private final UUID existingRecipeId;
    private final String existingName;

    public DuplicateRecipeException(UUID existingRecipeId, String existingName) {
        super(HttpStatus.CONFLICT, "You already have “" + existingName + "” in your recipes.");
        this.existingRecipeId = existingRecipeId;
        this.existingName = existingName;
    }

    public UUID getExistingRecipeId() {
        return existingRecipeId;
    }

    public String getExistingName() {
        return existingName;
    }
}
