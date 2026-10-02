package com.gehan.mealplanner.nutrition;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * The arithmetic behind every number on the Nutrition screens, on real USDA rows: grams for an
 * amount, a recipe's totals, and the label words and percentages.
 */
class NutritionMathsTest {

    static FoodTable table;

    @BeforeAll
    static void load() throws Exception {
        table = new FoodTable(UsdaTableLoader.bundled());
    }

    // The sanity checks anyone would do by hand

    @Test
    void a100gRawChickenBreastIs120KcalAnd22AndAHalfGramsOfProtein() {
        Nutrients n = nutrients(100, "g", "chicken breast", 171077);
        assertThat(n.kcal()).isCloseTo(120, within(1.0));
        assertThat(n.protein()).isCloseTo(22.5, within(0.1));
    }

    @Test
    void oneLargeEggIsAbout72Kcal() {
        Nutrients n = nutrients(1, null, "large egg", 171287);
        assertThat(n.kcal()).isCloseTo(72, within(1.0));
        assertThat(grams(1, null, "egg", 171287).basis()).isEqualTo("1 large = 50 g");
    }

    @Test
    void aTablespoonOfOliveOilIsAbout120Kcal() {
        assertThat(nutrients(1, "tbsp", "olive oil", 171413).kcal()).isCloseTo(119, within(1.5));
    }

    // Grams for an amount

    @Test
    void weightsConvertExactly() {
        assertThat(grams(1, "kg", "flour", 168894).grams()).isEqualTo(1000);
        assertThat(grams(4, "oz", "cheddar", 173414).grams()).isCloseTo(113.4, within(0.1));
        assertThat(grams(1, "lb", "salmon", 175167).grams()).isCloseTo(453.6, within(0.1));
        assertThat(grams(250, "grams", "rice", 168877).how()).isEqualTo(Grams.How.WEIGHT);
    }

    @Test
    void spoonsAndCupsUseTheFoodsOwnMeasures() {
        // USDA: a cup of all-purpose flour is 125 g, not 236 ml of anything.
        assertThat(grams(1, "cup", "plain flour", 168894).grams()).isEqualTo(125);
        assertThat(grams(2, "tablespoons", "olive oil", 171413).grams()).isEqualTo(27);
        assertThat(grams(1, "tsp", "salt", 173468).grams()).isEqualTo(6);
        assertThat(grams(1, "tblsp", "honey", 169640).grams()).isEqualTo(21);
        assertThat(grams(1, "tbsp", "honey", 169640).how()).isEqualTo(Grams.How.PORTION);
    }

    @Test
    void millilitresUseTheFoodsDensityWhereItHasOneAndWatersOtherwise() {
        // Milk: 1 cup = 244 g, so 250 ml is a little over 250 g.
        assertThat(grams(250, "ml", "milk", 171267).grams()).isCloseTo(257.8, within(0.5));
        // Oil floats: 100 ml of it is about 92 g.
        assertThat(grams(100, "ml", "vegetable oil", 171411).grams()).isCloseTo(92, within(1.0));
        assertThat(grams(1, "l", "water", 173647).grams()).isCloseTo(1000, within(15.0));
    }

    @Test
    void countsUseTheFoodsOwnSizes() {
        assertThat(grams(2, null, "onions", 170000).grams()).isEqualTo(220);         // 1 medium = 110 g
        assertThat(grams(1, "large", "onion", 170000).grams()).isEqualTo(150);
        assertThat(grams(3, null, "large eggs", 171287).grams()).isEqualTo(150);
        assertThat(grams(2, "cloves", "garlic", 169230).grams()).isEqualTo(6);
        assertThat(grams(4, "slices", "bread", 174924).grams()).isEqualTo(116);
        assertThat(grams(1, "stick", "butter", 173410).grams()).isEqualTo(113);
    }

    @Test
    void countsWithNoMeasureUseAUsualSizeAndSaySo() {
        Grams.Amount breasts = grams(2, null, "chicken breasts", 171077);
        assertThat(breasts.grams()).isEqualTo(350);
        assertThat(breasts.how()).isEqualTo(Grams.How.TYPICAL);
        assertThat(breasts.estimated()).isTrue();
        assertThat(grams(1, "stick", "celery", 169988).grams()).isEqualTo(40);  // its own "stalk" measure
    }

