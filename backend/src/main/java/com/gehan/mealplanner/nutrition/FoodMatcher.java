package com.gehan.mealplanner.nutrition;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Which USDA food an ingredient name most likely means, and how sure that is.
 *
 * Hand-picked rows first ({@link Staples}) for the names most recipes use. Everything else is
 * scored word by word against all eight thousand foods: how many of the recipe's words the food's
 * name has, whether the food is *about* that thing (its name starts with it — "Garlic, raw" is
 * garlic, "Spices, garlic powder" is a spice), how much more the USDA name says than the recipe
 * did (fewer extra words means a more basic food), and a nudge towards raw, as-bought foods over
 * cooked, canned, branded or restaurant ones unless the recipe asked for those.
 *
 * Confidence is separate from the score and means something to people: above ~0.75 is a match
 * worth trusting, below ~0.5 is a guess the iPhone's model (or a person) should look at.
 */
@Component
public class FoodMatcher {

    /** Bumped when matching changes enough that stored automatic matches should be redone. */
    public static final int VERSION = 1;

    /** Below this an automatic match is not counted at all: a wrong number is worse than none. */
    public static final double COUNTABLE = 0.45;
    /** Below this a counted match is called a guess, and the iPhone may ask its model. */
    public static final double CONFIDENT = 0.65;

    public static final int SHORTLIST = 8;

    public record Candidate(Food food, double score, double confidence) {
    }

    private final FoodTable table;
    private volatile List<Indexed> index;
    private volatile int indexedGeneration;

    public FoodMatcher(FoodTable table) {
        this.table = table;
    }

    /** The best food for a name, or null when nothing is even close. */
    public Candidate best(String name) {
        List<Candidate> list = shortlist(name, 1);
        return list.isEmpty() ? null : list.get(0);
    }

    public List<Candidate> shortlist(String name) {
        return shortlist(name, SHORTLIST);
    }

    public List<Candidate> shortlist(String name, int size) {
        List<String> query = FoodWords.queryWords(name);
        if (query.isEmpty()) return List.of();

        Integer staple = Staples.find(name);
        List<Candidate> scored = new ArrayList<>();
        for (Indexed food : index()) {
            if (staple != null && food.food.fdcId() == staple) continue;
            Candidate candidate = score(food, query);
            if (candidate != null) scored.add(candidate);
        }
        scored.sort(Comparator.comparingDouble(Candidate::score).reversed()
                .thenComparingInt(c -> c.food().name().length()));

        List<Candidate> top = new ArrayList<>(size);
        Set<String> names = new HashSet<>();
        if (staple != null) {
            table.find(staple).ifPresent(food -> {
                top.add(new Candidate(food, 2.0, 0.95));
                names.add(food.name().toLowerCase());
            });
        }
        for (Candidate candidate : scored) {
            if (top.size() >= size) break;
            // SR Legacy and Foundation Foods both have "Garlic, raw": one is enough to choose from.
            if (names.add(candidate.food().name().toLowerCase())) top.add(candidate);
        }
        return top;
    }

