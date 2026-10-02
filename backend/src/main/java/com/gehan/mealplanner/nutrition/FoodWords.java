package com.gehan.mealplanner.nutrition;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Turning an ingredient's name and a USDA food's name into comparable words.
 *
 * Both sides go through the same singular-making, so "tomatoes" meets "Tomatoes, red, ripe" and
 * "berries" meets "berry" without either being a perfect English singulariser. Recipes in this
 * app are mostly written in British English and USDA is American, so the British names are
 * rewritten first ("aubergine" → "eggplant", "minced beef" → "ground beef").
 */
final class FoodWords {

    private FoodWords() {
    }

    /** Whole phrases first (longest first matters: "double cream" before "cream"). */
    private static final List<Map.Entry<String, String>> PHRASES = List.of(
            Map.entry("minced beef", "ground beef"), Map.entry("beef mince", "ground beef"),
            Map.entry("minced pork", "ground pork"), Map.entry("pork mince", "ground pork"),
            Map.entry("minced lamb", "ground lamb"), Map.entry("lamb mince", "ground lamb"),
            Map.entry("minced turkey", "ground turkey"), Map.entry("turkey mince", "ground turkey"),
            Map.entry("minced chicken", "ground chicken"), Map.entry("chicken mince", "ground chicken"),
            Map.entry("double cream", "heavy cream"), Map.entry("whipping cream", "heavy whipping cream"),
            Map.entry("single cream", "light cream"), Map.entry("plain flour", "all purpose flour"),
            Map.entry("self raising flour", "self rising flour"), Map.entry("strong white flour", "bread flour"),
            Map.entry("strong flour", "bread flour"), Map.entry("wholemeal flour", "whole grain flour"),
            Map.entry("caster sugar", "granulated sugar"), Map.entry("icing sugar", "powdered sugar"),
            Map.entry("tomato puree", "tomato paste"), Map.entry("bicarbonate of soda", "baking soda"),
            Map.entry("bicarb", "baking soda"), Map.entry("spring onion", "scallion"),
            Map.entry("green onion", "scallion"), Map.entry("black pudding", "blood sausage"),
            Map.entry("natural yoghurt", "plain yogurt"), Map.entry("natural yogurt", "plain yogurt"),
            Map.entry("semi skimmed", "reduced fat 2%"), Map.entry("skimmed milk", "nonfat milk"),
            // In a British recipe "chopped tomatoes" is a tin; in an American one, so are crushed and diced.
            Map.entry("finely chopped tomato", "tomato"), Map.entry("roughly chopped tomato", "tomato"),
            Map.entry("fresh chopped tomato", "tomato"), Map.entry("chopped fresh tomato", "tomato"),
            Map.entry("chopped tomatoes", "canned tomatoes"), Map.entry("chopped tomato", "canned tomatoes"),
            Map.entry("crushed tomatoes", "canned tomatoes"), Map.entry("diced tomatoes", "canned tomatoes"),
            Map.entry("tinned", "canned"), Map.entry("streaky bacon", "bacon"), Map.entry("back bacon", "bacon"));

    /** Single words, after the phrases. */
    private static final Map<String, String> WORDS = Map.ofEntries(
            Map.entry("aubergine", "eggplant"), Map.entry("courgette", "zucchini"), Map.entry("prawn", "shrimp"),
            Map.entry("rocket", "arugula"), Map.entry("chilli", "chili"), Map.entry("chillies", "chili"),
            Map.entry("chile", "chili"), Map.entry("beetroot", "beet"), Map.entry("swede", "rutabaga"),
            Map.entry("yoghurt", "yogurt"), Map.entry("cornflour", "cornstarch"), Map.entry("rapeseed", "canola"),
            Map.entry("sweetcorn", "corn"), Map.entry("mince", "ground"), Map.entry("wholemeal", "whole wheat"),
            Map.entry("capsicum", "pepper"), Map.entry("pitta", "pita"), Map.entry("filo", "phyllo"),
            Map.entry("haricot", "navy"),  Map.entry("garbanzo", "chickpea"),
            Map.entry("sultana", "raisin"), Map.entry("gammon", "ham"), Map.entry("porridge", "oat"),
            Map.entry("tin", "can"), Map.entry("mangetout", "snow pea"), Map.entry("spaghetti", "pasta"), Map.entry("penne", "pasta"),
            Map.entry("fusilli", "pasta"), Map.entry("linguine", "pasta"), Map.entry("tagliatelle", "pasta"),
            Map.entry("rigatoni", "pasta"), Map.entry("macaroni", "pasta"), Map.entry("lasagne", "pasta"),
            Map.entry("lasagna", "pasta"), Map.entry("fettuccine", "pasta"), Map.entry("orzo", "pasta"));

