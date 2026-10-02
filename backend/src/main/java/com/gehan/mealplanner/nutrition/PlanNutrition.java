package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.nutrition.NutritionDtos.Attribution;
import com.gehan.mealplanner.nutrition.NutritionDtos.PlanDay;
import com.gehan.mealplanner.nutrition.NutritionDtos.PlanMealNotCounted;
import com.gehan.mealplanner.nutrition.NutritionDtos.PlanNutritionResponse;
import com.gehan.mealplanner.nutrition.NutritionDtos.Values;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * How the household's plan adds up for one person, day by day: one serving of every planned
 * recipe (with the optional bits that occasion includes), and one of any single food planned on
 * its own — eggs for breakfast. Places and saved links are not counted, and nor is anything with
 * no food data; the answer says how many meals that leaves out, so a light-looking Thursday
 * reads as "two meals counted" and not as a diet.
 */
@Service
public class PlanNutrition {

    /** A fortnight at most: it is a look at the plan, not a food diary. */
    static final int LONGEST = 31;

    private final MealPlanEntryRepository entries;
    private final HouseholdRepository households;
    private final HouseholdService householdService;
    private final RecipeNutrition recipes;
    private final IngredientMatches matches;

    public PlanNutrition(MealPlanEntryRepository entries, HouseholdRepository households,
                         HouseholdService householdService, RecipeNutrition recipes, IngredientMatches matches) {
        this.entries = entries;
        this.households = households;
        this.householdService = householdService;
        this.recipes = recipes;
        this.matches = matches;
    }

    /** start defaults to today; end to the end of the household's planning window. */
    @Transactional
    public PlanNutritionResponse forPlan(UUID householdId, UUID requesterId, LocalDate start, LocalDate end) {
        householdService.assertMember(householdId, requesterId);
        Household household = households.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        LocalDate from = start != null ? start : LocalDate.now();
        LocalDate to = end != null ? end : from.plusDays(Math.max(1, household.getPlanningHorizonDays()) - 1);
        if (to.isBefore(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The end is before the start.");
        if (ChronoUnit.DAYS.between(from, to) >= LONGEST) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That's more days than the plan looks at.");
        }

        List<MealPlanEntry> planned = entries.findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, from, to);

        Map<UUID, Recipe> recipeById = new LinkedHashMap<>();
        for (MealPlanEntry entry : planned) {
            if (entry.getRecipe() == null) continue;
            recipeById.put(entry.getRecipe().getId(), entry.getRecipe());
        }
        // The same recipe twice with different optional bits is two different servings; each
        // distinct choice gets worked out on its own.
        Map<String, Nutrients> servingByChoice = new HashMap<>();
        Map<UUID, Nutrients> plain = recipes.perServing(recipeById.values(), Map.of());
        for (MealPlanEntry entry : planned) {
            if (entry.getRecipe() == null || entry.getIncludedOptionalIngredientIds().isEmpty()) continue;
            String choice = choiceKey(entry);
            if (servingByChoice.containsKey(choice)) continue;
            Nutrients n = recipes.perServing(List.of(entry.getRecipe()),
                    Map.of(entry.getRecipe().getId(), entry.getIncludedOptionalIngredientIds())).get(entry.getRecipe().getId());
            servingByChoice.put(choice, n);
        }

        Map<UUID, IngredientMatches.Match> items = matches.matchesFor(planned.stream()
                .filter(e -> e.getRecipe() == null && e.getItem() != null)
                .map(MealPlanEntry::getItem).distinct().toList());

        Map<LocalDate, Nutrients> totals = new LinkedHashMap<>();
        Map<LocalDate, int[]> counts = new HashMap<>();  // [planned, counted]
        List<PlanMealNotCounted> notCounted = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            totals.put(day, Nutrients.NONE);
            counts.put(day, new int[2]);
        }

        for (MealPlanEntry entry : planned) {
            int[] count = counts.get(entry.getDate());
            String meal = entry.getMealType().name();
            Nutrients serving = null;
            String name;
            String reason = null;
            if (entry.getRecipe() != null) {
                name = entry.getRecipe().getName();
                serving = entry.getIncludedOptionalIngredientIds().isEmpty()
                        ? plain.get(entry.getRecipe().getId()) : servingByChoice.get(choiceKey(entry));
                if (serving == null) reason = "NO_DATA";
            } else if (entry.getPlace() != null) {
                name = entry.getPlace().getName();
                reason = "PLACE";
            } else if (entry.getSavedLink() != null) {
                name = entry.getSavedLink().getName() != null ? entry.getSavedLink().getName() : "A saved link";
                reason = "SAVED_LINK";
            } else if (entry.getItem() != null) {
                name = entry.getItem().getName();
                serving = oneOf(items.get(entry.getItem().getId()), name);
                if (serving == null) reason = "NO_DATA";
            } else if (entry.getDeletedRecipeName() != null) {
                name = entry.getDeletedRecipeName();
                reason = "DELETED";
            } else {
                continue;  // an empty slot is not a meal
            }
            count[0]++;
            if (serving != null) {
                count[1]++;
                totals.put(entry.getDate(), totals.get(entry.getDate()).plus(serving));
            } else {
                notCounted.add(new PlanMealNotCounted(entry.getDate(), meal, name, reason));
            }
        }

        List<PlanDay> days = new ArrayList<>();
        Nutrients sum = Nutrients.NONE;
        int daysCounted = 0, mealsPlanned = 0, mealsCounted = 0;
        for (Map.Entry<LocalDate, Nutrients> day : totals.entrySet()) {
            int[] count = counts.get(day.getKey());
            mealsPlanned += count[0];
            mealsCounted += count[1];
            if (count[1] > 0) {
                daysCounted++;
                sum = sum.plus(day.getValue());
            }
            days.add(new PlanDay(day.getKey(), Values.of(day.getValue()), count[0], count[1], count[1] < count[0]));
        }
        Values average = Values.of(daysCounted == 0 ? Nutrients.NONE : sum.scaled(1.0 / daysCounted));
        return new PlanNutritionResponse(from, to, days, average, daysCounted, mealsPlanned, mealsCounted, notCounted,
                NutritionLabels.REFERENCE_DAY, note(daysCounted, mealsPlanned, mealsCounted), Attribution.USDA);
    }

    /** A food planned on its own: one of it ("2 eggs" would be planned as servings: 1 each). */
    private static Nutrients oneOf(IngredientMatches.Match match, String name) {
        if (match == null || !match.countable()) return null;
        return Grams.of(1, null, name, match.food())
                .map(amount -> match.food().per100g().scaled(amount.grams() / 100.0))
                .orElse(null);
    }

    private static String choiceKey(MealPlanEntry entry) {
        return entry.getRecipe().getId() + ":" + entry.getIncludedOptionalIngredientIds().stream().sorted().toList();
    }

    static String note(int daysCounted, int mealsPlanned, int mealsCounted) {
        if (mealsPlanned == 0) return "Nothing is planned yet.";
        String meals = mealsCounted == mealsPlanned
                ? "All " + mealsPlanned + " planned meals counted."
                : mealsCounted + " of " + mealsPlanned + " planned meals counted — places, links and foods without data aren't.";
        return "Per person, one serving of each meal. " + meals
                + (daysCounted > 0 ? " The average is over the " + daysCounted + (daysCounted == 1 ? " day" : " days")
                + " with meals counted." : "");
    }
}
