package com.gehan.mealplanner.mealplans;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * A loose spelling of an ingredient for asking "is it in the cupboard?". The cupboard and
 * recipes share ingredients already, so the same row is the usual answer; this catches the
 * rest — "Chickpeas (tin)" in the cupboard and "chickpeas" in the curry, "baby spinach" and
 * "spinach", "eggs" and "large eggs" — without guessing that coconut milk is milk.
 *
 * Only words that never change what the thing is are dropped (sizes, colours of the same
 * vegetable, fresh, tinned, organic), and only the last word is made singular.
 */
public final class IngredientKeys {

    private static final Set<String> MODIFIERS = Set.of(
            "fresh", "large", "small", "medium", "big", "baby", "free-range", "free", "range", "organic",
            "tinned", "canned", "tin", "tins", "can", "cans", "of", "jar", "jarred", "pack", "packet", "bag",
            "red", "white", "yellow", "brown", "golden", "cherry", "plum", "vine", "ripe",
            "whole", "skinless", "boneless", "unsalted", "salted", "extra", "virgin", "raw", "british", "italian",
            "chopped", "diced", "sliced", "grated", "a", "the", "some");

    /** Things nobody shops for to make one meal: never "missing", never "from the cupboard". */
    private static final Set<String> FREE = Set.of(
            "water", "ice", "ice cube", "boiling water", "cold water", "warm water", "hot water",
            "salt", "sea salt", "table salt", "kosher salt", "salt and pepper", "salt & pepper",
            "black pepper", "ground black pepper", "pepper to taste");

    private IngredientKeys() {
    }

    public static boolean isFree(String name) {
        if (name == null) return true;
        String plain = name.toLowerCase(Locale.ROOT).replaceAll("\\(.*?\\)", " ").replaceAll("\\s+", " ").trim();
        return FREE.contains(plain) || FREE.contains(key(name));
    }

    public static String key(String name) {
        if (name == null) return "";
        String s = name.toLowerCase(Locale.ROOT)
                .replaceAll("\\(.*?\\)", " ")
                .replaceAll("[^\\p{L}\\p{N}& ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        List<String> words = new ArrayList<>();
        for (String word : s.split(" ")) {
            if (!word.isEmpty() && !MODIFIERS.contains(word)) words.add(word);
        }
        if (words.isEmpty()) {
            // Everything was a modifier ("red", "white"): keep what was written.
            return s;
        }
        int last = words.size() - 1;
        words.set(last, singular(words.get(last)));
        return String.join(" ", words);
    }

    static String singular(String word) {
        if (word.length() <= 3) return word;
        if (word.endsWith("ies")) return word.substring(0, word.length() - 3) + "y";
        if (word.endsWith("oes")) return word.substring(0, word.length() - 2);
        if (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes") || word.endsWith("sses")) {
            return word.substring(0, word.length() - 2);
        }
        if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
        if (word.endsWith("s")) return word.substring(0, word.length() - 1);
        return word;
    }
}
