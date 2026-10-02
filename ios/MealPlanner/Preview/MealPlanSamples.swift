import Foundation

/// Meal plans without a server, for the canvas and the Gallery: the mockup's own numbers
/// (5.7–5.11). Shapes, not fixtures — the e2e suite checks the real answers.
enum MealPlanSamples {
    static let options = FormOptions(
        activities: [
            ActivityOption(key: "sedentary", label: "Mostly sitting", factor: 1.2),
            ActivityOption(key: "light", label: "Light exercise 1–3x a week", factor: 1.375),
            ActivityOption(key: "moderate", label: "Lifts 3–5x a week", factor: 1.55),
            ActivityOption(key: "active", label: "Hard exercise 6–7x a week", factor: 1.725),
            ActivityOption(key: "very-active", label: "Physical job or twice a day", factor: 1.9),
        ],
        goals: [GoalOption(key: .loseFat, label: "Lose fat"), GoalOption(key: .maintain, label: "Maintain"),
                GoalOption(key: .buildMuscle, label: "Build muscle")],
        preferences: [
            PreferenceOption(key: "no-pork", label: "No pork", shown: true),
            PreferenceOption(key: "dairy-ok", label: "Dairy ok", shown: true),
            PreferenceOption(key: "under-30", label: "Under 30 min", shown: true),
            PreferenceOption(key: "vegetarian", label: "Vegetarian", shown: true),
            PreferenceOption(key: "budget", label: "Budget", shown: true),
            PreferenceOption(key: "vegan", label: "Vegan", shown: false),
            PreferenceOption(key: "high-protein", label: "High protein", shown: false),
        ],
        lengths: [3, 5, 7, 14], defaultMeals: [.breakfast, .lunch, .dinner, .snack])

    static let home = MealPlansHome(
        cupboard: CupboardTeaser(items: 64, useSoon: 5, highlights: ["Chickpeas", "Spinach", "Rice", "Eggs"]),
        filters: [PlanFilter(key: "all", label: "All"), PlanFilter(key: "build-muscle", label: "Build muscle"),
                  PlanFilter(key: "lose-fat", label: "Lose fat"), PlanFilter(key: "healthy", label: "Healthy"),
                  PlanFilter(key: "budget", label: "Budget")],
        plans: [
            card(nil, "build-muscle", "The 20-year-old guy", "Build muscle · 7 days", ["build-muscle"], "flame", "tomato", 2900, 160),
            card(nil, "heart-healthy", "Heart healthy", "Mediterranean · 7 days", ["healthy"], "heart", "herb", 2100, 110),
            card(nil, "veggie-high-protein", "Veggie high protein", "Vegetarian · 7 days", ["healthy", "build-muscle"], "leaf", "sky", 2300, 130),
            card(nil, "student-budget", "Student budget week", "Budget · 7 days", ["budget"], "cup", "bread", 2400, 95),
            card(UUID(uuidString: "1B6C3E7A-1111-4E2A-9C4B-3D2E1F0A9B8C"), nil, "Ryan · summer cut", "Lose fat · 7 days",
                 ["lose-fat"], "bolt", "mustard", 2200, 170),
        ],
        form: options)

    private static func card(_ id: UUID?, _ preset: String?, _ name: String, _ subtitle: String, _ tags: [String],
                             _ icon: String, _ hue: String, _ kcal: Int, _ protein: Int) -> TargetPlanCard {
        TargetPlanCard(id: id, preset: preset, mine: id != nil, name: name, subtitle: subtitle, goal: tags.first ?? "maintain",
                       tags: tags, icon: icon, hue: hue, kcal: kcal, protein: protein, length: 7, updatedAt: nil)
    }

    static let setup = CupboardSetup(
        items: 64, useSoon: 5, highlights: ["Spinach", "Chicken thighs"],
        useFirst: [
            use("Spinach", "date", "by Thu", true), use("Chicken thighs", "date", "by Wed", true),
            use("Greek yogurt", "low", "low", true), use("Coriander", "guess", "soon", true),
            use("Chickpeas", "plenty", "3 tins", true),
        ],
        days: (0..<7).map { SetupDay(date: NutritionText.day($0), planned: $0 == 5 ? [.dinner] : []) },
        defaultMeals: [.lunch, .dinner], defaultDays: 4, defaultBuyLimit: 5, defaultOnlyMine: true, defaultServings: 4)

    private static func use(_ name: String, _ reason: String, _ label: String, _ on: Bool) -> UseFirstItem {
        UseFirstItem(itemId: UUID(), ingredientId: UUID(), name: name, reason: reason, label: label, useBy: nil, selected: on)
    }

