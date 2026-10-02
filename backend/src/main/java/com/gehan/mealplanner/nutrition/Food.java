package com.gehan.mealplanner.nutrition;

import java.util.List;

/**
 * A USDA food as the app uses it: what 100 g of it holds, and its household measures.
 *
 * @param source "sr" (SR Legacy) or "fo" (Foundation Foods)
 */
public record Food(int fdcId, String source, String category, String name, Nutrients per100g, List<Portion> portions) {

    /** "1 large" = 50 g. amount is how many of the measure the grams weigh — "0.5 cup" is 0.5. */
    public record Portion(double amount, String label, double grams) {

        public double gramsEach() {
            return amount > 0 ? grams / amount : grams;
        }

        /** "1 large", "0.5 cup, chopped". */
        public String text() {
            String n = amount == Math.rint(amount) ? String.valueOf((long) amount) : String.valueOf(amount);
            return n + " " + label;
        }
    }
}
