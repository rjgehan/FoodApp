import Foundation

/*
 What the server's /api/nutrition answers with (backend NutritionDtos.java, the web's
 api/nutrition.ts), and the few ways the Nutrition screens write its numbers down.

 The numbers are always the server's. The phone rounds them for showing and scales a label to a
 serving; Apple Intelligence never makes one up (NutritionAssist.swift). Foundation only, so the
 checks in ios/checks can compile it on a Mac without the app.

 Every field a newer server might add or an older one might lack is optional, so a phone keeps
 decoding whatever the server it talks to says.
*/

/// Where the numbers come from, worded as each source asks to be credited.
struct NutritionAttribution: Codable, Hashable {
    let text: String
    let url: String
    let licence: String

    var link: URL? { URL(string: url) }

    static let usda = NutritionAttribution(
        text: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2026. fdc.nal.usda.gov.",
        url: "https://fdc.nal.usda.gov/", licence: "CC0 1.0 (public domain)")

    static let openFoodFacts = NutritionAttribution(
        text: "Data from Open Food Facts (ODbL)", url: "https://world.openfoodfacts.org/", licence: "ODbL 1.0")
}

/// GET /api/nutrition: whether this server has the Nutrition screens at all. An older one answers 404.
struct NutritionStatus: Codable, Hashable {
    let ready: Bool
    let foods: Int
    let version: String?
}

/// Rounded already: whole kcal and mg, one decimal for grams. Nil is "not known".
struct NutrientValues: Codable, Hashable {
    var kcal: Double?
    var protein: Double?
    var carbs: Double?
    var fat: Double?
    var fibre: Double?
    var sugars: Double?
    var satFat: Double?
    var saltG: Double?
    var sodiumMg: Double?
    var ironMg: Double?
    var calciumMg: Double?
    var vitaminCMg: Double?
    var potassiumMg: Double?

    static let none = NutrientValues()

    /// The same food in a different amount: every known value times `by`.
    func scaled(_ by: Double) -> NutrientValues {
        func s(_ v: Double?) -> Double? { v.map { $0 * by } }
        return NutrientValues(kcal: s(kcal), protein: s(protein), carbs: s(carbs), fat: s(fat), fibre: s(fibre),
                              sugars: s(sugars), satFat: s(satFat), saltG: s(saltG), sodiumMg: s(sodiumMg),
                              ironMg: s(ironMg), calciumMg: s(calciumMg), vitaminCMg: s(vitaminCMg),
                              potassiumMg: s(potassiumMg))
    }

    subscript(macro: Macro) -> Double? {
        switch macro {
        case .protein: return protein
        case .carbs: return carbs
        case .fat: return fat
        }
    }
}

/// Protein, carbs and fat: the three drawn everywhere, always in that order and colour.
enum Macro: String, CaseIterable, Identifiable {
    case protein, carbs, fat
    var id: String { rawValue }
    var label: String {
        switch self {
        case .protein: return "Protein"
        case .carbs: return "Carbs"
        case .fat: return "Fat"
        }
    }
}

/// Each macro's share of the calories, whole percents that add up to about 100.
struct MacroSplit: Codable, Hashable {
    let protein: Int
    let carbs: Int
    let fat: Int

    static let empty = MacroSplit(protein: 0, carbs: 0, fat: 0)
    var isEmpty: Bool { protein + carbs + fat == 0 }

    subscript(macro: Macro) -> Int {
        switch macro {
        case .protein: return protein
        case .carbs: return carbs
        case .fat: return fat
        }
    }
}

/// "High protein", "Low fat": tone good (herb), info (sky) or warn (mustard).
struct LabelBadge: Codable, Hashable {
    let key: String
    let label: String
    let tone: String
}

/// One line of a label's details, per 100 g: "Calcium · 17% of daily".
struct LabelDetail: Codable, Hashable {
    let key: String
    let label: String
    let amount: Double?
    let unit: String
    let percentDaily: Int?
}

struct FoodPortion: Codable, Hashable {
    let label: String
    let grams: Double
}

