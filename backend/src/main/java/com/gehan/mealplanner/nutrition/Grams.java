package com.gehan.mealplanner.nutrition;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * How many grams "2 onions", "1 tbsp olive oil" or "a knob of butter" is.
 *
 * In order of how much to trust it: weights convert exactly; volumes and counts use the food's
 * own USDA measures where it has one ("1 large" egg = 50 g, "1 tbsp" olive oil = 13.5 g);
 * failing that a volume uses the food's density from any of its measures, or a typical density
 * for its kind; a count uses a small table of usual sizes; and the vague kitchen words (knob,
 * handful, splash) use a small table of their own. Anything past the first two is an estimate,
 * and says so — the iPhone can ask its model for a better one and send it back.
 */
public final class Grams {

    private Grams() {
    }

    public enum How {
        /** g, kg, oz, lb: exact. */
        WEIGHT,
        /** One of the food's own USDA measures. */
        PORTION,
        /** A volume through a density — the food's own, or a typical one for its kind. */
        VOLUME,
        /** A usual size for one of these, from the table below. */
        TYPICAL,
        /** A pinch, a knob, a handful — a rough idea, never more. */
        ROUGH,
        /** Someone (or the iPhone's model) said how much one of these weighs. */
        LEARNED
    }

    /**
     * @param gramsEach what one of the unit weighs
     * @param basis     where the weight came from, for people: "1 large = 50 g"
     */
    public record Amount(double grams, double gramsEach, String unitKey, How how, String basis) {

        public boolean estimated() {
            return how != How.WEIGHT && how != How.PORTION && how != How.LEARNED;
        }
    }

    private static final Map<String, Double> WEIGHT = Map.of(
            "g", 1.0, "kg", 1000.0, "mg", 0.001, "oz", 28.3495, "lb", 453.592);

    /**
     * Millilitres in one. Spoons are the metric 5 and 15 ml (a US spoon is within 2% of that);
     * a cup is the US cup, since recipes measured in cups are nearly all American; a pint is
     * the British 568 ml, since recipes measured in pints are nearly all British.
     */
    private static final Map<String, Double> VOLUME = Map.ofEntries(
            Map.entry("ml", 1.0), Map.entry("cl", 10.0), Map.entry("dl", 100.0), Map.entry("l", 1000.0),
            Map.entry("tsp", 5.0), Map.entry("dsp", 10.0), Map.entry("tbsp", 15.0), Map.entry("cup", 236.6),
            Map.entry("floz", 29.57), Map.entry("pint", 568.0), Map.entry("quart", 946.0),
            Map.entry("gallon", 3785.0));

    /** Rough measures: grams, or millilitres where marked in VAGUE_ML. */
    private static final Map<String, Double> VAGUE_G = Map.of(
            "pinch", 0.4, "dash", 0.6, "knob", 12.0, "handful", 30.0, "sprinkle", 2.0, "dollop", 30.0,
            "thumb", 15.0);
    private static final Map<String, Double> VAGUE_ML = Map.of(
            "splash", 10.0, "drizzle", 5.0, "glug", 15.0, "shot", 30.0, "spoonful", 15.0, "squeeze", 5.0);

