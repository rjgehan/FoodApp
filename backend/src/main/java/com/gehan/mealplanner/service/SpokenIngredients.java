package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedIngredient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The shopping list, read out of somebody talking.
 *
 * A caption that gives the method but no ingredients used to be refused outright, and a video
 * whose recipe is entirely spoken produced no ingredient rows at all — which is the whole
 * point of the app. Everything needed is said out loud: "a cup of chicken stock", "1/2 a
 * Spanish onion", "a decent pinch of kosher salt".
 *
 * No model. The words for food already exist in {@link StoreSectionKeywords}, which is what
 * separates "a light sprinkling of brown sugar" from "a clean kitchen towel" — a towel is in
 * that list too, filed under household, and nobody is cooking it. {@link IngredientLine} then
 * does the arithmetic exactly, as it does everywhere else.
 *
 * This is a guess about English, so it aims to be worth showing rather than complete. What it
 * misses, a person adds; what it invents, they would have to delete, so it would rather say
 * nothing than make something up.
 */
final class SpokenIngredients {

    private SpokenIngredients() {
    }

    /** How a cook measures out loud. These become the unit. */
    private static final Set<String> MEASURES = Set.of(
            "cup", "cups", "pinch", "pinches", "can", "cans", "tin", "tins", "handful", "handfuls",
            "sprig", "sprigs", "clove", "cloves", "slice", "slices", "stick", "sticks", "knob",
            "knobs", "wedge", "wedges", "head", "heads", "bunch", "bunches", "block", "blocks",
            "packet", "packets", "package", "jar", "jars", "bottle", "bottles", "tablespoon",
            "tablespoons", "teaspoon", "teaspoons", "tbsp", "tsp", "gram", "grams", "kilo",
            "kilos", "ounce", "ounces", "pound", "pounds", "litre", "litres", "liter", "liters",
            "spoonful", "spoonfuls", "shot", "shots", "glug", "glugs", "sprinkling", "drizzle",
            "dash", "splash");

    /** Said to mean "not much", and worth nothing as a number. */
    private static final Set<String> VAGUE = Set.of("bit", "bits", "little", "touch", "lot", "lots");

    private static final Map<String, String> NUMBER_WORDS = Map.ofEntries(
            Map.entry("a", "1"), Map.entry("an", "1"), Map.entry("one", "1"), Map.entry("two", "2"),
            Map.entry("three", "3"), Map.entry("four", "4"), Map.entry("five", "5"),
            Map.entry("six", "6"), Map.entry("seven", "7"), Map.entry("eight", "8"),
            Map.entry("nine", "9"), Map.entry("ten", "10"), Map.entry("twelve", "12"),
            Map.entry("half", "0.5"), Map.entry("couple", "2"), Map.entry("few", "3"));

    /**
     * Words that end a name on the left. Anything else unknown is kept, because that is where
     * "kosher", "brown", "Spanish", "cannellini" and "butternut" live — the words that make an
     * ingredient the one you actually buy.
     */
    private static final Set<String> BOUNDARIES = Set.of(
            "the", "a", "an", "your", "my", "our", "his", "her", "their", "its", "this", "that",
            "these", "those", "some", "any", "of", "with", "in", "on", "into", "onto", "over",
            "under", "from", "to", "for", "at", "by", "and", "or", "but", "so", "then", "if",
            "when", "while", "until", "before", "after", "is", "are", "was", "were", "be", "been",
            "it", "them", "they", "you", "we", "i", "he", "she", "get", "got", "just", "about",
            "like", "really", "very", "also", "now", "up", "down", "out", "off", "back", "here",
            "there", "much", "more", "most", "all", "each", "every", "both", "than", "as");

    /**
     * A food word that is also the thing you do with it. "Mix them up" is not an ingredient,
     * and neither is "mince 4 garlic cloves" — the garlic is. They only count with an amount.
     */
    private static final Set<String> ALSO_VERBS = Set.of(
            "mix", "mince", "juice", "zest", "water", "butter", "oil", "cream", "salt", "pepper",
            "season", "stock", "chip", "slice", "dice", "roll", "grate");

    /** What the food is being done with, not what goes in it. */
    private static final Set<String> TOOLS = Set.of(
            "peeler", "masher", "grater", "knife", "board", "towel", "sheet", "tray", "bowl",
            "pan", "pot", "oven", "skillet", "spoon", "whisk", "blender", "processor", "mixer",
            "scoop", "brush", "rack", "dish", "plate", "juicer", "press", "zester", "mill");

