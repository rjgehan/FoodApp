package com.gehan.mealplanner.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Imports a recipe from a link by reading what the page already says about itself.
 *
 * Nearly every recipe site embeds a schema.org Recipe in a {@code <script type="application/
 * ld+json">} — the same data that puts recipe cards in search results — with the exact
 * ingredient and step lists. Reading it is instant, exact, and costs none of the twenty AI
 * requests a day. Scraping the visible text instead picks up the blog's "ingredient notes"
 * commentary, which reads like an ingredient list and is not one.
 *
 * Pages without that data are not handled here; they still go through the paste flow.
 */
@Service
public class RecipeImportService {

    private static final Pattern LD_JSON = Pattern.compile(
            "<script[^>]+type\\s*=\\s*[\"']application/ld\\+json[\"'][^>]*>(.*?)</script>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern ISO_DURATION = Pattern.compile("^P(?:\\d+D)?T(?:(\\d+)H)?(?:(\\d+)M)?");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final int MAX_BYTES = 4 * 1024 * 1024;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    public GeneratedRecipe fromUrl(String rawUrl) {
        URI uri = safeUri(rawUrl);
        String html = fetch(uri);
        JsonNode recipe = findRecipe(html);
        if (recipe == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "That page does not publish its recipe in a way this can read. Copy the recipe and paste it instead.");
        }
        return toDraft(recipe, uri.toString());
    }

    /**
     * This server sits on a home network, so a link is not automatically safe to fetch: an
     * address like 192.168.1.1 or localhost would make the server reach its own neighbours.
     * Only public http(s) hosts are followed.
     */
    private URI safeUri(String raw) {
        URI uri;
        try {
            uri = URI.create(raw.trim());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That is not a link.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only web links can be imported.");
        }
        if (uri.getHost() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link has no site in it.");
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(uri.getHost())) {
                if (address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress()
                        || address.isAnyLocalAddress() || address.isMulticastAddress()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That link points inside the network.");
                }
            }
        } catch (UnknownHostException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That site could not be found.");
        }
        return uri;
    }

    private String fetch(URI uri) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(20))
                // Some recipe sites serve a stub to anything that does not look like a browser.
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml")
                .GET()
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 403 || response.statusCode() == 429) {
                // Bot protection. The phone's share sheet still works on these, because
                // Safari is already on the page as a person.
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "That site will not let this server read it. Copy the recipe and paste it instead.");
            }
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "That page answered " + response.statusCode() + ".");
            }
            String body = response.body();
            return body.length() > MAX_BYTES ? body.substring(0, MAX_BYTES) : body;
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not reach that page.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not reach that page.");
        }
    }

    /** Visible for tests: pulls the Recipe out of a page's JSON-LD, wherever it is nested. */
    JsonNode findRecipe(String html) {
        Matcher matcher = LD_JSON.matcher(html);
        while (matcher.find()) {
            JsonNode parsed;
            try {
                parsed = mapper.readTree(matcher.group(1));
            } catch (RuntimeException e) {
                // A page with malformed JSON-LD is common; try the next block.
                continue;
            }
            JsonNode found = search(parsed);
            if (found != null) return found;
        }
        return null;
    }

    /** The Recipe sits at the top, in an array, or inside an {@code @graph}. */
    private JsonNode search(JsonNode node) {
        if (node == null) return null;
        if (node.isArray()) {
            for (JsonNode child : node) {
                JsonNode found = search(child);
                if (found != null) return found;
            }
            return null;
        }
        if (!node.isObject()) return null;
        if (isRecipe(node.get("@type")) && node.has("recipeIngredient")) return node;
        if (node.has("@graph")) return search(node.get("@graph"));
        return null;
    }

    private boolean isRecipe(JsonNode type) {
        if (type == null) return false;
        if (type.isArray()) {
            for (JsonNode one : type) {
                if ("Recipe".equals(one.asText())) return true;
            }
            return false;
        }
        return "Recipe".equals(type.asText());
    }

    GeneratedRecipe toDraft(JsonNode recipe, String sourceUrl) {
        List<GeneratedIngredient> ingredients = new ArrayList<>();
        for (JsonNode line : recipe.withArray("recipeIngredient")) {
            IngredientLine parsed = IngredientLine.of(line.asText());
            if (parsed.name().isBlank()) continue;
            ingredients.add(new GeneratedIngredient(parsed.name(), parsed.quantity(), parsed.unit()));
        }

        List<String> steps = new ArrayList<>();
        collectSteps(recipe.get("recipeInstructions"), steps);

        int prep = minutes(text(recipe, "prepTime"));
        int cook = minutes(text(recipe, "cookTime"));
        if (cook == 0) cook = minutes(text(recipe, "totalTime"));

        return new GeneratedRecipe(
                text(recipe, "name"),
                sourceUrl,
                prep > 0 ? prep : null,
                cook > 0 ? cook : null,
                Math.max(1, servings(recipe.get("recipeYield"))),
                ingredients,
                String.join("\n", steps));
    }

    /** Steps arrive as strings, as HowToStep objects, or as HowToSections holding steps. */
    private void collectSteps(JsonNode node, List<String> out) {
        if (node == null || node.isNull()) return;
        if (node.isTextual()) {
            for (String piece : node.asText().split("\\r?\\n")) {
                String step = TAGS.matcher(piece).replaceAll("").trim();
                if (!step.isBlank()) out.add(step);
            }
            return;
        }
        if (node.isArray()) {
            for (JsonNode child : node) collectSteps(child, out);
            return;
        }
        if (node.has("itemListElement")) {
            collectSteps(node.get("itemListElement"), out);
            return;
        }
        if (node.has("text")) {
            String step = TAGS.matcher(node.get("text").asText()).replaceAll("").trim();
            if (!step.isBlank()) out.add(step);
        }
    }

    private int servings(JsonNode yield) {
        if (yield == null) return 0;
        JsonNode value = yield.isArray() && !yield.isEmpty() ? yield.get(0) : yield;
        if (value.isNumber()) return value.asInt();
        Matcher digits = Pattern.compile("\\d+").matcher(value.asText(""));
        return digits.find() ? Integer.parseInt(digits.group()) : 0;
    }

    private int minutes(String iso) {
        if (iso == null) return 0;
        Matcher matcher = ISO_DURATION.matcher(iso);
        if (!matcher.find()) return 0;
        int hours = matcher.group(1) == null ? 0 : Integer.parseInt(matcher.group(1));
        int mins = matcher.group(2) == null ? 0 : Integer.parseInt(matcher.group(2));
        return hours * 60 + mins;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