/// An ingredient from USDA FoodData Central.
struct FoodLabel: Codable, Hashable {
    let fdcId: Int
    let name: String
    let category: String?
    let dataset: String?
    let per100g: NutrientValues
    let split: MacroSplit
    let details: [LabelDetail]
    let badges: [LabelBadge]
    let portions: [FoodPortion]
    let attribution: NutritionAttribution?
}

/// A packet from Open Food Facts, by its barcode.
struct ProductLabel: Codable, Hashable {
    let barcode: String
    let name: String
    let brand: String?
    let size: String?
    let packGrams: Double?
    let liquid: Bool
    let servingSize: String?
    let servingGrams: Double?
    let per100g: NutrientValues
    let perServing: NutrientValues?
    let split: MacroSplit
    let details: [LabelDetail]
    let badges: [LabelBadge]
    let nutriScore: String?
    let novaGroup: Int?
    let hasNutrition: Bool
    let attribution: NutritionAttribution?
}

/// What the percentages and bars are measured against: "a 2,000 kcal day".
struct NutritionReference: Codable, Hashable {
    let kcal: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let sugars: Double?
    let satFat: Double?
    let saltG: Double?
    let fibre: Double?
    let label: String
    let source: String?

    subscript(macro: Macro) -> Double {
        switch macro {
        case .protein: return protein
        case .carbs: return carbs
        case .fat: return fat
        }
    }
}

struct ReferencePercentages: Codable, Hashable {
    let kcal: Int?
}

/// One counted line of a recipe: its share of the calories and where its numbers came from.
struct NutritionContributor: Codable, Hashable, Identifiable {
    let recipeIngredientId: UUID
    let ingredientId: UUID?
    let name: String
    let fdcId: Int?
    let foodName: String?
    /// "2 knob", "300 g", "" with no amount: the line's own quantity and unit.
    let amount: String?
    let grams: Double
    /// WEIGHT, PORTION, VOLUME, TYPICAL, ROUGH or LEARNED (Grams.How on the server).
    let gramsHow: String?
    /// "1 knob = 12 g (estimated)": how the weight was worked out.
    let gramsBasis: String?
    let estimated: Bool
    let kcal: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    /// Of the whole recipe's calories, 0–1.
    let share: Double
    let confidence: Double?
    /// auto (the server's matcher), ai (an iPhone's model) or user.
    let matchSource: String?
    /// The matcher's own low-confidence pick.
    let guess: Bool?

    var id: UUID { recipeIngredientId }

    /// A model on somebody's iPhone chose the food this line is counted as.
    var foodChosenByModel: Bool { matchSource == "ai" }

    /// A model on somebody's iPhone said what one of its unit weighs.
    var weightEstimatedByModel: Bool {
        gramsHow == "LEARNED" && (gramsBasis ?? "").hasSuffix("(estimated)")
    }
}

/// A line that was left out, and why: OPTIONAL, NO_AMOUNT, NO_MATCH or NO_WEIGHT.
struct NutritionNotCounted: Codable, Hashable, Identifiable {
    let recipeIngredientId: UUID
    let ingredientId: UUID?
    let name: String
    let reason: String
    let quantity: Double?
    let unit: String?
    let optional: Bool
    let fdcId: Int?
    let foodName: String?

    var id: UUID { recipeIngredientId }
}

/// A recipe's nutrition (5.6), for `servings` servings.
struct RecipeNutrition: Codable, Hashable {
    let recipeId: UUID
    let name: String
    let recipeServings: Int
    let servings: Double
    let perServing: NutrientValues
    let forServings: NutrientValues
    let perRecipe: NutrientValues
    let split: MacroSplit
    let reference: NutritionReference
    let percentOfReference: ReferencePercentages
    let highlights: [String]
    /// The server's own few words ("High protein, low carb. A filling meal."), by rule.
    let summary: String?
    let contributors: [NutritionContributor]
    let notCounted: [NutritionNotCounted]
    let linesCounted: Int
    let linesTotal: Int
    let complete: Bool
    let note: String
    let attribution: NutritionAttribution?
}

