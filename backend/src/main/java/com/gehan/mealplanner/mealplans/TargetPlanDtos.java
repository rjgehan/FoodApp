package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Plans for health targets (mockup 5.7, 5.10, 5.11): ready-made ones and your own private ones. */
public class TargetPlanDtos {

    /**
     * Who a plan is for and what it should do. Metric on the wire; {@code units} only remembers
     * how the form showed them ("imperial": ft/in and lb), so it opens the same way again.
     *
     * @param sex          "male", "female", or anything else / null for rather not say
     * @param activity     sedentary, light, moderate, active, very-active
     * @param goal         lose-fat, maintain, build-muscle
     * @param preferences  keys from {@link Preferences#OPTIONS}
     * @param avoid        anybody's own words to keep out ("mushrooms")
     * @param onlyMyRecipes never use recipes published by other households
     * @param description  a line under the name ("Active, 5 ft 11, lifting 4x a week. Lean bulk.")
     */
    public record TargetDetails(
            @NotNull @Min(16) @Max(100) Integer age,
            @Size(max = 20) String sex,
            @NotNull @DecimalMin("120") @DecimalMax("230") Double heightCm,
            @NotNull @DecimalMin("35") @DecimalMax("250") Double weightKg,
            @Size(max = 20) String activity,
            @Size(max = 20) String goal,
            @Size(max = 20) List<@NotBlank @Size(max = 30) String> preferences,
            @Size(max = 20) List<@NotBlank @Size(max = 40) String> avoid,
            Boolean useMyRecipesFirst,
            Boolean onlyMyRecipes,
            @Min(1) @Max(14) Integer days,
            @Size(max = 4) List<@NotNull MealType> meals,
            @Valid TargetOverrides overrides,
            @Size(max = 160) String description,
            @Size(max = 10) String units) {
    }

    /** Numbers set by hand; null keeps the worked-out one. */
    public record TargetOverrides(
            @Min(800) @Max(6000) Integer kcal,
            @Min(0) @Max(500) Integer protein,
            @Min(0) @Max(900) Integer carbs,
            @Min(0) @Max(400) Integer fat) {
    }

    /** Just the parts the numbers come from, for the form's live tiles. */
    public record CalculateRequest(
            @NotNull @Min(16) @Max(100) Integer age, @Size(max = 20) String sex,
            @NotNull @DecimalMin("120") @DecimalMax("230") Double heightCm,
            @NotNull @DecimalMin("35") @DecimalMax("250") Double weightKg,
            @Size(max = 20) String activity, @Size(max = 20) String goal, @Valid TargetOverrides overrides) {
    }

    /**
     * @param computed   what the details work out to, before anything set by hand
     * @param overridden which of kcal / protein / carbs / fat were set by hand
     */
    public record TargetsResponse(int kcal, int protein, int carbs, int fat, Macro computed, List<String> overridden,
                                  int bmr, int tdee) {
    }

    public record Macro(int kcal, int protein, int carbs, int fat) {
    }

    /** One chosen meal as it is kept: day 0 is the plan's first day. */
    public record StoredMeal(int day, MealType mealType, UUID recipeId, double portion) {
    }

    /** A new plan: details, and optionally the meals of a preview to keep exactly. */
    public record CreateTargetPlanRequest(
            @NotBlank @Size(max = 80) String name,
            @NotNull @Valid TargetDetails details,
            @Size(max = 56) List<@Valid PlanMealChoice> meals) {
    }

    /**
     * New details choose the meals again; {@code meals} (a preview's, chosen by a phone's Apple
     * Intelligence) are kept exactly instead, as on create. A new name alone keeps them.
     */
    public record UpdateTargetPlanRequest(@Size(max = 80) String name, @Valid TargetDetails details,
                                          @Size(max = 56) List<@Valid PlanMealChoice> meals) {
    }

    public record PlanMealChoice(@Min(0) @Max(13) int day, @NotNull MealType mealType, @NotNull UUID recipeId,
                                 @DecimalMin("0.25") @DecimalMax("4") double portion) {
    }

    /**
     * Preview from details (nothing saved). {@code chosen}: the recipe a phone's Apple
     * Intelligence wants in each slot, taken where the rules allow, in the planner's own portions.
     */
    public record PreviewRequest(@Size(max = 80) String name, @NotNull @Valid TargetDetails details,
                                 @Size(max = 56) List<@Valid SlotChoice> chosen) {
    }

    /** A recipe for a slot, without a portion: the server works that out. */
    public record SlotChoice(@Min(0) @Max(13) int day, @NotNull MealType mealType, @NotNull UUID recipeId) {
    }

