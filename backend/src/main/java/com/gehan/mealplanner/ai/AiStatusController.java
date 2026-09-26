package com.gehan.mealplanner.ai;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Whether a Gemini key is configured, so the UI can leave out ✨ Sort rather than offer a button
 * that can only answer 503.
 *
 * This used to be the recipe writer's status at /api/recipe-writer. The writer is gone — people
 * paste a recipe from an AI of their own instead — but the grocery sort still needs to know.
 */
@RestController
public class AiStatusController {

    private final RecipeAiProperties properties;

    public AiStatusController(RecipeAiProperties properties) {
        this.properties = properties;
    }

    // The old path too, for a web tab or a home-screen app loaded before the deploy: it still
    // asks /api/recipe-writer, and a 404 would hide ✨ Sort until it reloads. Safe to drop later.
    @GetMapping({"/api/ai", "/api/recipe-writer"})
    public Map<String, Boolean> status() {
        return Map.of("enabled", properties.enabled());
    }
}
