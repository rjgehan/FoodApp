package com.gehan.mealplanner.ai;

import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.StoreSection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Asks Gemini which of a household's own grocery categories each of a batch of items belongs in —
 * all of them in ONE request.
 *
 * The key allows twenty requests a day, shared with the recipe writer, so this is only ever
 * called from the Sort button, never per item or in the background. A category still carrying its
 * {@code seededFrom} link gets the original canonical description alongside its current name, so
 * a household that only renamed things gets the same grounding as before; a brand new category is
 * classified by its name alone.
 */
@Service
public class StoreSectionAi {

    private static final Logger log = LoggerFactory.getLogger(StoreSectionAi.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** What each of the original twelve means — still used to ground a category seeded from it. */
    private static final Map<StoreSection, String> CANONICAL_DESCRIPTIONS = Map.ofEntries(
            Map.entry(StoreSection.PRODUCE, "fresh fruit, vegetables, fresh herbs, tofu"),
            Map.entry(StoreSection.BAKERY, "bread, rolls, buns, bagels, tortillas, pastries"),
            Map.entry(StoreSection.DRY_GOODS, "pasta, rice, grains, canned and jarred food, oils, sauces, "
                    + "condiments, cereal, snacks, nuts, coffee, tea"),
            Map.entry(StoreSection.BAKING, "flour, sugar, baking soda and powder, yeast, chocolate chips, "
                    + "extracts, cake mixes"),
            Map.entry(StoreSection.SPICES, "salt, pepper, dried herbs, ground spices, seasoning blends"),
            Map.entry(StoreSection.DELI, "sliced meats and cheeses, hummus, prepared foods"),
            Map.entry(StoreSection.MEAT, "fresh meat, poultry and seafood"),
            Map.entry(StoreSection.DAIRY, "milk, cheese, yogurt, butter, cream, eggs"),
            Map.entry(StoreSection.FROZEN, "anything sold frozen"),
            Map.entry(StoreSection.DRINKS, "water, juice, soda, beer, wine"),
            Map.entry(StoreSection.HOUSEHOLD, "cleaning, paper goods, toiletries, anything that is not food"),
            Map.entry(StoreSection.OTHER, "only when nothing else fits"));

    private final RecipeAiProperties properties;
    private final RestClient client;

    public StoreSectionAi(RecipeAiProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(90));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public boolean enabled() {
        return properties.enabled();
    }

    /** Lowercased, trimmed item name -> category id, for every name that came back with a category we know. */
    public Map<String, UUID> classify(List<String> names, List<GroceryCategory> categories) {
        if (!properties.enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Sorting is off. Set GEMINI_API_KEY to turn it on.");
        }
        if (categories.isEmpty()) {
            return Map.of();
        }

        JsonNode reply;
        try {
            reply = client.post()
                    .uri(properties.endpoint())
                    .header("x-goog-api-key", properties.apiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody(names, categories))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (HttpStatusCodeException e) {
            log.warn("Sorting {} items failed: {} {}", names.size(), e.getStatusCode(), e.getResponseBodyAsString());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, switch (e.getStatusCode().value()) {
                case 429 -> "That's all the AI requests for today. You can still move items by hand.";
                case 401, 403 -> "The AI key was rejected.";
                case 500, 503 -> "The sorter is busy right now. Give it a moment and try again.";
                default -> "The sorter wouldn't answer. Try again later, or move items by hand.";
            });
        } catch (Exception e) {
            log.warn("Sorting {} items failed", names.size(), e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Couldn't reach the sorter. Try again later.");
        }

        return parse(reply, categories);
    }

    private Map<String, Object> requestBody(List<String> names, List<GroceryCategory> categories) {
        StringBuilder categoryList = new StringBuilder();
        for (GroceryCategory category : categories) {
            categoryList.append(category.getName());
            String description = category.getSeededFrom() != null
                    ? CANONICAL_DESCRIPTIONS.get(category.getSeededFrom())
                    : null;
            if (description != null) {
                categoryList.append(": ").append(description);
            }
            categoryList.append('\n');
        }

        String instruction = """
                Put each grocery item into the category a shopper at this household's store would find it in.
                These are the household's own categories, not necessarily the usual supermarket aisles:

                %s
                Answer for every item, with its name copied exactly as given. The items, as JSON:
                %s
                """.formatted(categoryList, toJson(names));

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", "OBJECT");
        item.put("properties", new LinkedHashMap<>(Map.of(
                "name", Map.of("type", "STRING"),
                "category", Map.of("type", "STRING", "format", "enum",
                        "enum", categories.stream().map(GroceryCategory::getName).toList()))));
        item.put("required", List.of("name", "category"));

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "OBJECT");
        schema.put("properties", Map.of("items", Map.of("type", "ARRAY", "items", item)));
        schema.put("required", List.of("items"));

        Map<String, Object> generationConfig = new LinkedHashMap<>();
        generationConfig.put("responseMimeType", "application/json");
        generationConfig.put("responseSchema", schema);
        // Roughly a dozen tokens an item, with room to spare; a long list must not be cut short.
        generationConfig.put("maxOutputTokens", Math.max(properties.maxTokens(), 200 + names.size() * 30));
        generationConfig.put("thinkingConfig", Map.of("thinkingLevel", "low"));

        return Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", instruction)))),
                "generationConfig", generationConfig);
    }

    private static String toJson(List<String> names) {
        try {
            return MAPPER.writeValueAsString(names);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, UUID> parse(JsonNode reply, List<GroceryCategory> categories) {
        JsonNode text = reply == null ? null
                : reply.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (text == null || text.isMissingNode() || text.asString("").isBlank()) {
            log.warn("Gemini replied without usable content: {}", reply);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The sorter sent something unusable.");
        }

        JsonNode answer;
        try {
            answer = MAPPER.readTree(text.asString());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The sorter sent something unusable.");
        }

        Map<String, UUID> byName = new HashMap<>();
        for (GroceryCategory category : categories) {
            byName.put(category.getName().trim().toLowerCase(), category.getId());
        }

        Map<String, UUID> results = new HashMap<>();
        for (JsonNode entry : answer.path("items")) {
            String name = entry.path("name").asString("").trim().toLowerCase();
            UUID categoryId = byName.get(entry.path("category").asString("").trim().toLowerCase());
            if (categoryId != null) {
                results.put(name, categoryId);
            }
            // An answer outside the list; that item simply stays unsorted.
        }
        return results;
    }
}
