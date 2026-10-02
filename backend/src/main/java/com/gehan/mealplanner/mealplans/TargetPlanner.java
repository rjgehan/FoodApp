package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A plan for a health target: existing recipes, one per meal, in portions that bring each day
 * close to its energy and protein targets. Arithmetic only, so it can be checked by hand; every
 * number comes from the recipes' own nutrition (worked out from their ingredients by the server).
 *
 * The day is shared out as breakfast 25%, lunch 30%, dinner 35% and a snack 10% (rescaled to the
 * meals chosen). Each day is filled breakfast, lunch, snack, then dinner, and dinner aims at
 * whatever the day still needs, so a light lunch is made up in the evening. For each slot every
 * allowed recipe is tried at sensible portions (halves, from ½ to 3 servings; snacks up to 2) and
 * scored:
 * <pre>
 *   −4 × how far the portion's kcal is from the slot's, as a share of it
 *   −2 × how much protein it falls short by, as a share of the slot's protein
 *   +2 × how well its drawer suits the meal (CupboardPlanner.fit)
 *   +1.2 when it is the household's own and "use my recipes first" is on
 *   + the preferences' leaning (budget, heart healthy, high protein)
 *   −0.25 × how far the portion is from one serving
 *   −1.5 × how many times it is in the plan already (−0.5 at breakfast and snack time)
 * </pre>
 * A recipe is never repeated the same day, nor at lunch or dinner the day after (the same
 * breakfast or snack every day is ordinary, so those only pay the repeat cost); and recipes with
 * no nutrition to go on (nothing in them could be counted) are never chosen: a number the plan
 * can't show is a number it can't aim at.
 */
public final class TargetPlanner {

    /** A recipe that may be chosen, with its nutrition per serving. */
    public record Option(UUID id, String name, RecipeSection section, boolean yours, double kcal, double protein,
                         double carbs, double fat, Double satFat, Double sodiumMg, Integer minutes, String words,
                         UUID coverImageId) {
    }

    public record Slot(int day, MealType meal) {
    }

    public record Meal(Slot slot, Option option, double portion) {
        public double kcal() { return option.kcal() * portion; }
        public double protein() { return option.protein() * portion; }
        public double carbs() { return option.carbs() * portion; }
        public double fat() { return option.fat() * portion; }
    }

    /** Breakfast 25, lunch 30, dinner 35, snack 10. */
    static final Map<MealType, Double> SHARE = new EnumMap<>(Map.of(
            MealType.BREAKFAST, 0.25, MealType.LUNCH, 0.30, MealType.DINNER, 0.35, MealType.SNACK, 0.10));

