package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.repository.IngredientRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Which USDA food each ingredient is, and what its odd units weigh — worked out, remembered
 * and corrected. See {@link IngredientFoodMatch} and {@link IngredientUnitGrams} for the rules
 * of who can overrule whom.
 */
@Service
public class IngredientMatches {

    /**
     * What an ingredient is matched to right now. food is null when it is not counted. For a
     * model's pick, confidence is the server's own confidence in that food for the line.
     */
    public record Match(UUID ingredientId, Food food, double confidence, IngredientFoodMatch.Source source) {

        public boolean countable() {
            if (food == null) return false;
            return switch (source) {
                case USER -> true;
                case AI -> confidence >= AI_FLOOR;
                case AUTO -> confidence >= FoodMatcher.COUNTABLE;
            };
        }

        /**
         * Worth a second opinion, and shown as a guess: the matcher's unsure match, or a model's
         * pick of a food the matcher itself was unsure of.
         */
        public boolean guess() {
            return source != IngredientFoodMatch.Source.USER && confidence < FoodMatcher.CONFIDENT;
        }
    }

    /**
     * The least the matcher must think of a food before a model's pick of it is taken. A small
     * on-device model offered a shortlist picks something even for a line that is no food at
     * all ("grandma's secret mix" → trail mix, "xyzzy sauce" → barbecue sauce) — and its pick
     * is shared by every household — so a pick must also share a real word with the line.
     */
    static final double AI_FLOOR = 0.4;

    /** A model's grams must be within this factor of the server's own figure, either way. */
    static final double AI_BAND = 2.0;
    /** A model's grams for a unit the server cannot weigh at all, at most. */
    static final double AI_MOST = 1000;

    public record Learned(double gramsEach, IngredientUnitGrams.Source source) {
    }

    private final JdbcTemplate jdbc;
    private final FoodMatcher matcher;
    private final FoodTable table;
    private final UsdaTableLoader loader;
    private final IngredientRepository ingredients;

    public IngredientMatches(JdbcTemplate jdbc, FoodMatcher matcher, FoodTable table, UsdaTableLoader loader,
                             IngredientRepository ingredients) {
        this.jdbc = jdbc;
        this.matcher = matcher;
        this.table = table;
        this.loader = loader;
        this.ingredients = ingredients;
    }

    /** The match for each ingredient, working out (and remembering) any not matched yet. */
    public Map<UUID, Match> matchesFor(Collection<Ingredient> wanted) {
        Map<UUID, Match> found = new HashMap<>();
        if (wanted.isEmpty()) return found;
        String dataVersion = loader.currentVersion();
        Map<UUID, Ingredient> byId = new HashMap<>();
        for (Ingredient ingredient : wanted) byId.put(ingredient.getId(), ingredient);

        jdbc.query("""
                SELECT ingredient_id, fdc_id, confidence, source, matcher_version, data_version
                FROM ingredient_food_matches WHERE ingredient_id = ANY(?)
                """, rs -> {
            UUID id = rs.getObject(1, UUID.class);
            int fdc = rs.getInt(2);
            boolean noFood = rs.wasNull();
            IngredientFoodMatch.Source source = IngredientFoodMatch.Source.valueOf(rs.getString(4));
            boolean stale = source == IngredientFoodMatch.Source.AUTO
                    && (rs.getInt(5) != FoodMatcher.VERSION || !java.util.Objects.equals(rs.getString(6), dataVersion));
            if (stale) return;
            Food food = noFood ? null : table.find(fdc).orElse(null);
            if (!noFood && food == null && source == IngredientFoodMatch.Source.AUTO) return;  // left the table
            double confidence = rs.getDouble(3);
            if (source == IngredientFoodMatch.Source.AI && food != null
                    && !FoodMatcher.sharesARealWord(byId.get(id).getName(), food)) {
                // Saved before picks were checked: a food that is nothing like the line is not counted.
                food = null;
                confidence = 0;
            }
            found.put(id, new Match(id, food, confidence, source));
        }, (Object) byId.keySet().toArray(UUID[]::new));

        for (Ingredient ingredient : byId.values()) {
            if (found.containsKey(ingredient.getId())) continue;
            FoodMatcher.Candidate best = matcher.best(ingredient.getName());
            Food food = best == null ? null : best.food();
            double confidence = best == null ? 0 : best.confidence();
            saveAuto(ingredient.getId(), food, confidence, dataVersion);
            found.put(ingredient.getId(), new Match(ingredient.getId(), food, confidence, IngredientFoodMatch.Source.AUTO));
        }
        return found;
    }

    public Match matchFor(Ingredient ingredient) {
        return matchesFor(List.of(ingredient)).get(ingredient.getId());
    }