    /**
     * How a recipe describes the state of something on the way into the pan. Dropped from the
     * name before matching: "finely chopped onion" is an onion.
     */
    static final Set<String> DESCRIPTIVE = Set.of(
            "fresh", "freshly", "chopped", "finely", "roughly", "coarsely", "thinly", "thickly", "diced", "sliced",
            "cubed", "grated", "crushed", "minced", "peeled", "deseeded", "halved", "quartered", "trimmed", "washed",
            "rinsed", "softened", "melted", "beaten", "whisked", "sifted", "ripe", "large", "small", "medium", "big",
            "extra", "good", "quality", "organic", "free", "range", "of", "a", "an", "the", "for", "to", "taste",
            "some", "few", "cold", "warm", "room", "temperature", "plus", "serve", "serving", "optional", "packed",
            "heaped", "level", "boiling", "handful", "pinch", "x", "and", "or", "into", "in", "cut", "pieces",
            "piece", "jumbo", "baby", "about", "approx", "approximately", "roasted", "torn", "shredded",
            "juiced", "squeezed", "floury", "waxy", "new", "dash", "splash", "drizzle", "knob", "inch", "cm", "thumb", "sized", "bunch",
            "sprig", "sprigs", "leaves", "leaf", "stick", "can", "jar", "pack", "packet", "bag", "tub");

    /**
     * Words in a USDA name that say nothing about which food it is — dropped before counting how
     * much more a USDA name says than the recipe did.
     */
    static final Set<String> FILLER = Set.of(
            "raw", "and", "or", "with", "without", "all", "variety", "varieties", "commercial", "includes",
            "include", "food", "usda", "distribution", "program", "for", "s", "type", "types", "the", "of", "a",
            "in", "ns", "as", "to", "added", "only", "mixed", "species", "regular", "fluid", "year", "round",
            "average", "commercially", "prepared", "plain", "whole", "fresh", "unprepared", "mature", "seed",
            "us", "grade", "solid", "solids", "salad", "cooking");

    /**
     * What shape it comes in rather than what it is. Worth a little when both sides say it
     * ("salmon fillet"), not enough to drag "mozzarella balls" over to melon balls.
     */
    static final Set<String> LIGHT = Set.of(
            "ball", "fillet", "chunk", "strip", "floret", "rasher", "sheet", "slice", "piece", "cube", "joint",
            "steak", "breast", "thigh", "leg", "wing", "cutlet", "chop", "paste", "sauce", "powder", "seed",
            "stick", "stalk", "spear");

    /**
     * The group word some USDA names start with — "Spices, garlic powder", "Nuts, almonds",
     * "Cheese, cheddar". The food is the group plus what follows, not the group alone.
     */
    static final Set<String> GROUPS = Set.of(
            "spice", "nut", "beverage", "alcoholic", "fish", "crustacean", "mollusk", "cheese", "soup", "sauce",
            "oil", "seed", "syrup", "leavening", "sugar", "salad", "cereal", "snack", "candy", "candie", "cookie",
            "cracker", "dessert", "frosting", "beef", "pork", "lamb", "veal", "chicken", "turkey", "game",
            "sausage", "fat", "margarine", "cream", "milk", "yogurt", "egg", "flour", "wheat");

