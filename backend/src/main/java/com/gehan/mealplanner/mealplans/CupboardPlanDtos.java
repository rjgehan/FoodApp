package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Cook from your cupboard (mockup 5.7–5.9), and putting any generated meals on the Plan. */
public class CupboardPlanDtos {

    /**
     * Everything the setup screen starts from, and the teaser on the Meal plans and Explore pages
     * ("64 things you already have. 5 need using soon.").
     *
     * @param items      things in the cupboard (not used up)
     * @param useSoon    how many of them want using soon
     * @param highlights a few names for chips — the use-soon ones first
     * @param useFirst   suggestions for "use these up first", pre-selected when soon
     * @param days       the next week, with what is already planned on each
     */
    public record CupboardSetupResponse(
            int items, int useSoon, List<String> highlights, List<UseFirstItem> useFirst, List<SetupDay> days,
            List<MealType> defaultMeals, int defaultDays, Integer defaultBuyLimit, boolean defaultOnlyMine,
            int defaultServings) {
    }

    /**
     * @param reason "date" (typed use-by), "guess" (the server's), "low" (running low), "plenty" (lots counted)
     * @param label  "by Thu", "soon", "low", "3 tins"
     */
    public record UseFirstItem(UUID itemId, UUID ingredientId, String name, String reason, String label,
                               LocalDate useBy, boolean selected) {
    }

    public record SetupDay(LocalDate date, List<MealType> planned) {
    }

    /**
     * @param buyLimit how many extra things it may need buying: 0, 5, 10, or null for any
     * @param useFirst ingredient ids from the cupboard to build around
     * @param onlyMine false lets it use recipes other households published to Explore
     */
    public record CupboardPlanRequest(
            @NotEmpty @Size(max = 14) List<@NotNull LocalDate> dates,
            @NotEmpty @Size(max = 4) List<@NotNull MealType> meals,
            @Size(max = 200) List<UUID> useFirst,
            @Min(0) @Max(100) Integer buyLimit,
            Boolean onlyMine,
            @Min(1) @Max(50) Integer servings) {
    }

    /** One meal of a draft, as the client holds it. */
    public record MealChoice(@NotNull LocalDate date, @NotNull MealType mealType, @NotNull UUID recipeId) {
    }

    /**
     * Swap one meal for the next best: everything else stays as it is. {@code exclude}: recipes
     * already shown in that slot, so pressing swap again keeps moving on.
     */
    public record CupboardSwapRequest(
            @NotNull @Valid CupboardPlanRequest setup,
            @NotNull @Size(max = 60) List<@Valid MealChoice> meals,
            @NotNull LocalDate date,
            @NotNull MealType mealType,
            @Size(max = 200) List<UUID> exclude) {
    }

    /**
     * A draft plan — nothing saved until it is applied.
     *
     * @param percentFromCupboard across every counted ingredient of every meal
     * @param itemsUsed           different cupboard things the meals use
     * @param summary             "Uses 31 items, 5 to buy. Spinach and chicken get used before they go off."
     * @param swapped             after a swap: false when nothing else could go there (the meal is unchanged)
     */
    public record CupboardPlanResponse(
            List<LocalDate> dates, List<MealType> mealTypes, Integer buyLimit, boolean onlyMine, int servings,
            int percentFromCupboard, int itemsUsed, String summary,
            List<DraftMeal> meals, List<OpenSlot> open, List<ToBuy> toBuy,
            List<String> useSoonUsed, List<String> useSoonLeft, int recipesConsidered, Boolean swapped) {
    }

    /**
     * @param yours       the household's own recipe (or shared with / filed by it); false is from Explore
     * @param uses        cupboard things it uses
     * @param usesSoon    of those, the ones that want using soon
     * @param toBuy       what it needs that the cupboard doesn't have
     */
    public record DraftMeal(LocalDate date, MealType mealType, UUID recipeId, String name, RecipeSection section,
                            boolean yours, UUID coverImageId, int percentFromCupboard, List<String> uses,
                            List<String> usesSoon, List<String> toBuy, int servings) {
    }

    /** @param reason "PLANNED" (something is on the Plan there already) or "NOTHING_FITS" */
    public record OpenSlot(LocalDate date, MealType mealType, String reason) {
    }

    /** @param meals how many of the draft's meals need it */
    public record ToBuy(UUID ingredientId, String name, int meals) {
    }

    /** One meal to put on the Plan. Servings default to the household's. */
    public record ApplyMeal(@NotNull LocalDate date, @NotNull MealType mealType, @NotNull UUID recipeId,
                            @Min(1) @Max(50) Integer servings) {
    }

    /**
     * Puts generated meals on the household's Plan. {@code addToGroceries}: ingredient ids for the
     * grocery list (the draft's "things to buy"), each added once with no amount.
     */
    public record ApplyRequest(@NotEmpty @Size(max = 60) List<@Valid ApplyMeal> meals,
                               @Size(max = 200) List<UUID> addToGroceries) {
    }

    /** @param reason "PLANNED": that slot already has something on the Plan, which is left alone */
    public record Skipped(LocalDate date, MealType mealType, UUID recipeId, String reason) {
    }

    public record ApplyResponse(int added, List<Skipped> skipped, int groceriesAdded, LocalDate from, LocalDate to) {
    }

    /** Quantities on cupboard items are only ever shown, e.g. "3 tins". */
    static String countLabel(BigDecimal quantity, String unit) {
        String q = quantity.stripTrailingZeros().toPlainString();
        return unit == null || unit.isBlank() ? q : q + " " + unit.trim();
    }
}
