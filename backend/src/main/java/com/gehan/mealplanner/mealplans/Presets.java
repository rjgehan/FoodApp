package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetDetails;

import java.util.List;
import java.util.Optional;

/**
 * The ready-made plans on the Meal plans page (mockup 5.7). Each is only a filled-in create
 * form — an example person, a goal and some preferences — whose meals are chosen from the
 * household's own and published recipes when it is opened, exactly as a plan of your own is.
 * No recipes are stored or invented for them, and nothing about them is anybody's real details.
 */
public final class Presets {

    public record Preset(String key, String name, String subtitle, List<String> tags, String icon, String hue,
                         TargetDetails details) {
    }

    private static final List<MealType> FOUR_MEALS = List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK);

    private static TargetDetails details(int age, String sex, double cm, double kg, String activity, String goal,
                                         List<String> prefs, String description) {
        return new TargetDetails(age, sex, cm, kg, activity, goal, prefs, List.of(), true, false, 7, FOUR_MEALS,
                null, description, "imperial");
    }

    public static final List<Preset> ALL = List.of(
            new Preset("build-muscle", "The 20-year-old guy", "Build muscle", List.of("build-muscle"), "flame", "tomato",
                    // 5 ft 11 and 165 lb.
                    details(20, "male", 180.3, 74.8, "moderate", "build-muscle", List.of(),
                            "Active, 5 ft 11, lifting 4x a week. Lean bulk.")),
            new Preset("heart-healthy", "Heart healthy", "Mediterranean", List.of("healthy"), "heart", "herb",
                    details(50, "female", 165, 68, "moderate", "maintain", List.of("heart-healthy"),
                            "Fish, beans, vegetables and olive oil; easy on salt and saturated fat.")),
            new Preset("veggie-high-protein", "Veggie high protein", "Vegetarian", List.of("healthy", "build-muscle"),
                    "leaf", "sky",
                    details(30, "male", 175, 70, "moderate", "maintain", List.of("vegetarian", "high-protein"),
                            "No meat or fish, and plenty of protein.")),
            new Preset("student-budget", "Student budget week", "Budget", List.of("budget"), "cup", "bread",
                    details(20, "male", 178, 70, "light", "maintain", List.of("budget", "under-30"),
                            "Cheap, quick and filling.")),
            new Preset("lose-fat", "Steady cut", "Lose fat", List.of("lose-fat"), "bolt", "mustard",
                    details(35, "female", 165, 72, "light", "lose-fat", List.of(),
                            "A gentle 20% under, with protein high to keep muscle.")));

    public static Optional<Preset> find(String key) {
        return ALL.stream().filter(p -> p.key().equals(key)).findFirst();
    }

    private Presets() {
    }
}
