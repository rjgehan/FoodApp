package com.gehan.mealplanner.service;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;

/**
 * What is this packet, given the barcode on it.
 *
 * Open Food Facts is a public, volunteer-built catalogue of groceries. It is very good at the
 * one question the cupboard asks — what is in this box and how big is it — and much weaker on
 * nutrition: Nutella comes back with no vitamins at all. That split is the whole reason this
 * class is called a lookup and not a nutrition service.
 *
 * Answers are cached for a month. A barcode is a permanent name for a product, so a second scan
 * of the same jar should never leave the house, and a household re-scanning its staples should
 * not be a stream of traffic to a charity's servers.
 */
@Service
public class BarcodeLookup {

    /**
     * What comes back: enough to recognise the thing in your hand, and nothing more.
     *
     * No picture. The catalogue publishes front-of-pack thumbnails and they would be the
     * nicest way to confirm a scan, but its image server answers in twelve to seventeen
     * seconds for a ten-kilobyte JPEG, measured repeatedly and warm. A result card that sits
     * on an empty grey square for fifteen seconds is worse than one that never promises a
     * picture, and it would put every phone in the house on a third party's CDN to get it.
     */
    public record Product(String barcode, String name, String brand, String size) {
    }

    private static final String WHO_WE_ARE = "MealPlanner/1.0 (+https://meals.gehan.cloud)";
    private static final Duration KEEP_FOR = Duration.ofDays(30);
    private static final String MISSING = "";

    /**
     * EAN-13 and UPC-A cover practically every grocery item; EAN-8 is the small-package one,
     * and ITF-14 is on outer cases. Anything else is not a barcode we can ask about.
     */
    private static final java.util.regex.Pattern PLAUSIBLE = java.util.regex.Pattern.compile("\\d{8}|\\d{12,14}");

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final StringRedisTemplate cache;

    public BarcodeLookup(StringRedisTemplate cache) {
        this.cache = cache;
    }

    /** Empty when the barcode is malformed, unknown to the catalogue, or the catalogue is down. */
    public Optional<Product> find(String barcode) {
        String digits = barcode == null ? "" : barcode.trim();
        if (!PLAUSIBLE.matcher(digits).matches()) return Optional.empty();

        String key = "barcode:" + digits;
        String cached = remembered(key);
        if (cached != null) {
            // A remembered miss is worth as much as a remembered hit: scanning the one tin the
            // catalogue has never heard of should not phone out every single time.
            return MISSING.equals(cached) ? Optional.empty() : Optional.of(parse(digits, cached));
        }

        String body = ask(digits);
        if (body == null) return Optional.empty();  // down or slow: don't remember that as a miss
        Product found = productFrom(digits, body);
        write(key, found == null ? MISSING : body);
        return Optional.ofNullable(found);
    }

    private String ask(String barcode) {
        // v2 lets us name the fields, which turns a 100KB product record into about 300 bytes.
        URI uri = URI.create("https://world.openfoodfacts.org/api/v2/product/" + barcode
                + "?fields=product_name,product_name_en,generic_name,generic_name_en,brands,quantity");
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(6))
                .header("User-Agent", WHO_WE_ARE)
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            // 404 is the catalogue saying "no such product", which is an answer, not a failure.
            if (response.statusCode() == 404) return "{\"status\":0}";
            return response.statusCode() == 200 ? response.body() : null;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return null;
        }
    }

    /** Null when the catalogue does not know this barcode, or knows it only as an empty record. */
    Product productFrom(String barcode, String body) {
        JsonNode root;
        try {
            root = mapper.readTree(body);
        } catch (RuntimeException e) {
            return null;
        }
        JsonNode product = root.path("product");
        if (root.path("status").asInt(0) != 1 || product.isMissingNode()) return null;

        String brand = firstBrand(text(product, "brands"));
        String name = named(product, brand);
        if (name.isEmpty()) return null;  // a record with no name is no use to anybody

        return new Product(barcode, name, brand, size(text(product, "quantity")));
    }

    private Product parse(String barcode, String body) {
        Product product = productFrom(barcode, body);
        return product != null ? product : new Product(barcode, barcode, "", "");
    }

    /**
     * The name to put in the cupboard. English first where the catalogue has it, and the brand
     * on the front only when it is not already there: "Heinz" + "Baked Beans" wants joining,
     * "Nutella" + "Nutella" does not, and neither does "Coke" + "Diet Coke Soft Drink".
     */
    private static String named(JsonNode product, String brand) {
        String name = firstOf(text(product, "product_name_en"), text(product, "product_name"),
                text(product, "generic_name_en"), text(product, "generic_name"));
        if (name.isEmpty()) return "";
        if (brand.isEmpty() || alreadySaid(brand, name)) return trimmedToFit(name);
        return trimmedToFit(brand + " " + name);
    }

    /**
     * Whether sticking the brand on the front would stutter. Word by word rather than whole
     * string, because the overlap is usually partial — "Monster Energy" against "Monster Ultra
     * White" would otherwise come out as "Monster Energy Monster Ultra White". Short words are
     * skipped so an "&" or a "de" cannot make two unrelated names look like a match.
     */
    private static boolean alreadySaid(String brand, String name) {
        java.util.Set<String> inName = new java.util.HashSet<>(
                java.util.Arrays.asList(words(name)));
        for (String word : words(brand)) {
            if (word.length() >= 3 && inName.contains(word)) return true;
        }
        return false;
    }

    private static String[] words(String text) {
        return text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+");
    }

    /** Brands arrive comma-separated and roughly most-specific-first: "Nutella, Ferrero". */
    private static String firstBrand(String brands) {
        int comma = brands.indexOf(',');
        return (comma < 0 ? brands : brands.substring(0, comma)).trim();
    }

    private static String firstOf(String... candidates) {
        for (String candidate : candidates) {
            if (!candidate.isEmpty()) return candidate;
        }
        return "";
    }

    /**
     * "400 g e" is 400 g: the trailing e is the European estimated-quantity mark, which is a
     * fact about the packaging line and not about how much is in the jar.
     */
    private static String size(String quantity) {
        return quantity.replaceAll("(?i)\\s+e$", "").trim();
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    /** The cupboard's own limit is 200 characters, and a name that long is unreadable anyway. */
    private static String trimmedToFit(String name) {
        String tidy = name.replaceAll("\\s+", " ").trim();
        return tidy.length() <= 120 ? tidy : tidy.substring(0, 120).trim();
    }

    // Redis is where the grocery list's live updates already go, so it is running wherever this
    // is. It is still only a cache: every failure here means one more call to the catalogue.

    private String remembered(String key) {
        try {
            return cache.opsForValue().get(key);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void write(String key, String value) {
        try {
            cache.opsForValue().set(key, value, KEEP_FOR);
        } catch (RuntimeException e) {
            // Nothing to do about it and nothing worth failing a scan over.
        }
    }
}
