package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeIngredient;
import com.gehan.mealplanner.nutrition.NutritionDtos.Attribution;
import com.gehan.mealplanner.nutrition.NutritionDtos.Contributor;
import com.gehan.mealplanner.nutrition.NutritionDtos.NotCounted;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecipeNutritionResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.Reference;
import com.gehan.mealplanner.nutrition.NutritionDtos.Values;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.RecipeService;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What a recipe adds up to, worked out from its ingredients — per serving and for the whole
 * pot, with where the calories come from and, just as plainly, what was left out.
 *
 * Every number is USDA's per-100 g figure times the grams worked out for the line; nothing is
 * made up to fill a gap. A line with no amount ("salt and pepper"), a food that is not in the
 * data, or a unit that cannot honestly be weighed is listed as not counted rather than guessed.
 * Optional ingredients are left out unless this occasion includes them.
 */
@Service
public class RecipeNutrition {

    /** "Pepper" alone is the spice — unless it is counted, when "2 peppers" are the vegetables. */
    private static final int BLACK_PEPPER = 170931, BELL_PEPPER = 170108;

    /** One ingredient line, with what the server knows about it. */
    record Line(UUID recipeIngredientId, UUID ingredientId, String name, BigDecimal quantity, String unit,
                String notes, boolean optional, boolean included, IngredientMatches.Match match,
                IngredientMatches.Learned learned) {
    }

    record Counted(Line line, Food food, Grams.Amount amount, Nutrients nutrients) {
    }

    record Sum(Nutrients total, List<Counted> counted, List<Line> optionalLeftOut, List<Line> noAmount,
               List<Line> noMatch, List<Line> noWeight) {
    }

    private final RecipeService recipes;
    private final IngredientMatches matches;
    private final FoodTable table;
    private final MealPlanEntryRepository entries;
    private final HouseholdService householdService;

    public RecipeNutrition(RecipeService recipes, IngredientMatches matches, FoodTable table,
                           MealPlanEntryRepository entries, HouseholdService householdService) {
        this.recipes = recipes;
        this.matches = matches;
        this.table = table;
        this.entries = entries;
        this.householdService = householdService;
    }

    /**
     * @param servings          how many servings to show the numbers for (the stepper); 1 by default
     * @param includedOptionals the recipe's optional lines to count this time
     */
    @Transactional
    public RecipeNutritionResponse forRecipe(UUID recipeId, UUID householdId, UUID requesterId, Double servings,
                                             Set<UUID> includedOptionals) {
        Recipe recipe = recipes.readable(recipeId, householdId, requesterId);
        return describe(recipe, servings == null ? 1 : servings, includedOptionals, NutritionLabels.REFERENCE_DAY);
    }

