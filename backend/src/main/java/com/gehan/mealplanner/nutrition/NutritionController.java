package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.nutrition.NutritionDtos.Candidate;
import com.gehan.mealplanner.nutrition.NutritionDtos.FoodResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.GramsResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.MatchResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.PlanNutritionResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.ProductResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecentLookup;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecentRequest;
import com.gehan.mealplanner.nutrition.NutritionDtos.RecipeNutritionResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.SearchResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.SetGramsRequest;
import com.gehan.mealplanner.nutrition.NutritionDtos.SetMatchRequest;
import com.gehan.mealplanner.nutrition.NutritionDtos.StatusResponse;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.mealplans.TargetPlans;
import com.gehan.mealplanner.nutrition.NutritionDtos.Reference;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Nutrition facts: foods (USDA), packets (Open Food Facts), recipes and the week's plan.
 *
 * Signed in for all of it, like the barcode lookup — an open endpoint in front of Open Food
 * Facts would be an open proxy. Recipes and plans are checked against your households the same
 * way their own pages are. Ingredient matches and weights are shared by everyone on the server,
 * because an ingredient is: "red lentils" is the same food in every kitchen.
 *
 * GET /api/nutrition answers for any server that has this, so an app can tell whether to show
 * its Nutrition screens at all (an older server answers 404).
 */
@RestController
@RequestMapping("/api/nutrition")
public class NutritionController {

    private final FoodTable table;
    private final UsdaTableLoader loader;
    private final IngredientMatches matches;
    private final RecipeNutrition recipes;
    private final PlanNutrition plans;
    private final OffProducts products;
    private final NutritionLookups lookups;
    private final TargetPlans targetPlans;

    public NutritionController(FoodTable table, UsdaTableLoader loader, IngredientMatches matches,
                               RecipeNutrition recipes, PlanNutrition plans, OffProducts products,
                               NutritionLookups lookups, TargetPlans targetPlans) {
        this.table = table;
        this.loader = loader;
        this.matches = matches;
        this.recipes = recipes;
        this.plans = plans;
        this.products = products;
        this.lookups = lookups;
        this.targetPlans = targetPlans;
    }

    @GetMapping
    public StatusResponse status() {
        int foods = table.size();
        return new StatusResponse(foods > 0, foods, loader.currentVersion(),
                List.of(NutritionDtos.Attribution.USDA, NutritionDtos.Attribution.OPEN_FOOD_FACTS));
    }

    @GetMapping("/foods/{fdcId}")
    public FoodResponse food(@PathVariable int fdcId) {
        return lookups.food(fdcId);
    }

    /** products=true asks Open Food Facts too (debounced and rate-limited); off by default. */
    @GetMapping("/search")
    public SearchResponse search(@AuthenticationPrincipal UUID userId,
                                 @RequestParam(defaultValue = "") String q,
                                 @RequestParam(required = false) UUID householdId,
                                 @RequestParam(defaultValue = "false") boolean products) {
        return lookups.search(q, householdId, userId, products);
    }

    @GetMapping("/products/{barcode}")
    public ProductResponse product(@PathVariable String barcode) {
        return products.product(barcode);
    }

    @GetMapping("/ingredients/{ingredientId}/match")
    @Transactional
    public MatchResponse match(@PathVariable UUID ingredientId) {
        Ingredient ingredient = matches.ingredient(ingredientId);
        return response(ingredient, matches.matchFor(ingredient));
    }

    /**
     * {"fdcId": 171287, "source": "ai"} — an iPhone's model chose from the shortlist; "user" — a
     * person did. Only shortlisted foods are taken; a person may also send fdcId null for "none".
     * A model's pick of a food too far from the line answers 422. Only someone whose households
     * use the ingredient may change it (404 otherwise), since the change is everyone's.
     */
    @PutMapping("/ingredients/{ingredientId}/match")
    @Transactional
    public MatchResponse setMatch(@AuthenticationPrincipal UUID userId, @PathVariable UUID ingredientId,
                                  @Valid @RequestBody SetMatchRequest request) {
        IngredientFoodMatch.Source source = matchSource(request.source());
        matches.ingredient(ingredientId);
        matches.assertUsedBy(ingredientId, userId);
        matches.setMatch(ingredientId, request.fdcId(), source, userId);
        Ingredient ingredient = matches.ingredient(ingredientId);
        return response(ingredient, matches.matchFor(ingredient));
    }

