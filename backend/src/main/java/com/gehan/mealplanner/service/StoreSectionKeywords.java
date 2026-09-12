package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.StoreSection;

import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.gehan.mealplanner.domain.StoreSection.*;

/**
 * A free first pass at which aisle something is in. It covers the few hundred things most lists
 * are made of, so the Gemini sort — twenty requests a day, shared with the recipe writer — only
 * ever sees what this could not place.
 *
 * Three passes, most specific first. Phrases, because "ice cream" and "peanut butter" are not
 * cream or butter. Then words that describe the form, because "frozen peas" are in Frozen and
 * "chicken broth" is on a shelf, not at the meat counter. Then the food itself, reading from the
 * end of the name since that is where English puts the thing: "cheddar cheese", "chicken thighs".
 *
 * A wrong guess costs one tap to fix, and the fix sticks; a missing one just waits for Sort.
 */
final class StoreSectionKeywords {

    private StoreSectionKeywords() {
    }

    private static final Map<String, StoreSection> PHRASES = new HashMap<>();
    private static final Map<String, StoreSection> FORMS = new HashMap<>();
    private static final Map<String, StoreSection> FOODS = new HashMap<>();

    /** Longest first, so "sweet potato" is tried before anything shorter could claim it. */
    private static final List<String> PHRASES_LONGEST_FIRST;

    static {
        phrases(FROZEN, "ice cream", "frozen yogurt", "ice pop", "tater tot", "french fry", "fish stick");
        phrases(DRY_GOODS, "peanut butter", "almond butter", "black pepper", "bread crumb", "coconut milk",
                "baking soda", "chocolate chip", "graham cracker", "rolled oat", "cream of mushroom",
                "cream of chicken", "pie filling", "sweetened condensed milk", "evaporated milk");
        phrases(DAIRY, "sour cream", "cream cheese", "heavy cream", "whipping cream", "half and half",
                "cottage cheese", "egg white", "almond milk", "oat milk", "soy milk");
        phrases(PRODUCE, "green onion", "spring onion", "bell pepper", "red pepper", "green pepper",
                "lemon juice", "lime juice", "sweet potato", "green bean", "bean sprout", "baby spinach");
        phrases(DELI, "deli meat", "lunch meat", "sliced turkey", "rotisserie chicken");
        phrases(MEAT, "ground beef", "ground turkey", "ground pork", "ground chicken", "ground lamb");
        phrases(DRINKS, "sparkling water", "orange juice", "apple juice", "cranberry juice");
        phrases(BAKERY, "english muffin", "hamburger bun", "hot dog bun", "pita bread", "flour tortilla",
                "corn tortilla");
        phrases(HOUSEHOLD, "paper towel", "toilet paper", "trash bag", "garbage bag", "dish soap",
                "aluminum foil", "plastic wrap", "sandwich bag", "zip bag", "laundry detergent",
                "hand soap", "parchment paper", "dishwasher pod");

        words(FORMS, FROZEN, "frozen");
        words(FORMS, DRY_GOODS, "canned", "dried", "broth", "stock", "bouillon", "sauce", "paste", "powder",
                "flake", "seasoning", "extract", "oil", "vinegar", "syrup", "mix", "flour", "sugar", "spice",
                "dressing", "marinade", "jarred");
        words(FORMS, DRINKS, "juice", "soda");

        words(FOODS, PRODUCE, "apple", "banana", "orange", "lemon", "lime", "grape", "strawberry", "blueberry",
                "raspberry", "blackberry", "berry", "cherry", "peach", "pear", "plum", "mango", "pineapple",
                "watermelon", "melon", "cantaloupe", "kiwi", "avocado", "tomato", "potato", "onion", "shallot",
                "garlic", "ginger", "carrot", "celery", "cucumber", "zucchini", "squash", "pumpkin", "eggplant",
                "broccoli", "cauliflower", "cabbage", "lettuce", "romaine", "spinach", "kale", "arugula", "chard",
                "jalapeno", "mushroom", "corn", "asparagus", "beet", "radish", "turnip", "parsnip", "leek",
                "scallion", "cilantro", "parsley", "basil", "mint", "dill", "rosemary", "thyme", "sage", "chive",
                "herb", "sprout", "salad", "fruit", "vegetable", "veggie", "yam", "okra", "artichoke", "fennel",
                "grapefruit", "apricot", "nectarine", "pomegranate", "fig", "tofu", "clementine", "tangerine");
        words(FOODS, BAKERY, "bread", "baguette", "bun", "roll", "bagel", "croissant", "muffin", "tortilla",
                "pita", "naan", "brioche", "sourdough", "ciabatta", "loaf", "pastry", "donut", "doughnut");
        words(FOODS, DRY_GOODS, "pasta", "spaghetti", "penne", "macaroni", "noodle", "lasagna", "linguine",
                "fettuccine", "rice", "quinoa", "couscous", "oat", "oatmeal", "cereal", "granola", "bean", "lentil",
                "chickpea", "salt", "cumin", "paprika", "oregano", "cinnamon", "nutmeg", "turmeric", "cayenne",
                "curry", "peppercorn", "honey", "ketchup", "mustard", "mayonnaise", "mayo", "salsa", "jam", "jelly",
                "cracker", "chip", "pretzel", "popcorn", "nut", "almond", "walnut", "pecan", "cashew", "peanut",
                "raisin", "cornstarch", "yeast", "vanilla", "cocoa", "chocolate", "coffee", "tea", "soup", "tuna",
                "cornmeal", "breadcrumb", "panko", "crouton", "olive", "pickle", "caper", "sesame", "seed",
                "stuffing", "gravy");
        words(FOODS, DELI, "salami", "prosciutto", "pepperoni", "ham", "hummus", "deli", "pastrami");
        words(FOODS, MEAT, "chicken", "beef", "pork", "steak", "bacon", "sausage", "turkey", "lamb", "veal", "fish",
                "salmon", "shrimp", "prawn", "tilapia", "cod", "crab", "lobster", "scallop", "meatball", "brisket",
                "rib", "chorizo", "mince", "drumstick", "thigh", "wing");
        words(FOODS, DAIRY, "milk", "cheese", "cheddar", "mozzarella", "parmesan", "feta", "ricotta", "brie",
                "gouda", "butter", "yogurt", "yoghurt", "cream", "egg", "margarine", "kefir", "creamer");
        words(FOODS, FROZEN, "popsicle");
        words(FOODS, DRINKS, "water", "wine", "beer", "seltzer", "lemonade", "kombucha");
        words(FOODS, HOUSEHOLD, "towel", "napkin", "tissue", "detergent", "soap", "shampoo", "conditioner",
                "toothpaste", "deodorant", "sponge", "foil", "battery", "bleach", "cleaner", "diaper", "wipe",
                "razor", "lotion", "floss");

        PHRASES_LONGEST_FIRST = PHRASES.keySet().stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .toList();
    }