    /**
     * The optional lines a planned meal includes, so the numbers for "Tuesday's dinner" match
     * what will actually be cooked. The entry must be this recipe, in a household you are in.
     */
    @Transactional(readOnly = true)
    public Set<UUID> includedOn(UUID entryId, UUID recipeId, UUID requesterId) {
        MealPlanEntry entry = entries.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such meal on the plan."));
        if (!householdService.isMember(entry.getHousehold().getId(), requesterId)
                || entry.getRecipe() == null || !entry.getRecipe().getId().equals(recipeId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such meal on the plan.");
        }
        return new HashSet<>(entry.getIncludedOptionalIngredientIds());
    }

    /** The whole working-out for a recipe the caller has already been allowed to read. */
    @Transactional
    public RecipeNutritionResponse describe(Recipe recipe, double servings, Set<UUID> includedOptionals,
                                            Reference reference) {
        if (!(servings > 0) || servings > 100) servings = 1;
        int recipeServings = Math.max(1, recipe.getServings());
        Sum sum = add(lines(List.of(recipe), includedOptionals).getOrDefault(recipe.getId(), List.of()));

        Nutrients perServing = sum.total().scaled(1.0 / recipeServings);
        Nutrients shown = perServing.scaled(servings);
        double total = sum.total().kcalOrZero();

        List<Contributor> contributors = new ArrayList<>();
        double scale = servings / recipeServings;
        for (Counted c : sum.counted()) {
            Nutrients n = c.nutrients().scaled(scale);
            IngredientMatches.Match m = c.line().match();
            contributors.add(new Contributor(c.line().recipeIngredientId(), c.line().ingredientId(), c.line().name(),
                    c.food().fdcId(), c.food().name(), amountText(c.line()),
                    Nutrients.round(c.amount().grams() * scale, 1), c.amount().how().name(), c.amount().basis(),
                    c.amount().estimated(), Nutrients.round(n.kcalOrZero(), 0), Nutrients.round(orZero(n.protein()), 1),
                    Nutrients.round(orZero(n.carbs()), 1), Nutrients.round(orZero(n.fat()), 1),
                    total > 0 ? Nutrients.round(c.nutrients().kcalOrZero() / total, 3) : 0,
                    Nutrients.round(m.confidence(), 2), m.source().name().toLowerCase(Locale.ROOT), m.guess()));
        }
        contributors.sort(Comparator.comparingDouble(Contributor::kcal).reversed());

        List<NotCounted> notCounted = new ArrayList<>();
        sum.optionalLeftOut().forEach(l -> notCounted.add(notCounted(l, "OPTIONAL")));
        sum.noAmount().forEach(l -> notCounted.add(notCounted(l, "NO_AMOUNT")));
        sum.noMatch().forEach(l -> notCounted.add(notCounted(l, "NO_MATCH")));
        sum.noWeight().forEach(l -> notCounted.add(notCounted(l, "NO_WEIGHT")));

        int linesTotal = recipe.getIngredients().size();
        boolean complete = sum.noAmount().isEmpty() && sum.noMatch().isEmpty() && sum.noWeight().isEmpty();
        return new RecipeNutritionResponse(recipe.getId(), recipe.getName(), recipeServings, servings,
                Values.of(perServing), Values.of(shown), Values.of(sum.total()), NutritionLabels.split(perServing),
                reference, NutritionLabels.percentOf(shown, reference), NutritionLabels.highlights(perServing),
                NutritionLabels.summary(perServing), contributors, notCounted, sum.counted().size(), linesTotal,
                complete, note(sum), Attribution.USDA);
    }

    /**
     * One serving of each recipe, for adding up a plan. Recipes that share ingredients are matched
     * once, which keeps a fortnight's plan to a handful of queries.
     */
    @Transactional
    public Map<UUID, Nutrients> perServing(Collection<Recipe> recipeList, Map<UUID, Set<UUID>> includedOptionals) {
        Map<UUID, List<Line>> lines = lines(recipeList, includedOptionals.values().stream()
                .flatMap(Set::stream).collect(java.util.stream.Collectors.toSet()));
        Map<UUID, Nutrients> result = new LinkedHashMap<>();
        for (Recipe recipe : recipeList) {
            Set<UUID> mine = includedOptionals.getOrDefault(recipe.getId(), Set.of());
            List<Line> own = lines.getOrDefault(recipe.getId(), List.of()).stream()
                    .map(l -> new Line(l.recipeIngredientId(), l.ingredientId(), l.name(), l.quantity(), l.unit(),
                            l.notes(), l.optional(), !l.optional() || mine.contains(l.recipeIngredientId()), l.match(),
                            l.learned()))
                    .toList();
            Sum sum = add(own);
            result.put(recipe.getId(), sum.counted().isEmpty() ? null
                    : sum.total().scaled(1.0 / Math.max(1, recipe.getServings())));
        }
        return result;
    }

    /** Matches and learned weights for every line of these recipes, in two queries. */
    private Map<UUID, List<Line>> lines(Collection<Recipe> recipeList, Set<UUID> includedOptionals) {
        Set<Ingredient> ingredients = new HashSet<>();
        for (Recipe recipe : recipeList) {
            for (RecipeIngredient ri : recipe.getIngredients()) ingredients.add(ri.getIngredient());
        }
        Map<UUID, IngredientMatches.Match> matched = matches.matchesFor(ingredients);
        Map<UUID, Map<String, IngredientMatches.Learned>> learned =
                matches.learnedFor(ingredients.stream().map(Ingredient::getId).toList());

        Map<UUID, List<Line>> byRecipe = new LinkedHashMap<>();
        for (Recipe recipe : recipeList) {
            List<Line> lines = new ArrayList<>();
            for (RecipeIngredient ri : recipe.getIngredients()) {
                Ingredient ingredient = ri.getIngredient();
                IngredientMatches.Match match = lineMatch(matched.get(ingredient.getId()), ri);
                IngredientMatches.Learned grams = learned.getOrDefault(ingredient.getId(), Map.of())
                        .get(Grams.unitKey(ri.getUnit()));
                lines.add(new Line(ri.getId(), ingredient.getId(), ingredient.getName(), ri.getQuantity(), ri.getUnit(),
                        ri.getNotes(), ri.isOptional(), !ri.isOptional() || includedOptionals.contains(ri.getId()),
                        match, grams));
            }
            byRecipe.put(recipe.getId(), lines);
        }
        return byRecipe;
    }

    private IngredientMatches.Match lineMatch(IngredientMatches.Match match, RecipeIngredient line) {
        if (match == null || match.food() == null || match.food().fdcId() != BLACK_PEPPER
                || match.source() != IngredientFoodMatch.Source.AUTO) {
            return match;
        }
        String key = Grams.unitKey(line.getUnit());
        boolean counted = line.getQuantity() != null && (key.isEmpty() || Set.of("small", "medium", "large").contains(key));
        if (!counted) return match;
        return table.find(BELL_PEPPER)
                .map(f -> new IngredientMatches.Match(match.ingredientId(), f, match.confidence(), match.source()))
                .orElse(match);
    }

    /** The arithmetic, with no database: what each line weighs and adds, and what it leaves out. */
    Sum add(List<Line> lines) {
        Nutrients total = Nutrients.NONE;
        List<Counted> counted = new ArrayList<>();
        List<Line> optional = new ArrayList<>(), noAmount = new ArrayList<>(), noMatch = new ArrayList<>(),
                noWeight = new ArrayList<>();
        for (Line line : lines) {
            if (!line.included()) {
                optional.add(line);
                continue;
            }
            if (line.match() == null || !line.match().countable()) {
                // An unmatched line with no amount is still, first of all, one with no amount.
                (line.quantity() == null ? noAmount : noMatch).add(line);
                continue;
            }
            if (line.quantity() == null || line.quantity().signum() <= 0) {
                noAmount.add(line);
                continue;
            }
            double quantity = line.quantity().doubleValue();
            Food food = line.match().food();
            Grams.Amount rule = Grams.of(quantity, line.unit(), line.name(), food).orElse(null);
            IngredientMatches.Learned learned = line.learned();
            if (learned != null && learned.source() == IngredientUnitGrams.Source.AI
                    && !IngredientMatches.aiGramsAccepted(learned.gramsEach(), rule == null ? null : rule.gramsEach())) {
                // A model's figure from before they were checked, far from the server's own: not used.
                learned = null;
            }
            Grams.Amount amount = learned != null
                    ? Grams.learned(quantity, line.unit(), learned.gramsEach(),
                    learned.source() == IngredientUnitGrams.Source.AI ? "estimated" : "set by hand")
                    : rule;
            if (amount == null) {
                noWeight.add(line);
                continue;
            }
            if (learned == null && line.ingredientId() != null && matches != null) {
                matches.rememberRule(line.ingredientId(), amount, food);
            }
            Nutrients n = food.per100g().scaled(amount.grams() / 100.0);
            counted.add(new Counted(line, food, amount, n));
            total = total.plus(n);
        }
        return new Sum(total, counted, optional, noAmount, noMatch, noWeight);
    }

    /** "Figures are estimates from ingredient data. Optional coriander not counted." */
    static String note(Sum sum) {
        StringBuilder note = new StringBuilder("Figures are estimates from ingredient data.");
        if (!sum.optionalLeftOut().isEmpty()) {
            note.append(sum.optionalLeftOut().size() == 1
                    ? " Optional " + lower(sum.optionalLeftOut().get(0).name()) + " not counted."
                    : " " + sum.optionalLeftOut().size() + " optional ingredients not counted.");
        }
        if (!sum.noAmount().isEmpty()) {
            note.append(" ").append(capitalised(names(sum.noAmount())))
                    .append(sum.noAmount().size() == 1 ? " has" : " have").append(" no amount, so ")
                    .append(sum.noAmount().size() == 1 ? "isn't" : "aren't").append(" counted.");
        }
        if (!sum.noMatch().isEmpty()) {
            note.append(" ").append(capitalised(names(sum.noMatch())))
                    .append(sum.noMatch().size() == 1 ? " isn't" : " aren't").append(" in the food data yet.");
        }
        if (!sum.noWeight().isEmpty()) {
            note.append(" Couldn't weigh ").append(names(sum.noWeight())).append(".");
        }
        long guessed = sum.counted().stream().filter(c -> c.amount().estimated()).count();
        if (guessed > 0) {
            note.append(guessed == 1 ? " One amount is estimated." : " Some amounts are estimated.");
        }
        return note.toString();
    }

    private static String names(List<Line> lines) {
        List<String> names = lines.stream().map(l -> lower(l.name())).distinct().toList();
        if (names.size() > 3) return names.get(0) + ", " + names.get(1) + " and " + (names.size() - 2) + " more";
        if (names.size() == 1) return names.get(0);
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.get(names.size() - 1);
    }

    private static String lower(String name) {
        return name == null ? "" : name.trim();
    }

    private static String capitalised(String text) {
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    private NotCounted notCounted(Line l, String reason) {
        Food food = l.match() == null ? null : l.match().food();
        return new NotCounted(l.recipeIngredientId(), l.ingredientId(), l.name(), reason, l.quantity(), l.unit(),
                l.optional(), food == null ? null : food.fdcId(), food == null ? null : food.name());
    }

    private static String amountText(Line line) {
        if (line.quantity() == null) return "";
        String q = line.quantity().stripTrailingZeros().toPlainString();
        return line.unit() == null || line.unit().isBlank() ? q : q + " " + line.unit().trim();
    }

    private static double orZero(Double value) {
        return value == null ? 0 : value;
    }
}