    /**
     * {"unit": "knob", "grams": 12, "source": "ai"} — what ONE of that unit weighs. A model's
     * figure far from the server's own answers 422; the same 404 as above for an unused ingredient.
     */
    @PutMapping("/ingredients/{ingredientId}/grams")
    public GramsResponse setGrams(@AuthenticationPrincipal UUID userId, @PathVariable UUID ingredientId,
                                  @Valid @RequestBody SetGramsRequest request) {
        IngredientUnitGrams.Source source = switch (request.source().trim().toLowerCase(Locale.ROOT)) {
            case "ai" -> IngredientUnitGrams.Source.AI;
            case "user" -> IngredientUnitGrams.Source.USER;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "source is \"ai\" or \"user\".");
        };
        matches.ingredient(ingredientId);
        matches.assertUsedBy(ingredientId, userId);
        IngredientMatches.Learned learned = matches.setGrams(ingredientId, request.unit(), request.grams(), source, userId);
        return new GramsResponse(ingredientId, Grams.unitKey(request.unit()), learned.gramsEach(),
                learned.source().name().toLowerCase(Locale.ROOT));
    }

    /**
     * servings: how many to show the numbers for (default 1). include: optional lines to count.
     * entryId: a planned meal of this recipe, whose own optional choices are used. The
     * percentages are of the caller's own targets when they have a plan for a health target,
     * and of the reference day otherwise.
     */
    @GetMapping("/recipes/{recipeId}")
    public RecipeNutritionResponse recipe(@AuthenticationPrincipal UUID userId, @PathVariable UUID recipeId,
                                          @RequestParam(required = false) UUID householdId,
                                          @RequestParam(required = false) Double servings,
                                          @RequestParam(required = false) List<UUID> include,
                                          @RequestParam(required = false) UUID entryId) {
        Set<UUID> included = new HashSet<>(include == null ? List.of() : include);
        if (entryId != null) included.addAll(recipes.includedOn(entryId, recipeId, userId));
        Reference reference = targetPlans.ownReference(userId, householdId).orElse(NutritionLabels.REFERENCE_DAY);
        return recipes.forRecipe(recipeId, householdId, userId, servings, included, reference);
    }

    /** One person's share of the plan, per day and on average. Defaults to the planning window from today. */
    @GetMapping("/households/{householdId}/plan")
    public PlanNutritionResponse plan(@AuthenticationPrincipal UUID userId, @PathVariable UUID householdId,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return plans.forPlan(householdId, userId, start, end);
    }

    /** householdId: only recipes that household can open are listed (foods and packets always are). */
    @GetMapping("/recent")
    public List<RecentLookup> recent(@AuthenticationPrincipal UUID userId,
                                     @RequestParam(required = false) UUID householdId) {
        return lookups.recent(userId, householdId);
    }

    @PostMapping("/recent")
    public RecentLookup remember(@AuthenticationPrincipal UUID userId, @Valid @RequestBody RecentRequest request) {
        return lookups.remember(userId, request);
    }

    @DeleteMapping("/recent")
    public void forget(@AuthenticationPrincipal UUID userId) {
        lookups.forget(userId);
    }

    private MatchResponse response(Ingredient ingredient, IngredientMatches.Match match) {
        List<Candidate> shortlist = matches.shortlist(ingredient).stream()
                .map(c -> new Candidate(c.food().fdcId(), c.food().name(), c.food().category(),
                        Nutrients.round(c.confidence(), 2), Nutrients.round(c.food().per100g().kcal(), 0),
                        Nutrients.round(c.food().per100g().protein(), 1)))
                .toList();
        return new MatchResponse(ingredient.getId(), ingredient.getName(),
                match.food() == null ? null : match.food().fdcId(), match.food() == null ? null : match.food().name(),
                Nutrients.round(match.confidence(), 2), match.source().name().toLowerCase(Locale.ROOT),
                match.countable(), match.guess(), shortlist);
    }

    private static IngredientFoodMatch.Source matchSource(String source) {
        return switch (source.trim().toLowerCase(Locale.ROOT)) {
            case "ai" -> IngredientFoodMatch.Source.AI;
            case "user" -> IngredientFoodMatch.Source.USER;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "source is \"ai\" or \"user\".");
        };
    }
}
