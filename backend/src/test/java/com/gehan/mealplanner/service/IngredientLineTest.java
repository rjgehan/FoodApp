package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

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
}