struct PlanNutritionDay: Codable, Hashable, Identifiable {
    /// yyyy-MM-dd
    let date: String
    let totals: NutrientValues
    let mealsPlanned: Int
    let mealsCounted: Int
    let partial: Bool

    var id: String { date }
    var counted: Bool { mealsCounted > 0 && (totals.kcal ?? 0) > 0 }
}

/// One person's share of the plan, per day and on average.
struct PlanNutrition: Codable, Hashable {
    let start: String
    let end: String
    let days: [PlanNutritionDay]
    let average: NutrientValues
    let daysCounted: Int
    let mealsPlanned: Int
    let mealsCounted: Int
    let reference: NutritionReference?
    let note: String?
}

struct FoodHit: Codable, Hashable, Identifiable {
    let fdcId: Int
    let name: String
    let category: String?
    let kcal: Double?
    let protein: Double?
    var id: Int { fdcId }
}

struct ProductHit: Codable, Hashable, Identifiable {
    let barcode: String
    let name: String
    let brand: String?
    let size: String?
    let kcal: Double?
    var id: String { barcode }
}

struct RecipeHit: Codable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let kcalPerServing: Double?
}

/// productsStatus: ok, cached, skipped, debounced, busy (Open Food Facts' limit), unavailable.
struct NutritionSearchAnswer: Codable, Hashable {
    let query: String
    let ingredients: [FoodHit]
    let products: [ProductHit]
    let productsStatus: String
    let recipes: [RecipeHit]
}

/// Something looked at lately: kind FOOD, PRODUCT or RECIPE; per "100g" or "serving".
struct RecentLookup: Codable, Hashable, Identifiable {
    let kind: String
    let ref: String
    let label: String
    let kcal: Double?
    let protein: Double?
    let per: String
    let lookedAt: String?
    var id: String { "\(kind):\(ref)" }
}

/// An ingredient's food, and the shortlist a better one may be chosen from.
struct IngredientMatch: Codable, Hashable {
    let ingredientId: UUID
    let ingredientName: String
    let fdcId: Int?
    let foodName: String?
    let confidence: Double
    let source: String
    let counted: Bool
    let guess: Bool
    let shortlist: [MatchCandidate]
}

struct MatchCandidate: Codable, Hashable {
    let fdcId: Int
    let name: String
    let category: String?
    let confidence: Double
    let kcal: Double?
    let protein: Double?
}

struct LearnedGrams: Codable, Hashable {
    let ingredientId: UUID
    let unitKey: String
    let gramsEach: Double
    let source: String
}

// MARK: - Writing the numbers down

