package com.gehan.mealplanner.nutrition;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class NutritionDtos {

    private NutritionDtos() {
    }

    /** Where the numbers come from, worded as each source asks to be credited. */
    public record Attribution(String text, String url, String licence) {

        public static final Attribution USDA = new Attribution(
                "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2026. fdc.nal.usda.gov.",
                "https://fdc.nal.usda.gov/", "CC0 1.0 (public domain)");

        public static final Attribution OPEN_FOOD_FACTS = new Attribution(
                "Data from Open Food Facts (ODbL)", "https://world.openfoodfacts.org/", "ODbL 1.0");

        static Attribution openFoodFacts(String barcode) {
            return new Attribution(OPEN_FOOD_FACTS.text(), "https://world.openfoodfacts.org/product/" + barcode,
                    OPEN_FOOD_FACTS.licence());
        }
    }

    /** Rounded for showing: whole kcal and mg, one decimal for grams. Null is "not known". */
    public record Values(Double kcal, Double protein, Double carbs, Double fat, Double fibre, Double sugars,
                         Double satFat, Double saltG, Double sodiumMg, Double ironMg, Double calciumMg,
                         Double vitaminCMg, Double potassiumMg) {

        static Values of(Nutrients n) {
            Nutrients r = n.rounded();
            return new Values(r.kcal(), r.protein(), r.carbs(), r.fat(), r.fibre(), r.sugars(), r.satFat(),
                    Nutrients.round(n.saltG(), 2), r.sodiumMg(), r.ironMg(), r.calciumMg(), r.vitaminCMg(),
                    r.potassiumMg());
        }
    }

    /** Share of the calories from each macro, in whole percent (adds up to about 100). */
    public record MacroSplit(int protein, int carbs, int fat) {
    }

    /** "High protein", "Low fat" — with the tone the apps colour it in (good / info / warn). */
    public record Badge(String key, String label, String tone) {
    }

    /** One line of a label's details: "Calcium · 17% of daily". */
    public record Detail(String key, String label, Double amount, String unit, Integer percentDaily) {
    }

    /** What the percentages are of. source "reference" is the EU/UK reference intake. */
    public record Reference(double kcal, double protein, double carbs, double fat, double sugars, double satFat,
                            double saltG, double fibre, String label, String source) {
    }

    public record Percentages(Integer kcal, Integer protein, Integer carbs, Integer fat, Integer sugars,
                              Integer satFat, Integer saltG, Integer fibre) {
    }

    // Foods

    public record FoodSummary(int fdcId, String name, String category, Double kcal, Double protein,
                              double confidence) {
    }

    public record Portion(String label, double grams) {
    }

    public record FoodResponse(int fdcId, String name, String category, String dataset, Values per100g,
                               MacroSplit split, List<Detail> details, List<Badge> badges, List<Portion> portions,
                               Attribution attribution) {
    }

    // Matching

    public record Candidate(int fdcId, String name, String category, double confidence, Double kcal,
                            Double protein) {
    }

    public record MatchResponse(UUID ingredientId, String ingredientName, Integer fdcId, String foodName,
                                double confidence, String source, boolean counted, boolean guess,
                                List<Candidate> shortlist) {
    }

    /** source is "ai" (an iPhone's model chose from the shortlist) or "user". fdcId null = none of these. */
    public record SetMatchRequest(Integer fdcId, @NotBlank String source) {
    }

    public record SetGramsRequest(String unit, @NotNull Double grams, @NotBlank String source) {
    }

    public record GramsResponse(UUID ingredientId, String unitKey, double gramsEach, String source) {
    }

    // Recipes

    public record Contributor(UUID recipeIngredientId, UUID ingredientId, String name, Integer fdcId,
                              String foodName, String amount, double grams, String gramsHow, String gramsBasis,
                              boolean estimated, double kcal, double protein, double carbs, double fat, double share,
                              double confidence, String matchSource, boolean guess) {
    }

    /** reason: OPTIONAL (left out this time), NO_AMOUNT, NO_MATCH (not in the food data), NO_WEIGHT. */
    public record NotCounted(UUID recipeIngredientId, UUID ingredientId, String name, String reason,
                             BigDecimal quantity, String unit, boolean optional, Integer fdcId, String foodName) {
    }

    public record RecipeNutritionResponse(UUID recipeId, String name, int recipeServings, double servings,
                                          Values perServing, Values forServings, Values perRecipe,
                                          MacroSplit split, Reference reference, Percentages percentOfReference,
                                          List<String> highlights, String summary,
                                          List<Contributor> contributors, List<NotCounted> notCounted,
                                          int linesCounted, int linesTotal, boolean complete, String note,
                                          Attribution attribution) {
    }

    // Plans

    /**
     * partial: some planned meals were not counted. fuller: two or more meals counted — the days
     * the average is taken over, when there are any.
     */
    public record PlanDay(LocalDate date, Values totals, int mealsPlanned, int mealsCounted, boolean partial,
                          boolean fuller) {
    }

    /** reason: PLACE, SAVED_LINK, NO_DATA, DELETED. */
    public record PlanMealNotCounted(LocalDate date, String mealType, String name, String reason) {
    }

    /**
     * average is over averageDays days: the fuller ones (averageOver "fuller"), or when there are
     * none every day with something counted ("partial"), or nothing ("none").
     */
    public record PlanNutritionResponse(LocalDate start, LocalDate end, List<PlanDay> days, Values average,
                                        int daysCounted, int mealsPlanned, int mealsCounted,
                                        List<PlanMealNotCounted> notCounted, Reference reference, String note,
                                        Attribution attribution, int averageDays, String averageOver) {
    }

    // Products

    public record ProductResponse(String barcode, String name, String brand, String size, Double packGrams,
                                  boolean liquid, String servingSize, Double servingGrams, Values per100g,
                                  Values perServing, MacroSplit split, List<Detail> details, List<Badge> badges,
                                  String nutriScore, Integer novaGroup, boolean hasNutrition, Attribution attribution) {
    }

    public record ProductHit(String barcode, String name, String brand, String size, Double kcal, Double protein) {
    }

    // Search and recent lookups

    public record RecipeHit(UUID id, String name, Double kcalPerServing, Double proteinPerServing) {
    }

    /** productsStatus: ok, cached, skipped (too short / not asked), debounced, busy (rate limit), unavailable. */
    public record SearchResponse(String query, List<FoodSummary> ingredients, List<ProductHit> products,
                                 String productsStatus, List<RecipeHit> recipes, List<Attribution> attribution) {
    }

    public record RecentRequest(@NotBlank String kind, @NotBlank @Size(max = 64) String ref,
                                @Size(max = 200) String label, Double kcal, Double protein, UUID householdId) {
    }

    public record RecentLookup(String kind, String ref, String label, Double kcal, Double protein, String per,
                               Instant lookedAt) {
    }

    public record StatusResponse(boolean ready, int foods, String version, List<Attribution> attribution) {
    }
}
