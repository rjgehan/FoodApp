package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static com.gehan.mealplanner.domain.StoreSection.*;
import static org.assertj.core.api.Assertions.assertThat;

class StoreSectionKeywordsTest {

    @Test
    void placesTheFoodByTheLastWordItKnows() {
        assertThat(StoreSectionKeywords.guess("Cheddar Cheese")).contains(DAIRY);
        assertThat(StoreSectionKeywords.guess("chicken thighs")).contains(MEAT);
        assertThat(StoreSectionKeywords.guess("strawberries")).contains(PRODUCE);
        assertThat(StoreSectionKeywords.guess("tomatoes")).contains(PRODUCE);
        assertThat(StoreSectionKeywords.guess("eggs")).contains(DAIRY);
        assertThat(StoreSectionKeywords.guess("tortillas")).contains(BAKERY);
        assertThat(StoreSectionKeywords.guess("hummus")).contains(DELI);
    }

    @Test
    void theFormBeatsTheFood() {
        assertThat(StoreSectionKeywords.guess("frozen peas")).contains(FROZEN);
        assertThat(StoreSectionKeywords.guess("chicken broth")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("tomato sauce")).contains(DRY_GOODS);
    }

    @Test
    void spicesHaveTheirOwnAisle() {
        assertThat(StoreSectionKeywords.guess("garlic powder")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("salt")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("black pepper")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("red pepper flakes")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("ground cumin")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("dried oregano")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("taco seasoning")).contains(SPICES);
        // Fresh is still produce.
        assertThat(StoreSectionKeywords.guess("fresh basil")).contains(PRODUCE);
        assertThat(StoreSectionKeywords.guess("red pepper")).contains(PRODUCE);
    }

    @Test
    void bakingHasItsOwnAisle() {
        assertThat(StoreSectionKeywords.guess("almond flour")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("brown sugar")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("vanilla extract")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("baking soda")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("chocolate chips")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("yeast")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("sugar snap peas")).contains(PRODUCE);
    }

    @Test
    void phrasesBeatTheirWords() {
        assertThat(StoreSectionKeywords.guess("ice cream")).contains(FROZEN);
        assertThat(StoreSectionKeywords.guess("peanut butter")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("sour cream")).contains(DAIRY);
        assertThat(StoreSectionKeywords.guess("ground beef")).contains(MEAT);
        assertThat(StoreSectionKeywords.guess("green onions")).contains(PRODUCE);
        assertThat(StoreSectionKeywords.guess("paper towels")).contains(HOUSEHOLD);
        assertThat(StoreSectionKeywords.guess("lemon juice")).contains(PRODUCE);
        assertThat(StoreSectionKeywords.guess("flour tortillas")).contains(BAKERY);
    }

    @Test
    void leavesWhatItDoesNotKnowForSort() {
        assertThat(StoreSectionKeywords.guess("gochujang")).isEmpty();
        assertThat(StoreSectionKeywords.guess("")).isEmpty();
        assertThat(StoreSectionKeywords.guess(null)).isEqualTo(Optional.empty());
    }
}
