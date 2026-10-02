package com.gehan.mealplanner.nutrition;

/**
 * An amount of food's worth of nutrients: grams unless the name says mg.
 *
 * A null is "not known", which is not the same as zero — USDA has no fibre figure for plenty of
 * foods that certainly have some. Adding keeps that distinction where it can: unknown plus
 * unknown stays unknown, and unknown plus a number is the number, because a recipe's fibre is
 * still worth showing when one of its ten ingredients has no figure.
 */
public record Nutrients(
        Double kcal,
        Double protein,
        Double carbs,
        Double fat,
        Double fibre,
        Double sugars,
        Double sodiumMg,
        Double satFat,
        Double ironMg,
        Double calciumMg,
        Double vitaminCMg,
        Double potassiumMg) {

    public static final Nutrients NONE = new Nutrients(null, null, null, null, null, null, null, null, null, null, null, null);

    public Nutrients scaled(double factor) {
        return new Nutrients(times(kcal, factor), times(protein, factor), times(carbs, factor), times(fat, factor),
                times(fibre, factor), times(sugars, factor), times(sodiumMg, factor), times(satFat, factor),
                times(ironMg, factor), times(calciumMg, factor), times(vitaminCMg, factor), times(potassiumMg, factor));
    }

    public Nutrients plus(Nutrients other) {
        return new Nutrients(add(kcal, other.kcal), add(protein, other.protein), add(carbs, other.carbs),
                add(fat, other.fat), add(fibre, other.fibre), add(sugars, other.sugars),
                add(sodiumMg, other.sodiumMg), add(satFat, other.satFat), add(ironMg, other.ironMg),
                add(calciumMg, other.calciumMg), add(vitaminCMg, other.vitaminCMg), add(potassiumMg, other.potassiumMg));
    }

    /** Salt is what UK and EU labels print; it is sodium × 2.5 (Regulation (EU) No 1169/2011, Annex I). */
    public Double saltG() {
        return sodiumMg == null ? null : sodiumMg * 2.5 / 1000.0;
    }

    /** Rounded for sending: whole kcal and mg, one decimal for grams. */
    public Nutrients rounded() {
        return new Nutrients(round(kcal, 0), round(protein, 1), round(carbs, 1), round(fat, 1), round(fibre, 1),
                round(sugars, 1), round(sodiumMg, 0), round(satFat, 1), round(ironMg, 1), round(calciumMg, 0),
                round(vitaminCMg, 1), round(potassiumMg, 0));
    }

    public double kcalOrZero() {
        return kcal == null ? 0 : kcal;
    }

    private static Double times(Double value, double factor) {
        return value == null ? null : value * factor;
    }

    private static Double add(Double a, Double b) {
        if (a == null) return b;
        if (b == null) return a;
        return a + b;
    }

    static Double round(Double value, int places) {
        if (value == null) return null;
        double scale = Math.pow(10, places);
        return Math.round(value * scale) / scale;
    }
}
