package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.nutrition.NutritionDtos.Attribution;
import com.gehan.mealplanner.nutrition.NutritionDtos.FoodResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.FoodSummary;
import com.gehan.mealplanner.nutrition.NutritionDtos.Portion;
import com.gehan.mealplanner.nutrition.NutritionDtos.ProductHit;
import com.gehan.mealplanner.nutrition.NutritionDtos.ProductResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecentLookup;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecentRequest;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecipeHit;
import com.gehan.mealplanner.nutrition.NutritionDtos.SearchResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.Values;
import com.gehan.mealplanner.repository.RecipeRepository;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The Nutrition screen's own questions: look a food up, search for one, and remember what this
 * person looked at last.
 */
@Service
public class NutritionLookups {

    /** The latest this many lookups are kept per person. */
    static final int RECENT = 12;
    /** A product search per person at most this often; anything closer is someone still typing. */
    static final long SEARCH_GAP_MS = 1200;

    private static final Set<String> KINDS = Set.of("FOOD", "PRODUCT", "RECIPE");

    private final FoodTable table;
    private final FoodMatcher matcher;
    private final OffProducts products;
    private final RecipeRepository recipeRepository;
    private final RecipeNutrition recipeNutrition;
    private final HouseholdService householdService;
    private final JdbcTemplate jdbc;
    private final Map<UUID, Long> lastProductSearch = new ConcurrentHashMap<>();

    public NutritionLookups(FoodTable table, FoodMatcher matcher, OffProducts products,
                            RecipeRepository recipeRepository, RecipeNutrition recipeNutrition,
                            HouseholdService householdService, JdbcTemplate jdbc) {
        this.table = table;
        this.matcher = matcher;
        this.products = products;
        this.recipeRepository = recipeRepository;
        this.recipeNutrition = recipeNutrition;
        this.householdService = householdService;
        this.jdbc = jdbc;
    }

