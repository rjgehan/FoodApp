package com.gehan.mealplanner.ai;

import tools.jackson.databind.JsonNode;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import com.gehan.mealplanner.service.HouseholdService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

/**
 * Asks Claude for a recipe and gets structured data back.
 *
 * The model is made to answer through a tool call with a fixed schema rather than in prose, so
 * there is no parsing here at all. The old flow had 165 lines of text-wrangling that broke
 * whenever the model bolded a word or auto-numbered a list; none of that exists now.
 */
@Service
public class RecipeAiService {

    private static final Logger log = LoggerFactory.getLogger(RecipeAiService.class);
    private static final String TOOL = "write_recipe";

    /** The schema is the contract. Anything not described here will not come back. */
    private static final Map<String, Object> SCHEMA = Map.of(
            "type", "object",
            "properties", Map.of(
                    "name", Map.of("type", "string", "description", "The recipe's name"),
                    "description", Map.of("type", "string", "description", "One short sentence about it"),
                    "prepTimeMinutes", Map.of("type", "integer"),
                    "cookTimeMinutes", Map.of("type", "integer"),
                    "ingredients", Map.of(
                            "type", "array",
                            "items", Map.of(
                                    "type", "object",
                                    "properties", Map.of(
                                            "ingredientName", Map.of("type", "string"),
                                            "quantity", Map.of("type", "number"),
                                            "unit", Map.of("type", "string",
                                                    "description", "cup, tbsp, tsp, oz, lb, g, ml, ct, clove — empty for whole items")),
                                    "required", List.of("ingredientName", "quantity"))),
                    "instructions", Map.of(
                            "type", "array",
                            "items", Map.of("type", "string"),
                            "description", "One step per entry, no numbering")),
            "required", List.of("name", "ingredients", "instructions"));

    private final RecipeAiProperties properties;
    private final HouseholdService householdService;
    private final RestClient client;

    public RecipeAiService(RecipeAiProperties properties, HouseholdService householdService) {
        this.properties = properties;
        this.householdService = householdService;

        // Built here rather than injected: writing a recipe takes several seconds, well past the
        // default read timeout, and this is the only outbound call the app makes.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(90));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public boolean enabled() {
        return properties.enabled();
    }

    public GeneratedRecipe generate(UUID householdId, UUID requesterId, String name, int servings) {
        householdService.assertMember(householdId, requesterId);
        if (!properties.enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Recipe writing is off. Set ANTHROPIC_API_KEY to turn it on.");
        }

        JsonNode reply;
        try {
            reply = client.post()
                    .uri(properties.baseUrl())
                    .header("x-api-key", properties.apiKey())
                    .header("anthropic-version", "2023-06-01")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody(name, servings))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (Exception e) {
            log.warn("Recipe generation failed for \"{}\"", name, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Couldn't reach the recipe writer. Try again, or write it out yourself.");
        }

        return toRecipe(toolInput(reply), servings);
    }

    private Map<String, Object> requestBody(String name, int servings) {
        String instruction = """
                Write a recipe for "%s" that serves exactly %d, and return it with the %s tool.

                Quantities must be what you would actually buy and cook for %d people, written the way a
                person writes a recipe — "1 egg", never "0.125 egg". Never give a fraction of a whole item.
                Leave the unit empty for things counted individually. Keep steps short and in order, and do
                not number them; the app does that. Use ordinary supermarket ingredients.
                """.formatted(name, servings, TOOL, servings);

        return Map.of(
                "model", properties.model(),
                "max_tokens", properties.maxTokens(),
                "tools", List.of(Map.of(
                        "name", TOOL,
                        "description", "Record a complete recipe.",
                        "input_schema", SCHEMA)),
                // Forces the tool rather than inviting it, so there is always structured data to read.
                "tool_choice", Map.of("type", "tool", "name", TOOL),
                "messages", List.of(Map.of("role", "user", "content", instruction)));
    }

    private JsonNode toolInput(JsonNode reply) {
        JsonNode content = reply == null ? null : reply.get("content");
        if (content != null) {
            for (JsonNode block : content) {
                if ("tool_use".equals(block.path("type").asString())) {
                    return block.path("input");
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The recipe writer sent something unusable.");
    }

    private GeneratedRecipe toRecipe(JsonNode input, int servings) {
        List<GeneratedIngredient> ingredients = new ArrayList<>();
        for (JsonNode i : input.path("ingredients")) {
            String ingredientName = i.path("ingredientName").asString("").trim();
            if (ingredientName.isEmpty()) {
                continue;
            }
            BigDecimal quantity = i.has("quantity") ? BigDecimal.valueOf(i.path("quantity").asDouble(1)) : BigDecimal.ONE;
            ingredients.add(new GeneratedIngredient(ingredientName, quantity, i.path("unit").asString("").trim()));
        }
        if (ingredients.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "That came back without any ingredients.");
        }

        String instructions = StreamSupport.stream(input.path("instructions").spliterator(), false)
                .map(JsonNode::asString)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");

        return new GeneratedRecipe(
                input.path("name").asString("").trim(),
                blankToNull(input.path("description").asString("")),
                input.has("prepTimeMinutes") ? input.path("prepTimeMinutes").asInt() : null,
                input.has("cookTimeMinutes") ? input.path("cookTimeMinutes").asInt() : null,
                servings,
                ingredients,
                instructions);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
