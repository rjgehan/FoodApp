package com.gehan.mealplanner.service;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.gehan.mealplanner.domain.StoreSection.*;
import static org.assertj.core.api.Assertions.assertThat;

class StarterCupboardTest {

    /** A starter nobody can place would sit in Unsorted in a brand new house, waiting on Sort. */
    @Test
    void everyStarterLandsInAnAisle() {
        List<String> unplaced = StarterCupboard.GROUPS.stream()
                .flatMap(g -> g.items().stream())
                .filter(name -> StoreSectionKeywords.guess(name).isEmpty())
                .toList();
        assertThat(unplaced).isEmpty();
    }

    @Test
    void theAislesAreTheOnesYouWouldLookIn() {
        assertThat(StoreSectionKeywords.guess("all-purpose flour")).contains(BAKING);
        assertThat(StoreSectionKeywords.guess("bay leaves")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("cooking spray")).contains(DRY_GOODS);
        assertThat(StoreSectionKeywords.guess("italian seasoning")).contains(SPICES);
        assertThat(StoreSectionKeywords.guess("plain yogurt")).contains(DAIRY);
        assertThat(StoreSectionKeywords.guess("onions")).contains(PRODUCE);
        for (String name : group("Baking")) {
            assertThat(StoreSectionKeywords.guess(name)).as(name).contains(BAKING);
        }
        for (String name : group("Spices")) {
            assertThat(StoreSectionKeywords.guess(name)).as(name).contains(SPICES);
        }
        for (String name : group("Fridge")) {
            assertThat(StoreSectionKeywords.guess(name)).as(name).contains(DAIRY);
        }
        for (String name : group("Oils & vinegars")) {
            assertThat(StoreSectionKeywords.guess(name)).as(name).contains(DRY_GOODS);
        }
    }

    @Test
    void noNameIsOfferedTwice() {
        Set<String> seen = new HashSet<>();
        StarterCupboard.GROUPS.stream()
                .flatMap(g -> g.items().stream())
                .forEach(name -> assertThat(seen.add(IngredientService.normalize(name))).as(name).isTrue());
        assertThat(seen).hasSizeBetween(50, 90);
    }

    private static List<String> group(String name) {
        return StarterCupboard.GROUPS.stream().filter(g -> g.name().equals(name)).findFirst().orElseThrow().items();
    }
}
