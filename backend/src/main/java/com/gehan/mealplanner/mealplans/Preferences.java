package com.gehan.mealplanner.mealplans;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The preference chips on "New meal plan" (mockup 5.11), checked against a recipe's name and
 * ingredients. Some rule recipes out (no pork, vegetarian); others only lean the choice (budget,
 * heart healthy). Words, not a database of products: "chicken" means meat, "coconut milk" does
 * not mean dairy, and anybody can add their own word to avoid.
 */
public final class Preferences {

    public record Option(String key, String label, boolean shown) {
    }

    /** In the order the form shows them; the rest come from "+ Add". */
    public static final List<Option> OPTIONS = List.of(
            new Option("no-pork", "No pork", true),
            new Option("dairy-ok", "Dairy ok", true),
            new Option("under-30", "Under 30 min", true),
            new Option("vegetarian", "Vegetarian", true),
            new Option("budget", "Budget", true),
            new Option("vegan", "Vegan", false),
            new Option("pescatarian", "Pescatarian", false),
            new Option("no-beef", "No beef", false),
            new Option("dairy-free", "Dairy-free", false),
            new Option("heart-healthy", "Heart healthy", false),
            new Option("high-protein", "High protein", false));

    public static final Set<String> KEYS = OPTIONS.stream().map(Option::key)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());

    private static Pattern words(String alternatives) {
        return Pattern.compile("\\b(" + alternatives + ")");
    }

    static final Pattern PORK = words("pork|bacon|ham\\b|gammon|chorizo|salami|pepperoni|pancetta|prosciutto|lardons?|lard\\b"
            + "|sausage|nduja|'nduja|guanciale|spare ?ribs");
    static final Pattern BEEF = words("beef|steak|veal|brisket|oxtail|bresaola");
    static final Pattern MEAT = words("chicken|beef|pork|lamb|mutton|veal|turkey|duck|goose|venison|rabbit|bacon|ham\\b|gammon"
            + "|sausage|chorizo|salami|pepperoni|pancetta|prosciutto|lardons?|lard\\b|mince\\b|minced (beef|lamb|pork|meat)"
            + "|steak|meatballs?|liver|kidney|gelatine?|suet|bone broth|chicken stock|beef stock|nduja|guanciale|brisket");
    static final Pattern FISH = words("fish|salmon|tuna|cod\\b|haddock|mackerel|sardines?|anchov|prawns?|shrimps?|crab|lobster"
            + "|mussels?|clams?|scallops?|squid|calamari|octopus|hake|trout|sea bass|pollock|oysters?|kipper|caviar|roe\\b");
    static final Pattern DAIRY = words("milk|cheese|butter|cream|yogh?urt|crème fraîche|creme fraiche|ghee|paneer|mozzarella"
            + "|cheddar|parmesan|parmigiano|pecorino|feta|ricotta|halloumi|mascarpone|quark|kefir|whey|gruy[eè]re|brie|camembert");
    static final Pattern EGG = words("eggs?\\b|mayonnaise|mayo\\b|meringue");
    static final Pattern HONEY = words("honey");
    /** Plant milks, nut butters and the like, taken out before looking for dairy (and eggplant for eggs). */
    static final Pattern NOT_DAIRY = Pattern.compile("\\b(coconut|almond|oat|soya?|rice|cashew|peanut|nut|cocoa|shea) "
            + "(milk|butter|cream|yogh?urt|cheese)|butter ?beans?|butternut|cream of tartar|eggplant|ice cream sandwich");

    static final Pattern PRICEY = words("steak|fillet steak|salmon|prawns?|shrimps?|lamb|duck|scallops?|lobster|crab|venison"
            + "|pine nuts|saffron|truffle|sea bass|halibut|monkfish");
    static final Pattern CHEAP = words("lentils?|beans?|chickpeas?|eggs?\\b|rice|pasta|potato|oats|porridge|cabbage|carrots?|onions?"
            + "|tinned tomatoes|chopped tomatoes|noodles");
    static final Pattern HEART_GOOD = words("salmon|mackerel|sardines?|trout|fish|lentils?|beans?|chickpeas?|oats|olive oil"
            + "|walnuts?|almonds?|spinach|kale|broccoli|tomato|wholemeal|whole ?grain|brown rice|quinoa");

    private final Set<String> keys;
    private final List<String> avoid;

    public Preferences(Collection<String> keys, Collection<String> avoid) {
        this.keys = new LinkedHashSet<>();
        if (keys != null) keys.forEach(k -> this.keys.add(k.trim().toLowerCase(Locale.ROOT)));
        this.avoid = avoid == null ? List.of() : avoid.stream()
                .map(a -> a.trim().toLowerCase(Locale.ROOT)).filter(a -> !a.isEmpty()).toList();
    }

    public boolean has(String key) {
        return keys.contains(key);
    }

    /**
     * Whether a recipe is allowed at all.
     *
     * @param words   its name and ingredients, lower-cased (see RecipePool.PoolRecipe#words)
     * @param minutes prep + cook, or null when the recipe doesn't say
     */
    public boolean allows(String words, Integer minutes) {
        String w = words.toLowerCase(Locale.ROOT);
        String noPlant = NOT_DAIRY.matcher(w).replaceAll(" ");
        boolean meat = MEAT.matcher(w).find(), fish = FISH.matcher(w).find();
        if (has("vegan") && (meat || fish || DAIRY.matcher(noPlant).find() || EGG.matcher(noPlant).find()
                || HONEY.matcher(w).find())) return false;
        if (has("vegetarian") && (meat || fish)) return false;
        if (has("pescatarian") && meat) return false;
        if (has("no-pork") && PORK.matcher(w).find()) return false;
        if (has("no-beef") && BEEF.matcher(w).find()) return false;
        if (has("dairy-free") && !has("dairy-ok") && DAIRY.matcher(noPlant).find()) return false;
        if (has("under-30") && minutes != null && minutes > 30) return false;
        for (String a : avoid) {
            if (Pattern.compile("\\b" + Pattern.quote(a)).matcher(w).find()) return false;
        }
        return true;
    }

    /**
     * The leaning, added to a candidate's score: cheap staples for a budget, fish and beans over
     * saturated fat and salt for a heart, more protein per calorie when protein is asked for.
     */
    public double lean(String words, Integer minutes, double kcal, double protein, Double satFat, Double sodiumMg) {
        String w = words.toLowerCase(Locale.ROOT);
        double score = 0;
        if (has("budget")) {
            if (PRICEY.matcher(w).find()) score -= 1.5;
            if (CHEAP.matcher(w).find()) score += 0.5;
        }
        if (has("heart-healthy")) {
            if (satFat != null && satFat > 6) score -= 1.5;
            if (sodiumMg != null && sodiumMg > 1000) score -= 1;
            if (HEART_GOOD.matcher(w).find()) score += 0.5;
        }
        if (has("high-protein") && kcal > 0 && protein * 4 / kcal >= 0.25) score += 1;
        if (has("under-30") && minutes == null) score -= 0.5;
        return score;
    }
}