    public FoodResponse food(int fdcId) {
        Food food = table.find(fdcId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "No such food."));
        boolean liquid = "Beverages".equals(food.category()) || food.name().startsWith("Milk")
                || food.name().contains("juice");
        List<Portion> portions = food.portions().stream()
                .map(p -> new Portion(p.text(), Nutrients.round(p.grams(), 1))).toList();
        return new FoodResponse(food.fdcId(), food.name(), food.category(),
                "fo".equals(food.source()) ? "Foundation Foods" : "SR Legacy", Values.of(food.per100g()),
                NutritionLabels.split(food.per100g()), NutritionLabels.details(food.per100g(), null, null),
                NutritionLabels.badges(food.per100g(), liquid), portions, Attribution.USDA);
    }

    /**
     * Foods, packets and the household's own recipes for what was typed. Products are only
     * asked for when products=true, the query is at least three letters, and this person has not
     * searched for products in the last moment — the apps debounce too, but the catalogue's
     * limit is the server's to keep.
     */
    @Transactional
    public SearchResponse search(String query, UUID householdId, UUID requesterId, boolean withProducts) {
        String q = query == null ? "" : query.trim();
        if (q.length() > 100) q = q.substring(0, 100);
        if (householdId != null) householdService.assertMember(householdId, requesterId);

        List<FoodSummary> foods = new ArrayList<>();
        if (!q.isEmpty() && !OffProducts.PLAUSIBLE.matcher(q).matches()) {
            for (FoodMatcher.Candidate c : matcher.shortlist(q)) {
                if (c.confidence() < 0.3) continue;
                foods.add(new FoodSummary(c.food().fdcId(), c.food().name(), c.food().category(),
                        Nutrients.round(c.food().per100g().kcal(), 0), Nutrients.round(c.food().per100g().protein(), 1),
                        Nutrients.round(c.confidence(), 2)));
            }
        }

        List<ProductHit> hits = List.of();
        String status = "skipped";
        if (withProducts && OffProducts.PLAUSIBLE.matcher(q).matches()) {
            // A typed barcode is a product read, not a search.
            try {
                ProductResponse p = products.product(q);
                hits = List.of(new ProductHit(p.barcode(), p.name(), p.brand(), p.size(), p.per100g().kcal(),
                        p.per100g().protein()));
                status = "ok";
            } catch (ResponseStatusException e) {
                status = e.getStatusCode().value() == 429 ? "busy" : e.getStatusCode().value() == 404 ? "ok" : "unavailable";
            }
        } else if (withProducts && q.length() >= 3) {
            long now = System.currentTimeMillis();
            Long last = lastProductSearch.put(requesterId, now);
            if (last != null && now - last < SEARCH_GAP_MS) {
                status = "debounced";
            } else {
                OffProducts.Search found = products.search(q);
                hits = found.hits();
                status = found.status();
            }
        }

        List<RecipeHit> recipes = new ArrayList<>();
        if (householdId != null && !q.isEmpty()) {
            String lowered = q.toLowerCase(Locale.ROOT);
            List<Recipe> found = recipeRepository.findVisibleTo(householdId).stream()
                    .filter(r -> r.getName().toLowerCase(Locale.ROOT).contains(lowered))
                    .limit(5).toList();
            Map<UUID, Nutrients> perServing = recipeNutrition.perServing(found, Map.of());
            for (Recipe r : found) {
                Nutrients n = perServing.get(r.getId());
                recipes.add(new RecipeHit(r.getId(), r.getName(), n == null ? null : Nutrients.round(n.kcal(), 0),
                        n == null ? null : Nutrients.round(n.protein(), 1)));
            }
        }
        return new SearchResponse(q, foods, hits, status, recipes,
                hits.isEmpty() ? List.of(Attribution.USDA) : List.of(Attribution.USDA, Attribution.OPEN_FOOD_FACTS));
    }

    // Recent lookups

    /**
     * This person's latest lookups. A recipe is listed only if it can be opened from here: from
     * the given household (its own, shared with it, filed in it or published), or with none
     * given, from a household they are still in — so a recipe looked up in another house does
     * not turn up in this one's list, and one from a house they left does not linger.
     */
    @Transactional(readOnly = true)
    public List<RecentLookup> recent(UUID userId, UUID householdId) {
        if (householdId != null) householdService.assertMember(householdId, userId);
        List<RecentLookup> all = recent(userId);
        List<UUID> recipeIds = new ArrayList<>();
        for (RecentLookup r : all) {
            if (!r.kind().equals("RECIPE")) continue;
            try {
                recipeIds.add(UUID.fromString(r.ref()));
            } catch (IllegalArgumentException ignored) {
                // Not a recipe id; dropped below.
            }
        }
        Set<String> open = new java.util.HashSet<>();
        if (!recipeIds.isEmpty()) {
            jdbc.query("""
                    WITH here AS (SELECT household_id FROM household_members
                                  WHERE user_id = ? AND (CAST(? AS uuid) IS NULL OR household_id = CAST(? AS uuid)))
                    SELECT r.id FROM recipes r WHERE r.id = ANY(?) AND (
                        (r.published AND CAST(? AS uuid) IS NOT NULL)
                        OR r.household_id IN (SELECT household_id FROM here)
                        OR EXISTS (SELECT 1 FROM recipe_shares s
                                   WHERE s.recipe_id = r.id AND s.household_id IN (SELECT household_id FROM here))
                        OR EXISTS (SELECT 1 FROM recipe_filings f
                                   WHERE f.recipe_id = r.id AND f.household_id IN (SELECT household_id FROM here)))
                    """, rs -> {
                open.add(rs.getObject(1, UUID.class).toString());
            }, userId, householdId, householdId, recipeIds.toArray(UUID[]::new), householdId);
        }
        return all.stream().filter(r -> !r.kind().equals("RECIPE") || open.contains(r.ref().toLowerCase(Locale.ROOT)))
                .toList();
    }

    private List<RecentLookup> recent(UUID userId) {
        return jdbc.query("""
                SELECT kind, ref, label, kcal, protein, looked_at FROM nutrition_lookups
                WHERE user_id = ? ORDER BY looked_at DESC LIMIT ?
                """, (rs, i) -> {
            String kind = rs.getString(1);
            double kcal = rs.getDouble(4);
            Double k = rs.wasNull() ? null : kcal;
            double protein = rs.getDouble(5);
            Double p = rs.wasNull() ? null : protein;
            return new RecentLookup(kind, rs.getString(2), rs.getString(3), k, p,
                    kind.equals("RECIPE") ? "serving" : "100g", rs.getTimestamp(6).toInstant());
        }, userId, RECENT);
    }

    /**
     * Remembers a lookup for this person. The label and figures are the server's own where it
     * has them (a USDA food, a recipe, a product it has cached), and the app's otherwise.
     */
    @Transactional
    public RecentLookup remember(UUID userId, RecentRequest request) {
        String kind = request.kind().trim().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown kind of lookup.");
        String ref = request.ref().trim();
        String label = request.label() == null ? null : request.label().trim();
        Double kcal = request.kcal(), protein = request.protein();
        switch (kind) {
            case "FOOD" -> {
                Food food;
                try {
                    food = table.find(Integer.parseInt(ref)).orElse(null);
                } catch (NumberFormatException e) {
                    food = null;
                }
                if (food == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such food.");
                if (label == null || label.isEmpty()) label = food.name();
                kcal = food.per100g().kcal();
                protein = food.per100g().protein();
            }
            case "PRODUCT" -> {
                if (!OffProducts.PLAUSIBLE.matcher(ref).matches()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That isn't a barcode.");
                }
                ProductResponse cached = products.cachedProduct(ref);
                if (cached != null) {
                    label = cached.name();
                    kcal = cached.per100g().kcal();
                    protein = cached.per100g().protein();
                }
            }
            default -> {
                UUID recipeId;
                try {
                    recipeId = UUID.fromString(ref);
                } catch (IllegalArgumentException e) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That isn't a recipe.");
                }
                var nutrition = recipeNutrition.forRecipe(recipeId, request.householdId(), userId, 1.0, Set.of());
                label = nutrition.name();
                kcal = nutrition.perServing().kcal();
                protein = nutrition.perServing().protein();
            }
        }
        if (label == null || label.isBlank()) label = ref;
        if (label.length() > 200) label = label.substring(0, 200);
        Instant now = Instant.now();
        jdbc.update("""
                INSERT INTO nutrition_lookups (id, user_id, kind, ref, label, kcal, protein, looked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, kind, ref) DO UPDATE SET label = EXCLUDED.label, kcal = EXCLUDED.kcal,
                    protein = EXCLUDED.protein, looked_at = EXCLUDED.looked_at
                """, UUID.randomUUID(), userId, kind, ref, label, Nutrients.round(kcal, 0), Nutrients.round(protein, 1),
                Timestamp.from(now));
        jdbc.update("""
                DELETE FROM nutrition_lookups WHERE user_id = ? AND id NOT IN (
                    SELECT id FROM nutrition_lookups WHERE user_id = ? ORDER BY looked_at DESC LIMIT ?)
                """, userId, userId, RECENT);
        return new RecentLookup(kind, ref, label, Nutrients.round(kcal, 0), Nutrients.round(protein, 1),
                kind.equals("RECIPE") ? "serving" : "100g", now);
    }

    public void forget(UUID userId) {
        jdbc.update("DELETE FROM nutrition_lookups WHERE user_id = ?", userId);
    }
}
