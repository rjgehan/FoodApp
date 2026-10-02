package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyMeal;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.Skipped;
import com.gehan.mealplanner.repository.IngredientRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.service.GroceryListService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.MealPlanService;
import com.gehan.mealplanner.service.RecipeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * Puts generated meals on the household's Plan — a cupboard draft, a ready-made plan or your own
 * target plan. Each becomes an ordinary planned meal, exactly as if somebody had planned it by
 * hand, so everything else (groceries, nutrition, editing) treats it the same.
 *
 * Never over the top of something: a slot that already has a meal is left as it is and the
 * meal is reported as skipped, so applying a plan can't quietly turn Tuesday's dinner into a
 * side. Only recipes the household could read anyway can be planned.
 */
@Service
public class PlanApply {

    private final HouseholdService householdService;
    private final RecipeService recipes;
    private final MealPlanService mealPlans;
    private final MealPlanEntryRepository entries;
    private final GroceryListService groceries;
    private final IngredientRepository ingredients;

    public PlanApply(HouseholdService householdService, RecipeService recipes, MealPlanService mealPlans,
                     MealPlanEntryRepository entries, GroceryListService groceries, IngredientRepository ingredients) {
        this.ingredients = ingredients;
        this.householdService = householdService;
        this.recipes = recipes;
        this.mealPlans = mealPlans;
        this.entries = entries;
        this.groceries = groceries;
    }

    /** @param addToGroceries ingredients for the grocery list, each once and with no amount */
    @Transactional
    public ApplyResponse apply(UUID householdId, UUID requesterId, List<ApplyMeal> meals, List<UUID> addToGroceries) {
        householdService.assertMember(householdId, requesterId);
        // Every recipe is checked before anything is written, so a bad one changes nothing.
        for (ApplyMeal meal : meals) {
            recipes.readable(meal.recipeId(), householdId, requesterId);
        }

        int added = 0;
        List<Skipped> skipped = new ArrayList<>();
        LocalDate from = null, to = null;
        List<ApplyMeal> ordered = meals.stream()
                .sorted(Comparator.comparing(ApplyMeal::date).thenComparing(ApplyMeal::mealType)).toList();
        List<String> slotsDone = new ArrayList<>();
        for (ApplyMeal meal : ordered) {
            String slot = meal.date() + ":" + meal.mealType();
            boolean taken = slotsDone.contains(slot) || !entries
                    .findByHouseholdIdAndDateAndMealTypeOrderByCreatedAtAsc(householdId, meal.date(), meal.mealType())
                    .isEmpty();
            if (taken) {
                skipped.add(new Skipped(meal.date(), meal.mealType(), meal.recipeId(), "PLANNED"));
                continue;
            }
            mealPlans.add(householdId, requesterId, new AddMealPlanEntryRequest(meal.date(), meal.mealType(),
                    meal.recipeId(), null, null, null, meal.servings(), null, null));
            slotsDone.add(slot);
            added++;
            from = from == null || meal.date().isBefore(from) ? meal.date() : from;
            to = to == null || meal.date().isAfter(to) ? meal.date() : to;
        }

        int groceriesAdded = 0;
        if (addToGroceries != null) {
            for (UUID ingredientId : new LinkedHashSet<>(addToGroceries)) {
                // An id that isn't an ingredient adds nothing, and is no reason to undo the plan.
                if (!ingredients.existsById(ingredientId)) continue;
                groceries.ensureOnList(householdId, ingredientId, requesterId);
                groceriesAdded++;
            }
        }
        return new ApplyResponse(added, skipped, groceriesAdded, from, to);
    }
}
