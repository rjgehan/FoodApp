package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The shapes real recipes are written in. Every case here came from an actual page, and most
 * of them from a bug: a language model read "1/3 cup parmesan cheese" as one parmesan cheese,
 * and the first version of this parser read "56 oz crushed tomatoes ((2, 28 oz cans))" as
 * "crushed tomatoes ((2".
 */
class IngredientLineTest {

    @Test
    void readsAPlainAmount() {
        IngredientLine line = IngredientLine.of("2 lb chicken");
        assertThat(line.quantity()).hasToString("2");
        assertThat(line.unit()).isEqualTo("lb");
        assertThat(line.name()).isEqualTo("chicken");
    }

    @Test
    void readsAFraction() {
        IngredientLine line = IngredientLine.of("1/3 cup parmesan cheese");
        assertThat(line.quantity().doubleValue()).isCloseTo(0.333, org.assertj.core.data.Offset.offset(0.001));
        assertThat(line.unit()).isEqualTo("cup");
        assertThat(line.name()).isEqualTo("parmesan cheese");
    }

    @Test
    void readsAMixedFraction() {
        IngredientLine line = IngredientLine.of("1 1/2 cups flour");
        assertThat(line.quantity().doubleValue()).isEqualTo(1.5);
        assertThat(line.unit()).isEqualTo("cup");
        assertThat(line.name()).isEqualTo("flour");
    }

    @Test
    void readsAFractionGlyph() {
        assertThat(IngredientLine.of("½ tsp salt").quantity().doubleValue()).isEqualTo(0.5);
        assertThat(IngredientLine.of("1½ cups milk").quantity().doubleValue()).isEqualTo(1.5);
    }

    @Test
    void readsANumberWeldedToItsUnit() {
        IngredientLine line = IngredientLine.of("400g tinned tomatoes");
        assertThat(line.quantity()).hasToString("400");
        assertThat(line.unit()).isEqualTo("g");
        assertThat(line.name()).isEqualTo("tinned tomatoes");
    }

    @Test
    void keepsACommaInsideBracketsOutOfTheName() {
        IngredientLine line = IngredientLine.of("56 oz crushed tomatoes ((2, 28 oz cans))");
        assertThat(line.name()).isEqualTo("crushed tomatoes");
        assertThat(line.unit()).isEqualTo("oz");
        assertThat(line.quantity()).hasToString("56");
    }

    @Test
    void takesNotesFromAfterACommaAndFromBrackets() {
        IngredientLine line = IngredientLine.of("2 yellow onions (about 1 lb), diced");
        assertThat(line.name()).isEqualTo("yellow onions");
        assertThat(line.notes()).contains("about 1 lb").contains("diced");
    }

    @Test
    void marksToTasteAsOptionalRatherThanPartOfTheName() {
        IngredientLine line = IngredientLine.of("1 tbsp sugar or to taste");
        assertThat(line.name()).isEqualTo("sugar");
        assertThat(line.unit()).isEqualTo("tbsp");
        assertThat(line.optional()).isTrue();
    }

    @Test
    void leavesAWordThatIsNotAUnitInTheName() {
        IngredientLine line = IngredientLine.of("2 large eggs");
        assertThat(line.quantity()).hasToString("2");
        assertThat(line.unit()).isNull();
        assertThat(line.name()).isEqualTo("large eggs");
    }

    @Test
    void copesWithNoAmountAtAll() {
        IngredientLine line = IngredientLine.of("salt and pepper");
        assertThat(line.quantity()).isNull();
        assertThat(line.name()).isEqualTo("salt and pepper");
    }

    @Test
    void takesTheLowerBoundOfARange() {
        // Real captions say "6-8 garlic cloves". Dropping the line lost the main ingredient.
        IngredientLine cloves = IngredientLine.of("6-8 garlic cloves, roughly chopped");
        assertThat(cloves.quantity()).hasToString("6");
        assertThat(cloves.name()).isEqualTo("garlic cloves");

        IngredientLine chicken = IngredientLine.of("1kg-1.2kg chicken thighs");
        assertThat(chicken.quantity()).hasToString("1");
        assertThat(chicken.unit()).isEqualTo("kg");
        assertThat(chicken.name()).isEqualTo("chicken thighs");
    }

    @Test
    void readsARangeWrittenOutInWords() {
        IngredientLine line = IngredientLine.of("1 to 2 garlic cloves");
        assertThat(line.quantity()).hasToString("1");
        assertThat(line.name()).isEqualTo("garlic cloves");
        // "2 to 3 tbsp oil" keeps its unit.
        assertThat(IngredientLine.of("2 to 3 tbsp olive oil").unit()).isEqualTo("tbsp");
    }

    @Test
    void stripsTheBulletAnIngredientListIsWrittenWith() {
        assertThat(IngredientLine.of("- 3 tbsp butter").name()).isEqualTo("butter");
        assertThat(IngredientLine.of("• 3 tbsp butter").unit()).isEqualTo("tbsp");
    }

    @Test
    void readsTheShorthandRealSitesUse() {
        // Both found by running the importer over real recipe sites and reading the output.

        // American recipes abbreviate cup to a single letter, and it was staying in the name.
        IngredientLine cup = IngredientLine.of("1 1/2 c. cherry tomatoes");
        assertThat(cup.quantity()).isEqualByComparingTo(new BigDecimal("1.5"));
        assertThat(cup.unit()).isEqualTo("cup");
        assertThat(cup.name()).isEqualTo("cherry tomatoes");

        // "2 x 400g cans": the count, the size of each tin, then what is in them. The name
        // used to start with the x, and the tin size was the only thing resembling a unit.
        IngredientLine tins = IngredientLine.of("2 x 400g cans chopped tomatoes");
        assertThat(tins.quantity()).isEqualByComparingTo(new BigDecimal("2"));
        assertThat(tins.unit()).isEqualTo("can");
        assertThat(tins.name()).isEqualTo("chopped tomatoes");
        assertThat(tins.notes()).contains("400g");

        // The multiplication sign, which is what a tidier site writes.
        assertThat(IngredientLine.of("2 \u00D7 400g tins tomatoes").unit()).isEqualTo("can");
    }

    @Test
    void unitsAddUpOnlyWhenTheyAreTheSameThing() {
        assertThat(IngredientLine.sameUnit("cups", "Cup")).isTrue();
        assertThat(IngredientLine.sameUnit("lbs", "lb")).isTrue();
        assertThat(IngredientLine.sameUnit(null, " ")).isTrue();

        // A tablespoon is three teaspoons, and "T" and "t" are how recipes tell them apart.
        assertThat(IngredientLine.sameUnit("T", "t")).isFalse();
        assertThat(IngredientLine.sameUnit("T", "tbsp")).isTrue();
        assertThat(IngredientLine.sameUnit("t", "tsp")).isTrue();

        // Units the list does not know still match their plural, so buying "2 bags" of flour
        // adds to the cupboard's "1 bag".
        assertThat(IngredientLine.sameUnit("bag", "Bags")).isTrue();
        assertThat(IngredientLine.sameUnit("box", "boxes")).isTrue();
        assertThat(IngredientLine.sameUnit("glass", "glasses")).isTrue();
        assertThat(IngredientLine.sameUnit("bag", "box")).isFalse();

        // What a share is remembered under reads back as itself.
        for (String unit : new String[] {"T", "t", "Bags", "boxes", "glass", "cups", "pcs"}) {
            String once = IngredientLine.canonicalUnit(unit);
            assertThat(IngredientLine.canonicalUnit(once)).as(unit).isEqualTo(once);
        }
    }
}
