package com.gehan.mealplanner.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Writing a recipe from a name and a serving count, via Google's Gemini API.
 *
 * Unset key means the feature is simply absent — the button does not appear and the endpoint
 * answers 503. Same shape as the integration API: a thing you turn on deliberately.
 */
@ConfigurationProperties(prefix = "app.ai")
public record RecipeAiProperties(String apiKey, String model, int maxTokens, String baseUrl) {

    public RecipeAiProperties {
        if (model == null || model.isBlank()) {
            model = "gemini-2.5-flash";
        }
        if (maxTokens <= 0) {
            maxTokens = 2000;
        }
        // The API root, not the full URL: the model name is part of the path. Overridable so the
        // call can be pointed at a stub in testing without spending a live key.
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
    }

    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Where a generateContent call goes for the configured model. */
    public String endpoint() {
        return "%s/models/%s:generateContent".formatted(baseUrl.replaceAll("/+$", ""), model);
    }
}