    /** The order a day is filled in: dinner last, to make up whatever the day still needs. */
    static final List<MealType> FILL_ORDER = List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.SNACK, MealType.DINNER);

    static final double[] PORTIONS = {0.5, 1, 1.5, 2, 2.5, 3};
    static final double[] SNACK_PORTIONS = {0.5, 1, 1.5, 2};

    /** Under this many kcal a serving, a recipe's nutrition is too thin to plan with. */
    static final double MIN_KCAL = 50;

    private final List<Option> options;
    private final Preferences prefs;
    private final boolean useMineFirst;
    private final int kcal;
    private final int protein;

    public TargetPlanner(List<Option> options, Preferences prefs, boolean useMineFirst, int kcal, int protein) {
        this.options = options.stream()
                .filter(o -> o.kcal() >= MIN_KCAL)
                .filter(o -> prefs.allows(o.words(), o.minutes()))
                .sorted(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER).thenComparing(o -> o.id().toString()))
                .toList();
        this.prefs = prefs;
        this.useMineFirst = useMineFirst;
        this.kcal = kcal;
        this.protein = protein;
    }

    /** How many recipes the preferences leave to choose from. */
    public int allowed() {
        return options.size();
    }

    /** The meals' shares of the day, rescaled so the chosen ones add up to 1. */
    static Map<MealType, Double> shares(List<MealType> meals) {
        double total = meals.stream().mapToDouble(SHARE::get).sum();
        Map<MealType, Double> shares = new EnumMap<>(MealType.class);
        for (MealType m : meals) shares.put(m, SHARE.get(m) / total);
        return shares;
    }

    /** Every slot filled where something is allowed; a slot with nothing allowed is left out. */
    public List<Meal> plan(int days, List<MealType> meals) {
        return plan(days, meals, Map.of(), Map.of());
    }

    /**
     * @param fixed    meals already decided (everything but the one being swapped)
     * @param excluded recipes not to put in a slot
     */
    public List<Meal> plan(int days, List<MealType> meals, Map<Slot, Meal> fixed, Map<Slot, Set<UUID>> excluded) {
        Map<MealType, Double> shares = shares(meals);
        List<MealType> order = FILL_ORDER.stream().filter(meals::contains).toList();
        List<Meal> plan = new ArrayList<>(fixed.values());
        for (int day = 0; day < days; day++) {
            for (MealType meal : order) {
                Slot slot = new Slot(day, meal);
                if (fixed.containsKey(slot)) continue;
                Meal best = best(slot, shares, order, plan, excluded.getOrDefault(slot, Set.of()));
                if (best != null) plan.add(best);
            }
        }
        plan.sort(Comparator.comparingInt((Meal m) -> m.slot().day()).thenComparing(m -> m.slot().meal()));
        return plan;
    }

    /** What this slot should aim at, given what the rest of the day already has. */
    double[] aim(Slot slot, Map<MealType, Double> shares, List<MealType> order, List<Meal> plan) {
        double share = shares.get(slot.meal());
        double k = kcal * share, p = protein * share;
        boolean last = order.get(order.size() - 1) == slot.meal();
        List<Meal> sameDay = plan.stream().filter(m -> m.slot().day() == slot.day() && m.slot().meal() != slot.meal()).toList();
        if (last && !sameDay.isEmpty()) {
            double restShare = sameDay.stream().mapToDouble(m -> shares.getOrDefault(m.slot().meal(), 0.0)).sum();
            double eaten = sameDay.stream().mapToDouble(Meal::kcal).sum();
            double eatenP = sameDay.stream().mapToDouble(Meal::protein).sum();
            // Only make up for meals that are actually there: an empty lunch is not dinner's job.
            double planned = share + restShare;
            k = clamp(kcal * planned - eaten, k * 0.5, k * 1.6);
            p = clamp(protein * planned - eatenP, p * 0.5, p * 1.8);
        }
        return new double[]{k, p};
    }

    Meal best(Slot slot, Map<MealType, Double> shares, List<MealType> order, List<Meal> plan, Set<UUID> excluded) {
        double[] aim = aim(slot, shares, order, plan);
        Map<UUID, Integer> uses = new HashMap<>();
        Map<UUID, List<Integer>> daysUsed = new HashMap<>();
        for (Meal m : plan) {
            uses.merge(m.option().id(), 1, Integer::sum);
            daysUsed.computeIfAbsent(m.option().id(), id -> new ArrayList<>()).add(m.slot().day());
        }
        Meal best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (Option o : options) {
            if (excluded.contains(o.id())) continue;
            double fit = CupboardPlanner.fit(o.section(), slot.meal());
            if (fit == 0) continue;
            // Never twice in a day; lunch and dinner not the day after either. The same breakfast or
            // snack every day is how plenty of people eat, so those only pay the repeat cost.
            int apart = slot.meal() == MealType.LUNCH || slot.meal() == MealType.DINNER ? 1 : 0;
            List<Integer> on = daysUsed.getOrDefault(o.id(), List.of());
            if (on.stream().anyMatch(d -> Math.abs(d - slot.day()) <= apart)) continue;
            double portion = portion(o.kcal(), aim[0], slot.meal());
            double score = score(o, portion, aim[0], aim[1], fit, uses.getOrDefault(o.id(), 0), apart == 0);
            if (score > bestScore) {
                bestScore = score;
                best = new Meal(slot, o, portion);
            }
        }
        return best;
    }

    double score(Option o, double portion, double aimKcal, double aimProtein, double fit, int timesUsed,
                 boolean everyday) {
        double kcalErr = Math.abs(o.kcal() * portion - aimKcal) / Math.max(1, aimKcal);
        double short_ = Math.max(0, aimProtein - o.protein() * portion) / Math.max(1, aimProtein);
        return -4 * kcalErr - 2 * short_ + 2 * fit + (useMineFirst && o.yours() ? 1.2 : 0)
                + prefs.lean(o.words(), o.minutes(), o.kcal(), o.protein(), o.satFat(), o.sodiumMg())
                - 0.25 * Math.abs(portion - 1) - (everyday ? 0.5 : 1.5) * timesUsed;
    }

    /** The sensible portion whose energy is nearest the aim. */
    static double portion(double kcalPerServing, double aim, MealType meal) {
        double[] steps = meal == MealType.SNACK ? SNACK_PORTIONS : PORTIONS;
        double best = 1, bestErr = Double.MAX_VALUE;
        for (double p : steps) {
            double err = Math.abs(kcalPerServing * p - aim);
            if (err < bestErr - 1e-9) {
                bestErr = err;
                best = p;
            }
        }
        return best;
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
