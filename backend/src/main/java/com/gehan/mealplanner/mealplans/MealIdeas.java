package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.GroceryListItem;
import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasRequest;
import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasResponse;
import com.gehan.mealplanner.repository.GroceryListItemRepository;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.KitchenMachines;
import com.gehan.mealplanner.service.RecipeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * Meal ideas (Explore, for a household with the Plan off): a handful of recipes the kitchen can
 * actually make, to go straight onto the grocery list — what a generated meal plan is to a
 * household that plans, without a Plan to put anything on. Nothing is saved; adding them is the
 * recipe page's own Add to groceries, once per idea.
 *
 * Chosen from what a meal plan would choose from ({@link RecipePool}): the household's own
 * recipes, the ones shared with it and filed from Explore, then what other households have
 * published. For each:
 * <ul>
 *   <li>its drawer has to suit the meal (CupboardPlanner.fit at least {@link #MIN_FIT}: a dinner
 *   is a Dinner or a Lunch, never a pudding or a sauce from Other);</li>
 *   <li>the kitchen has to be able to make it (KitchenMachines.missing);</li>
 *   <li>it is not one whose things are still waiting on the list — that one is being shopped for
 *   already — nor one the person has just seen.</li>
 * </ul>
 * and they come best first: twice how well the drawer suits the meal, 1.2 for the household's
 * own (as "use my recipes first" weighs it in a plan), and up to 1 at random, so a household's
 * dinners come before anybody else's and each visit brings different ones.
 */
@Service
public class MealIdeas {

    static final int DEFAULT_COUNT = 5;
    static final int MAX_COUNT = 10;

    /** How well a drawer has to suit the meal: Lunch for a dinner (0.6) does, Other (0.4) does not. */
    static final double MIN_FIT = 0.5;

    private final HouseholdService householdService;
    private final RecipePool pool;
    private final RecipeService recipeService;
    private final GroceryListItemRepository groceries;
    private final Random random = new Random();

    public MealIdeas(HouseholdService householdService, RecipePool pool, RecipeService recipeService,
                     GroceryListItemRepository groceries) {
        this.householdService = householdService;
        this.pool = pool;
        this.recipeService = recipeService;
        this.groceries = groceries;
    }

    private record Scored(Recipe recipe, double score) {
    }

    @Transactional(readOnly = true)
    public MealIdeasResponse ideas(UUID householdId, UUID requesterId, MealIdeasRequest request) {
        householdService.assertMember(householdId, requesterId);
        MealType meal = request.meal() == null ? MealType.DINNER : request.meal();
        int count = request.count() == null ? DEFAULT_COUNT : request.count();
        Set<UUID> exclude = new HashSet<>(request.exclude() == null ? List.of() : request.exclude());
        Set<UUID> waiting = waitingOnTheList(householdId);
        Set<String> kitchen = pool.kitchen(householdId);

        int canMake = 0, leftOut = 0;
        List<Scored> choices = new ArrayList<>();
        for (RecipePool.PoolRecipe r : pool.everything(householdId, true)) {
            double fit = CupboardPlanner.fit(r.section(), meal);
            if (fit < MIN_FIT) continue;
            if (!KitchenMachines.canMake(r.recipe().getAppliances(), kitchen)) {
                leftOut++;
                continue;
            }
            canMake++;
            if (exclude.contains(r.id()) || waiting.contains(r.id())) continue;
            choices.add(new Scored(r.recipe(), 2 * fit + (r.yours() ? 1.2 : 0) + random.nextDouble()));
        }
        List<Recipe> chosen = choices.stream()
                .sorted(Comparator.comparingDouble(Scored::score).reversed())
                .limit(count)
                .map(Scored::recipe)
                .toList();
        return new MealIdeasResponse(meal, recipeService.asSeenBy(householdId, chosen), canMake, leftOut);
    }

    /** Recipes whose things are on the list and not yet in the cart. */
    private Set<UUID> waitingOnTheList(UUID householdId) {
        Set<UUID> ids = new HashSet<>();
        for (GroceryListItem row : groceries.findByHouseholdId(householdId)) {
            if (!row.isChecked()) ids.addAll(row.getFromRecipeIds());
        }
        return ids;
    }
}
