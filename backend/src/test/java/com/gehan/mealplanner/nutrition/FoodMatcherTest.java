package com.gehan.mealplanner.nutrition;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Matching recipe names to USDA foods, against the real bundled table — the names are ones that
 * really turn up in this app's recipes, British and American.
 */
class FoodMatcherTest {

    static FoodTable table;
    static FoodMatcher matcher;

    @BeforeAll
    static void load() throws Exception {
        table = new FoodTable(UsdaTableLoader.bundled());
        matcher = new FoodMatcher(table);
    }

    @Test
    void theBundledTableIsTheWholeOfBothDatasets() {
        assertThat(table.size()).isGreaterThan(8000);
        Food chicken = table.find(171077).orElseThrow();
        assertThat(chicken.name()).startsWith("Chicken, broiler or fryers, breast, skinless");
        assertThat(chicken.category()).isEqualTo("Poultry Products");
        assertThat(table.find(171287).orElseThrow().portions())
                .extracting(Food.Portion::text).contains("1 large", "1 medium");
    }

    @Test
    void everyHandPickedStapleIsInTheTable() {
        for (Map.Entry<Integer, List<String>> staple : Staples.all().entrySet()) {
            assertThat(table.find(staple.getKey())).as("fdc %d for %s", staple.getKey(), staple.getValue()).isPresent();
        }
    }

    @Test
    void noTwoStaplesClaimTheSameName() {
        Map<String, Integer> seen = new java.util.HashMap<>();
        List<String> clashes = new java.util.ArrayList<>();
        for (Map.Entry<Integer, List<String>> staple : Staples.all().entrySet()) {
            for (String name : staple.getValue()) {
                Integer before = seen.put(Staples.key(name), staple.getKey());
                if (before != null && !before.equals(staple.getKey())) {
                    clashes.add("'" + name + "' (" + Staples.key(name) + ") is claimed by " + before + " and " + staple.getKey());
                }
            }
        }
        assertThat(clashes).isEmpty();
    }

    @Test
    void stapleNamesFindTheBasicRawFood() {
        assertThat(best("eggs")).isEqualTo(171287);
        assertThat(best("Large Eggs")).isEqualTo(171287);
        assertThat(best("chicken breasts")).isEqualTo(171077);
        assertThat(best("finely chopped onion")).isEqualTo(170000);
        assertThat(best("extra virgin olive oil")).isEqualTo(171413);
        assertThat(best("semi-skimmed milk")).isEqualTo(171267);
        assertThat(best("minced beef")).isEqualTo(171796);
        assertThat(best("aubergines")).isEqualTo(169228);
        assertThat(best("courgette")).isEqualTo(169291);
        assertThat(best("tinned chickpeas")).isEqualTo(173800);
        assertThat(best("chopped tomatoes")).isEqualTo(170051);
        assertThat(best("cherry tomatoes")).isEqualTo(170457);
        assertThat(matcher.best("garlic").confidence()).isGreaterThanOrEqualTo(0.9);
    }

    @Test
    void namesWithoutAStapleAreStillFoundByTheirWords() {
        assertThat(name("pork belly")).startsWith("Pork").contains("belly");
        assertThat(name("beef brisket")).startsWith("Beef, brisket");
        assertThat(name("pecan nuts")).contains("pecans");
        assertThat(name("jerusalem artichokes")).startsWith("Jerusalem-artichokes");
        assertThat(name("hoisin sauce")).startsWith("Sauce, hoisin");
        // British for navy beans.
        assertThat(name("haricot beans")).startsWith("Beans, navy");
    }

    @Test
    void theLastWordIsTheThingAndShapeWordsCountForLittle() {
        assertThat(name("rice vinegar")).startsWith("Vinegar");
        assertThat(name("mozzarella balls")).startsWith("Cheese, mozzarella");
    }

    @Test
    void brandsAndRestaurantFoodsLoseToThePlainFood() {
        assertThat(name("coffee")).startsWith("Beverages, coffee");
        assertThat(FoodMatcher.branded("SILK Coffee, soymilk")).isTrue();
        assertThat(FoodMatcher.branded("Beef, ground, 85% lean meat / 15% fat, raw (Includes foods for USDA's Food Distribution Program)")).isFalse();
    }

    @Test
    void somethingThatIsNotAFoodIsNotCounted() {
        assertThat(matcher.best("paper towels").confidence()).isLessThan(FoodMatcher.COUNTABLE);
        // One letter from "carissa", a plum: a near-miss in spelling alone is never trusted.
        assertThat(matcher.best("harissa").confidence()).isLessThan(FoodMatcher.COUNTABLE);
        assertThat(matcher.best("xyzzy sauce").confidence()).isLessThan(FoodMatcher.COUNTABLE);
    }

