package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.mealplans.Targets.Activity;
import com.gehan.mealplanner.mealplans.Targets.Body;
import com.gehan.mealplanner.mealplans.Targets.Goal;
import com.gehan.mealplanner.mealplans.Targets.Macros;
import com.gehan.mealplanner.mealplans.Targets.Sex;
import com.gehan.mealplanner.mealplans.TargetPlanner.Meal;
import com.gehan.mealplanner.mealplans.TargetPlanner.Option;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Targets (Mifflin–St Jeor and the goal rules), preferences, and the target plan's choosing, by hand. */
class TargetsTest {

    // BMR and the day's total

    @Test
    void mifflinStJeorForAManAndAWoman() {
        // 10·80 + 6.25·180 − 5·30 + 5 = 1780
        assertThat(Targets.bmr(new Body(30, Sex.MALE, 180, 80, Activity.MODERATE, Goal.MAINTAIN))).isCloseTo(1780, within(0.01));
        // 10·60 + 6.25·165 − 5·30 − 161 = 1320.25
        assertThat(Targets.bmr(new Body(30, Sex.FEMALE, 165, 60, Activity.MODERATE, Goal.MAINTAIN))).isCloseTo(1320.25, within(0.01));
        // Rather not say: the midpoint, −78.
        assertThat(Targets.bmr(new Body(30, Sex.UNSPECIFIED, 165, 60, Activity.MODERATE, Goal.MAINTAIN))).isCloseTo(1403.25, within(0.01));
        assertThat(Targets.tdee(new Body(30, Sex.MALE, 180, 80, Activity.SEDENTARY, Goal.MAINTAIN))).isCloseTo(2136, within(0.01));
        assertThat(Targets.tdee(new Body(30, Sex.MALE, 180, 80, Activity.VERY_ACTIVE, Goal.MAINTAIN))).isCloseTo(3382, within(0.01));
    }

    @Test
    void maintainIsTheDayWithProteinAt1Point4PerKiloAndFatAt30Percent() {
        Macros m = Targets.worked(new Body(30, Sex.MALE, 180, 80, Activity.MODERATE, Goal.MAINTAIN));
        // 1780 × 1.55 = 2759 → 2760; 112 g protein; 2760 × 0.3 / 9 = 92 g fat; (2760 − 448 − 828) / 4 = 371 g carbs.
        assertThat(m).isEqualTo(new Macros(2760, 112, 371, 92));
    }

    @Test
    void loseFatIs20PercentUnderWithAFloor() {
        // 1320.25 × 1.2 × 0.8 = 1267 → 1270; 2 g/kg protein; 25% fat.
        assertThat(Targets.worked(new Body(30, Sex.FEMALE, 165, 60, Activity.SEDENTARY, Goal.LOSE_FAT)))
                .isEqualTo(new Macros(1270, 120, 119, 35));
        // 1189 × 1.2 = 1427 a day; 20% under would be 1,141 kcal; 1,200 is as low as it goes.
        assertThat(Targets.worked(new Body(40, Sex.FEMALE, 160, 55, Activity.SEDENTARY, Goal.LOSE_FAT)).kcal()).isEqualTo(1200);
        // 1517.5 × 1.2 = 1821; 20% under is 1,457; 1,500 for a man.
        assertThat(Targets.worked(new Body(40, Sex.MALE, 170, 65, Activity.SEDENTARY, Goal.LOSE_FAT)).kcal()).isEqualTo(1500);
        // A small, older woman whose whole day is 1,112 kcal: the floor would be a surplus, so maintenance.
        assertThat(Targets.worked(new Body(60, Sex.FEMALE, 150, 45, Activity.SEDENTARY, Goal.LOSE_FAT)).kcal()).isEqualTo(1110);
    }