    /** Null when the food shares no word with the query. */
    static Candidate score(Indexed food, List<String> query) {
        double credit = 0;
        double weights = 0;
        boolean exactHit = false;
        for (int i = 0; i < query.size(); i++) {
            String word = query.get(i);
            double weight = weight(word, i == query.size() - 1);
            double c = credit(word, food.words);
            if (c == 1) exactHit = true;
            credit += c * weight;
            weights += weight;
        }
        if (credit == 0) return null;
        double coverage = credit / weights;

        Set<String> asked = new HashSet<>(query);
        long headNamed = food.head.stream().filter(asked::contains).count();
        double headShare = food.head.isEmpty() ? 0 : (double) headNamed / food.head.size();
        boolean aboutIt = headNamed > 0;

        int extra = 0;
        int processed = 0;
        for (String word : food.words) {
            if (asked.contains(word) || FoodWords.FILLER.contains(word)) continue;
            extra++;
            if (FoodWords.PROCESSED.contains(word)) processed++;
        }
        boolean raw = food.words.contains("raw");

        double score = coverage
                + 0.25 * headShare
                + (aboutIt ? 0.1 : 0)
                - Math.min(0.3, 0.02 * extra)
                - Math.min(0.24, 0.08 * processed)
                + (raw ? 0.06 : 0)
                - food.categoryPenalty
                - (food.branded ? 0.2 : 0)
                + (food.food.portions().isEmpty() ? 0 : 0.01);

        double confidence = coverage
                * (aboutIt ? 1.0 : 0.7)
                * Math.max(0.55, 1 - 0.035 * extra)
                * (processed > 0 ? 0.88 : 1.0)
                * (food.categoryPenalty >= 0.3 ? 0.6 : food.categoryPenalty > 0 ? 0.9 : 1.0)
                * (food.branded ? 0.75 : 1.0)
                // Only near-misses in spelling: "harissa" is one letter from "carissa", a plum.
                * (exactHit ? 1.0 : 0.5);
        return new Candidate(food.food, score, Math.min(0.92, confidence));
    }

    /**
     * The last word of an English food name is usually the thing ("rice vinegar" is vinegar),
     * and a word for its shape counts for little ("mozzarella balls" is mozzarella).
     */
    private static double weight(String word, boolean last) {
        if (FoodWords.LIGHT.contains(word)) return 0.35;
        return last ? 1.5 : 1.0;
    }

    private static double credit(String word, Set<String> foodWords) {
        if (foodWords.contains(word)) return 1;
        for (String other : foodWords) {
            if (word.length() >= 5 && other.length() >= 5 && FoodWords.oneEditApart(word, other)) return 0.6;
            // Compounds: a recipe's "pepper" against USDA's "peppercorn".
            if (word.length() >= 4 && other.length() > word.length() && other.startsWith(word)) return 0.5;
        }
        return 0;
    }

    /** A food with its words worked out once. */
    record Indexed(Food food, Set<String> words, Set<String> head, double categoryPenalty, boolean branded) {
    }

    private List<Indexed> index() {
        int generation = table.generation();
        List<Indexed> built = index;
        if (built == null || indexedGeneration != generation) {
            synchronized (this) {
                built = index;
                if (built == null || indexedGeneration != generation) {
                    built = table.all().stream().map(FoodMatcher::indexed).toList();
                    index = built;
                    indexedGeneration = generation;
                }
            }
        }
        return built;
    }

    static Indexed indexed(Food food) {
        Set<String> words = new HashSet<>(FoodWords.words(food.name()));
        String[] segments = food.name().split(",");
        Set<String> head = new HashSet<>(FoodWords.words(segments[0]));
        // "Spices, garlic powder" is about garlic powder, not about spices.
        if (segments.length > 1 && head.stream().anyMatch(FoodWords.GROUPS::contains)) {
            head.addAll(FoodWords.words(segments[1]));
        }
        return new Indexed(food, words, head, categoryPenalty(food.category()), branded(food.name()));
    }

    /**
     * SR Legacy has a few hundred brand-name products ("SILK Coffee, soymilk", "CHOBANI"), which
     * USDA writes in capitals. A recipe's "coffee" means coffee.
     */
    static boolean branded(String name) {
        for (String word : name.split("[^A-Za-z']+")) {
            if (word.length() >= 3 && word.equals(word.toUpperCase()) && !word.equals("USDA") && !word.equals("NFS")
                    && !word.equals("NLEA") && !word.equals("RTE") && !word.equals("RTF")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whole dishes, restaurant meals and baby food are almost never what a recipe line means,
     * even when the words fit ("Chicken, ... , school lunch").
     */
    private static double categoryPenalty(String category) {
        if (category == null) return 0;
        return switch (category) {
            case "Baby Foods", "Fast Foods", "Restaurant Foods", "Meals, Entrees, and Side Dishes",
                 "American Indian/Alaska Native Foods" -> 0.35;
            case "Snacks", "Breakfast Cereals", "Baked Products", "Soups, Sauces, and Gravies" -> 0.08;
            default -> 0;
        };
    }
}
