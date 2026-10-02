import Foundation

/// Nutrition facts without a server, for the canvas and the Gallery: the mockup's own numbers
/// (5.4–5.6). Shapes, not fixtures — the e2e suite checks the real answers.
enum NutritionSamples {
    static let today = NutritionText.day(0)

    /// The coming seven days: five counted, one with nothing planned, one a meal out.
    static let week: PlanNutrition = {
        let kcal: [Double?] = [2310, 1980, 2260, nil, 2450, 1720, nil]
        let days = kcal.enumerated().map { i, k in
            PlanNutritionDay(date: NutritionText.day(i),
                             totals: k.map { NutrientValues(kcal: $0, protein: $0 / 18, carbs: $0 / 9, fat: $0 / 27, fibre: 24) } ?? .none,
                             mealsPlanned: k == nil ? (i == 3 ? 1 : 0) : 3, mealsCounted: k == nil ? 0 : 3, partial: false)
        }
        return PlanNutrition(start: days[0].date, end: days[6].date, days: days,
                             average: NutrientValues(kcal: 2140, protein: 118, carbs: 231, fat: 79, fibre: 24),
                             daysCounted: 5, mealsPlanned: 16, mealsCounted: 15, reference: reference,
                             note: "One person's share: a serving of each meal.")
    }()

    static let emptyWeek = PlanNutrition(
        start: today, end: NutritionText.day(6),
        days: (0..<7).map { PlanNutritionDay(date: NutritionText.day($0), totals: .none, mealsPlanned: 0, mealsCounted: 0, partial: false) },
        average: .none, daysCounted: 0, mealsPlanned: 0, mealsCounted: 0, reference: reference, note: nil)

    static let recipeId = UUID(uuidString: "6B1E0D2A-8C51-4E7B-9D3F-2A4C5E6F7081")!

    static let recent: [RecentLookup] = [
        RecentLookup(kind: "PRODUCT", ref: "5000112637922", label: "Greek yogurt 0%", kcal: 57, protein: 10, per: "100g", lookedAt: nil),
        RecentLookup(kind: "FOOD", ref: "173757", label: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids",
                     kcal: 139, protein: 7, per: "100g", lookedAt: nil),
        RecentLookup(kind: "RECIPE", ref: recipeId.uuidString, label: "Lemon herb chicken", kcal: 512, protein: 41, per: "serving", lookedAt: nil),
    ]

    static let reference = NutritionReference(kcal: 2100, protein: 160, carbs: 300, fat: 80, sugars: 90, satFat: 20,
                                              saltG: 6, fibre: 30, label: "a 2,100 kcal day", source: "reference")

    static let yogurt = ProductLabel(
        barcode: "5000112637922", name: "Greek yogurt 0%", brand: "Kitchen Dairy", size: "500g tub", packGrams: 500,
        liquid: false, servingSize: "170 g", servingGrams: 170,
        per100g: NutrientValues(kcal: 57, protein: 10, carbs: 3.6, fat: 0.4, fibre: 0, sugars: 3.6, satFat: 0.1, saltG: 0.06),
        perServing: NutrientValues(kcal: 97, protein: 17, carbs: 6, fat: 0.7, fibre: 0, sugars: 6, satFat: 0.2, saltG: 0.1),
        split: MacroSplit(protein: 68, carbs: 26, fat: 6),
        details: [
            LabelDetail(key: "sugars", label: "Sugars", amount: 3.6, unit: "g", percentDaily: nil),
            LabelDetail(key: "fibre", label: "Fibre", amount: 0, unit: "g", percentDaily: nil),
            LabelDetail(key: "salt", label: "Salt", amount: 0.06, unit: "g", percentDaily: nil),
        ],
        badges: [LabelBadge(key: "high-protein", label: "High protein", tone: "good"),
                 LabelBadge(key: "low-fat", label: "Low fat", tone: "info")],
        nutriScore: "a", novaGroup: 1, hasNutrition: true,
        attribution: NutritionAttribution(text: "Data from Open Food Facts (ODbL)",
                                          url: "https://world.openfoodfacts.org/product/5000112637922", licence: "ODbL 1.0"))

    static let chickpeas = FoodLabel(
        fdcId: 173757, name: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids",
        category: "Legumes and Legume Products", dataset: "sr_legacy",
        per100g: NutrientValues(kcal: 139, protein: 7, carbs: 22.5, fat: 2.6, fibre: 7.6, sugars: 0.2, satFat: 0.3,
                                saltG: 0.6, sodiumMg: 246, ironMg: 1.3, calciumMg: 43),
        split: MacroSplit(protein: 20, carbs: 63, fat: 17),
        details: [
            LabelDetail(key: "sugars", label: "Sugars", amount: 0.2, unit: "g", percentDaily: nil),
            LabelDetail(key: "fibre", label: "Fibre", amount: 7.6, unit: "g", percentDaily: nil),
            LabelDetail(key: "salt", label: "Salt", amount: 0.6, unit: "g", percentDaily: nil),
            LabelDetail(key: "iron", label: "Iron", amount: 1.3, unit: "mg", percentDaily: 9),
            LabelDetail(key: "calcium", label: "Calcium", amount: 43, unit: "mg", percentDaily: 5),
        ],
        badges: [LabelBadge(key: "high-fibre", label: "High fibre", tone: "good")],
        portions: [FoodPortion(label: "1 cup", grams: 152)],
        attribution: .usda)

