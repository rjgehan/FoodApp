package com.gehan.mealplanner.mealplans;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Daily targets worked out from who a plan is for — the numbers on mockup 5.10/5.11, which
 * anyone can then overwrite ("Tap a number to set your own").
 *
 * Energy: the Mifflin–St Jeor equation (Mifflin MD, St Jeor ST et al., "A new predictive
 * equation for resting energy expenditure in healthy individuals", Am J Clin Nutr 1990;51:241–7),
 * which the Academy of Nutrition and Dietetics found the most accurate of the common equations
 * (Frankenfield et al., J Am Diet Assoc 2005;105:775–89):
 * <pre>
 *   BMR = 10·kg + 6.25·cm − 5·age + 5      (men)
 *   BMR = 10·kg + 6.25·cm − 5·age − 161    (women)
 * </pre>
 * For someone who would rather not say, the midpoint (−78). Times the usual activity factors
 * 1.2 / 1.375 / 1.55 / 1.725 / 1.9 (FAO/WHO/UNU-style physical activity levels as used with
 * Mifflin–St Jeor) for the day's total.
 *
 * Goals:
 * <ul>
 *   <li>Lose fat: 20% under, never below 1,200 kcal (women) / 1,500 (men), the usual floors for
 *       unsupervised diets; protein 2.0 g/kg to keep muscle while eating less (Helms et al.,
 *       IJSNEM 2014 put 2.3–3.1 g/kg of lean mass); fat 25% of energy.</li>
 *   <li>Maintain: the day's total; protein 1.4 g/kg (the ISSN's 1.4–2.0 g/kg for active people,
 *       Jäger et al., JISSN 2017); fat 30%.</li>
 *   <li>Build muscle: 15% over; protein 1.8 g/kg (Morton et al., Br J Sports Med 2018: gains
 *       plateau around 1.6 g/kg); fat 1.0 g/kg.</li>
 * </ul>
 * Carbohydrate is whatever energy is left, at 4 kcal per gram of protein and carbohydrate and 9
 * per gram of fat (the Atwater general factors). Kilocalories are rounded to the nearest 10 and
 * grams to whole grams: the inputs are not more precise than that.
 */
public final class Targets {

    public enum Sex {
        MALE, FEMALE, UNSPECIFIED;

        static Sex parse(String value) {
            if (value == null) return UNSPECIFIED;
            return switch (value.trim().toLowerCase(Locale.ROOT)) {
                case "male", "man", "m" -> MALE;
                case "female", "woman", "f" -> FEMALE;
                default -> UNSPECIFIED;
            };
        }
    }

    public enum Activity {
        SEDENTARY(1.2, "Mostly sitting"),
        LIGHT(1.375, "Active 1–3x a week"),
        MODERATE(1.55, "Active 3–5x a week"),
        ACTIVE(1.725, "Active 6–7x a week"),
        VERY_ACTIVE(1.9, "Training twice a day");

        public final double factor;
        public final String label;

        Activity(double factor, String label) {
            this.factor = factor;
            this.label = label;
        }

        static Activity parse(String value) {
            if (value == null) return MODERATE;
            try {
                return valueOf(value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_'));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
    }

    public enum Goal {
        LOSE_FAT("Lose fat"), MAINTAIN("Maintain"), BUILD_MUSCLE("Build muscle");

        public final String label;

        Goal(String label) {
            this.label = label;
        }

        static Goal parse(String value) {
            if (value == null) return MAINTAIN;
            try {
                return valueOf(value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_'));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        public String key() {
            return name().toLowerCase(Locale.ROOT).replace('_', '-');
        }
    }

    public record Body(int age, Sex sex, double heightCm, double weightKg, Activity activity, Goal goal) {
    }

    /** One day's targets, kcal and grams. */
    public record Macros(int kcal, int protein, int carbs, int fat) {
    }

    /** Anything left null keeps the worked-out number. */
    public record Overrides(Integer kcal, Integer protein, Integer carbs, Integer fat) {
        public static final Overrides NONE = new Overrides(null, null, null, null);
    }

    /**
     * The numbers to plan to, the ones worked out, and which were set by hand.
     *
     * @param bmr  resting energy, kcal/day
     * @param tdee the day's total before the goal, kcal/day
     */
    public record Result(Macros target, Macros computed, List<String> overridden, int bmr, int tdee) {
    }

    private Targets() {
    }

    public static double bmr(Body b) {
        double base = 10 * b.weightKg() + 6.25 * b.heightCm() - 5 * b.age();
        return base + switch (b.sex()) {
            case MALE -> 5;
            case FEMALE -> -161;
            case UNSPECIFIED -> -78;
        };
    }

    public static double tdee(Body b) {
        return bmr(b) * b.activity().factor;
    }

    static double floor(Sex sex) {
        return switch (sex) {
            case MALE -> 1500;
            case FEMALE -> 1200;
            case UNSPECIFIED -> 1350;
        };
    }

    public static Macros worked(Body b) {
        double tdee = tdee(b);
        double kcal, protein, fat;
        switch (b.goal()) {
            case LOSE_FAT -> {
                kcal = Math.max(tdee * 0.80, floor(b.sex()));
                protein = 2.0 * b.weightKg();
                fat = kcal * 0.25 / 9;
            }
            case BUILD_MUSCLE -> {
                kcal = tdee * 1.15;
                protein = 1.8 * b.weightKg();
                fat = 1.0 * b.weightKg();
            }
            default -> {
                kcal = tdee;
                protein = 1.4 * b.weightKg();
                fat = kcal * 0.30 / 9;
            }
        }
        int roundedKcal = (int) (Math.round(kcal / 10.0) * 10);
        int p = (int) Math.round(protein), f = (int) Math.round(fat);
        int carbs = (int) Math.max(0, Math.round((roundedKcal - 4.0 * p - 9.0 * f) / 4.0));
        return new Macros(roundedKcal, p, carbs, f);
    }

    /**
     * Worked out, then whatever was set by hand on top. Setting the energy by hand without the
     * carbohydrate moves the carbohydrate with it — it is "the rest" — while protein and fat
     * keep their grams; a hand-set carbohydrate stays as it was set.
     */
    public static Result of(Body b, Overrides o) {
        Macros computed = worked(b);
        Overrides set = o == null ? Overrides.NONE : o;
        List<String> overridden = new ArrayList<>();
        int kcal = computed.kcal(), protein = computed.protein(), fat = computed.fat(), carbs = computed.carbs();
        if (set.kcal() != null) { kcal = set.kcal(); overridden.add("kcal"); }
        if (set.protein() != null) { protein = set.protein(); overridden.add("protein"); }
        if (set.fat() != null) { fat = set.fat(); overridden.add("fat"); }
        if (set.carbs() != null) {
            carbs = set.carbs();
            overridden.add("carbs");
        } else if (!overridden.isEmpty()) {
            carbs = (int) Math.max(0, Math.round((kcal - 4.0 * protein - 9.0 * fat) / 4.0));
        }
        return new Result(new Macros(kcal, protein, carbs, fat), computed, overridden,
                (int) Math.round(bmr(b)), (int) Math.round(tdee(b)));
    }
}