enum NutritionText {
    private static let whole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_GB")
        f.maximumFractionDigits = 0
        return f
    }()

    /// "2,140", or "–" for not known.
    static func kcal(_ kcal: Double?) -> String {
        guard let kcal else { return "–" }
        return whole.string(from: NSNumber(value: kcal.rounded())) ?? String(Int(kcal.rounded()))
    }

    /// "17g", "6.3g", "0.7g": whole grams from 10 up, one decimal under it, no trailing ".0".
    static func grams(_ grams: Double?, unit: String = "g") -> String {
        guard let grams else { return "–" }
        return number(grams) + unit
    }

    /// 10 and up whole, under it one decimal, never "6.0".
    static func number(_ value: Double) -> String {
        if value >= 10 { return whole.string(from: NSNumber(value: value.rounded())) ?? String(Int(value.rounded())) }
        let one = (value * 10).rounded() / 10
        return one == one.rounded() ? String(Int(one)) : String(format: "%.1f", one)
    }

    /// "6g", "17% of daily": the per-cent where there is one, else the amount — scaled to a serving.
    static func detail(_ detail: LabelDetail, scale: Double = 1) -> String {
        if let pct = detail.percentDaily { return "\(Int((Double(pct) * scale).rounded()))% of daily" }
        guard let amount = detail.amount else { return "–" }
        let scaled = amount * scale
        if detail.unit == "g" { return grams(scaled) }
        return "\(number(scaled)) \(detail.unit)"
    }

    /// USDA's group words: the food is the next part ("Fish, salmon" is salmon).
    private static let groupOnly: Set<String> = [
        "fish", "nuts", "spices", "seeds", "snacks", "cereals", "beverages", "alcoholic beverage", "alcoholic beverages",
        "candies", "crustaceans", "mollusks", "leavening agents", "game meat", "sweeteners", "soup", "babyfood",
    ]
    /// Group words that end the food's name: "Oil, olive" is olive oil, "Cheese, cheddar" cheddar cheese.
    private static let groupAfter: Set<String> = ["oil", "cheese", "sauce", "beans", "vinegar", "rice", "milk", "yogurt"]
    /// Meats, said first: "Chicken, broilers or fryers, breast" is chicken breast.
    private static let groupBefore: Set<String> = ["beef", "pork", "chicken", "lamb", "veal", "turkey", "duck"]
    /// Parts of a USDA name that say how it was bred, sold or cooked rather than what it is.
    private static let notTheFood = #"^(raw|cooked|fresh|frozen|canned|dry|dried|boiled|roasted|fluid|mature seeds|broilers? or fryers|roasting|fryers|all classes|retail parts|all grades|composite of .*|variety meats and by-products|new zealand|australian|imported|domestic|commercial|regular|plain|whole|nfs)$"#

    /**
     A USDA name made readable: "Chickpeas (garbanzo beans, bengal gram), mature seeds, canned,
     drained solids" is "Chickpeas", with "mature seeds, canned, drained solids" to say which. The
     bracketed other names and the first comma are where USDA puts the food and its kind — except
     where the first part is only a group ("Fish, salmon, Atlantic"), when the food is the next
     part: Salmon, Olive oil, Coconut milk, Curry powder, Cheddar cheese, Chicken breast. The title
     is also what Add to list and Cupboard add, so it must be the food, never "Fish". (The web's
     foodTitle does the same.)
     */
    static func foodTitle(_ name: String) -> (title: String, detail: String) {
        let plain = name.replacingOccurrences(of: #"\s*\([^)]*\)"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+,"#, with: ",", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        let parts = plain.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard let head = parts.first else { return (plain, "") }
        let group = head.lowercased()
        let next = parts.indices.first { $0 > 0 && parts[$0].range(of: notTheFood, options: [.regularExpression, .caseInsensitive]) == nil }
        if let next, groupOnly.contains(group) || groupAfter.contains(group) || groupBefore.contains(group) {
            let what = parts[next]
            let title: String
            if groupOnly.contains(group) {
                title = capitalised(what)
            } else if groupAfter.contains(group) {
                title = "\(capitalised(what)) \(group)"
            } else if what.lowercased() == "ground" {
                title = "Ground \(group)"
            } else {
                title = "\(head) \(what.lowercased())"
            }
            let detail = parts.indices.filter { $0 != 0 && $0 != next }.map { parts[$0] }.joined(separator: ", ")
            return (title, detail)
        }
        return (head, parts.dropFirst().joined(separator: ", "))
    }

    /// "Chickpeas, mature seeds, canned": the USDA name without its bracketed other names.
    static func plainFoodName(_ name: String) -> String {
        let (title, detail) = foodTitle(name)
        return detail.isEmpty ? title : "\(title), \(detail)"
    }

    /// The first letter up: ingredient names are stored as typed ("chicken breast").
    static func capitalised(_ text: String) -> String {
        guard let first = text.first else { return text }
        return first.uppercased() + text.dropFirst()
    }

    /// Something the server will look up as a packet's barcode.
    static func isBarcode(_ text: String) -> Bool {
        text.range(of: #"^\d{8,14}$"#, options: .regularExpression) != nil
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// yyyy-MM-dd, `days` from today on this phone's clock.
    static func day(_ days: Int = 0, from date: Date = Date()) -> String {
        isoDay.string(from: Calendar.current.date(byAdding: .day, value: days, to: date) ?? date)
    }

    /// "Monday" or "Mon" for a yyyy-MM-dd.
    static func weekday(_ iso: String, short: Bool = true) -> String {
        guard let date = isoDay.date(from: iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.dateFormat = short ? "EEE" : "EEEE"
        return f.string(from: date)
    }
}
