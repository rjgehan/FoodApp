package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.StoreSection;
import org.junit.jupiter.api.Test;

import java.util.List;
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
        assertThat(StoreSectionKeywords.guess("garlic powder")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("tomato sauce")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("almond flour")).contains(DRY_GOODS);
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
        assertThat(StoreSectionKeywords.guess("nutritional yeast flakes")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("gochujang")).isEmpty();
        assertThat(StoreSectionKeywords.guess("")).isEmpty();
        assertThat(StoreSectionKeywords.guess(null)).isEqualTo(Optional.empty());
    }

    @Test
    void storedOrderAlwaysHoldsEverySectionOnce() {
        List<StoreSection> order = StoreSection.orderFrom("FROZEN,PRODUCE,FROZEN,NOT_A_SECTION");
        assertThat(order).startsWith(FROZEN, PRODUCE).hasSize(StoreSection.values().length).doesNotHaveDuplicates();
        assertThat(StoreSection.orderFrom(null)).containsExactly(StoreSection.values());
        assertThat(StoreSection.toStored(List.of(DELI))).startsWith("DELI,PRODUCE,BAKERY");
    }
}