    static func lemonChicken(servings: Int = 1, potatoesIn: Bool = false, aiMarks: Bool = false) -> RecipeNutrition {
        let s = Double(servings)
        let per = NutrientValues(kcal: 512, protein: 41, carbs: 9, fat: 34, fibre: 2, sugars: 3, satFat: 8, saltG: 1.1)
        let potatoes = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!
        return RecipeNutrition(
            recipeId: recipeId, name: "Lemon herb chicken", recipeServings: 4, servings: s,
            perServing: per, forServings: per.scaled(s), perRecipe: per.scaled(4),
            split: MacroSplit(protein: 32, carbs: 7, fat: 61), reference: reference,
            percentOfReference: ReferencePercentages(kcal: Int((512 * s / 2100 * 100).rounded())),
            highlights: ["High protein", "Low carb"], summary: "High protein, low carb. A filling meal.",
            contributors: [
                NutritionContributor(recipeIngredientId: UUID(), ingredientId: UUID(), name: "chicken thighs, skin on",
                                     fdcId: 172386, foodName: "Chicken, broilers or fryers, thigh, meat and skin, raw",
                                     amount: "800 g", grams: 200 * s, gramsHow: "WEIGHT", gramsBasis: nil, estimated: false,
                                     kcal: 318 * s, protein: 38 * s, carbs: 0, fat: 18 * s, share: 0.62, confidence: 0.8,
                                     matchSource: aiMarks ? "ai" : "auto", guess: false),
                NutritionContributor(recipeIngredientId: UUID(), ingredientId: UUID(), name: "olive oil", fdcId: 171413,
                                     foodName: "Oil, olive, salad or cooking", amount: "4 tbsp", grams: 13.5 * s,
                                     gramsHow: "VOLUME", gramsBasis: "1 tbsp = 13.5 g", estimated: true,
                                     kcal: 119 * s, protein: 0, carbs: 0, fat: 13 * s, share: 0.23, confidence: 0.9,
                                     matchSource: "auto", guess: false),
                NutritionContributor(recipeIngredientId: UUID(), ingredientId: UUID(), name: "butter", fdcId: 173410,
                                     foodName: "Butter, salted", amount: "1 knob", grams: 3 * s,
                                     gramsHow: aiMarks ? "LEARNED" : "ROUGH",
                                     gramsBasis: aiMarks ? "1 knob = 12 g (estimated)" : "a knob is about 12 g",
                                     estimated: !aiMarks, kcal: 22 * s, protein: 0, carbs: 0, fat: 2.4 * s, share: 0.04,
                                     confidence: 0.9, matchSource: "auto", guess: false),
            ] + (potatoesIn ? [
                NutritionContributor(recipeIngredientId: potatoes, ingredientId: UUID(), name: "roasted potatoes", fdcId: 170093,
                                     foodName: "Potatoes, roasted", amount: "600 g", grams: 150 * s, gramsHow: "WEIGHT",
                                     gramsBasis: nil, estimated: false, kcal: 140 * s, protein: 3 * s, carbs: 30 * s,
                                     fat: 1 * s, share: 0.2, confidence: 0.8, matchSource: "auto", guess: false),
            ] : []),
            notCounted: potatoesIn ? [] : [
                NutritionNotCounted(recipeIngredientId: potatoes, ingredientId: UUID(), name: "roasted potatoes (side)",
                                    reason: "OPTIONAL", quantity: 600, unit: "g", optional: true, fdcId: nil, foodName: nil),
            ],
            linesCounted: 3, linesTotal: 5, complete: true,
            note: "Figures are estimates from ingredient data. Optional garnish not counted.",
            attribution: .usda)
    }

    /// A granola bar's label as the model would copy it off a photo, per 100 g.
    static let readLabel = LabelReading(
        name: "Oat & honey granola bar",
        per100g: NutrientValues(kcal: 370, protein: 8, carbs: 55, fat: 12, fibre: 4, sugars: 20, satFat: 4, saltG: 0.5),
        servingGrams: 30)

    static let search = NutritionSearchAnswer(
        query: "chick",
        ingredients: [
            FoodHit(fdcId: 171477, name: "Chicken, broilers or fryers, breast, meat only, raw", category: nil, kcal: 120, protein: 22.5),
            FoodHit(fdcId: 173757, name: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids",
                    category: nil, kcal: 139, protein: 7),
        ],
        products: [], productsStatus: "skipped",
        recipes: [RecipeHit(id: recipeId, name: "Lemon herb chicken", kcalPerServing: 512)])
}
