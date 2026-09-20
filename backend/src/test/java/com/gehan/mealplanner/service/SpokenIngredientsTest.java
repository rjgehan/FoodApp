package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reading the shopping list out of somebody talking. Every case here is a line a real cook
 * actually said in a video this was measured against.
 */
class SpokenIngredientsTest {

    private static GeneratedIngredient find(List<GeneratedIngredient> all, String name) {
        return all.stream().filter(i -> i.ingredientName().equalsIgnoreCase(name)).findFirst()
                .orElseThrow(() -> new AssertionError("no " + name + " in " + names(all)));
    }

    private static List<String> names(List<GeneratedIngredient> all) {
        return all.stream().map(GeneratedIngredient::ingredientName).toList();
    }

    @Test
    void readsTheAmountsACookSaysOutLoud() {
        List<GeneratedIngredient> found = SpokenIngredients.from("""
                Cut each half into wedges, get them into a bowl with a little bit of oil, a decent \
                pinch of kosher salt and a light sprinkling of brown sugar. While those are in the \
                oven, I can small dice, 1/2 a Spanish onion, mince 4 garlic cloves. Then after \
                about 10 to 20 seconds, I'll add a cup of chicken stock. Turn the heat off and add \
                one can of drained and rinsed cannellini beans. Hit this with a shot of vinegar, a \
                couple handfuls of baby spinach.
                """);

        assertThat(find(found, "kosher salt").unit()).isEqualTo("pinch");
        assertThat(find(found, "chicken stock").quantity()).isEqualByComparingTo(BigDecimal.ONE);
        assertThat(find(found, "chicken stock").unit()).isEqualTo("cup");
        assertThat(find(found, "baby spinach").quantity()).isEqualByComparingTo(new BigDecimal("2"));
        assertThat(find(found, "baby spinach").unit()).isEqualTo("handful");

        // "1/2 a Spanish onion": the number sits one word further back than usual.
        assertThat(find(found, "Spanish onion").quantity()).isEqualByComparingTo(new BigDecimal("0.5"));
        assertThat(find(found, "garlic cloves").quantity()).isEqualByComparingTo(new BigDecimal("4"));

        // A comma is the only thing separating the onion from the garlic.
        assertThat(names(found)).noneMatch(n -> n.toLowerCase().contains("mince"));
        // You buy the tin, not the draining of it.
        assertThat(find(found, "cannellini beans").unit()).isEqualTo("can");
        // "a little bit of oil" is a measurement of nothing.
        assertThat(find(found, "oil").quantity()).isNull();
    }

    @Test
    void doesNotShopForTheEquipment() {
        // A towel and a peeler are in the aisle list too, and nobody is cooking them.
        List<GeneratedIngredient> found = SpokenIngredients.from("""
                Take off the top and the bottom. Then you can just go at this whole thing with a \
                vegetable peeler. We're gonna cut it directly in half and I like to use a clean \
                kitchen towel to push down on my knife. Stand your wedges up on a lined cookie \
                sheet and go into a 375 degree oven.
                """);

        assertThat(names(found)).noneMatch(n -> n.toLowerCase().matches(".*(towel|peeler|knife|sheet|oven).*"));
    }

    @Test
    void leavesOutTheWordsThatAreAlsoSomethingToDo() {
        // "Mix" and "mince" are both in the food list; neither is a thing to buy.
        assertThat(names(SpokenIngredients.from("Mix them up. Season it well. Slice it thinly.")))
                .isEmpty();
    }

    @Test
    void doesNotListTheSameThingTwiceBecauseItWasMentionedAgain() {
        // A cook says "chicken stock" once and "the stock" three times after that.
        List<GeneratedIngredient> found = SpokenIngredients.from("""
                I'll add a cup of chicken stock. Once your stock is reduced by about half its \
                volume, turn the heat off. Sweat the Onions in a little olive oil, and the onion \
                will soften. Use 1/2 a Spanish onion.
                """);

        assertThat(names(found)).containsExactlyInAnyOrder("chicken stock", "olive oil", "Spanish onion");
    }

    @Test
    void saysNothingRatherThanGuessing() {
        assertThat(SpokenIngredients.from(null)).isEmpty();
        assertThat(SpokenIngredients.from("  ")).isEmpty();
        assertThat(SpokenIngredients.from("stop scrolling, this is the best thing I have ever made")).isEmpty();
    }
}
