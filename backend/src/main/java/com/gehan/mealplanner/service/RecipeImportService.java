package com.gehan.mealplanner.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
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

    private static final Logger log = LoggerFactory.getLogger(RecipeImportService.class);

    private static final Pattern LD_JSON = Pattern.compile(
            "<script[^>]+type\\s*=\\s*[\"']application/ld\\+json[\"'][^>]*>(.*?)</script>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern ISO_DURATION = Pattern.compile("^P(?:\\d+D)?T(?:(\\d+)H)?(?:(\\d+)M)?");
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");
    private static final Pattern HASHTAGS = Pattern.compile("#\\w+");
    private static final Pattern TIKTOK_DATA = Pattern.compile(
            "<script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"[^>]*>(.*?)</script>", Pattern.DOTALL);
    private static final int MAX_BYTES = 4 * 1024 * 1024;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    public GeneratedRecipe fromUrl(String rawUrl) {
        URI uri = safeUri(rawUrl);
        // An import that fails should leave a trace: without one, "the server said 422" is
        // all anybody has to go on.
        try {
            GeneratedRecipe draft = isTikTok(uri) ? fromTikTok(uri) : fromPage(uri);
            log.info("Imported \"{}\" from {} — {} ingredients", draft.name(), uri, draft.ingredients().size());
            return draft;
        } catch (ResponseStatusException e) {
            log.info("Import of {} refused: {}", uri, e.getReason());
            throw e;
        }
    }

    private GeneratedRecipe fromPage(URI uri) {
        String html = fetch(uri);
        JsonNode recipe = findRecipe(html);
        if (recipe == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "That page does not publish its recipe in a way this can read. Copy the recipe and paste it instead.");
        }
        return toDraft(recipe, uri.toString());
    }

    private boolean isTikTok(URI uri) {
        String host = uri.getHost().toLowerCase();
        return host.endsWith("tiktok.com");
    }

    /**
     * A TikTok page is rendered by JavaScript and publishes no structured data, so there is
     * nothing on it for a server to read. Its oEmbed endpoint, though, is public and needs no
     * key, and it returns the caption — which is where a recipe TikTok puts the recipe.
     *
     * When the caption is only a title and hashtags, the recipe is being spoken in the video
     * and there is nothing here to import. That is said plainly rather than guessed at.
     */
    private GeneratedRecipe fromTikTok(URI uri) {
        String caption = tikTokCaption(uri);
        if (caption == null || caption.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That video has no caption to read.");
        }
        return fromCaption(caption, uri.toString());
    }

    /**
     * The caption, with its line breaks.
     *
     * oEmbed is the obvious source and the wrong one: its `title` holds the whole caption —
     * never truncated, checked against captions up to 1,957 characters — but every newline in
     * it has been replaced by a single space. A recipe caption arrives as one unbroken line,
     * and one line can never be split into ingredients.
     *
     * The page itself carries `itemStruct.contents`, an array with one entry per original
     * line, so the structure survives. oEmbed stays as the fallback: a flat caption is worth
     * more than none, and some captions are a single line anyway.
     */
    private String tikTokCaption(URI uri) {
        try {
            Matcher matcher = TIKTOK_DATA.matcher(fetch(uri));
            if (matcher.find()) {
                JsonNode contents = mapper.readTree(matcher.group(1))
                        .path("__DEFAULT_SCOPE__").path("webapp.video-detail")
                        .path("itemInfo").path("itemStruct").path("contents");
                if (contents.isArray() && !contents.isEmpty()) {
                    List<String> lines = new ArrayList<>();
                    for (JsonNode entry : contents) lines.add(entry.path("desc").asText(""));
                    String joined = String.join("\n", lines).trim();
                    if (!joined.isBlank()) return joined;
                }
            }
        } catch (RuntimeException e) {
            // Includes ResponseStatusException from fetch(): a page that will not load is a
            // reason to try oEmbed, not to give up.
            log.info("Could not read the TikTok page for {} ({}), falling back to oEmbed", uri, e.toString());
        }
        return oembedCaption(uri);
    }

    private String oembedCaption(URI uri) {
        URI oembed = URI.create("https://www.tiktok.com/oembed?url="
                + URLEncoder.encode(uri.toString(), StandardCharsets.UTF_8));
        try {
            return text(mapper.readTree(fetch(oembed)), "title");
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "TikTok did not answer for that video.");
        }
    }

    /** Visible for tests: a caption, split into a recipe. */
    GeneratedRecipe fromCaption(String caption, String sourceUrl) {
        List<String> lines = new ArrayList<>();
        for (String raw : caption.replace("\\n", "\n").split("\r?\n")) {
            String line = HASHTAGS.matcher(raw).replaceAll(" ").replaceAll("\\s+", " ").trim();
            if (!line.isBlank()) lines.add(line);
        }
        if (lines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "That caption is only hashtags.");
        }

        String name = lines.get(0).replaceAll("[:\\-–—]+$", "").trim();

        // A caption that labels its own sections is far more reliable than any guess.
        int ingredientsAt = indexOfHeading(lines, "ingredient");
        int stepsAt = indexOfHeading(lines, "method", "instruction", "direction", "steps");

        List<GeneratedIngredient> ingredients = new ArrayList<>();
        List<String> steps = new ArrayList<>();

        if (ingredientsAt >= 0) {
            int end = stepsAt > ingredientsAt ? stepsAt : lines.size();
            for (String line : lines.subList(ingredientsAt + 1, end)) add(ingredients, line);
            if (stepsAt >= 0) steps.addAll(lines.subList(stepsAt + 1, lines.size()));
        } else {
            /*
             No headings. An ingredient list is a contiguous run of short lines, so find where
             it starts — the first line with an amount — and take everything short after it,
             amount or not, until the prose begins.
             *
             Picking out only the lines with amounts, which is the obvious thing to do, quietly
             loses the ones without: "Sea salt to taste", "Juice of one lemon", and — measured
             on a real caption — "1kg-1.2kg chicken thighs", the main ingredient. A recipe
             missing its chicken is worse than no recipe at all.
            */
            int start = -1;
            for (int i = 1; i < lines.size() && start < 0; i++) {
                if (IngredientLine.of(lines.get(i)).quantity() != null) start = i;
            }
            int end = start;
            if (start >= 0) {
                for (int i = start; i < lines.size(); i++) {
                    if (!looksLikeAnIngredient(lines.get(i))) break;
                    add(ingredients, lines.get(i));
                    end = i;
                }
                if (end + 1 < lines.size()) steps.addAll(lines.subList(end + 1, lines.size()));
            }
        }

        if (ingredients.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "That caption does not list any ingredients — the recipe is probably spoken in the video.");
        }
        return new GeneratedRecipe(name, sourceUrl, null, null, 4, ingredients, String.join("\n", steps));
    }

    /**
     * Short, and not a sentence. An ingredient is "2 tbsp butter" or "Sea salt to taste";
     * a step is a sentence that ends in a full stop. The length cap is what keeps a long
     * unpunctuated instruction out of the shopping list.
     */
    private boolean looksLikeAnIngredient(String line) {
        String trimmed = line.trim();
        if (trimmed.length() > 80) return false;
        if (trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")) return false;
        return true;
    }

    private void add(List<GeneratedIngredient> out, String line) {
        // "For the salmon:" and "Sauce:" divide an ingredient list; they are not in it. A
        // heading has no amount and ends in a colon, which "salt and pepper" does not.
        if (line.trim().endsWith(":")) return;
        IngredientLine parsed = IngredientLine.of(line);
        if (parsed.name().isBlank()) return;
        out.add(new GeneratedIngredient(parsed.name(), parsed.quantity(), parsed.unit()));
    }

    private int indexOfHeading(List<String> lines, String... words) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i).toLowerCase().replaceAll("[^a-z]", "");
            for (String word : words) {
                if (line.equals(word) || line.equals(word + "s") || line.equals(word + "list")) return i;
            }
        }
        return -1;
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