    @Test
    void butterBeansAreLimaBeansNotGreenBeans() {
        assertThat(best("butter beans")).isEqualTo(174254);
        assertThat(best("tinned butter beans")).isEqualTo(174254);
    }

    @Test
    void britishNamesUSDAHasNoRowForUseTheNearestStandIn() {
        assertThat(best("crème fraîche")).isEqualTo(170858);
        assertThat(best("halloumi")).isEqualTo(2647442);
        assertThat(best("garam masala")).isEqualTo(170924);
        // An ordinary cube, with an ordinary cube's salt; low-salt only when it says so.
        assertThat(best("chicken stock cube")).isEqualTo(171563);
        assertThat(best("stock cubes")).isEqualTo(171563);
        assertThat(best("low salt stock cube")).isEqualTo(171613);
        assertThat(best("cooked chicken")).isEqualTo(171054);
    }

    @Test
    void aModelsPickMustShareARealWordWithTheLine() {
        // What an iPhone's model picked for lines that are no food: refused.
        assertThat(FoodMatcher.sharesARealWord("grandma's secret mix", food("Snacks, trail mix, regular"))).isFalse();
        assertThat(FoodMatcher.sharesARealWord("xyzzy sauce", food("Sauce, barbecue"))).isFalse();
        // A real choice between close foods: taken.
        assertThat(FoodMatcher.sharesARealWord("curry paste", table.find(170924).orElseThrow())).isTrue();
        assertThat(FoodMatcher.sharesARealWord("chicken thighs, skin on", table.find(172385).orElseThrow())).isTrue();
        assertThat(FoodMatcher.sharesARealWord("parmesean", table.find(171247).orElseThrow())).isTrue();
        // And the matcher itself thinks little of them.
        assertThat(matcher.shortlist("grandma's secret mix")).allMatch(c -> c.confidence() < 0.4);
    }

    @Test
    void offalAndHumanMilkComeLastUnlessTheyAreAskedFor() {
        List<String> milk = matcher.shortlist("milk").stream().map(c -> c.food().name()).toList();
        assertThat(milk.subList(0, 2)).allMatch(n -> n.startsWith("Milk, reduced fat") || n.startsWith("Milk, whole"));
        assertThat(milk).noneMatch(n -> n.contains("human"));
        List<String> chicken = matcher.shortlist("chicken").stream().map(c -> c.food().name()).toList();
        assertThat(chicken.subList(0, 4)).noneMatch(n -> n.contains("giblets") || n.contains("capons"));
        assertThat(chicken.subList(0, 4)).anyMatch(n -> n.contains("breast") || n.contains("thigh"));
        assertThat(name("chicken livers")).startsWith("Chicken, liver");
    }

    @Test
    void theShortlistIsDistinctAndLeadsWithTheMatch() {
        List<FoodMatcher.Candidate> list = matcher.shortlist("greek yogurt");
        assertThat(list).hasSize(FoodMatcher.SHORTLIST);
        assertThat(list.get(0).food().fdcId()).isEqualTo(171304);
        assertThat(list.stream().map(c -> c.food().name().toLowerCase()).distinct().count()).isEqualTo(list.size());
    }

    @Test
    void wordsAreMadeSingularAndBritishNamesAmerican() {
        assertThat(FoodWords.queryWords("Finely chopped Tomatoes")).containsExactly("tomato");
        assertThat(FoodWords.queryWords("raspberries")).containsExactly("raspberry");
        assertThat(FoodWords.queryWords("courgettes")).containsExactly("zucchini");
        assertThat(FoodWords.queryWords("double cream")).containsExactly("heavy", "cream");
        assertThat(FoodWords.singular("hummus")).isEqualTo("hummus");
        assertThat(FoodWords.oneEditApart("parmesean", "parmesan")).isTrue();
        assertThat(FoodWords.oneEditApart("onion", "union")).isTrue();
        assertThat(FoodWords.oneEditApart("onion", "lemon")).isFalse();
    }

    private static int best(String name) {
        return matcher.best(name).food().fdcId();
    }

    private static String name(String query) {
        return matcher.best(query).food().name();
    }

    private static Food food(String name) {
        return table.all().stream().filter(f -> f.name().equals(name)).findFirst().orElseThrow();
    }
}