    static let request = CupboardPlanRequest(dates: (0..<4).map { NutritionText.day($0) }, meals: [.lunch, .dinner],
                                             useFirst: [], buyLimit: 5, onlyMine: true, servings: 4)

    static let draft = CupboardPlan(
        dates: request.dates, mealTypes: [.lunch, .dinner], buyLimit: 5, onlyMine: true, servings: 4,
        percentFromCupboard: 87, itemsUsed: 31,
        summary: "Uses 31 items, 5 to buy. Spinach and chicken thighs get used before they go off.",
        meals: [
            meal(0, .dinner, "Chickpea & spinach curry", .dinner, 100),
            meal(0, .lunch, "Leftover curry wraps", .lunch, 100),
            meal(1, .dinner, "Lemon herb chicken", .dinner, 90),
            meal(2, .dinner, "Egg fried rice", .dinner, 75),
        ],
        open: [OpenSlot(date: NutritionText.day(1), mealType: .lunch, reason: "NOTHING_FITS"),
               OpenSlot(date: NutritionText.day(2), mealType: .lunch, reason: "PLANNED")],
        toBuy: ["Lemons", "Soy sauce", "Spring onions", "Tortillas", "Ginger"].map { ToBuy(ingredientId: UUID(), name: $0, meals: 1) },
        useSoonUsed: ["Spinach", "Chicken thighs"], useSoonLeft: [], recipesConsidered: 40, swapped: nil)

    private static func meal(_ day: Int, _ type: MealType, _ name: String, _ section: RecipeSection, _ pct: Int) -> DraftMeal {
        DraftMeal(date: NutritionText.day(day), mealType: type, recipeId: UUID(), name: name, section: section, yours: true,
                  coverImageId: nil, percentFromCupboard: pct, uses: [], usesSoon: [], toBuy: [], servings: 4)
    }

    static let plan: TargetPlan = {
        let targets = Targets(kcal: 2900, protein: 160, carbs: 340, fat: 95,
                              computed: MacroNumbers(kcal: 2900, protein: 160, carbs: 340, fat: 95),
                              overridden: [], bmr: 1780, tdee: 2759)
        let day0 = [
            planMeal(0, .breakfast, "Protein oats with banana", .breakfast, true, 720, 42),
            planMeal(0, .lunch, "Chicken burrito bowl", .lunch, false, 850, 52),
            planMeal(0, .snack, "Greek yogurt & honey", .snacks, true, 290, 24),
            planMeal(0, .dinner, "Beef ragu with rigatoni", .dinner, false, 1040, 48),
        ]
        let days = (0..<7).map { d in
            PlanDay(day: d, kcal: 2900, protein: 166, carbs: 330, fat: 92,
                    meals: day0.map { PlanMeal(day: d, mealType: $0.mealType, recipeId: $0.recipeId, name: $0.name,
                                               section: $0.section, yours: $0.yours, coverImageId: nil, portion: $0.portion,
                                               kcal: $0.kcal, protein: $0.protein, carbs: $0.carbs, fat: $0.fat, missing: false) })
        }
        let details = TargetDetails(age: 20, sex: "male", heightCm: 180.3, weightKg: 74.8, activity: "moderate",
                                    goal: .buildMuscle, description: "Active, 5 ft 11, lifting 4x a week. Lean bulk.")
        return TargetPlan(id: nil, preset: "build-muscle", mine: false, name: "The 20-year-old guy",
                          description: details.description, goal: "build-muscle", goalLabel: "Build muscle", length: 7,
                          mealTypes: [.breakfast, .lunch, .dinner, .snack], tags: ["build-muscle"], icon: "flame", hue: "tomato",
                          targets: targets, details: details, days: days,
                          average: PlanAverage(kcal: 2900, protein: 166, carbs: 330, fat: 92, kcalPercent: 100, proteinPercent: 104),
                          allowed: 24,
                          summary: "About 2,900 kcal and 166 g protein a day: 100% and 104% of the targets. 14 of 28 meals are your own recipes.",
                          updatedAt: nil)
    }()

    private static func planMeal(_ day: Int, _ type: MealType, _ name: String, _ section: RecipeSection, _ yours: Bool,
                                 _ kcal: Int, _ protein: Int) -> PlanMeal {
        PlanMeal(day: day, mealType: type, recipeId: UUID(), name: name, section: section, yours: yours, coverImageId: nil,
                 portion: 1, kcal: kcal, protein: protein, carbs: kcal / 9, fat: kcal / 30, missing: false)
    }
}
