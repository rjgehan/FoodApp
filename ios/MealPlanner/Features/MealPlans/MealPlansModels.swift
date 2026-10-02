import Foundation

/*
 What the server's meal plans answer with (CupboardPlanDtos.java, TargetPlanDtos.java) and the
 few ways the Meal plans screens write it down — the same shapes the web's api/mealPlans.ts reads.
 Every recipe choice and every number is the server's; on a phone with Apple Intelligence the
 model only chooses among the server's candidates (MealPlanAssist.swift), and the server checks
 and works out every number again.

 Foundation only, so ios/checks can compile it on a Mac with no app.
*/

// MARK: - The door

/// GET /api/meal-plans: answers on a server that has meal plans; an older one says 404.
struct MealPlansStatus: Codable, Hashable {
    let ready: Bool
    let features: [String]
}

// MARK: - Cook from your cupboard (5.8, 5.9)

/// One suggestion for "Use these up first": `label` is "by Thu", "soon", "low" or "3 tins".
struct UseFirstItem: Codable, Hashable, Identifiable {
    let itemId: UUID
    let ingredientId: UUID
    let name: String
    /// "date", "guess", "low", "plenty" — and "ai" for one this phone's model guessed.
    let reason: String
    let label: String
    let useBy: String?
    let selected: Bool

    var id: UUID { ingredientId }
}

struct SetupDay: Codable, Hashable {
    let date: String
    let planned: [MealType]
}

/// Something in the cupboard the server's use-soon rule has no view on, for the phone to guess.
struct UnsureItem: Codable, Hashable {
    let itemId: UUID
    let ingredientId: UUID
    let name: String
    let arrivedOn: String
}

struct CupboardSetup: Codable, Hashable {
    let items: Int
    let useSoon: Int
    let highlights: [String]
    var useFirst: [UseFirstItem]
    /// The coming week from today, with what is on the Plan already.
    let days: [SetupDay]
    let defaultMeals: [MealType]
    let defaultDays: Int
    /// Nil is "any".
    let defaultBuyLimit: Int?
    let defaultOnlyMine: Bool
    let defaultServings: Int
    /// Absent from a server older than the phone's guesses.
    var unsure: [UnsureItem]? = nil
}

/// A meal of a draft as the phone holds it, or one its model wants in a slot.
struct MealChoice: Codable, Hashable {
    let date: String
    let mealType: MealType
    let recipeId: UUID
}

struct CupboardPlanRequest: Codable, Hashable {
    var dates: [String]
    var meals: [MealType]
    var useFirst: [UUID]
    /// Nil is "any". Always sent, as null for any — the server reads a missing one the same.
    var buyLimit: Int?
    var onlyMine: Bool
    var servings: Int
    /// What a phone's model chose for each slot; the server takes each one the rules allow.
    var chosen: [MealChoice]? = nil

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(dates, forKey: .dates)
        try c.encode(meals, forKey: .meals)
        try c.encode(useFirst, forKey: .useFirst)
        try c.encode(buyLimit, forKey: .buyLimit)
        try c.encode(onlyMine, forKey: .onlyMine)
        try c.encode(servings, forKey: .servings)
        try c.encodeIfPresent(chosen, forKey: .chosen)
    }

    /// The same setup without a model's choices, as a swap or a fresh draft sends it.
    var plain: CupboardPlanRequest {
        var copy = self
        copy.chosen = nil
        return copy
    }
}

struct DraftMeal: Codable, Hashable {
    let date: String
    let mealType: MealType
    let recipeId: UUID
    let name: String
    let section: RecipeSection?
    let yours: Bool
    let coverImageId: UUID?
    let percentFromCupboard: Int
    let uses: [String]
    let usesSoon: [String]
    let toBuy: [String]
    let servings: Int

    var slot: String { MealPlanText.slotKey(date, mealType) }
    var choice: MealChoice { MealChoice(date: date, mealType: mealType, recipeId: recipeId) }
}

/// A slot with nothing in the draft: "PLANNED" (something is on the Plan) or "NOTHING_FITS".
struct OpenSlot: Codable, Hashable {
    let date: String
    let mealType: MealType
    let reason: String
}

struct ToBuy: Codable, Hashable {
    let ingredientId: UUID?
    let name: String
    let meals: Int
}

struct CupboardPlan: Codable, Hashable {
    let dates: [String]
    let mealTypes: [MealType]
    let buyLimit: Int?
    let onlyMine: Bool
    let servings: Int
    let percentFromCupboard: Int
    let itemsUsed: Int
    let summary: String
    let meals: [DraftMeal]
    let open: [OpenSlot]
    let toBuy: [ToBuy]
    let useSoonUsed: [String]
    let useSoonLeft: [String]
    let recipesConsidered: Int
    /// After a swap: false when nothing else could go there.
    let swapped: Bool?
}

