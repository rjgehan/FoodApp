package com.gehan.mealplanner.web;

import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateRecipeVisibilityRequest;
import com.gehan.mealplanner.service.RecipeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class RecipeController {

    private final RecipeService recipeService;

    public RecipeController(RecipeService recipeService) {
        this.recipeService = recipeService;
    }

    @PostMapping("/api/households/{householdId}/recipes")
    public ResponseEntity<RecipeResponse> create(@AuthenticationPrincipal UUID userId,
                                                  @PathVariable UUID householdId,
                                                  @Valid @RequestBody RecipeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(recipeService.create(householdId, userId, request));
    }

    @GetMapping("/api/households/{householdId}/recipes")
    public List<RecipeResponse> list(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId) {
        return recipeService.list(householdId, userId);
    }

    @GetMapping("/api/recipes/{recipeId}")
    public RecipeResponse get(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        return recipeService.get(recipeId, userId);
    }

    @PatchMapping("/api/recipes/{recipeId}/visibility")
    public RecipeResponse updateVisibility(@AuthenticationPrincipal UUID userId,
                                            @PathVariable UUID recipeId,
                                            @Valid @RequestBody UpdateRecipeVisibilityRequest request) {
        return recipeService.updateVisibility(recipeId, userId, request);
    }

    @DeleteMapping("/api/recipes/{recipeId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId) {
        recipeService.delete(recipeId, userId);
        return ResponseEntity.noContent().build();
    }
}