    private static final Map<String, String> UNIT_WORDS = Map.ofEntries(
            Map.entry("g", "g"), Map.entry("gr", "g"), Map.entry("grm", "g"), Map.entry("gram", "g"),
            Map.entry("grams", "g"), Map.entry("gramme", "g"), Map.entry("grammes", "g"),
            Map.entry("kg", "kg"), Map.entry("kgs", "kg"), Map.entry("kilo", "kg"), Map.entry("kilos", "kg"),
            Map.entry("kilogram", "kg"), Map.entry("kilograms", "kg"), Map.entry("mg", "mg"),
            Map.entry("oz", "oz"), Map.entry("ozs", "oz"), Map.entry("ounce", "oz"), Map.entry("ounces", "oz"),
            Map.entry("lb", "lb"), Map.entry("lbs", "lb"), Map.entry("pound", "lb"), Map.entry("pounds", "lb"),
            Map.entry("ml", "ml"), Map.entry("mls", "ml"), Map.entry("millilitre", "ml"), Map.entry("millilitres", "ml"),
            Map.entry("milliliter", "ml"), Map.entry("milliliters", "ml"), Map.entry("cl", "cl"), Map.entry("dl", "dl"),
            Map.entry("l", "l"), Map.entry("litre", "l"), Map.entry("litres", "l"), Map.entry("liter", "l"),
            Map.entry("liters", "l"), Map.entry("ltr", "l"),
            Map.entry("tsp", "tsp"), Map.entry("tsps", "tsp"), Map.entry("teaspoon", "tsp"), Map.entry("teaspoons", "tsp"),
            Map.entry("tspn", "tsp"),
            Map.entry("tbsp", "tbsp"), Map.entry("tbsps", "tbsp"), Map.entry("tbs", "tbsp"), Map.entry("tbl", "tbsp"),
            Map.entry("tbls", "tbsp"), Map.entry("tblsp", "tbsp"), Map.entry("tblspn", "tbsp"), Map.entry("tbspn", "tbsp"),
            Map.entry("tablespoon", "tbsp"), Map.entry("tablespoons", "tbsp"),
            Map.entry("dsp", "dsp"), Map.entry("dessertspoon", "dsp"), Map.entry("dessertspoons", "dsp"),
            Map.entry("cup", "cup"), Map.entry("cups", "cup"), Map.entry("c", "cup"),
            Map.entry("fl oz", "floz"), Map.entry("floz", "floz"), Map.entry("fluid ounce", "floz"),
            Map.entry("fluid ounces", "floz"), Map.entry("fl. oz", "floz"),
            Map.entry("pint", "pint"), Map.entry("pints", "pint"), Map.entry("pt", "pint"),
            Map.entry("quart", "quart"), Map.entry("quarts", "quart"), Map.entry("qt", "quart"),
            Map.entry("gallon", "gallon"), Map.entry("gallons", "gallon"),
            // A count: "2 onions" has no unit at all, and these say the same.
            Map.entry("", ""), Map.entry("ct", ""), Map.entry("count", ""), Map.entry("each", ""), Map.entry("ea", ""),
            Map.entry("x", ""), Map.entry("whole", ""), Map.entry("item", ""), Map.entry("items", ""),
            Map.entry("piece", "piece"), Map.entry("pieces", "piece"), Map.entry("pc", "piece"), Map.entry("pcs", "piece"),
            Map.entry("small", "small"), Map.entry("medium", "medium"), Map.entry("med", "medium"),
            Map.entry("large", "large"), Map.entry("lge", "large"), Map.entry("lg", "large"),
            Map.entry("extra large", "extra large"), Map.entry("jumbo", "jumbo"),
            Map.entry("can", "can"), Map.entry("cans", "can"), Map.entry("tin", "can"), Map.entry("tins", "can"),
            Map.entry("package", "package"), Map.entry("packages", "package"), Map.entry("pkg", "package"),
            Map.entry("pack", "package"), Map.entry("packs", "package"), Map.entry("packet", "package"),
            Map.entry("packets", "package"), Map.entry("bag", "package"), Map.entry("bags", "package"),
            Map.entry("rasher", "slice"), Map.entry("rashers", "slice"),
            Map.entry("sprinkling", "sprinkle"), Map.entry("sprinkles", "sprinkle"),
            Map.entry("spoon", "spoonful"), Map.entry("spoons", "spoonful"), Map.entry("spoonfuls", "spoonful"),
            Map.entry("handfuls", "handful"), Map.entry("knobs", "knob"), Map.entry("pinches", "pinch"),
            Map.entry("dashes", "dash"), Map.entry("splashes", "splash"), Map.entry("glugs", "glug"),
            Map.entry("shots", "shot"), Map.entry("dollops", "dollop"), Map.entry("squeezes", "squeeze"),
            Map.entry("thumbs", "thumb"), Map.entry("leaves", "leaf"), Map.entry("sachets", "sachet"),
            Map.entry("heads", "head"));

    /** Named things you count — "2 cloves", "3 slices" — looked for among the food's measures. */
    private static final Set<String> COUNTED = Set.of(
            "clove", "slice", "stick", "head", "bunch", "wedge", "sprig", "leaf", "stalk", "fillet", "breast",
            "thigh", "link", "sheet", "ball", "bulb", "ear", "cube", "pod", "piece", "jar", "bottle", "block",
            "carton", "tub", "pot", "punnet", "loaf", "bar", "square", "can", "package", "sausage", "steak",
            "chop", "drumstick", "fruit", "segment", "floret", "spear", "strip", "rasher", "tortilla", "roll", "sachet");

