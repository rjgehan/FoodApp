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

    /** What an ingredient is matched to right now. food is null when it is not counted. */
    public record Match(UUID ingredientId, Food food, double confidence, IngredientFoodMatch.Source source) {

        public boolean countable() {
            return food != null && (source != IngredientFoodMatch.Source.AUTO || confidence >= FoodMatcher.COUNTABLE);
        }

        /** Worth a second opinion — from the iPhone's model or a person. */
        public boolean guess() {
            return source == IngredientFoodMatch.Source.AUTO && confidence < FoodMatcher.CONFIDENT;
        }
    }

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
            found.put(id, new Match(id, food, rs.getDouble(3), source));
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
        if (fdcId == null) {
            if (source != IngredientFoodMatch.Source.USER) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose one of the foods on the shortlist.");
            }
        } else {
            food = shortlist(ingredient).stream().map(FoodMatcher.Candidate::food)
                    .filter(f -> f.fdcId() == fdcId).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "That food isn't on this ingredient's shortlist."));
        }
        if (source == IngredientFoodMatch.Source.AI && currentSource(ingredientId).orElse(null) == IngredientFoodMatch.Source.USER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Someone already chose the food for this one.");
        }
        double confidence = source == IngredientFoodMatch.Source.USER ? 1.0 : 0.8;
        jdbc.update("""
                INSERT INTO ingredient_food_matches
                    (ingredient_id, fdc_id, confidence, source, matcher_version, data_version, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ingredient_id) DO UPDATE SET fdc_id = EXCLUDED.fdc_id, confidence = EXCLUDED.confidence,
                    source = EXCLUDED.source, matcher_version = EXCLUDED.matcher_version,
                    data_version = EXCLUDED.data_version, updated_at = EXCLUDED.updated_at,
                    updated_by = EXCLUDED.updated_by
                """, ingredientId, fdcId, confidence, source.name(), FoodMatcher.VERSION, loader.currentVersion(),
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
        ingredient(ingredientId);
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

    private static String trimmed(String text) {
        return text == null || text.length() <= 200 ? text : text.substring(0, 200);
    }
}
