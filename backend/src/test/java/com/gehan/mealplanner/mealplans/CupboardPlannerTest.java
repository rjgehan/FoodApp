package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Dish;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Need;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Slot;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Stocked;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The cook-from-cupboard scoring, by hand: coverage, use-soon, buy limit, variety and meal fit. */
class CupboardPlannerTest {

    static final LocalDate MON = LocalDate.of(2026, 10, 5);

    static Need need(String name) {
        return new Need(null, name, IngredientKeys.key(name));
    }

    static Dish dish(String name, RecipeSection section, String... ingredients) {
        return new Dish(UUID.nameUUIDFromBytes(name.getBytes()), name, section, true,
                Arrays.stream(ingredients).map(CupboardPlannerTest::need).toList());
    }

    static Stocked have(String name) {
        return new Stocked(null, name, IngredientKeys.key(name), false, false);
    }

    static Stocked soon(String name) {
        return new Stocked(null, name, IngredientKeys.key(name), true, false);
    }

    static Stocked first(String name) {
        return new Stocked(null, name, IngredientKeys.key(name), false, true);
    }

    static List<Slot> dinners(int days) {
        return java.util.stream.IntStream.range(0, days).mapToObj(d -> new Slot(MON.plusDays(d), MealType.DINNER)).toList();
    }

    static List<String> names(CupboardPlanner.Draft draft) {
        return draft.picks().stream().map(p -> p.dish().name()).toList();
    }

    @Test
    void theRecipeMostlyInTheCupboardComesFirst() {
        Dish curry = dish("Chickpea curry", RecipeSection.DINNER, "chickpeas", "spinach", "onion", "coconut milk");
        Dish lasagne = dish("Lasagne", RecipeSection.DINNER, "beef mince", "lasagne sheets", "onion", "passata");
        CupboardPlanner planner = new CupboardPlanner(
                List.of(have("Chickpeas (tin)"), have("Baby spinach"), have("Red onions"), have("Coconut milk")),
                List.of(curry, lasagne), CupboardPlanner.ANY);
        CupboardPlanner.Draft draft = planner.plan(dinners(2), Map.of(), Map.of(), Set.of());
        assertThat(names(draft)).containsExactly("Chickpea curry", "Lasagne");
        assertThat(draft.picks().get(0).percent()).isEqualTo(100);
        assertThat(draft.picks().get(1).percent()).isEqualTo(25);
        // 5 of 8 counted ingredients come from the cupboard (the onion twice).
        assertThat(draft.percent()).isEqualTo(63);
        assertThat(draft.toBuy()).extracting(Need::name).containsExactly("beef mince", "lasagne sheets", "passata");
    }

    @Test
    void useSoonThingsGoIntoTheFirstDays() {
        Dish omelette = dish("Omelette", RecipeSection.DINNER, "eggs", "cheddar");
        Dish fishPie = dish("Fish pie", RecipeSection.DINNER, "cod", "potatoes");
        CupboardPlanner planner = new CupboardPlanner(
                List.of(have("Eggs"), have("Cheddar"), soon("Cod"), have("Potatoes")),
                List.of(omelette, fishPie), CupboardPlanner.ANY);
        // Both are 100% from the cupboard; the cod wants using, so the fish pie is Monday's.
        assertThat(names(planner.plan(dinners(2), Map.of(), Map.of(), Set.of()))).containsExactly("Fish pie", "Omelette");
    }

    @Test
    void useTheseUpFirstOutweighsAPlainUseSoon() {
        Dish a = dish("Yogurt bowl", RecipeSection.DINNER, "greek yogurt", "granola");
        Dish b = dish("Spinach pasta", RecipeSection.DINNER, "spinach", "pasta");
        CupboardPlanner planner = new CupboardPlanner(
                List.of(first("Greek yogurt"), have("Granola"), soon("Spinach"), have("Pasta")),
                List.of(a, b), CupboardPlanner.ANY);
        assertThat(names(planner.plan(dinners(1), Map.of(), Map.of(), Set.of()))).containsExactly("Yogurt bowl");
    }

    @Test
    void theBuyLimitIsNeverPassed() {
        Dish cheap = dish("Beans on toast", RecipeSection.DINNER, "baked beans", "bread");
        Dish dear = dish("Paella", RecipeSection.DINNER, "rice", "prawns", "chorizo", "saffron", "peas");
        CupboardPlanner none = new CupboardPlanner(List.of(have("Baked beans"), have("Bread"), have("Rice")),
                List.of(cheap, dear), 0);
        CupboardPlanner.Draft draft = none.plan(dinners(2), Map.of(), Map.of(), Set.of());
        assertThat(names(draft)).containsExactly("Beans on toast");
        assertThat(draft.unfilled()).containsExactly(new Slot(MON.plusDays(1), MealType.DINNER));
        assertThat(draft.toBuy()).isEmpty();

        CupboardPlanner four = new CupboardPlanner(List.of(have("Baked beans"), have("Bread"), have("Rice")),
                List.of(cheap, dear), 4);
        assertThat(four.plan(dinners(2), Map.of(), Map.of(), Set.of()).toBuy()).hasSize(4);
        CupboardPlanner three = new CupboardPlanner(List.of(have("Baked beans"), have("Bread"), have("Rice")),
                List.of(cheap, dear), 3);
        assertThat(three.plan(dinners(2), Map.of(), Map.of(), Set.of()).picks()).hasSize(1);
    }

