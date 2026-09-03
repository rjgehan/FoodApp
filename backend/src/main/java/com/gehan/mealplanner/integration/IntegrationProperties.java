package com.gehan.mealplanner.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Read-only API for other services on the home network — a dashboard, a display, a script.
 *
 * The key is the whole of the authentication: there is no user behind these calls, so they are
 * not scoped to a household's membership. Leave it unset and the endpoints refuse to answer,
 * which is the safe default for something reachable from the public internet.
 */
@ConfigurationProperties(prefix = "app.integration")
public record IntegrationProperties(String apiKey) {

    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