    /**
     * Cuts a recipe counts the way a shop sells them, and the most one of them weighs. USDA
     * sometimes measures one as the whole side it was cut from — salmon's "0.5 fillet" is 198 g,
     * so "1 fillet" would be a 396 g side and four of them a kilo and a half; Atlantic cod's
     * "1 fillet" is 231 g where a shop's is 120–150 g. A measure heavier than this is not used to
     * count, and a shop-sized one from the tables below is used instead (and called an estimate).
     */
    private static final Map<String, Double> CUTS = Map.of(
            "fillet", 180.0, "breast", 250.0, "thigh", 200.0, "steak", 350.0, "chop", 300.0, "loin", 350.0,
            "cutlet", 200.0);

    /** When the food has no measure of that name, what one usually weighs. */
    private static final Map<String, Double> TYPICAL_UNIT = Map.ofEntries(
            Map.entry("clove", 3.0), Map.entry("slice", 25.0), Map.entry("stick", 113.0), Map.entry("wedge", 10.0),
            Map.entry("sprig", 1.0), Map.entry("leaf", 0.5), Map.entry("stalk", 40.0), Map.entry("fillet", 130.0),
            Map.entry("breast", 175.0), Map.entry("thigh", 110.0), Map.entry("link", 60.0), Map.entry("sausage", 60.0),
            Map.entry("ball", 125.0), Map.entry("cube", 10.0), Map.entry("bulb", 40.0), Map.entry("steak", 225.0),
            Map.entry("chop", 150.0), Map.entry("drumstick", 110.0), Map.entry("floret", 12.0),
            Map.entry("can", 400.0));

    /**
     * When the food has no measure for a plain count: what one of these usually weighs, by a
     * word in its name. Mostly the things USDA measures by weight but recipes count.
     */
    private static final List<Map.Entry<String, Double>> TYPICAL_ONE = List.of(
            Map.entry("garlic", 3.0), Map.entry("chicken breast", 175.0), Map.entry("chicken thigh", 110.0),
            Map.entry("drumstick", 110.0), Map.entry("sausage", 60.0), Map.entry("chorizo", 60.0),
            Map.entry("bacon", 25.0), Map.entry("salmon", 130.0), Map.entry("cod", 140.0), Map.entry("fish", 130.0),
            Map.entry("steak", 225.0), Map.entry("chop", 150.0), Map.entry("stock cube", 10.0),
            Map.entry("bouillon", 10.0), Map.entry("bay", 0.2), Map.entry("chili", 15.0), Map.entry("chilli", 15.0),
            Map.entry("spring onion", 15.0), Map.entry("scallion", 15.0), Map.entry("shallot", 30.0),
            Map.entry("tortilla", 45.0), Map.entry("pita", 60.0), Map.entry("naan", 90.0), Map.entry("bread", 36.0),
            Map.entry("egg yolk", 17.0), Map.entry("egg white", 33.0), Map.entry("egg", 50.0),
            Map.entry("lemon", 84.0), Map.entry("lime", 67.0), Map.entry("mushroom", 18.0),
            Map.entry("celery", 40.0), Map.entry("leek", 90.0), Map.entry("courgette", 200.0),
            Map.entry("zucchini", 200.0), Map.entry("aubergine", 300.0), Map.entry("eggplant", 300.0),
            Map.entry("potato", 170.0), Map.entry("onion", 110.0), Map.entry("carrot", 60.0),
            Map.entry("tomato", 120.0), Map.entry("pepper", 120.0), Map.entry("avocado", 150.0),
            Map.entry("apple", 180.0), Map.entry("banana", 118.0), Map.entry("orange", 140.0),
            // A whole head, which is what a recipe means by "1 broccoli".
            Map.entry("broccoli", 300.0), Map.entry("cauliflower", 600.0), Map.entry("cabbage", 900.0),
            Map.entry("lettuce", 300.0), Map.entry("butternut", 900.0),
            // A slice of cured ham; a sprig of a herb.
            Map.entry("ham", 15.0), Map.entry("prosciutto", 15.0), Map.entry("rosemary", 1.0),
            Map.entry("thyme", 1.0), Map.entry("parsley", 1.0), Map.entry("basil", 1.0), Map.entry("mint", 1.0),
            Map.entry("dill", 1.0), Map.entry("coriander", 1.0), Map.entry("sage", 1.0));