    public Ingredient ingredient(UUID ingredientId) {
        return ingredients.findById(ingredientId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "No such ingredient."));
    }

    /** The foods it might be, best first — and the only ones a match may be set to. */
    public List<FoodMatcher.Candidate> shortlist(Ingredient ingredient) {
        return matcher.shortlist(ingredient.getName());
    }

    /**
     * Someone (or an iPhone's model) says which food this is. Only foods from the shortlist are
     * accepted, so a phone cannot point "butter" at anything it likes; a person may also say it
     * is none of them (null). A model never overrules a person: that answers 409.
     */
    public Match setMatch(UUID ingredientId, Integer fdcId, IngredientFoodMatch.Source source, UUID by) {
        if (source == IngredientFoodMatch.Source.AUTO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say whether a person or the model chose it.");
        }
        Ingredient ingredient = ingredient(ingredientId);
        Food food = null;
        double confidence = 1.0;
        if (fdcId == null) {
            if (source != IngredientFoodMatch.Source.USER) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose one of the foods on the shortlist.");
            }
        } else {
            FoodMatcher.Candidate picked = shortlist(ingredient).stream()
                    .filter(c -> c.food().fdcId() == fdcId).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "That food isn't on this ingredient's shortlist."));
            food = picked.food();
            if (source == IngredientFoodMatch.Source.AI) {
                if (picked.confidence() < AI_FLOOR || !FoodMatcher.sharesARealWord(ingredient.getName(), food)) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                            "That food is too far from the ingredient to count it as one.");
                }
                confidence = picked.confidence();
            }
        }
        if (source == IngredientFoodMatch.Source.AI && currentSource(ingredientId).orElse(null) == IngredientFoodMatch.Source.USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already chose the food for this one.");
        }
        jdbc.update("""
                INSERT INTO ingredient_food_matches
                    (ingredient_id, fdc_id, confidence, source, matcher_version, data_version, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ingredient_id) DO UPDATE SET fdc_id = EXCLUDED.fdc_id, confidence = EXCLUDED.confidence,
                    source = EXCLUDED.source, matcher_version = EXCLUDED.matcher_version,
                    data_version = EXCLUDED.data_version, updated_at = EXCLUDED.updated_at,
                    updated_by = EXCLUDED.updated_by
                """, ingredientId, fdcId, Nutrients.round(confidence, 3), source.name(), FoodMatcher.VERSION, loader.currentVersion(),
                Timestamp.from(Instant.now()), by);
        return new Match(ingredientId, food, confidence, source);
    }

    private Optional<IngredientFoodMatch.Source> currentSource(UUID ingredientId) {
        List<String> found = jdbc.queryForList("SELECT source FROM ingredient_food_matches WHERE ingredient_id = ?",
                String.class, ingredientId);
        return found.isEmpty() ? Optional.empty() : Optional.of(IngredientFoodMatch.Source.valueOf(found.get(0)));
    }

    /** Never overwrites a choice made by a model or a person — only the matcher's own earlier guess. */
    private void saveAuto(UUID ingredientId, Food food, double confidence, String dataVersion) {
        jdbc.update("""
                INSERT INTO ingredient_food_matches
                    (ingredient_id, fdc_id, confidence, source, matcher_version, data_version, updated_at)
                VALUES (?, ?, ?, 'AUTO', ?, ?, ?)
                ON CONFLICT (ingredient_id) DO UPDATE SET fdc_id = EXCLUDED.fdc_id, confidence = EXCLUDED.confidence,
                    matcher_version = EXCLUDED.matcher_version, data_version = EXCLUDED.data_version,
                    updated_at = EXCLUDED.updated_at
                WHERE ingredient_food_matches.source = 'AUTO'
                """, ingredientId, food == null ? null : food.fdcId(), Nutrients.round(confidence, 3),
                FoodMatcher.VERSION, dataVersion, Timestamp.from(Instant.now()));
    }

    // Grams per unit

    /** What a model or a person said one of each unit weighs, by ingredient then unit key. */
    public Map<UUID, Map<String, Learned>> learnedFor(Collection<UUID> ingredientIds) {
        Map<UUID, Map<String, Learned>> found = new HashMap<>();
        if (ingredientIds.isEmpty()) return found;
        jdbc.query("""
                SELECT ingredient_id, unit_key, grams_each, source FROM ingredient_unit_grams
                WHERE ingredient_id = ANY(?) AND source <> 'RULE'
                """, rs -> {
            found.computeIfAbsent(rs.getObject(1, UUID.class), k -> new HashMap<>())
                    .put(rs.getString(2), new Learned(rs.getDouble(3), IngredientUnitGrams.Source.valueOf(rs.getString(4))));
        }, (Object) ingredientIds.toArray(UUID[]::new));
        return found;
    }

    /**
     * Keeps the server's own working-out for an amount next to the learned ones, so it can be
     * seen which amounts rest on a guess. Rewritten only when it changes, and never over a
     * model's or a person's figure.
     */
    public void rememberRule(UUID ingredientId, Grams.Amount amount, Food food) {
        if (amount.how() == Grams.How.WEIGHT || amount.how() == Grams.How.LEARNED) return;
        jdbc.update("""
                INSERT INTO ingredient_unit_grams (id, ingredient_id, unit_key, grams_each, source, fdc_id, basis, updated_at)
                VALUES (?, ?, ?, ?, 'RULE', ?, ?, ?)
                ON CONFLICT (ingredient_id, unit_key) DO UPDATE SET grams_each = EXCLUDED.grams_each,
                    fdc_id = EXCLUDED.fdc_id, basis = EXCLUDED.basis, updated_at = EXCLUDED.updated_at
                WHERE ingredient_unit_grams.source = 'RULE'
                  AND (ingredient_unit_grams.grams_each <> EXCLUDED.grams_each
                       OR ingredient_unit_grams.fdc_id IS DISTINCT FROM EXCLUDED.fdc_id)
                """, UUID.randomUUID(), ingredientId, amount.unitKey(), Nutrients.round(amount.gramsEach(), 3),
                food.fdcId(), trimmed(amount.basis()), Timestamp.from(Instant.now()));
    }

    /**
     * A model or a person says what one of these weighs. Bounded so a slip ("5000 g" for a
     * pinch) cannot make a recipe's numbers absurd, and a model never overrules a person.
     */
    public Learned setGrams(UUID ingredientId, String unit, double gramsEach, IngredientUnitGrams.Source source, UUID by) {
        if (source == IngredientUnitGrams.Source.RULE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Say whether a person or the model worked it out.");
        }
        if (!(gramsEach > 0) || gramsEach > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That weight doesn't look right.");
        }
        String key = Grams.unitKey(unit);
        if (WEIGHTS.contains(key)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Weights don't need working out.");
        }
        Ingredient ingredient = ingredient(ingredientId);
        if (source == IngredientUnitGrams.Source.AI) {
            Match match = matchFor(ingredient);
            Double rule = match.food() == null ? null
                    : Grams.of(1, unit, ingredient.getName(), match.food()).map(Grams.Amount::gramsEach).orElse(null);
            if (!aiGramsAccepted(gramsEach, rule)) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "That estimate is too far from what one usually weighs.");
            }
        }
        if (source == IngredientUnitGrams.Source.AI) {
            List<String> current = jdbc.queryForList(
                    "SELECT source FROM ingredient_unit_grams WHERE ingredient_id = ? AND unit_key = ?",
                    String.class, ingredientId, key);
            if (!current.isEmpty() && current.get(0).equals("USER")) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already said what this weighs.");
            }
        }
        jdbc.update("""
                INSERT INTO ingredient_unit_grams (id, ingredient_id, unit_key, grams_each, source, basis, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ingredient_id, unit_key) DO UPDATE SET grams_each = EXCLUDED.grams_each,
                    source = EXCLUDED.source, fdc_id = NULL, basis = EXCLUDED.basis,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                """, UUID.randomUUID(), ingredientId, key, Nutrients.round(gramsEach, 3), source.name(),
                source == IngredientUnitGrams.Source.AI ? "estimated on an iPhone" : "set by hand",
                Timestamp.from(Instant.now()), by);
        return new Learned(gramsEach, source);
    }

    private static final java.util.Set<String> WEIGHTS = java.util.Set.of("g", "kg", "mg", "oz", "lb");

    /**
     * A model's figure is a refinement of the server's, not a replacement for it: one phone's
     * answer is used by every household, and a small model tends to give the same round number
     * for everything (10 g for a handful of spinach, a thumb of ginger and a sachet alike). So it
     * must be within half to twice the server's own figure, or — for a unit the server cannot
     * weigh at all — no more than a kilo.
     */
    static boolean aiGramsAccepted(double gramsEach, Double rule) {
        if (!(gramsEach > 0)) return false;
        if (rule == null || !(rule > 0)) return gramsEach <= AI_MOST;
        return gramsEach >= rule / AI_BAND && gramsEach <= rule * AI_BAND;
    }

    /**
     * Matches and weights are shared by the whole server, so only someone who cooks with the
     * ingredient may change them: it must be in a recipe one of their households can see (its
     * own, shared with it or filed from Explore), in one published to Explore, or planned on its
     * own in one of their households. Otherwise the ingredient is, to them, not there.
     */
    public void assertUsedBy(UUID ingredientId, UUID userId) {
        Boolean used = jdbc.queryForObject("""
                WITH mine AS (SELECT household_id FROM household_members WHERE user_id = ?)
                SELECT EXISTS (
                    SELECT 1 FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id
                    WHERE ri.ingredient_id = ? AND (
                        r.published
                        OR r.household_id IN (SELECT household_id FROM mine)
                        OR EXISTS (SELECT 1 FROM recipe_shares s
                                   WHERE s.recipe_id = r.id AND s.household_id IN (SELECT household_id FROM mine))
                        OR EXISTS (SELECT 1 FROM recipe_filings f
                                   WHERE f.recipe_id = r.id AND f.household_id IN (SELECT household_id FROM mine))))
                OR EXISTS (
                    SELECT 1 FROM meal_plan_entries e
                    WHERE e.ingredient_id = ? AND e.household_id IN (SELECT household_id FROM mine))
                """, Boolean.class, userId, ingredientId, ingredientId);
        if (!Boolean.TRUE.equals(used)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such ingredient.");
        }
    }

    private static String trimmed(String text) {
        return text == null || text.length() <= 200 ? text : text.substring(0, 200);
    }
}
