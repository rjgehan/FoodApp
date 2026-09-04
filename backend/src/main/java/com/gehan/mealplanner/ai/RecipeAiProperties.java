package com.gehan.mealplanner.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Writing a recipe from a name and a serving count.
 *
 * Unset key means the feature is simply absent — the button does not appear and the endpoint
 * answers 503. Same shape as the integration API: a thing you turn on deliberately.
 */
@ConfigurationProperties(prefix = "app.ai")
public record RecipeAiProperties(String apiKey, String model, int maxTokens, String baseUrl) {

    public RecipeAiProperties {
        if (model == null || model.isBlank()) {
            model = "claude-haiku-4-5-20251001";
        }
        if (maxTokens <= 0) {
            maxTokens = 2000;
        }
        // Overridable so the call can be pointed at a stub in testing without a live key.
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://api.anthropic.com/v1/messages";
        }
    }

    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
