package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.nutrition.NutritionDtos.Attribution;
import com.gehan.mealplanner.nutrition.NutritionDtos.ProductHit;
import com.gehan.mealplanner.nutrition.NutritionDtos.ProductResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.Values;
import com.gehan.mealplanner.service.BarcodeLookup;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * A packet's nutrition label, from Open Food Facts — the product side of the Nutrition screen.
 *
 * The cupboard's {@link BarcodeLookup} asks the same catalogue only for a name and size, and
 * caches that under "barcode:{digits}". This asks for the nutrition too, so it keeps its own
 * cache under "barcode:v2:{digits}" and leaves the older one, and its endpoint, exactly as they
 * were. Both are polite: one caller for the whole server, a User-Agent with a contact address as
 * Open Food Facts asks, answers kept for a month, and a hard ceiling on calls a minute
 * ({@link OffRateLimit}).
 *
 * The data is the catalogue's volunteers' (ODbL): every answer carries the attribution, and the
 * apps show it wherever product numbers appear. "nutriments_estimated" is never asked for — a
 * figure the catalogue guessed is not one to show as the label's.
 */
@Service
public class OffProducts {

    static final String WHO_WE_ARE = "MealPlanner/1.0 (rgehan27@gmail.com)";
    private static final Duration KEEP_FOR = Duration.ofDays(30);
    private static final Duration KEEP_MISS_FOR = Duration.ofDays(7);
    private static final Duration KEEP_SEARCH_FOR = Duration.ofDays(1);
    private static final String MISSING = "";
    static final Pattern PLAUSIBLE = Pattern.compile("\\d{8}|\\d{12,14}");

    private static final String FIELDS = "code,product_name,product_name_en,generic_name,generic_name_en,brands,"
            + "quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutriments,"
            + "nutriscore_grade,nova_group";

    /** What a search came back with, and whether it had to ask. */
    public record Search(List<ProductHit> hits, String status) {
    }

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final StringRedisTemplate cache;
    private final OffRateLimit limit;
    private final BarcodeLookup names;

    public OffProducts(StringRedisTemplate cache, OffRateLimit limit, BarcodeLookup names) {
        this.cache = cache;
        this.limit = limit;
        this.names = names;
    }