    /**
     * Tins that are not the usual 400 g, by a word in the food's or the line's name: {the tin,
     * what is left drained}. A UK tin of tuna is 145 g and about 110 g drained, not a 400 g tin of
     * tomatoes; sweetcorn is a 198 g tin, 165 g drained. Sizes as sold in UK supermarkets.
     */
    private static final List<Map.Entry<String, double[]>> TINS = List.of(
            Map.entry("tuna", new double[]{145, 110}), Map.entry("sardine", new double[]{120, 90}),
            Map.entry("mackerel", new double[]{125, 90}), Map.entry("anchovy", new double[]{50, 30}),
            Map.entry("salmon", new double[]{213, 170}), Map.entry("corn", new double[]{198, 165}));

    private static final Set<String> SIZES = Set.of("small", "medium", "large", "extra large", "jumbo");

    /** "Tablespoons" and "tbsp" are the same key; a plain count is "". Null for nothing at all. */
    public static String unitKey(String unit) {
        if (unit == null) return "";
        String u = unit.toLowerCase(Locale.ROOT).replace(".", "").replaceAll("\\s+", " ").trim();
        if (UNIT_WORDS.containsKey(u)) return UNIT_WORDS.get(u);
        String singular = FoodWords.singular(u);
        if (UNIT_WORDS.containsKey(singular)) return UNIT_WORDS.get(singular);
        if (COUNTED.contains(singular) || VAGUE_G.containsKey(singular) || VAGUE_ML.containsKey(singular)) {
            return singular;
        }
        return u.length() > 32 ? u.substring(0, 32) : u;
    }

    /**
     * The weight of an amount of a food, or empty when there is no honest way to say.
     *
     * @param name the ingredient's own name, for the size it says ("large eggs") and the
     *             typical-size table
     */
    public static Optional<Amount> of(double quantity, String unit, String name, Food food) {
        if (quantity <= 0 || food == null) return Optional.empty();
        String key = unitKey(unit);
        return each(key, name, food).map(e -> new Amount(e.grams * quantity, e.grams, key, e.how, e.basis));
    }

    /** What one of a unit weighs, with someone's own figure taking the place of the rules. */
    public static Amount learned(double quantity, String unit, double gramsEach, String source) {
        String key = unitKey(unit);
        String label = key.isEmpty() ? "1" : "1 " + key;
        return new Amount(gramsEach * quantity, gramsEach, key, How.LEARNED,
                label + " = " + tidy(gramsEach) + " g (" + source + ")");
    }

    private record Each(double grams, How how, String basis) {
    }

    private static Optional<Each> each(String key, String name, Food food) {
        if (WEIGHT.containsKey(key)) {
            return Optional.of(new Each(WEIGHT.get(key), How.WEIGHT, "1 " + key + " = " + tidy(WEIGHT.get(key)) + " g"));
        }
        if (VOLUME.containsKey(key)) return volume(key, food);
        if (VAGUE_G.containsKey(key)) {
            return Optional.of(new Each(VAGUE_G.get(key), How.ROUGH, "a " + key + " ≈ " + tidy(VAGUE_G.get(key)) + " g"));
        }
        if (VAGUE_ML.containsKey(key)) {
            double ml = VAGUE_ML.get(key);
            double grams = ml * density(food, true).orElse(1.0);
            return Optional.of(new Each(grams, How.ROUGH, "a " + key + " ≈ " + tidy(ml) + " ml"));
        }
        if (key.isEmpty() || SIZES.contains(key) || key.equals("piece")) return count(key, name, food);
        if (COUNTED.contains(key)) return named(key, name, food);
        return Optional.empty();
    }

    private static Optional<Each> volume(String key, Food food) {
        double ml = VOLUME.get(key);
        // The food's own measure in this very unit is best: a cup of flour is 125 g whatever
        // the density arithmetic says about how flour settles.
        for (Food.Portion portion : food.portions()) {
            String unit = volumeUnit(portion.label());
            if (key.equals(unit) && !portion.label().contains("whipped")) {
                return Optional.of(new Each(portion.gramsEach(), How.PORTION, portion.text() + " = " + tidy(portion.grams()) + " g"));
            }
        }
        boolean metric = key.equals("ml") || key.equals("cl") || key.equals("dl") || key.equals("l");
        Optional<Double> own = density(food, false);
        if (own.isPresent()) {
            return Optional.of(new Each(ml * own.get(), How.VOLUME, "from its " + densitySource(food)));
        }
        // ml/l of something with no measures at all is nearly always a liquid: water's density.
        double typical = metric ? 1.0 : typicalDensity(food);
        return Optional.of(new Each(ml * typical, How.VOLUME, "about " + tidy(typical) + " g per ml"));
    }