struct SlotRef: Codable, Hashable {
    let date: String
    let mealType: MealType
}

/// A recipe the phone's model may choose for a cupboard plan, in the words it chooses on.
struct CandidateRecipe: Codable, Hashable {
    let recipeId: UUID
    let name: String
    let section: RecipeSection?
    let yours: Bool
    let fits: [MealType]
    let percentFromCupboard: Int
    let uses: Int
    let usesSoon: [String]
    let toBuy: [String]
    let score: Double
}

struct CupboardCandidates: Codable, Hashable {
    let slots: [SlotRef]
    let recipes: [CandidateRecipe]
    let recipesConsidered: Int
}

struct ApplyResult: Codable, Hashable {
    struct Skipped: Codable, Hashable {
        let date: String
        let mealType: MealType
        let recipeId: UUID?
        let reason: String
    }

    let added: Int
    let skipped: [Skipped]
    let groceriesAdded: Int
    let from: String?
    let to: String?
}

// MARK: - Plans for health targets (5.7, 5.10, 5.11)

enum Goal: String, Codable, Hashable, CaseIterable {
    case loseFat = "lose-fat"
    case maintain = "maintain"
    case buildMuscle = "build-muscle"
}

/// Numbers set by hand; nil keeps the worked-out one.
struct TargetOverrides: Codable, Hashable {
    var kcal: Int?
    var protein: Int?
    var carbs: Int?
    var fat: Int?

    var isEmpty: Bool { kcal == nil && protein == nil && carbs == nil && fat == nil }
}

/// Who a plan is for. Metric on the wire; `units` only remembers how the form showed them.
struct TargetDetails: Codable, Hashable {
    var age: Int
    var sex: String?
    var heightCm: Double
    var weightKg: Double
    var activity: String
    var goal: Goal
    var preferences: [String]
    var avoid: [String]
    var useMyRecipesFirst: Bool
    var onlyMyRecipes: Bool
    var days: Int
    var meals: [MealType]?
    var overrides: TargetOverrides?
    var description: String?
    var units: String

    init(age: Int, sex: String?, heightCm: Double, weightKg: Double, activity: String, goal: Goal,
         preferences: [String] = [], avoid: [String] = [], useMyRecipesFirst: Bool = true, onlyMyRecipes: Bool = false,
         days: Int = 7, meals: [MealType]? = nil, overrides: TargetOverrides? = nil, description: String? = nil,
         units: String = "imperial") {
        self.age = age
        self.sex = sex
        self.heightCm = heightCm
        self.weightKg = weightKg
        self.activity = activity
        self.goal = goal
        self.preferences = preferences
        self.avoid = avoid
        self.useMyRecipesFirst = useMyRecipesFirst
        self.onlyMyRecipes = onlyMyRecipes
        self.days = days
        self.meals = meals
        self.overrides = overrides
        self.description = description
        self.units = units
    }

    /// Lenient on the way in: a stored plan from before a field existed still opens.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        age = try c.decode(Int.self, forKey: .age)
        sex = try c.decodeIfPresent(String.self, forKey: .sex)
        heightCm = try c.decode(Double.self, forKey: .heightCm)
        weightKg = try c.decode(Double.self, forKey: .weightKg)
        activity = try c.decodeIfPresent(String.self, forKey: .activity) ?? "moderate"
        goal = (try? c.decodeIfPresent(Goal.self, forKey: .goal)) ?? .maintain
        preferences = try c.decodeIfPresent([String].self, forKey: .preferences) ?? []
        avoid = try c.decodeIfPresent([String].self, forKey: .avoid) ?? []
        useMyRecipesFirst = try c.decodeIfPresent(Bool.self, forKey: .useMyRecipesFirst) ?? true
        onlyMyRecipes = try c.decodeIfPresent(Bool.self, forKey: .onlyMyRecipes) ?? false
        days = try c.decodeIfPresent(Int.self, forKey: .days) ?? 7
        meals = try c.decodeIfPresent([MealType].self, forKey: .meals)
        overrides = try c.decodeIfPresent(TargetOverrides.self, forKey: .overrides)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        units = try c.decodeIfPresent(String.self, forKey: .units) ?? "imperial"
    }
}

struct MacroNumbers: Codable, Hashable {
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
}

struct Targets: Codable, Hashable {
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let computed: MacroNumbers
    /// "kcal", "protein", "carbs", "fat": the ones set by hand.
    let overridden: [String]
    let bmr: Int
    let tdee: Int
}