    /**
     * Swap one meal of a preview: everything else is kept as the client has it. {@code recipeId}:
     * the one a phone's model wants there, used if the rules allow it.
     */
    public record PreviewSwapRequest(@Size(max = 80) String name, @NotNull @Valid TargetDetails details,
                                     @NotNull @Size(max = 56) List<@Valid PlanMealChoice> meals,
                                     @Min(0) @Max(13) int day, @NotNull MealType mealType,
                                     @Size(max = 200) List<UUID> exclude, UUID recipeId) {
    }

    public record SwapRequest(@Min(0) @Max(13) int day, @NotNull MealType mealType, @Size(max = 200) List<UUID> exclude,
                              UUID recipeId) {
    }

    /** What a phone's Apple Intelligence chooses a plan from: the details, as for a preview. */
    public record CandidatesRequest(@NotNull @Valid TargetDetails details) {
    }

    /**
     * @param aims    roughly what each meal is aiming at: the day's targets shared out
     * @param recipes the ones the preferences allow, best leaning first, with their nutrition per serving
     */
    public record TargetCandidatesResponse(TargetsResponse targets, int length, List<MealType> mealTypes,
                                           List<MealAim> aims, List<TargetCandidate> recipes) {
    }

    public record MealAim(MealType mealType, int kcal, int protein) {
    }

    /** @param fits the plan's meals it may go in */
    public record TargetCandidate(UUID recipeId, String name, RecipeSection section, boolean yours, List<MealType> fits,
                                  int kcal, int protein, int carbs, int fat, Integer minutes) {
    }

    /**
     * Puts a saved plan on the Plan from a start date: day 0 on {@code start}.
     *
     * @param days     which of the plan's days (0-based); all of them when left out
     * @param servings how many to cook for; the household's usual when left out
     */
    public record ApplyTargetPlanRequest(@NotNull LocalDate start, @Size(max = 14) List<Integer> days,
                                         @Min(1) @Max(50) Integer servings) {
    }

    /**
     * A plan with every meal. {@code id} is null for a ready-made plan or a preview, which are
     * worked out fresh from the household's recipes each time and never stored.
     *
     * @param mine      your own saved plan (only ever true: nobody else's is ever sent)
     * @param preset    the ready-made plan's key
     * @param details   who it is for — your own, or the ready-made plan's example person
     * @param allowed   how many recipes the preferences left to choose from
     */
    public record TargetPlanResponse(
            UUID id, String preset, boolean mine, String name, String description, String goal, String goalLabel,
            int length, List<MealType> mealTypes, List<String> tags, String icon, String hue,
            TargetsResponse targets, TargetDetails details, List<PlanDay> days, Average average,
            int allowed, String summary, Instant updatedAt) {
    }

    /** One day: its meals and how they add up. */
    public record PlanDay(int day, int kcal, int protein, int carbs, int fat, List<PlanMeal> meals) {
    }

    /** The plan's daily average against its targets. */
    public record Average(int kcal, int protein, int carbs, int fat, int kcalPercent, int proteinPercent) {
    }

    /**
     * @param portion  servings of the recipe for this person ("1.5")
     * @param yours    the household's own recipe (or shared with / filed by it); false is from Explore
     * @param missing  the recipe was deleted or is no longer readable; the numbers are zero
     */
    public record PlanMeal(int day, MealType mealType, UUID recipeId, String name, RecipeSection section,
                           boolean yours, UUID coverImageId, double portion, int kcal, int protein, int carbs,
                           int fat, boolean missing) {
    }

    /** A card on the Meal plans page. */
    public record TargetPlanCard(UUID id, String preset, boolean mine, String name, String subtitle, String goal,
                                 List<String> tags, String icon, String hue, int kcal, int protein, int length,
                                 Instant updatedAt) {
    }

    public record Filter(String key, String label) {
    }

    public record ActivityOption(String key, String label, double factor) {
    }

    public record GoalOption(String key, String label) {
    }

    /** Everything the create form offers. */
    public record FormOptions(List<ActivityOption> activities, List<GoalOption> goals,
                              List<Preferences.Option> preferences, List<Integer> lengths,
                              List<MealType> defaultMeals) {
    }

    /** The Meal plans page in one request (mockup 5.7). */
    public record MealPlansHome(CupboardTeaser cupboard, List<Filter> filters, List<TargetPlanCard> plans,
                                FormOptions form) {
    }

    /** "Build the next few days around the 64 things you already have. 5 need using soon." */
    public record CupboardTeaser(int items, int useSoon, List<String> highlights) {
    }
}