    /** Grams per ml from any of the food's volume measures, preferring a cup (the most precise). */
    static Optional<Double> density(Food food, boolean orTypical) {
        Food.Portion best = null;
        int rank = Integer.MAX_VALUE;
        for (Food.Portion portion : food.portions()) {
            String unit = volumeUnit(portion.label());
            if (unit == null || portion.label().contains("whipped")) continue;
            int r = List.of("cup", "tbsp", "floz", "ml", "l", "tsp", "quart", "pint").indexOf(unit);
            if (r >= 0 && r < rank) {
                rank = r;
                best = portion;
            }
        }
        if (best != null) return Optional.of(best.gramsEach() / VOLUME.get(volumeUnit(best.label())));
        return orTypical ? Optional.of(typicalDensity(food)) : Optional.empty();
    }

    private static String densitySource(Food food) {
        for (String unit : List.of("cup", "tbsp", "floz", "ml", "l", "tsp", "quart", "pint")) {
            for (Food.Portion portion : food.portions()) {
                if (unit.equals(volumeUnit(portion.label())) && !portion.label().contains("whipped")) {
                    return portion.text() + " = " + tidy(portion.grams()) + " g";
                }
            }
        }
        return "measures";
    }

    /** The volume unit a USDA measure is in, or null: "cup, chopped" → cup, "tbsp" → tbsp. */
    static String volumeUnit(String label) {
        String l = label.toLowerCase(Locale.ROOT);
        if (l.startsWith("cup")) return "cup";
        if (l.startsWith("tbsp") || l.startsWith("tablespoon")) return "tbsp";
        if (l.startsWith("tsp") || l.startsWith("teaspoon")) return "tsp";
        if (l.startsWith("fl oz") || l.startsWith("fluid ounce")) return "floz";
        if (l.startsWith("ml") || l.startsWith("milliliter")) return "ml";
        if (l.startsWith("liter") || l.startsWith("litre") || l.equals("l")) return "l";
        if (l.startsWith("quart")) return "quart";
        if (l.startsWith("pint")) return "pint";
        return null;
    }

    /**
     * Grams per ml for a spoon or a cup of something USDA gives no measures for — by its kind.
     * Oils float on water; flour is mostly air; syrups are heavy.
     */
    static double typicalDensity(Food food) {
        String n = food.name().toLowerCase(Locale.ROOT);
        String category = food.category() == null ? "" : food.category();
        if (n.startsWith("oil") || n.contains(" oil")) return 0.92;
        if (n.contains("flour")) return 0.53;
        if (n.contains("powdered") || n.contains("icing")) return 0.5;
        if (n.contains("sugar")) return 0.85;
        if (n.contains("honey") || n.contains("syrup") || n.contains("molasses")) return 1.4;
        if (n.contains("oat")) return 0.4;
        if (category.equals("Spices and Herbs")) return 0.5;
        if (category.equals("Nut and Seed Products")) return 0.6;
        if (category.equals("Cereal Grains and Pasta")) return 0.8;
        if (n.startsWith("cheese")) return 0.45;
        if (category.startsWith("Vegetables") || category.startsWith("Fruits")) return 0.6;
        return 1.0;
    }

