package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.nutrition.NutritionDtos.Badge;
import com.gehan.mealplanner.nutrition.NutritionDtos.Detail;
import com.gehan.mealplanner.nutrition.NutritionDtos.MacroSplit;
import com.gehan.mealplanner.nutrition.NutritionDtos.Percentages;
import com.gehan.mealplanner.nutrition.NutritionDtos.Reference;

import java.util.ArrayList;
import java.util.List;

/**
 * The words and percentages printed next to the numbers, with the rules behind each written
 * down where it is used — so "Low fat" means the same thing on a scanned yogurt, a USDA food and
 * a recipe, and is the thing it means on a European label.
 */
public final class NutritionLabels {

    private NutritionLabels() {
    }

    /**
     * The reference intakes for an average adult that EU and UK labels use for "% RI":
     * Regulation (EU) No 1169/2011, Annex XIII Part B — energy 2,000 kcal, fat 70 g, saturates
     * 20 g, carbohydrate 260 g, sugars 90 g, protein 50 g, salt 6 g. Fibre 30 g is the UK's
     * adult recommendation (SACN, Carbohydrates and Health, 2015). A person's own targets, when
     * they have set some, replace this.
     */
    public static final Reference REFERENCE_DAY = new Reference(2000, 50, 260, 70, 90, 20, 6, 30,
            "a 2,000 kcal day", "reference", null);

    /**
     * Somebody's own daily targets as the thing to compare with, the rest (sugars, saturates,
     * salt, fibre) staying the reference intakes. For their eyes only: it is made from their body.
     */
    public static Reference target(String planName, int kcal, int protein, int carbs, int fat) {
        return new Reference(kcal, protein, carbs, fat, REFERENCE_DAY.sugars(), REFERENCE_DAY.satFat(),
                REFERENCE_DAY.saltG(), REFERENCE_DAY.fibre(),
                "a " + String.format(java.util.Locale.UK, "%,d", kcal) + " kcal day", "target", planName);
    }

    /**
     * Nutrient reference values for vitamins and minerals, for "% of daily": Regulation (EU)
     * No 1169/2011, Annex XIII Part A. In mg, except B12 and D in µg.
     */
    static final double CALCIUM_MG = 800, IRON_MG = 14, VITAMIN_C_MG = 80, POTASSIUM_MG = 2000,
            VITAMIN_B12_UG = 2.5, VITAMIN_D_UG = 5, MAGNESIUM_MG = 375;

    /** Each macro's share of the calories, by Atwater factors 4/4/9, whole percents that add to 100. */
    public static MacroSplit split(Nutrients n) {
        double p = 4 * orZero(n.protein()), c = 4 * orZero(n.carbs()), f = 9 * orZero(n.fat());
        double sum = p + c + f;
        if (sum <= 0) return new MacroSplit(0, 0, 0);
        double[] shares = {100 * p / sum, 100 * c / sum, 100 * f / sum};
        int[] whole = {(int) shares[0], (int) shares[1], (int) shares[2]};
        int left = 100 - whole[0] - whole[1] - whole[2];
        // Largest remainder, so 68 + 26 + 6 is 100 and not 99.
        while (left-- > 0) {
            int best = 0;
            for (int i = 1; i < 3; i++) {
                if (shares[i] - whole[i] > shares[best] - whole[best]) best = i;
            }
            whole[best]++;
            shares[best] = whole[best];
        }
        return new MacroSplit(whole[0], whole[1], whole[2]);
    }

    public static Percentages percentOf(Nutrients n, Reference r) {
        return new Percentages(pct(n.kcal(), r.kcal()), pct(n.protein(), r.protein()), pct(n.carbs(), r.carbs()),
                pct(n.fat(), r.fat()), pct(n.sugars(), r.sugars()), pct(n.satFat(), r.satFat()),
                pct(n.saltG(), r.saltG()), pct(n.fibre(), r.fibre()));
    }

    /**
     * Badges for 100 g (or 100 ml of a drink). The "good" ones are the EU nutrition-claim
     * conditions — Regulation (EC) No 1924/2006, Annex: high protein = at least 20% of the energy
     * from protein; high fibre = at least 6 g; low fat = at most 3 g (1.5 g for a drink); fat free
     * = at most 0.5 g; low sugars = at most 5 g (2.5 g); sugars free = at most 0.5 g; low salt =
     * at most 0.12 g sodium (0.3 g salt). The warnings are the UK's front-of-pack "high" (red)
     * levels — Department of Health / FSA, Guide to creating a front of pack nutrition label, 2016:
     * more than 17.5 g fat, 5 g saturates, 22.5 g sugars or 1.5 g salt per 100 g (half of each
     * for drinks).
     */
    public static List<Badge> badges(Nutrients per100, boolean liquid) {
        List<Badge> badges = new ArrayList<>();
        double half = liquid ? 0.5 : 1.0;
        Double kcal = per100.kcal(), protein = per100.protein(), fat = per100.fat(), sugars = per100.sugars(),
                fibre = per100.fibre(), sat = per100.satFat(), salt = per100.saltG();

        if (kcal != null && kcal > 0 && protein != null && 4 * protein / kcal >= 0.20) {
            badges.add(new Badge("high-protein", "High protein", "good"));
        }
        if (fibre != null && fibre >= 6) badges.add(new Badge("high-fibre", "High fibre", "good"));
        if (fat != null) {
            if (fat <= 0.5) badges.add(new Badge("fat-free", "Fat free", "info"));
            else if (fat <= 3 * half) badges.add(new Badge("low-fat", "Low fat", "info"));
            else if (fat > 17.5 * half) badges.add(new Badge("high-fat", "High fat", "warn"));
        }
        if (sat != null && sat > 5 * half) badges.add(new Badge("high-saturates", "High saturates", "warn"));
        if (sugars != null) {
            if (sugars <= 0.5) badges.add(new Badge("sugar-free", "Sugar free", "info"));
            else if (sugars <= 5 * half) badges.add(new Badge("low-sugar", "Low sugar", "info"));
            else if (sugars > 22.5 * half) badges.add(new Badge("high-sugar", "High sugar", "warn"));
        }
        if (salt != null) {
            if (salt <= 0.3) badges.add(new Badge("low-salt", "Low salt", "info"));
            else if (salt > 1.5 * half) badges.add(new Badge("high-salt", "High salt", "warn"));
        }
        return badges;
    }