    @Test
    void buildMuscleIs15PercentOverWithProteinAt1Point8AndFatAt1PerKilo() {
        // The mockup's 20-year-old: 5 ft 11 (180.3 cm), 165 lb (74.8 kg), lifting 4x a week.
        Macros m = Targets.worked(new Body(20, Sex.MALE, 180.3, 74.8, Activity.MODERATE, Goal.BUILD_MUSCLE));
        // 1779.9 × 1.55 × 1.15 = 3172.6 → 3170; 134.6 → 135 g; 75 g fat; (3170 − 540 − 675) / 4 = 489 g.
        assertThat(m).isEqualTo(new Macros(3170, 135, 489, 75));
        // The energy adds back up from the grams, within rounding.
        assertThat(4 * m.protein() + 4 * m.carbs() + 9 * m.fat()).isCloseTo(m.kcal(), within(4));
    }

    @Test
    void numbersSetByHandWinAndCarbsAreStillTheRest() {
        Body body = new Body(20, Sex.MALE, 180.3, 74.8, Activity.MODERATE, Goal.BUILD_MUSCLE);
        Targets.Result r = Targets.of(body, new Targets.Overrides(2500, null, null, null));
        assertThat(r.target()).isEqualTo(new Macros(2500, 135, 321, 75));
        assertThat(r.computed().kcal()).isEqualTo(3170);
        assertThat(r.overridden()).containsExactly("kcal");
        Targets.Result carbs = Targets.of(body, new Targets.Overrides(2500, 160, 250, null));
        assertThat(carbs.target()).isEqualTo(new Macros(2500, 160, 250, 75));
        assertThat(carbs.overridden()).containsExactly("kcal", "protein", "carbs");
        assertThat(Targets.of(body, null).overridden()).isEmpty();
    }

    // Preferences

    @Test
    void preferencesRuleRecipesOutByTheirWords() {
        Preferences veggie = new Preferences(List.of("vegetarian"), List.of());
        assertThat(veggie.allows("chickpea curry | chickpeas | coconut milk", 30)).isTrue();
        assertThat(veggie.allows("pasta | bacon | cream", 30)).isFalse();
        assertThat(veggie.allows("risotto | rice | chicken stock", 30)).isFalse();
        assertThat(veggie.allows("fish pie | cod | potatoes", 30)).isFalse();

        Preferences noPork = new Preferences(List.of("no-pork"), List.of());
        assertThat(noPork.allows("carbonara | pancetta", 20)).isFalse();
        assertThat(noPork.allows("hamburger | beef mince", 20)).isTrue();

        Preferences vegan = new Preferences(List.of("vegan"), List.of());
        assertThat(vegan.allows("satay | peanut butter | coconut milk | tofu", 20)).isTrue();
        assertThat(vegan.allows("omelette | eggs", 20)).isFalse();
        assertThat(vegan.allows("moussaka | eggplant | lentils", 20)).isTrue();
        assertThat(vegan.allows("toast | butter", 20)).isFalse();

        Preferences quick = new Preferences(List.of("under-30"), List.of("mushrooms"));
        assertThat(quick.allows("stew | beef", 120)).isFalse();
        assertThat(quick.allows("salad | lettuce", null)).isTrue();
        assertThat(quick.allows("risotto | mushrooms", 25)).isFalse();
    }