struct PlanMeal: Codable, Hashable {
    let day: Int
    let mealType: MealType
    let recipeId: UUID
    let name: String
    let section: RecipeSection?
    let yours: Bool
    let coverImageId: UUID?
    let portion: Double
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    /// Deleted, or no longer readable: its numbers are nought.
    let missing: Bool

    var slot: String { "\(day)|\(mealType.rawValue)" }
}

struct PlanDay: Codable, Hashable {
    let day: Int
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let meals: [PlanMeal]
}

struct PlanAverage: Codable, Hashable {
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let kcalPercent: Int
    let proteinPercent: Int
}

struct TargetPlan: Codable, Hashable {
    /// Nil for a ready-made plan or a preview, worked out fresh each time and never stored.
    let id: UUID?
    var preset: String?
    let mine: Bool
    var name: String
    let description: String?
    let goal: String
    let goalLabel: String
    let length: Int
    let mealTypes: [MealType]
    var tags: [String]
    var icon: String
    var hue: String
    let targets: Targets
    let details: TargetDetails
    let days: [PlanDay]
    let average: PlanAverage
    let allowed: Int
    let summary: String
    let updatedAt: String?

    /// Every meal still there, as a preview's swap or keep sends them back.
    var choices: [[String: Any]] {
        days.flatMap { d in
            d.meals.filter { !$0.missing }.map {
                ["day": $0.day, "mealType": $0.mealType.rawValue, "recipeId": $0.recipeId.uuidString, "portion": $0.portion]
            }
        }
    }

    /// The same plan with a ready-made one's own name and picture kept: a preview's answer says
    /// neither.
    func keeping(_ preset: TargetPlan) -> TargetPlan {
        var copy = self
        copy.preset = preset.preset
        copy.icon = preset.icon
        copy.hue = preset.hue
        copy.tags = preset.tags
        copy.name = preset.name
        return copy
    }
}

struct TargetPlanCard: Codable, Hashable {
    let id: UUID?
    let preset: String?
    let mine: Bool
    let name: String
    let subtitle: String
    let goal: String
    let tags: [String]
    let icon: String
    let hue: String
    let kcal: Int
    let protein: Int
    let length: Int
    let updatedAt: String?

    /// Unique on the page: a ready-made plan has no id, only its preset key.
    var key: String { id?.uuidString ?? "preset:\(preset ?? name)" }
    /// Protein is worth showing on a card when the plan is about muscle or losing fat.
    var showsProtein: Bool { tags.contains("build-muscle") || tags.contains("lose-fat") }
}

struct ActivityOption: Codable, Hashable {
    let key: String
    let label: String
    let factor: Double
}

struct GoalOption: Codable, Hashable {
    let key: Goal
    let label: String
}

struct PreferenceOption: Codable, Hashable {
    let key: String
    let label: String
    let shown: Bool
}

struct FormOptions: Codable, Hashable {
    let activities: [ActivityOption]
    let goals: [GoalOption]
    let preferences: [PreferenceOption]
    let lengths: [Int]
    let defaultMeals: [MealType]
}

struct PlanFilter: Codable, Hashable {
    let key: String
    let label: String
}

struct CupboardTeaser: Codable, Hashable {
    let items: Int
    let useSoon: Int
    let highlights: [String]
}

struct MealPlansHome: Codable, Hashable {
    let cupboard: CupboardTeaser
    let filters: [PlanFilter]
    let plans: [TargetPlanCard]
    let form: FormOptions
}

/// Roughly what each meal of a day is aiming at: the day's targets shared out.
struct MealAim: Codable, Hashable {
    let mealType: MealType
    let kcal: Int
    let protein: Int
}

/// A recipe the phone's model may choose for a target plan, with its nutrition per serving.
struct TargetCandidate: Codable, Hashable {
    let recipeId: UUID
    let name: String
    let section: RecipeSection?
    let yours: Bool
    let fits: [MealType]
    let kcal: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    let minutes: Int?
}

struct TargetCandidates: Codable, Hashable {
    let targets: Targets
    let length: Int
    let mealTypes: [MealType]
    let aims: [MealAim]
    let recipes: [TargetCandidate]
}

/// A recipe for a slot of a target plan, without a portion: the server works that out.
struct SlotChoice: Codable, Hashable {
    let day: Int
    let mealType: MealType
    let recipeId: UUID
}

// MARK: - Writing it down

enum MealPlanText {
    /// The order meals are shown in, a day at a time.
    static let order: [MealType] = [.breakfast, .lunch, .dinner, .snack]

