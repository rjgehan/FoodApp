package com.gehan.mealplanner.ai;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import com.gehan.mealplanner.service.HouseholdService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

/**
 * Asks Gemini for a recipe and gets structured data back.
 *
 * The request carries a responseSchema, so the model answers with JSON in that exact shape
 * rather than prose. The flow this replaced had 165 lines of text-wrangling that broke whenever
 * the model bolded a word or auto-numbered a list; none of that exists now.
 */
@Service
public class RecipeAiService {

    private static final Logger log = LoggerFactory.getLogger(RecipeAiService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Gemini's responseSchema is an OpenAPI subset, not full JSON Schema: types are upper case
     * and there is no additionalProperties. LinkedHashMap because propertyOrdering below refers
     * to these keys and the order is worth keeping stable.
     */
    private static final Map<String, Object> SCHEMA = schema();

    private static Map<String, Object> schema() {
        Map<String, Object> ingredient = new LinkedHashMap<>();
        ingredient.put("type", "OBJECT");
        ingredient.put("properties", new LinkedHashMap<>(Map.of(
                "ingredientName", Map.of("type", "STRING"),
                "quantity", Map.of("type", "NUMBER"),
                "unit", Map.of("type", "STRING",
                        "description", "cup, tbsp, tsp, oz, lb, g, ml, ct, clove — empty for whole items"))));
        ingredient.put("required", List.of("ingredientName", "quantity"));

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("name", Map.of("type", "STRING", "description", "The recipe's name"));
        properties.put("description", Map.of("type", "STRING", "description", "One short sentence about it"));
        properties.put("prepTimeMinutes", Map.of("type", "INTEGER"));
        properties.put("cookTimeMinutes", Map.of("type", "INTEGER"));
        properties.put("ingredients", Map.of("type", "ARRAY", "items", ingredient));
        properties.put("instructions", Map.of(
                "type", "ARRAY",
                "items", Map.of("type", "STRING"),
                "description", "One step per entry, no numbering"));

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("type", "OBJECT");
        root.put("properties", properties);
        root.put("propertyOrdering",
                List.of("name", "description", "prepTimeMinutes", "cookTimeMinutes", "ingredients", "instructions"));
        root.put("required", List.of("name", "ingredients", "instructions"));
        return root;
    }

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
                    "Recipe writing is off. Set GEMINI_API_KEY to turn it on.");
        }

        JsonNode reply;
        try {
            reply = client.post()
                    .uri(properties.endpoint())
                    // Header rather than ?key=: a query string ends up in access logs and proxies.
                    .header("x-goog-api-key", properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody(name, servings))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (Exception e) {
            log.warn("Recipe generation failed for \"{}\"", name, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Couldn't reach the recipe writer. Try again, or write it out yourself.");
        }

        return toRecipe(payload(reply), servings);
    }

    private Map<String, Object> requestBody(String name, int servings) {
        String instruction = """
                Write a recipe for "%s" that serves exactly %d.

                Quantities must be what you would actually buy and cook for %d people, written the way a
                person writes a recipe — "1 egg", never "0.125 egg". Never give a fraction of a whole item.
                Leave the unit empty for things counted individually. Keep steps short and in order, and do
                not number them; the app does that. Use ordinary supermarket ingredients.
                """.formatted(name, servings, servings);

        Map<String, Object> generationConfig = new LinkedHashMap<>();
        generationConfig.put("responseMimeType", "application/json");
        generationConfig.put("responseSchema", SCHEMA);
        generationConfig.put("maxOutputTokens", properties.maxTokens());

        return Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", instruction)))),
                "generationConfig", generationConfig);
    }

    /** The recipe arrives as a JSON string inside the first candidate's first text part. */
    private JsonNode payload(JsonNode reply) {
        JsonNode text = reply == null ? null
                : reply.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (text == null || text.isMissingNode() || text.asString("").isBlank()) {
            log.warn("Gemini replied without usable content: {}", reply);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The recipe writer sent something unusable.");
        }
        try {
            return MAPPER.readTree(text.asString());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The recipe writer sent something unusable.");
        }
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