    /** 404 unknown, 400 not a barcode, 429 over our own limit, 503 the catalogue did not answer. */
    public ProductResponse product(String barcode) {
        String digits = barcode == null ? "" : barcode.trim();
        if (!PLAUSIBLE.matcher(digits).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That isn't a barcode.");
        }
        String key = "barcode:v2:" + digits;
        String body = remembered(key);
        if (body == null) {
            if (!limit.tryProduct()) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Lots of lookups just now — try again in a minute.");
            }
            body = fetch(URI.create("https://world.openfoodfacts.org/api/v2/product/" + digits + "?fields=" + FIELDS),
                    true);
            if (body == null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Open Food Facts didn't answer.");
            }
            ProductResponse parsed = parse(digits, body);
            write(key, parsed == null ? MISSING : body, parsed == null ? KEEP_MISS_FOR : KEEP_FOR);
            if (parsed == null) throw notFound();
            return parsed;
        }
        ProductResponse parsed = MISSING.equals(body) ? null : parse(digits, body);
        if (parsed == null) throw notFound();
        return parsed;
    }

    /** Only what is already cached — for a recent-lookups row, which must not phone out. */
    public ProductResponse cachedProduct(String barcode) {
        String body = remembered("barcode:v2:" + barcode);
        return body == null || MISSING.equals(body) ? null : parse(barcode, body);
    }

    /**
     * Products by name, through Open Food Facts' Search-a-licious. Cached a day per query;
     * the caller has already debounced it per person. Never throws: the search screen still has
     * USDA foods and recipes to show when this has nothing.
     */
    public Search search(String query) {
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        if (q.length() < 3) return new Search(List.of(), "skipped");
        String key = "off:search:v1:" + q;
        String body = remembered(key);
        String status = "cached";
        if (body == null) {
            if (!limit.trySearch()) return new Search(List.of(), "busy");
            body = fetch(URI.create("https://search.openfoodfacts.org/search?q="
                    + URLEncoder.encode(q, StandardCharsets.UTF_8)
                    + "&page_size=8&langs=en&fields=code,product_name,product_name_en,brands,quantity,nutriments"), false);
            if (body == null) return new Search(List.of(), "unavailable");
            write(key, body, KEEP_SEARCH_FOR);
            status = "ok";
        }
        return new Search(hits(body), status);
    }

    List<ProductHit> hits(String body) {
        List<ProductHit> hits = new ArrayList<>();
        JsonNode root;
        try {
            root = mapper.readTree(body);
        } catch (RuntimeException e) {
            return hits;
        }
        for (JsonNode hit : root.path("hits")) {
            String code = hit.path("code").asText("");
            if (!PLAUSIBLE.matcher(code).matches()) continue;
            String brand = "";
            JsonNode brands = hit.path("brands");
            if (brands.isArray() && !brands.isEmpty()) brand = brands.get(0).asText("");
            else if (brands.isString()) brand = brands.asText("").split(",")[0].trim();
            String name = firstOf(text(hit, "product_name_en"), text(hit, "product_name"));
            if (name.isEmpty()) continue;
            JsonNode n = hit.path("nutriments");
            hits.add(new ProductHit(code, name, brand, text(hit, "quantity"), Nutrients.round(kcal(n, "_100g"), 0),
                    Nutrients.round(number(n, "proteins_100g"), 1)));
        }
        return hits;
    }

    /** Null when the catalogue does not know it, or knows it only as a nameless record. */
    ProductResponse parse(String barcode, String body) {
        BarcodeLookup.Product named = names.productFrom(barcode, body);
        if (named == null) return null;
        JsonNode product;
        try {
            product = mapper.readTree(body).path("product");
        } catch (RuntimeException e) {
            return null;
        }
        JsonNode n = product.path("nutriments");
        Nutrients per100 = nutrients(n, "_100g");
        boolean hasNutrition = per100.kcal() != null;

        Double servingGrams = positive(number(product, "serving_quantity"));
        Nutrients perServing = null;
        if (servingGrams != null) {
            Nutrients labelled = nutrients(n, "_serving");
            perServing = labelled.kcal() != null ? labelled : hasNutrition ? per100.scaled(servingGrams / 100.0) : null;
        }
        String unit = text(product, "product_quantity_unit").toLowerCase(Locale.ROOT);
        String servingText = text(product, "serving_size");
        boolean liquid = unit.equals("ml") || unit.equals("l") || unit.equals("cl")
                || (unit.isEmpty() && servingText.toLowerCase(Locale.ROOT).matches(".*\\d\\s*ml.*"));
        Double packGrams = positive(number(product, "product_quantity"));
        if (packGrams != null && unit.equals("kg")) packGrams *= 1000;
        if (packGrams != null && unit.equals("l")) packGrams *= 1000;
        if (packGrams != null && unit.equals("cl")) packGrams *= 10;

        String grade = text(product, "nutriscore_grade").toLowerCase(Locale.ROOT);
        Integer nova = product.path("nova_group").isNumber() ? product.path("nova_group").asInt() : null;
        Double b12 = micro(n, "vitamin-b12_100g"), vitaminD = micro(n, "vitamin-d_100g");
        return new ProductResponse(barcode, named.name(), named.brand(), named.size(), packGrams, liquid,
                servingText.isEmpty() ? null : servingText, servingGrams, Values.of(per100),
                perServing == null ? null : Values.of(perServing), NutritionLabels.split(per100),
                NutritionLabels.details(per100, b12, vitaminD),
                hasNutrition ? NutritionLabels.badges(per100, liquid) : List.of(),
                grade.matches("[a-e]") ? grade : null, nova, hasNutrition, Attribution.openFoodFacts(barcode));
    }

    /**
     * The label's figures in the app's units. Open Food Facts keeps sodium, calcium and the
     * rest in grams per 100 g (so 0.0428 is 42.8 mg); its "salt" is sodium × 2.5.
     */
    static Nutrients nutrients(JsonNode n, String suffix) {
        Double sodiumG = number(n, "sodium" + suffix);
        Double salt = number(n, "salt" + suffix);
        Double sodiumMg = null;
        if (sodiumG != null) sodiumMg = sodiumG * 1000;
        else if (salt != null) sodiumMg = salt / 2.5 * 1000;
        return new Nutrients(kcal(n, suffix), number(n, "proteins" + suffix), number(n, "carbohydrates" + suffix),
                number(n, "fat" + suffix), number(n, "fiber" + suffix), number(n, "sugars" + suffix), sodiumMg,
                number(n, "saturated-fat" + suffix), times(number(n, "iron" + suffix), 1000),
                times(number(n, "calcium" + suffix), 1000), times(number(n, "vitamin-c" + suffix), 1000),
                times(number(n, "potassium" + suffix), 1000));
    }

    /** kcal as labelled; else from kJ (4.184 kJ to the kcal); "energy" alone is kJ. */
    static Double kcal(JsonNode n, String suffix) {
        Double kcal = number(n, "energy-kcal" + suffix);
        if (kcal != null) return kcal;
        Double kj = number(n, "energy-kj" + suffix);
        if (kj == null) kj = number(n, "energy" + suffix);
        return kj == null ? null : kj / 4.184;
    }

    private static Double micro(JsonNode n, String field) {
        return times(number(n, field), 1_000_000);
    }

    private static Double number(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isNumber()) return value.asDouble();
        if (value.isString()) {
            try {
                return Double.parseDouble(value.asText().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static Double times(Double value, double factor) {
        return value == null ? null : value * factor;
    }

    private static Double positive(Double value) {
        return value == null || value <= 0 ? null : value;
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static String firstOf(String... candidates) {
        for (String candidate : candidates) {
            if (!candidate.isEmpty()) return candidate;
        }
        return "";
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Open Food Facts doesn't know that barcode.");
    }

    /** The body, "{\"status\":0}" for the catalogue's "no such product", or null when it is down. */
    protected String fetch(URI uri, boolean product) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(product ? 6 : 8))
                .header("User-Agent", WHO_WE_ARE)
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (product && response.statusCode() == 404) return "{\"status\":0}";
            return response.statusCode() == 200 ? response.body() : null;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return null;
        }
    }

    // Redis is only a cache: any failure here means one more (rate-limited) call to the catalogue.

    private String remembered(String key) {
        try {
            return cache == null ? null : cache.opsForValue().get(key);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void write(String key, String value, Duration keep) {
        try {
            if (cache != null) cache.opsForValue().set(key, value, keep);
        } catch (RuntimeException e) {
            // Nothing worth failing a lookup over.
        }
    }
}
