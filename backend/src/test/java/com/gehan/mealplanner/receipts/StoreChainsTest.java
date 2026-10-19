package com.gehan.mealplanner.receipts;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Which chain a shop's name is — the same words the iPhone's StoreMatch uses to find it on the map. */
class StoreChainsTest {

    @Test
    void aReceiptsHeadingAndTheMapsNameAreTheSameChain() {
        assertThat(StoreChains.key("KINGS FOOD MARKETS")).isEqualTo("kings");
        assertThat(StoreChains.key("Kings")).isEqualTo("kings");
        assertThat(StoreChains.key("ShopRite of Hoboken")).isEqualTo("shoprite");
        assertThat(StoreChains.key("Whole Foods Market")).isEqualTo("whole");
        assertThat(StoreChains.key("Trader Joe's")).isEqualTo("trader joes");
        assertThat(StoreChains.key("Trader Joe’s")).isEqualTo("trader joes");
        assertThat(StoreChains.key("Stop & Shop")).isEqualTo("stop and shop");
        assertThat(StoreChains.key("  Café Grocery  ")).isEqualTo("cafe");
    }

    @Test
    void aNameOfNothingButGrocersWordsIsItsOwnChain() {
        assertThat(StoreChains.key("The Food Market")).isEqualTo("the food market");
    }

    @Test
    void aNameWithNoWordsInItIsNoChain() {
        assertThat(StoreChains.key("")).isEmpty();
        assertThat(StoreChains.key(" - ")).isEmpty();
        assertThat(StoreChains.key(null)).isEmpty();
    }
}