    @Test
    void somethingAlreadyOnTheListCostsNothingMore() {
        // Both need lemons; buying them once covers the second meal too.
        Dish a = dish("Lemon chicken", RecipeSection.DINNER, "chicken thighs", "lemons");
        Dish b = dish("Lemon pasta", RecipeSection.DINNER, "pasta", "lemon");
        CupboardPlanner planner = new CupboardPlanner(List.of(have("Chicken thighs"), have("Pasta")), List.of(a, b), 1);
        CupboardPlanner.Draft draft = planner.plan(dinners(2), Map.of(), Map.of(), Set.of());
        assertThat(draft.picks()).hasSize(2);
        assertThat(draft.toBuy()).extracting(Need::key).containsExactly("lemon");
    }

    @Test
    void noRecipeTwiceAndNothingAlreadyPlanned() {
        Dish only = dish("Dal", RecipeSection.DINNER, "lentils");
        Dish other = dish("Soup", RecipeSection.DINNER, "lentils", "carrots");
        CupboardPlanner planner = new CupboardPlanner(List.of(have("Lentils")), List.of(only, other), CupboardPlanner.ANY);
        assertThat(names(planner.plan(dinners(3), Map.of(), Map.of(), Set.of()))).containsExactly("Dal", "Soup");
        assertThat(names(planner.plan(dinners(3), Map.of(), Map.of(), Set.of(only.id())))).containsExactly("Soup");
    }

    @Test
    void mealsGoWhereTheyFit() {
        Dish porridge = dish("Porridge", RecipeSection.BREAKFAST, "oats", "milk");
        Dish stew = dish("Stew", RecipeSection.DINNER, "beef", "carrots");
        Dish smoothie = dish("Smoothie", RecipeSection.DRINKS, "banana", "milk");
        CupboardPlanner planner = new CupboardPlanner(
                List.of(have("Oats"), have("Milk"), have("Banana"), have("Beef"), have("Carrots")),
                List.of(porridge, stew, smoothie), CupboardPlanner.ANY);
        CupboardPlanner.Draft draft = planner.plan(
                List.of(new Slot(MON, MealType.BREAKFAST), new Slot(MON, MealType.DINNER)), Map.of(), Map.of(), Set.of());
        assertThat(names(draft)).containsExactly("Porridge", "Stew");
        assertThat(CupboardPlanner.fit(RecipeSection.DRINKS, MealType.DINNER)).isZero();
        assertThat(CupboardPlanner.fit(RecipeSection.BREAKFAST, MealType.DINNER)).isZero();
        assertThat(CupboardPlanner.fit(RecipeSection.DINNER, MealType.LUNCH)).isEqualTo(0.7);
    }

    @Test
    void aSwapKeepsTheRestAndMovesOnToTheNextBest() {
        Dish a = dish("A curry", RecipeSection.DINNER, "chickpeas", "spinach");
        Dish b = dish("B stew", RecipeSection.DINNER, "chickpeas", "carrots");
        Dish c = dish("C soup", RecipeSection.DINNER, "lentils", "stock");
        CupboardPlanner planner = new CupboardPlanner(List.of(have("Chickpeas"), have("Spinach"), have("Carrots")),
                List.of(a, b, c), CupboardPlanner.ANY);
        Slot mon = new Slot(MON, MealType.DINNER), tue = new Slot(MON.plusDays(1), MealType.DINNER);
        assertThat(names(planner.plan(List.of(mon, tue), Map.of(), Map.of(), Set.of()))).containsExactly("A curry", "B stew");
        // Swap Monday: Tuesday's stew stays, so the next best for Monday is the soup.
        CupboardPlanner.Draft swapped = planner.plan(List.of(mon, tue), Map.of(tue, b.id()), Map.of(mon, Set.of(a.id())), Set.of());
        assertThat(names(swapped)).containsExactly("C soup", "B stew");
        assertThat(swapped.picks().get(1).fixed()).isTrue();
    }

    @Test
    void keysCatchTheSameThingSpelledDifferently() {
        assertThat(IngredientKeys.key("Chickpeas (tin)")).isEqualTo(IngredientKeys.key("chickpeas"));
        assertThat(IngredientKeys.key("baby spinach")).isEqualTo("spinach");
        assertThat(IngredientKeys.key("Large free-range eggs")).isEqualTo("egg");
        assertThat(IngredientKeys.key("tomatoes")).isEqualTo("tomato");
        assertThat(IngredientKeys.key("Red onions")).isEqualTo("onion");
        assertThat(IngredientKeys.key("coconut milk")).isNotEqualTo(IngredientKeys.key("milk"));
        assertThat(IngredientKeys.key("spring onions")).isNotEqualTo(IngredientKeys.key("onion"));
        assertThat(IngredientKeys.isFree("Salt")).isTrue();
        assertThat(IngredientKeys.isFree("water")).isTrue();
        assertThat(IngredientKeys.isFree("pepper")).isFalse();
    }
}