    /** A plain count, maybe with a size: "2 onions", "1 large egg". */
    private static Optional<Each> count(String key, String name, Food food) {
        List<String> nameWords = FoodWords.words(name);
        // "1 tin tuna" is a tin, written without its unit.
        if (key.isEmpty() && nameWords.contains("can")) return named("can", name, food);
        String size = SIZES.contains(key) ? key
                : nameWords.contains("large") ? "large" : nameWords.contains("small") ? "small"
                : nameWords.contains("medium") ? "medium" : nameWords.contains("jumbo") ? "jumbo" : null;
        List<Food.Portion> portions = food.portions();

        if (size != null) {
            for (Food.Portion p : portions) {
                if (sizeOf(p.label()).equals(size)) return portion(p);
            }
        }
        // A measure named after the thing itself: "1 onion", "1 breast", "1 tortilla", "1 fruit".
        java.util.Set<String> own = new java.util.HashSet<>(FoodWords.words(food.name().split(",")[0]));
        own.addAll(FoodWords.queryWords(name));
        own.add("fruit");
        Food.Portion named = null;
        int namedRank = Integer.MAX_VALUE;
        for (Food.Portion p : portions) {
            String first = FoodWords.singular(firstWord(p.label()));
            if (!own.contains(first) || volumeUnit(p.label()) != null || tooBigACut(p)) continue;
            int rank = sizeRank(p.label());
            if (rank < namedRank) {
                namedRank = rank;
                named = p;
            }
        }
        if (named != null) return portion(named);
        Optional<Each> cut = shopCut(nameWords, name, food);
        if (cut.isPresent()) return cut;
        // Recipes mean a large egg; USDA's large is 50 g, close to a British medium.
        List<String> order = food.name().startsWith("Egg") ? List.of("large", "medium", "extra large", "small")
                : List.of("medium", "large", "small");
        for (String s : order) {
            for (Food.Portion p : portions) {
                if (sizeOf(p.label()).equals(s)) return portion(p);
            }
        }
        Optional<Each> typical = typicalOne(name, food);
        if (typical.isPresent()) return typical;
        for (Food.Portion p : portions) {
            String first = firstWord(p.label());
            if (first.equals("piece") || first.equals("each") || first.equals("unit") || first.equals("whole")) {
                return portion(p);
            }
        }
        return Optional.empty();
    }

    /** "3 cloves", "2 slices", "1 stick", "1 can". */
    private static Optional<Each> named(String key, String name, Food food) {
        Food.Portion same = null;
        int sameRank = Integer.MAX_VALUE;
        for (Food.Portion p : food.portions()) {
            String first = FoodWords.singular(firstWord(p.label()));
            boolean match = first.equals(key) || (key.equals("stick") && first.equals("stalk"))
                    || (key.equals("stalk") && first.equals("stick")) || (key.equals("slice") && first.equals("rasher"));
            if (!match || key.equals("can") || key.equals("package") || tooBigACut(p)) continue;
            int rank = sizeRank(p.label());
            if (rank < sameRank) {
                sameRank = rank;
                same = p;
            }
        }
        if (same != null) return portion(same);
        if (key.equals("can")) {
            // A standard 400 g tin; drained, about 240 g of it is the food — unless it is one of
            // the things sold in smaller tins.
            // Tinned beans and pulses are drained before they go in, whatever the USDA row says.
            String foodName = food.name().toLowerCase(Locale.ROOT);
            boolean drained = foodName.contains("drained") || (foodName.contains("canned")
                    && food.category() != null && food.category().startsWith("Legumes")
                    && !foodName.contains("baked") && !foodName.contains("refried"));
            double[] tin = tinSize(name, food);
            double grams = drained ? tin[1] : tin[0];
            return Optional.of(new Each(grams, How.TYPICAL, "a " + tidy(tin[0]) + " g tin"
                    + (drained ? ", drained ≈ " + tidy(tin[1]) + " g" : "")));
        }
        if (key.equals("sachet")) {
            // A sachet of yeast is 7 g; a sachet of anything else could be a gram or a stock pot.
            if (!food.name().toLowerCase(Locale.ROOT).contains("yeast")) return Optional.empty();
            return Optional.of(new Each(7, How.TYPICAL, "a sachet ≈ 7 g"));
        }
        if (key.equals("head")) {
            // A head of garlic is ten-odd cloves; a head of broccoli is what "1 broccoli" means.
            if (FoodWords.words(food.name()).contains("garlic")) {
                return Optional.of(new Each(50, How.TYPICAL, "a head ≈ 50 g"));
            }
            return typicalOne(name, food);
        }
        if (CUTS.containsKey(key)) {
            Optional<Each> cut = shopCut(List.of(key), name, food);
            if (cut.isPresent()) return cut;
        }
        if (key.equals("package")) {
            for (Food.Portion p : food.portions()) {
                String first = firstWord(p.label());
                if (first.equals("package") || first.equals("packet") || first.equals("container")) return portion(p);
            }
            return Optional.empty();
        }
        if (key.equals("stick") && !food.name().toLowerCase(Locale.ROOT).startsWith("butter")
                && !food.name().toLowerCase(Locale.ROOT).startsWith("margarine")) {
            // A stick of celery or cinnamon, not of butter.
            return Optional.of(new Each(40, How.TYPICAL, "a stick ≈ 40 g"));
        }
        if (key.equals("bunch")) {
            boolean herb = "Spices and Herbs".equals(food.category()) || FoodWords.words(food.name()).stream()
                    .anyMatch(w -> Set.of("parsley", "coriander", "basil", "mint", "dill", "chive", "thyme").contains(w));
            double grams = herb ? 30 : 100;
            return Optional.of(new Each(grams, How.TYPICAL, "a bunch ≈ " + tidy(grams) + " g"));
        }
        if (key.equals("piece")) return count(key, name, food);
        Double typical = TYPICAL_UNIT.get(key);
        if (typical != null) {
            return Optional.of(new Each(typical, How.TYPICAL, "a " + key + " ≈ " + tidy(typical) + " g"));
        }
        return Optional.empty();
    }

