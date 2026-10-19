package com.gehan.mealplanner.receipts;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Which chain a shop is, by its name, so that what every household paid at Kings meets on the
 * store map however each one's receipts spelled it. A receipt is headed with the chain's name and
 * the chain sets the prices, so "ShopRite of Hoboken" is every ShopRite, and "KINGS FOOD MARKETS"
 * is "Kings": the words every grocer uses ("market", "foods", "the") and a trailing "of <town>"
 * are set aside, and what is left is the chain.
 *
 * The iPhone's StoreMatch says the same names the same way, word for word, to find the chain's
 * stores on Apple Maps; change one and change the other.
 */
final class StoreChains {

    private static final Set<String> GENERIC = Set.of(
            "the", "food", "foods", "market", "markets", "supermarket", "supermarkets", "grocery",
            "groceries", "store", "stores", "inc", "co", "llc");

    private StoreChains() {
    }

    /** "shoprite", "whole", "trader joes" — empty for a name with no letters or digits in it. */
    static String key(String name) {
        if (name == null) {
            return "";
        }
        String folded = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replace("'", "")
                .replace("’", "")
                .replace("&", " and ");
        List<String> words = Arrays.stream(folded.split("[^\\p{L}\\p{N}]+")).filter(w -> !w.isEmpty()).toList();
        // "ShopRite of Hoboken": the town is which branch, not which shop.
        int of = words.indexOf("of");
        if (of > 0) {
            words = words.subList(0, of);
        }
        List<String> kept = words.stream().filter(w -> !GENERIC.contains(w)).toList();
        // A name that is nothing but grocer's words ("The Food Market") is its own chain, as it stands.
        return String.join(" ", kept.isEmpty() ? words : kept);
    }
}