    /** What was done to it before it went in. Not part of what you buy. */
    private static final Set<String> PREPARED = Set.of(
            "drained", "rinsed", "chopped", "minced", "diced", "sliced", "grated", "crushed",
            "peeled", "cooked", "cubed", "shredded", "melted", "softened", "beaten", "ground",
            "roasted", "toasted", "washed", "trimmed", "halved", "quartered", "leftover");

    /** Too general to buy on their own, unless somebody counted them out. */
    private static final Set<String> TOO_GENERAL = Set.of(
            "seed", "seeds", "herb", "herbs", "fruit", "vegetable", "vegetables", "veggie",
            "veggies", "salad", "meat", "nut", "nuts", "sauce", "spice", "spices", "leaf", "leaves");

    /** Long enough to be a name, short enough not to swallow the sentence. */
    private static final int MOST_MODIFIERS = 3;

    static List<GeneratedIngredient> from(String spoken) {
        if (spoken == null || spoken.isBlank()) return List.of();

        // Keep the first mention of each thing, and prefer one that came with an amount.
        Map<String, IngredientLine> found = new LinkedHashMap<>();
        for (String sentence : spoken.split("[.!?\\n]")) {
            for (IngredientLine line : inSentence(sentence)) {
                String key = line.name().toLowerCase();
                IngredientLine already = found.get(key);
                if (already == null || (already.quantity() == null && line.quantity() != null)) {
                    found.put(key, line);
                }
            }
        }

        List<GeneratedIngredient> out = new ArrayList<>();
        for (IngredientLine line : found.values()) {
            // A cook says "chicken stock" once and "the stock" four times after that. The bare
            // word is the same shopping-list line, so it is not a second one.
            if (line.quantity() == null && saidMoreFullyElsewhere(line.name(), found.keySet())) continue;
            out.add(new GeneratedIngredient(line.name(), line.quantity(), line.unit()));
        }
        return out;
    }

    private static boolean saidMoreFullyElsewhere(String name, Iterable<String> all) {
        String padded = " " + singularise(name) + " ";
        for (String other : all) {
            if (other.equalsIgnoreCase(name)) continue;
            if ((" " + singularise(other) + " ").contains(padded)) return true;
        }
        return false;
    }

    /** So "Onions" and "Spanish onion" are not two things to buy. */
    private static String singularise(String text) {
        List<String> out = new ArrayList<>();
        for (String word : text.toLowerCase().split("\\s+")) {
            out.add(word.length() > 3 && word.endsWith("s") && !word.endsWith("ss")
                    ? word.substring(0, word.length() - 1) : word);
        }
        return String.join(" ", out);
    }

    /**
     * "A little bit OF oil" is a thing; "oil the pan" is an act. The word in front settles it:
     * after "of" or a determiner, even a word that doubles as a verb is being named.
     */
    private static boolean isNamedHere(String[] words, int at) {
        if (at == 0) return false;
        String before = clean(words[at - 1]);
        return before.equals("of") || before.equals("the") || before.equals("a") || before.equals("an")
                || before.equals("some") || before.equals("your") || before.equals("my");
    }

    /** A comma or a full stop: the cook has moved on to the next thing. */
    private static boolean endsAClause(String word) {
        String trimmed = word.strip();
        if (trimmed.isEmpty()) return false;
        char last = trimmed.charAt(trimmed.length() - 1);
        return last == ',' || last == ';' || last == ':' || last == '.';
    }

    private static List<IngredientLine> inSentence(String sentence) {
        String[] words = sentence.trim().split("\\s+");
        List<IngredientLine> out = new ArrayList<>();

        int at = 0;
        while (at < words.length) {
            if (!isFood(words[at])) {
                at++;
                continue;
            }

            // "a vegetable peeler" is not an ingredient, it is what you hold.
            if (at + 1 < words.length && TOOLS.contains(clean(words[at + 1]))) {
                at++;
                continue;
            }

            // "chicken stock", "olive oil": two food words in a row are one ingredient — but
            // only inside one breath. "1/2 a Spanish onion, mince 4 garlic cloves" is two.
            int end = at;
            while (end + 1 < words.length && !endsAClause(words[end]) && isFood(words[end + 1])) end++;

            int start = leftEdgeOf(words, at);
            String name = join(words, start, end);
            String amount = amountBefore(words, start);

            boolean bare = start == at && end == at;
            if (amount.isEmpty() && bare
                    && ((ALSO_VERBS.contains(clean(words[at])) && !isNamedHere(words, at))
                        || TOO_GENERAL.contains(clean(words[at])))) {
                at = end + 1;
                continue;
            }

            out.add(IngredientLine.of((amount.isEmpty() ? "" : amount + " ") + name));
            at = end + 1;
        }
        return out;
    }

