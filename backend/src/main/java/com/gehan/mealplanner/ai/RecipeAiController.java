package com.gehan.mealplanner.ai;

import com.gehan.mealplanner.ai.RecipeAiDtos.GenerateRecipeRequest;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
public class RecipeAiController {

    private final RecipeAiService service;

    public RecipeAiController(RecipeAiService service) {
        this.service = service;
    }

    /** Lets the UI hide the whole feature when no key is configured, rather than offering a 503. */
    @GetMapping("/api/recipe-writer")
    public Map<String, Boolean> status() {
        return Map.of("enabled", service.enabled());
    }

    /** Returns a draft. Nothing is saved — the form gets it so a person can check the quantities. */
    @PostMapping("/api/households/{householdId}/recipes/generate")
    public GeneratedRecipe generate(@AuthenticationPrincipal UUID userId,
                                    @PathVariable UUID householdId,
                                    @Valid @RequestBody GenerateRecipeRequest request) {
        return service.generate(householdId, userId, request.name().trim(), request.servings());
    }
}