    /** USDA words that mean it has been cooked or processed, unlike what a recipe usually starts from. */
    static final Set<String> PROCESSED = Set.of(
            "cooked", "boiled", "fried", "roasted", "baked", "braised", "grilled", "broiled", "stewed", "steamed",
            "microwaved", "dehydrated", "frozen", "prepared", "imitation", "babyfood", "toddler", "infant", "mix",
            "flavored", "sweetened", "heated", "simmered", "pan", "breaded", "batter", "glazed", "candied",
            "reconstituted", "condensed", "powder", "dry", "dried", "pickled", "smoked", "cured", "canned",
            "drained", "rinsed", "light", "reduced", "low", "fat", "free", "nonfat", "lowfat", "diet", "enriched",
            "fortified", "vitamin", "added", "sodium", "salt", "unsalted", "salted", "sulfured", "unsulfured",
            "stuffed", "drumstick", "wing", "back", "neck", "giblets", "skin", "patty", "loaf", "crumbles",
            "restaurant", "brand", "school", "lunch", "kids");

    private static final Set<String> KEEP_S = Set.of(
            "hummus", "asparagus", "couscous", "molasses", "swiss", "citrus", "octopus", "lentils", "grass",
            "cress", "watercress", "bass", "brussels", "chives", "this", "gas", "mass", "glass");

    /** Lowercase, accents off, punctuation to spaces, synonyms applied — but not split. */
    static String clean(String text) {
        String lowered = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replace("(includes foods for usda's food distribution program)", " ")
                .replace("'", "")
                .replaceAll("[^a-z0-9%]+", " ")
                .trim();
        String padded = " " + lowered + " ";
        for (Map.Entry<String, String> phrase : PHRASES) {
            padded = padded.replace(" " + phrase.getKey() + " ", " " + phrase.getValue() + " ")
                    .replace(" " + phrase.getKey() + "s ", " " + phrase.getValue() + " ")
                    .replace(" " + phrase.getKey() + "es ", " " + phrase.getValue() + " ");
        }
        StringBuilder out = new StringBuilder();
        for (String word : padded.trim().split(" ")) {
            if (word.isEmpty()) continue;
            String swapped = WORDS.getOrDefault(word, WORDS.getOrDefault(singular(word), word));
            if (!out.isEmpty()) out.append(' ');
            out.append(swapped);
        }
        return out.toString();
    }

    /** The words of a name, each made singular, in order, without repeats. */
    static List<String> words(String text) {
        LinkedHashSet<String> words = new LinkedHashSet<>();
        for (String word : clean(text).split(" ")) {
            if (!word.isEmpty()) words.add(singular(word));
        }
        return new ArrayList<>(words);
    }

    /** What a recipe line names, without how it was cut or how much of it there is. */
    static List<String> queryWords(String name) {
        List<String> all = words(name);
        List<String> kept = new ArrayList<>();
        for (String word : all) {
            if (!DESCRIPTIVE.contains(word) && !word.matches("\\d+(g|kg|ml|l|oz|lb)?")) kept.add(word);
        }
        return kept.isEmpty() ? all : kept;
    }

    /** Good enough to make plurals and singulars meet — both sides go through it. */
    static String singular(String word) {
        if (word.length() <= 3 || KEEP_S.contains(word)) return word;
        if (word.endsWith("ies") && word.length() > 4) return word.substring(0, word.length() - 3) + "y";
        if (word.endsWith("oes")) return word.substring(0, word.length() - 2);
        if (word.equals("leaves")) return "leaf";
        if (word.equals("halves")) return "half";
        if (word.equals("loaves")) return "loaf";
        if (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes") || word.endsWith("sses")) {
            return word.substring(0, word.length() - 2);
        }
        if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }

    /** At most one letter added, dropped or changed — "parmesean", "zuchini". */
    static boolean oneEditApart(String a, String b) {
        int la = a.length(), lb = b.length();
        if (Math.abs(la - lb) > 1) return false;
        int i = 0, j = 0, edits = 0;
        while (i < la && j < lb) {
            if (a.charAt(i) == b.charAt(j)) {
                i++;
                j++;
                continue;
            }
            if (++edits > 1) return false;
            if (la > lb) i++;
            else if (lb > la) j++;
            else {
                i++;
                j++;
            }
        }
        return edits + (la - i) + (lb - j) <= 1;
    }
}