    /**
     * How far left the name runs. "kosher salt", "baby spinach", "drained and rinsed cannellini
     * beans" — an unknown word in front of a food is describing it. One "and" may be crossed,
     * because a cook says two things about the same tin.
     */
    private static int leftEdgeOf(String[] words, int food) {
        int start = food;
        int taken = 0;
        int i = food - 1;
        boolean crossedAnd = false;
        while (i >= 0 && taken < MOST_MODIFIERS) {
            String word = clean(words[i]);
            if (word.isEmpty()) break;
            // "1/2 a Spanish onion, mince 4 garlic cloves" — the comma is the whole reason
            // the onion and the garlic are two things.
            if (endsAClause(words[i])) break;
            if ((word.equals("and") || word.equals("or")) && !crossedAnd && taken > 0 && i > 0
                    && !BOUNDARIES.contains(clean(words[i - 1]))) {
                crossedAnd = true;
                i--;
                continue;
            }
            if (BOUNDARIES.contains(word) || MEASURES.contains(word) || VAGUE.contains(word)
                    || NUMBER_WORDS.containsKey(word) || isNumber(word)) {
                break;
            }
            start = i;
            taken++;
            i--;
        }
        return start;
    }

    /**
     * The amount in front of the name: "a cup of", "1/2 a", "4", "a decent pinch of".
     *
     * Returned as the text a recipe would have written, so IngredientLine does the parsing —
     * one place where "1/2" becomes a half and nowhere else.
     */
    private static String amountBefore(String[] words, int nameStart) {
        int i = nameStart - 1;
        // "a cup OF chicken stock"
        boolean viaOf = i >= 0 && clean(words[i]).equals("of");
        if (viaOf) i--;

        String unit = null;
        if (i >= 0 && MEASURES.contains(clean(words[i]))) {
            unit = clean(words[i]);
            i--;
        } else if (i >= 0 && VAGUE.contains(clean(words[i]))) {
            // "a little bit of oil" measures nothing at all.
            i--;
            while (i >= 0 && (VAGUE.contains(clean(words[i])) || clean(words[i]).equals("a"))) i--;
            return "";
        } else if (viaOf) {
            return "";
        }

        // "a decent pinch", "a light sprinkling": whatever it was, it was one of them.
        int adjectives = 0;
        while (i >= 0 && unit != null && adjectives < 2 && !NUMBER_WORDS.containsKey(clean(words[i]))
                && !isNumber(clean(words[i])) && !BOUNDARIES.contains(clean(words[i]))) {
            i--;
            adjectives++;
        }

        String number = null;
        if (i >= 0) {
            String word = clean(words[i]);
            if (isNumber(word)) {
                number = word;
            } else if (NUMBER_WORDS.containsKey(word)) {
                // "a" only counts as one when it is counting something.
                if (!word.equals("a") && !word.equals("an") || unit != null) number = NUMBER_WORDS.get(word);
            }
        }
        // "1/2 a Spanish onion": the number is one word further back.
        if (number == null && i >= 1 && (clean(words[i]).equals("a") || clean(words[i]).equals("an"))
                && isNumber(clean(words[i - 1]))) {
            number = clean(words[i - 1]);
        }

        if (number == null && unit == null) return "";
        if (number == null) number = "1";
        return unit == null ? number : number + " " + unit;
    }

    private static boolean isFood(String word) {
        return StoreSectionKeywords.namesFood(clean(word));
    }

    private static boolean isNumber(String word) {
        return word.matches("\\d+(?:[./]\\d+)?");
    }

    /** The word itself: no commas, no full stops, no "375-degree". */
    private static String clean(String word) {
        return word.toLowerCase().replaceAll("^[^a-z0-9/]+|[^a-z0-9/]+$", "");
    }

    private static String join(String[] words, int from, int to) {
        List<String> parts = new ArrayList<>();
        for (int i = from; i <= to; i++) {
            String word = words[i].replaceAll("^[^\\p{L}0-9]+|[^\\p{L}0-9]+$", "");
            if (!word.isEmpty()) parts.add(word);
        }
        // "drained and rinsed cannellini beans" is a tin of cannellini beans.
        while (!parts.isEmpty() && (PREPARED.contains(parts.get(0).toLowerCase())
                || parts.get(0).equalsIgnoreCase("and") || parts.get(0).equalsIgnoreCase("or"))) {
            parts.remove(0);
        }
        return String.join(" ", parts);
    }
}