    /** A USDA measure of a cut that is the whole side, not one a shop would sell. */
    private static boolean tooBigACut(Food.Portion p) {
        Double most = CUTS.get(FoodWords.singular(firstWord(p.label())));
        return most != null && p.gramsEach() > most;
    }

    /**
     * One shop-sized cut — "4 salmon fillets", "2 cod fillets", "1 sirloin steak" — from the
     * usual sizes by name, when the line counts cuts and the food has no sensible measure for one.
     */
    private static Optional<Each> shopCut(List<String> unitOrNameWords, String name, Food food) {
        String cut = unitOrNameWords.stream().map(FoodWords::singular).filter(CUTS::containsKey).findFirst().orElse(null);
        if (cut == null) return Optional.empty();
        Optional<Each> typical = typicalOne(name, food);
        Double each = typical.map(Each::grams).orElse(TYPICAL_UNIT.get(cut));
        if (each == null) return Optional.empty();
        return Optional.of(new Each(each, How.TYPICAL, "a " + cut + " ≈ " + tidy(each) + " g"));
    }

    private static double[] tinSize(String name, Food food) {
        List<String> words = new java.util.ArrayList<>(FoodWords.words(name));
        words.addAll(FoodWords.words(food.name().split(",").length > 1
                ? food.name().split(",")[0] + " " + food.name().split(",")[1] : food.name()));
        for (Map.Entry<String, double[]> tin : TINS) {
            if (words.contains(tin.getKey())) return tin.getValue();
        }
        return new double[]{400, 240};
    }

    private static Optional<Each> typicalOne(String name, Food food) {
        String text = " " + String.join(" ", FoodWords.words(name)) + " ";
        String foodText = " " + String.join(" ", FoodWords.words(food.name())) + " ";
        for (Map.Entry<String, Double> entry : TYPICAL_ONE) {
            String word = " " + entry.getKey() + " ";
            if (text.contains(word) || (entry.getKey().indexOf(' ') < 0 && foodText.startsWith(word))) {
                return Optional.of(new Each(entry.getValue(), How.TYPICAL,
                        "one ≈ " + tidy(entry.getValue()) + " g"));
            }
        }
        return Optional.empty();
    }

    /** "1 potato, medium" over "1 potato, large" — a recipe that wanted a big one says so. */
    private static int sizeRank(String label) {
        String l = label.toLowerCase(Locale.ROOT);
        if (l.contains("medium")) return 0;
        if (!l.matches(".*\\b(small|large|jumbo)\\b.*")) return 1;
        return l.contains("large") ? 2 : 3;
    }

    private static Optional<Each> portion(Food.Portion p) {
        return Optional.of(new Each(p.gramsEach(), How.PORTION, p.text() + " = " + tidy(p.grams()) + " g"));
    }

    private static String firstWord(String label) {
        String l = label.toLowerCase(Locale.ROOT).trim();
        int end = 0;
        while (end < l.length() && Character.isLetter(l.charAt(end))) end++;
        return l.substring(0, end);
    }

    /** "large", "medium (2-1/2" dia)", "fruit, medium (...)", "extra large" → the size, or "". */
    private static String sizeOf(String label) {
        String l = label.toLowerCase(Locale.ROOT);
        if (l.startsWith("extra large")) return "extra large";
        for (String size : List.of("small", "medium", "large", "jumbo")) {
            if (l.startsWith(size) || l.matches("^[a-z]+, " + size + "\\b.*")) return size;
        }
        return "";
    }

    static String tidy(double value) {
        if (value == Math.rint(value)) return String.valueOf((long) value);
        String text = String.format(Locale.ROOT, "%.1f", value);
        return text.endsWith(".0") ? text.substring(0, text.length() - 2) : text;
    }
}