    private static void phrases(StoreSection section, String... phrases) {
        for (String p : phrases) {
            PHRASES.put(p, section);
        }
    }

    private static void words(Map<String, StoreSection> into, StoreSection section, String... words) {
        for (String w : words) {
            into.put(w, section);
        }
    }

    static Optional<StoreSection> guess(String name) {
        if (name == null) {
            return Optional.empty();
        }
        String[] tokens = name.toLowerCase().replaceAll("[^a-z ]", " ").trim().split("\\s+");
        if (tokens.length == 0 || tokens[0].isEmpty()) {
            return Optional.empty();
        }
        String[] singular = Arrays.stream(tokens).map(StoreSectionKeywords::singular).toArray(String[]::new);

        String padded = " " + String.join(" ", singular) + " ";
        for (String phrase : PHRASES_LONGEST_FIRST) {
            if (padded.contains(" " + phrase + " ")) {
                return Optional.of(PHRASES.get(phrase));
            }
        }
        for (String token : singular) {
            if (FORMS.containsKey(token)) {
                return Optional.of(FORMS.get(token));
            }
        }
        for (int i = singular.length - 1; i >= 0; i--) {
            if (FOODS.containsKey(singular[i])) {
                return Optional.of(FOODS.get(singular[i]));
            }
            if (FOODS.containsKey(tokens[i])) {
                return Optional.of(FOODS.get(tokens[i]));
            }
        }
        return Optional.empty();
    }

    /** Good enough English plurals for grocery words: berries, tomatoes, peaches, eggs. */
    private static String singular(String word) {
        if (word.length() > 4 && word.endsWith("ies")) {
            return word.substring(0, word.length() - 3) + "y";
        }
        if (word.length() > 4 && word.endsWith("oes")) {
            return word.substring(0, word.length() - 2);
        }
        if (word.length() > 4 && (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes"))) {
            return word.substring(0, word.length() - 2);
        }
        if (word.length() > 3 && word.endsWith("s") && !word.endsWith("ss")) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }
}