    /** Sugars, fibre, salt and saturates in grams, then whichever vitamins and minerals are known, as % NRV. */
    public static List<Detail> details(Nutrients n, Double vitaminB12Ug, Double vitaminDUg) {
        List<Detail> details = new ArrayList<>();
        grams(details, "sugars", "Sugars", n.sugars());
        grams(details, "fibre", "Fibre", n.fibre());
        details.add(new Detail("salt", "Salt", Nutrients.round(n.saltG(), 2), "g", null));
        grams(details, "satFat", "Saturates", n.satFat());
        daily(details, "calcium", "Calcium", n.calciumMg(), "mg", CALCIUM_MG);
        daily(details, "iron", "Iron", n.ironMg(), "mg", IRON_MG);
        daily(details, "vitaminC", "Vitamin C", n.vitaminCMg(), "mg", VITAMIN_C_MG);
        daily(details, "vitaminB12", "Vitamin B12", vitaminB12Ug, "µg", VITAMIN_B12_UG);
        daily(details, "vitaminD", "Vitamin D", vitaminDUg, "µg", VITAMIN_D_UG);
        daily(details, "potassium", "Potassium", n.potassiumMg(), "mg", POTASSIUM_MG);
        details.removeIf(d -> d.amount() == null);
        return details;
    }

    /**
     * A couple of plain words about a serving, for when no model is there to write something
     * nicer: "High protein, low carb. A filling main." Thresholds are shares of the serving's
     * own calories — protein at least 20% (the EU high-protein claim), carbs under 26% (the
     * usual line for "low carb"), fat under 20% — so they work for a snack and a feast alike.
     */
    public static List<String> highlights(Nutrients serving) {
        List<String> words = new ArrayList<>();
        double kcal = orZero(serving.kcal());
        if (kcal <= 0) return words;
        MacroSplit split = split(serving);
        if (split.protein() >= 20 && orZero(serving.protein()) >= 15) words.add("High protein");
        if (split.carbs() < 26) words.add("Low carb");
        else if (split.carbs() >= 60) words.add("Mostly carbs");
        if (split.fat() < 20) words.add("Low fat");
        if (orZero(serving.fibre()) >= 6) words.add("High fibre");
        if (serving.saltG() != null && serving.saltG() >= 2.5) words.add("Salty");
        return words;
    }

    public static String summary(Nutrients serving) {
        return summary(serving, null);
    }

    /** With a plan named, the size is said for it: "A filling meal for your Lean bulk plan." */
    public static String summary(Nutrients serving, String planName) {
        double kcal = orZero(serving.kcal());
        if (kcal <= 0) return null;
        List<String> words = highlights(serving);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < Math.min(2, words.size()); i++) {
            text.append(i == 0 ? words.get(i) : ", " + words.get(i).toLowerCase());
        }
        if (!text.isEmpty()) text.append(". ");
        text.append(kcal < 250 ? "A light bite" : kcal < 500 ? "A light meal" : kcal < 850 ? "A filling meal"
                : "A big meal");
        if (planName != null && !planName.isBlank()) {
            String name = planName.trim();
            text.append(" for your ").append(name)
                    .append(name.toLowerCase(java.util.Locale.ROOT).endsWith("plan") ? "" : " plan");
        }
        return text.append('.').toString();
    }

    private static void grams(List<Detail> details, String key, String label, Double value) {
        details.add(new Detail(key, label, Nutrients.round(value, 1), "g", null));
    }

    private static void daily(List<Detail> details, String key, String label, Double value, String unit, double nrv) {
        if (value == null) return;
        details.add(new Detail(key, label, Nutrients.round(value, 1), unit, (int) Math.round(100 * value / nrv)));
    }

    private static Integer pct(Double value, double of) {
        return value == null || of <= 0 ? null : (int) Math.round(100 * value / of);
    }

    private static double orZero(Double value) {
        return value == null ? 0 : value;
    }
}