    /// The setup's meal chips say "Snacks", as the mockup does: it is a kind of meal, not one.
    static func chip(_ meal: MealType) -> String { meal == .snack ? "Snacks" : meal.title }

    static func slotKey(_ date: String, _ meal: MealType) -> String { "\(date)|\(meal.rawValue)" }

    /// "Mon 5": a day as the setup's tiles and the result's headings write it.
    static func dayAndDate(_ iso: String) -> String {
        "\(NutritionText.weekday(iso)) \(dayOfMonth(iso))"
    }

    static func dayOfMonth(_ iso: String) -> Int { Int(iso.suffix(2)) ?? 0 }

    /// "Mon 5 to Thu 8", or just "Mon 5" for one day.
    static func dateRange(_ dates: [String]) -> String {
        let sorted = Set(dates).sorted()
        guard let first = sorted.first, let last = sorted.last else { return "" }
        return first == last ? dayAndDate(first) : "\(dayAndDate(first)) to \(dayAndDate(last))"
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// A plan day's date, with day 0 on `start`.
    static func addDays(_ start: String, _ days: Int) -> String {
        guard let date = isoDay.date(from: start),
              let moved = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: date) else { return start }
        return isoDay.string(from: moved)
    }

    /// Whole days from `from` to `to` (yyyy-MM-dd), negative when `to` is earlier.
    static func daysBetween(_ from: String, _ to: String) -> Int? {
        guard let a = isoDay.date(from: from), let b = isoDay.date(from: to) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: a, to: b).day
    }

    /// "1½ servings", for a portion that is not one.
    static func portion(_ portion: Double) -> String {
        let whole = Int(portion.rounded(.down))
        let rest = portion - Double(whole)
        let part = abs(rest - 0.25) < 0.01 ? "¼" : abs(rest - 0.75) < 0.01 ? "¾" : rest >= 0.5 ? "½" : ""
        let number = (whole > 0 ? String(whole) : "") + part
        return "\(number.isEmpty ? "0" : number) \(portion == 1 ? "serving" : "servings")"
    }

    /// "Build the next few days around the 64 things you already have. 5 need using soon."
    static func cupboardLine(items: Int, useSoon: Int) -> String {
        if items == 0 { return "Your cupboard is empty. Add what you have, and plans can be built around it." }
        let things = "\(items) \(items == 1 ? "thing" : "things")"
        let soon = useSoon == 0 ? "" : useSoon == 1 ? " 1 needs using soon." : " \(useSoon) need using soon."
        return "Build the next few days around the \(things) you already have.\(soon)"
    }

    /// Explore's door: "Cook from your cupboard: 22 things, 2 need using soon".
    static func doorLine(_ cupboard: CupboardTeaser) -> String {
        if cupboard.items == 0 { return "Cook from your cupboard once it has a few things in" }
        let soon = cupboard.useSoon == 0 ? ""
            : ", \(cupboard.useSoon) \(cupboard.useSoon == 1 ? "needs" : "need") using soon"
        return "Cook from your cupboard: \(cupboard.items) \(cupboard.items == 1 ? "thing" : "things")\(soon)"
    }

    /// "None", "Up to 5", "Any".
    static func buyText(_ limit: Int?) -> String {
        guard let limit else { return "Any" }
        return limit == 0 ? "None" : "Up to \(limit)"
    }

    // MARK: Heights and weights

    /// 180.3 cm as 5 ft 11.
    static func feetInches(_ cm: Double) -> (ft: Int, inches: Int) {
        var ft = Int((cm / 30.48).rounded(.down))
        var inches = Int((cm / 2.54 - Double(ft * 12)).rounded())
        if inches == 12 {
            ft += 1
            inches = 0
        }
        return (ft, inches)
    }

    static func cm(ft: Int, inches: Int) -> Double { (Double(ft * 12 + inches) * 2.54 * 10).rounded() / 10 }
    static func lb(kg: Double) -> Int { Int((kg / 0.45359237).rounded()) }
    static func kg(lb: Int) -> Double { (Double(lb) * 0.45359237 * 10).rounded() / 10 }

    /// "Age 20 · 5 ft 11 · 165 lb · Active 3–5x a week": who a plan of your own is for, in a line.
    static func whoLine(_ d: TargetDetails, activity: String?) -> String {
        let height: String
        let weight: String
        if d.units == "metric" {
            height = "\(Int(d.heightCm.rounded())) cm"
            weight = "\(Int(d.weightKg.rounded())) kg"
        } else {
            let fi = feetInches(d.heightCm)
            height = "\(fi.ft) ft \(fi.inches)"
            weight = "\(lb(kg: d.weightKg)) lb"
        }
        return ["Age \(d.age)", height, weight, activity].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}