    @Test
    void tinsAreAStandard400gAndDrainedFoodsAreWhatIsLeft() {
        assertThat(grams(1, "tin", "chopped tomatoes", 170051).grams()).isEqualTo(400);
        assertThat(grams(1, "can", "chickpeas", 173800).grams()).isEqualTo(240);
    }

    @Test
    void vagueAmountsAreRoughButNotNothing() {
        Grams.Amount knob = grams(1, "knob", "butter", 173410);
        assertThat(knob.grams()).isEqualTo(12);
        assertThat(knob.how()).isEqualTo(Grams.How.ROUGH);
        assertThat(grams(1, "pinch", "salt", 173468).grams()).isEqualTo(0.4);
        assertThat(grams(2, "handfuls", "spinach", 168462).grams()).isEqualTo(60);
        // A splash is 10 ml, weighed with the food's density.
        assertThat(grams(1, "splash", "milk", 171267).grams()).isCloseTo(10.3, within(0.1));
    }

    @Test
    void anAmountThatCannotHonestlyBeWeighedIsLeftOut() {
        assertThat(Grams.of(1, "jar", "pesto", table.find(171413).orElseThrow())).isEmpty();
        assertThat(Grams.of(0, "g", "flour", table.find(168894).orElseThrow())).isEmpty();
        assertThat(Grams.of(1, "wibble", "flour", table.find(168894).orElseThrow())).isEmpty();
    }

    @Test
    void unitsAreReadTheWayRecipesWriteThem() {
        assertThat(Grams.unitKey("Tablespoons")).isEqualTo("tbsp");
        assertThat(Grams.unitKey("tbls")).isEqualTo("tbsp");
        assertThat(Grams.unitKey("teaspoon")).isEqualTo("tsp");
        assertThat(Grams.unitKey("fl oz")).isEqualTo("floz");
        assertThat(Grams.unitKey("Litres")).isEqualTo("l");
        assertThat(Grams.unitKey("tins")).isEqualTo("can");
        assertThat(Grams.unitKey("rashers")).isEqualTo("slice");
        assertThat(Grams.unitKey("cloves")).isEqualTo("clove");
        assertThat(Grams.unitKey(null)).isEqualTo("");
        assertThat(Grams.unitKey("ct")).isEqualTo("");
    }

    @Test
    void someonesOwnFigureReplacesTheRules() {
        Grams.Amount learned = Grams.learned(2, "knobs", 15, "estimated");
        assertThat(learned.grams()).isEqualTo(30);
        assertThat(learned.unitKey()).isEqualTo("knob");
        assertThat(learned.estimated()).isFalse();
    }

    // A recipe's totals

    @Test
    void aRecipeAddsUpItsLinesAndListsWhatItLeftOut() {
        RecipeNutrition maths = new RecipeNutrition(null, null, table, null, null);
        var sum = maths.add(List.of(
                line("chicken breast", "400", "g", 171077, false, true),
                line("eggs", "2", null, 171287, false, true),
                line("olive oil", "2", "tbsp", 171413, false, true),
                line("salt", null, null, 173468, false, true),
                line("coriander", "1", "bunch", 169997, true, false),
                line("paper towels", "1", null, null, false, true)));

        // 400 g chicken (480) + 2 large eggs (143) + 27 g oil (238.7).
        assertThat(sum.total().kcal()).isCloseTo(480 + 143 + 238.7, within(0.5));
        assertThat(sum.counted()).hasSize(3);
        assertThat(sum.optionalLeftOut()).extracting(RecipeNutrition.Line::name).containsExactly("coriander");
        assertThat(sum.noAmount()).extracting(RecipeNutrition.Line::name).containsExactly("salt");
        assertThat(sum.noMatch()).extracting(RecipeNutrition.Line::name).containsExactly("paper towels");
        assertThat(RecipeNutrition.note(sum)).isEqualTo("Figures are estimates from ingredient data. "
                + "Optional coriander not counted. Salt has no amount, so isn't counted. "
                + "Paper towels isn't in the food data yet.");
    }