    @Test
    void wordsThatOnlyStartLikeMeatAreNotMeat() {
        Preferences veggie = new Preferences(List.of("vegetarian"), List.of());
        assertThat(veggie.allows("three-bean veggie chilli | kidney beans | onion | rice", 45)).isTrue();
        assertThat(veggie.allows("steak and kidney pie | beef | kidneys", 45)).isFalse();
        assertThat(veggie.allows("gooseberry fool | gooseberries | cream", 20)).isTrue();
        assertThat(veggie.allows("roast goose | goose", 120)).isFalse();
        assertThat(veggie.allows("mince pies | mincemeat | flour | butter", 40)).isTrue();
        assertThat(veggie.allows("cottage pie | beef mince", 60)).isFalse();
        assertThat(veggie.allows("dumplings | vegetable suet | flour", 30)).isTrue();
        assertThat(veggie.allows("dumplings | suet | flour", 30)).isFalse();
        assertThat(veggie.allows("liverpool scouse | potatoes | carrots", 30)).isTrue();
        assertThat(veggie.allows("bangers and mash | vegetarian sausages | potatoes", 30)).isTrue();
        assertThat(veggie.allows("cauliflower steak | cauliflower", 30)).isTrue();
        // A tuna steak is not meat, but it is fish.
        assertThat(veggie.allows("tuna steak | tuna", 20)).isFalse();
        assertThat(new Preferences(List.of("pescatarian"), List.of()).allows("tuna steak | tuna", 20)).isTrue();
        assertThat(new Preferences(List.of("no-pork"), List.of()).allows("toad in the hole | veggie sausages", 40)).isTrue();
    }

    @Test
    void theLoseFatFloorNeverGoesAboveMaintenance() {
        // 75, a woman, 150 cm and 42 kg, mostly sitting: 986 kcal a day in all. The 1,200 floor
        // would be a surplus, so the plan holds weight at maintenance and says why.
        Body small = new Body(75, Sex.FEMALE, 150, 42, Activity.SEDENTARY, Goal.LOSE_FAT);
        Targets.Result r = Targets.of(small, Targets.Overrides.NONE);
        assertThat(r.tdee()).isEqualTo(986);
        assertThat(r.target().kcal()).isEqualTo(990);
        assertThat(r.notes()).hasSize(1);
        assertThat(r.notes().get(0)).contains("1,200").contains("maintenance");
        // Above the floor, no note.
        assertThat(Targets.of(new Body(38, Sex.MALE, 183, 86, Activity.LIGHT, Goal.LOSE_FAT), Targets.Overrides.NONE)
                .notes()).isEmpty();
    }

    @Test
    void numbersSetByHandThatLeaveNoRoomForCarbsSaySo() {
        Body b = new Body(38, Sex.MALE, 183, 86, Activity.LIGHT, Goal.LOSE_FAT);
        Targets.Result r = Targets.of(b, new Targets.Overrides(800, 172, null, 56));
        assertThat(r.target().carbs()).isZero();
        assertThat(r.notes()).anyMatch(n -> n.contains("1,192 kcal") && n.contains("800 kcal"));
    }

    @Test
    void aPlansPortionIsCookedOnTopOfEveryoneElsesServing() {
        assertThat(TargetPlans.servingsToCook(2, 4)).isEqualTo(5);
        assertThat(TargetPlans.servingsToCook(1, 4)).isEqualTo(4);
        assertThat(TargetPlans.servingsToCook(1.5, 1)).isEqualTo(2);
        assertThat(TargetPlans.servingsToCook(0.5, 1)).isEqualTo(1);
        assertThat(TargetPlans.servingsToCook(3, 2)).isEqualTo(4);
    }

    @Test
    void recipesCountedOnlyInPartAreNeverChosen() {
        Option pudding = new Option(UUID.randomUUID(), "Strawberry thing", RecipeSection.DINNER, true, 966, 6, 8, 100,
                null, null, 10, "strawberry thing", null, true);
        assertThat(new TargetPlanner(List.of(pudding), new Preferences(List.of(), List.of()), true, 2000, 100)
                .plan(1, List.of(MealType.DINNER))).isEmpty();
    }

    // Choosing meals

    static Option option(String name, RecipeSection section, boolean yours, double kcal, double protein) {
        return new Option(UUID.nameUUIDFromBytes(name.getBytes()), name, section, yours, kcal, protein, kcal * 0.1, kcal * 0.03,
                null, null, 20, name.toLowerCase(), null);
    }