    @Test
    void anOptionalLineIsCountedWhenThisOccasionIncludesIt() {
        RecipeNutrition maths = new RecipeNutrition(null, null, table, null, null);
        var sum = maths.add(List.of(line("coriander", "1", "bunch", 169997, true, true)));
        assertThat(sum.counted()).hasSize(1);
        assertThat(sum.total().kcal()).isCloseTo(30 * 0.23, within(0.1));
    }

    // Labels

    @Test
    void theMacroSplitIsByCaloriesAndAddsUpTo100() {
        // The mockup's Greek yogurt: 17 g protein, 6 g carbs, 0.7 g fat.
        var split = NutritionLabels.split(new Nutrients(97.0, 17.0, 6.0, 0.7, null, null, null, null, null, null, null, null));
        assertThat(split.protein() + split.carbs() + split.fat()).isEqualTo(100);
        assertThat(split.protein()).isEqualTo(69);
        assertThat(split.fat()).isEqualTo(6);
    }

    @Test
    void badgesFollowTheClaimRulesAndTheTrafficLights() {
        var yogurt = new Nutrients(57.0, 10.0, 3.6, 0.2, 0.0, 3.6, 40.0, 0.1, null, null, null, null);
        assertThat(NutritionLabels.badges(yogurt, false)).extracting(NutritionDtos.Badge::label)
                .contains("High protein", "Fat free", "Low sugar", "Low salt");
        var nutella = new Nutrients(539.0, 6.3, 57.5, 30.9, 0.0, 56.3, 43.0, 10.6, null, null, null, null);
        assertThat(NutritionLabels.badges(nutella, false)).extracting(NutritionDtos.Badge::key)
                .contains("high-fat", "high-saturates", "high-sugar").doesNotContain("high-protein");
        // A drink is held to half the sugar: 10 g in 100 ml is red, in 100 g it would not be.
        var juice = new Nutrients(45.0, 0.5, 10.4, 0.2, null, 12.0, 1.0, null, null, null, null, null);
        assertThat(NutritionLabels.badges(juice, true)).extracting(NutritionDtos.Badge::key).contains("high-sugar");
        assertThat(NutritionLabels.badges(juice, false)).extracting(NutritionDtos.Badge::key).doesNotContain("high-sugar");
    }

    @Test
    void percentagesAreOfTheReferenceDay() {
        var meal = new Nutrients(512.0, 41.0, 9.0, 34.0, null, null, 1000.0, null, null, null, null, null);
        var pct = NutritionLabels.percentOf(meal, NutritionLabels.REFERENCE_DAY);
        assertThat(pct.kcal()).isEqualTo(26);
        assertThat(pct.protein()).isEqualTo(82);
        assertThat(pct.saltG()).isEqualTo(42);
    }

    @Test
    void theSummaryIsPlainWordsAboutTheServing() {
        var chicken = new Nutrients(512.0, 41.0, 9.0, 34.0, 1.0, null, null, null, null, null, null, null);
        assertThat(NutritionLabels.summary(chicken)).isEqualTo("High protein, low carb. A filling meal.");
        assertThat(NutritionLabels.summary(Nutrients.NONE)).isNull();
    }

    private static Grams.Amount grams(double quantity, String unit, String name, int fdcId) {
        return Grams.of(quantity, unit, name, table.find(fdcId).orElseThrow()).orElseThrow();
    }

    private static Nutrients nutrients(double quantity, String unit, String name, int fdcId) {
        Food food = table.find(fdcId).orElseThrow();
        return food.per100g().scaled(grams(quantity, unit, name, fdcId).grams() / 100);
    }

    private static RecipeNutrition.Line line(String name, String quantity, String unit, Integer fdcId, boolean optional,
                                             boolean included) {
        Food food = fdcId == null ? null : table.find(fdcId).orElseThrow();
        var match = new IngredientMatches.Match(UUID.randomUUID(), food, food == null ? 0.1 : 0.95,
                IngredientFoodMatch.Source.AUTO);
        return new RecipeNutrition.Line(UUID.randomUUID(), null, name, quantity == null ? null : new BigDecimal(quantity),
                unit, null, optional, included, match, null);
    }
}