    @Test
    void portionsAreSensibleStepsNearestTheAim() {
        assertThat(TargetPlanner.portion(400, 1015, MealType.DINNER)).isEqualTo(2.5);
        assertThat(TargetPlanner.portion(400, 380, MealType.DINNER)).isEqualTo(1.0);
        assertThat(TargetPlanner.portion(100, 900, MealType.SNACK)).isEqualTo(2.0);
        assertThat(TargetPlanner.portion(900, 200, MealType.LUNCH)).isEqualTo(0.5);
    }

    @Test
    void aDayComesCloseToItsEnergyAndProtein() {
        List<Option> options = List.of(
                option("Porridge", RecipeSection.BREAKFAST, true, 350, 12),
                option("Protein oats", RecipeSection.BREAKFAST, true, 480, 35),
                option("Chicken wrap", RecipeSection.LUNCH, true, 520, 38),
                option("Soup", RecipeSection.LUNCH, false, 300, 10),
                option("Steak and chips", RecipeSection.DINNER, false, 800, 55),
                option("Dal", RecipeSection.DINNER, true, 450, 18),
                option("Yogurt and honey", RecipeSection.SNACKS, true, 200, 15));
        TargetPlanner planner = new TargetPlanner(options, new Preferences(List.of(), List.of()), true, 2800, 150);
        List<Meal> day = planner.plan(1, List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK));
        assertThat(day).hasSize(4);
        double kcal = day.stream().mapToDouble(Meal::kcal).sum();
        double protein = day.stream().mapToDouble(Meal::protein).sum();
        assertThat(kcal).isCloseTo(2800, within(2800 * 0.1));
        assertThat(protein).isGreaterThan(150 * 0.85);
        // Every meal fits its slot.
        for (Meal m : day) assertThat(CupboardPlanner.fit(m.option().section(), m.slot().meal())).isPositive();
    }

    @Test
    void noDinnerTheSameDayOrTheNextAndNothingTheRulesForbid() {
        List<Option> options = List.of(
                option("Stew A", RecipeSection.DINNER, true, 700, 40),
                option("Stew B", RecipeSection.DINNER, true, 700, 40),
                option("Pork belly", RecipeSection.DINNER, true, 700, 40));
        TargetPlanner planner = new TargetPlanner(options, new Preferences(List.of("no-pork"), List.of()), true, 2000, 100);
        assertThat(planner.allowed()).isEqualTo(2);
        List<Meal> plan = planner.plan(4, List.of(MealType.DINNER));
        assertThat(plan).extracting(m -> m.option().name()).containsExactly("Stew A", "Stew B", "Stew A", "Stew B");
    }

    @Test
    void theSameSnackEveryDayIsFineButNotTwiceADay() {
        Option yogurt = option("Yogurt", RecipeSection.SNACKS, true, 200, 15);
        TargetPlanner planner = new TargetPlanner(List.of(yogurt), new Preferences(List.of(), List.of()), true, 2000, 100);
        assertThat(planner.plan(3, List.of(MealType.SNACK))).hasSize(3);
        // Snack-drawer only: it could not also be breakfast the same day.
        assertThat(planner.plan(1, List.of(MealType.BREAKFAST, MealType.SNACK))).extracting(m -> m.slot().meal())
                .containsExactly(MealType.BREAKFAST);
    }

    @Test
    void yourRecipesComeFirstWhenAsked() {
        Option mine = option("My curry", RecipeSection.DINNER, true, 600, 30);
        Option theirs = option("Their curry", RecipeSection.DINNER, false, 600, 30);
        List<MealType> dinner = List.of(MealType.DINNER);
        assertThat(new TargetPlanner(List.of(mine, theirs), new Preferences(List.of(), List.of()), true, 2000, 100)
                .plan(1, dinner).get(0).option().name()).isEqualTo("My curry");
        // Off, the two are equal and the order is just by name.
        Option aaa = option("Aaa curry", RecipeSection.DINNER, false, 600, 30);
        assertThat(new TargetPlanner(List.of(mine, aaa), new Preferences(List.of(), List.of()), false, 2000, 100)
                .plan(1, dinner).get(0).option().name()).isEqualTo("Aaa curry");
    }

    @Test
    void aSwapKeepsTheRestOfTheDay() {
        Option a = option("A dinner", RecipeSection.DINNER, true, 700, 40);
        Option b = option("B dinner", RecipeSection.DINNER, true, 700, 40);
        Option bf = option("Breakfast", RecipeSection.BREAKFAST, true, 500, 25);
        TargetPlanner planner = new TargetPlanner(List.of(a, b, bf), new Preferences(List.of(), List.of()), true, 2000, 100);
        List<MealType> meals = List.of(MealType.BREAKFAST, MealType.DINNER);
        List<Meal> plan = planner.plan(1, meals);
        Meal breakfast = plan.get(0), dinner = plan.get(1);
        assertThat(dinner.option().name()).isEqualTo("A dinner");
        TargetPlanner.Slot slot = dinner.slot();
        List<Meal> swapped = planner.plan(1, meals, Map.of(breakfast.slot(), breakfast), Map.of(slot, Set.of(a.id())));
        assertThat(swapped).extracting(m -> m.option().name()).containsExactly("Breakfast", "B dinner");
    }

    @Test
    void aRecipeAPhoneChoseIsTakenInTheRightPortionIfTheRulesAllow() {
        Option a = option("A dinner", RecipeSection.DINNER, true, 700, 40);
        Option b = option("B dinner", RecipeSection.DINNER, true, 350, 20);
        Option bf = option("Breakfast", RecipeSection.BREAKFAST, true, 500, 25);
        TargetPlanner planner = new TargetPlanner(List.of(a, b, bf), new Preferences(List.of(), List.of()), true, 2000, 100);
        TargetPlanner.Slot mon = new TargetPlanner.Slot(0, MealType.DINNER), tue = new TargetPlanner.Slot(1, MealType.DINNER);
        List<Meal> plan = planner.plan(2, List.of(MealType.DINNER), Map.of(), Map.of(), Map.of(mon, b.id()));
        assertThat(plan).extracting(m -> m.option().name()).containsExactly("B dinner", "A dinner");
        // A whole day on one dinner: the small one is given the portion that reaches the day.
        assertThat(plan.get(0).portion()).isEqualTo(3.0);
        // Breakfast for dinner, or Monday's dinner again on Tuesday, is refused: the server's own best goes there.
        List<Meal> refused = planner.plan(2, List.of(MealType.DINNER), Map.of(), Map.of(),
                Map.of(mon, bf.id(), tue, a.id()));
        assertThat(refused).extracting(m -> m.option().name()).containsExactly("A dinner", "B dinner");
    }

    @Test
    void candidatesAreTheAllowedRecipesThatSuitAMeal() {
        Option mine = option("My curry", RecipeSection.DINNER, true, 600, 30);
        Option theirs = option("Their curry", RecipeSection.DINNER, false, 600, 30);
        Option drink = option("Smoothie", RecipeSection.DRINKS, true, 300, 10);
        Option pork = option("Pork chops", RecipeSection.DINNER, true, 600, 40);
        TargetPlanner planner = new TargetPlanner(List.of(theirs, mine, drink, pork),
                new Preferences(List.of("no-pork"), List.of()), true, 2000, 100);
        assertThat(planner.candidates(List.of(MealType.DINNER), 10)).extracting(Option::name)
                .containsExactly("My curry", "Their curry");
        assertThat(planner.candidates(List.of(MealType.DINNER), 1)).hasSize(1);
    }

    @Test
    void recipesWithoutNumbersAreNeverChosen() {
        Option empty = option("Mystery", RecipeSection.DINNER, true, 0, 0);
        assertThat(new TargetPlanner(List.of(empty), new Preferences(List.of(), List.of()), true, 2000, 100).plan(1, List.of(MealType.DINNER)))
                .isEmpty();
    }
}
