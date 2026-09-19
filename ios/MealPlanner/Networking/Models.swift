import Foundation

/*
 * The shapes the backend already sends. Field names match the Java DTOs exactly, so there is no
 * mapping layer to keep in step — if a field is added there and wanted here, it gets added here
 * and nowhere else. Only what a screen actually uses is decoded; Codable ignores the rest.
 */

struct HouseholdSummary: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    /// The landing screen sends this; /api/households does not, so it is optional.
    let memberCount: Int?

    init(id: UUID, name: String, memberCount: Int? = nil) {
        self.id = id
        self.name = name
        self.memberCount = memberCount
    }
}

struct UserSummary: Codable, Identifiable, Hashable {
    let username: String
    let displayName: String?
    let pinSet: Bool

    var id: String { username }
    /** Display names are optional in the API; the username is the fallback everywhere. */
    var shown: String { displayName ?? username }
}

struct LandingResponse: Codable {
    let needsSetup: Bool
    let households: [HouseholdSummary]
}

struct AuthResponse: Codable {
    let token: String
    let userId: UUID
    let displayName: String?
}

enum MealType: String, Codable, CaseIterable, Hashable {
    case breakfast = "BREAKFAST"
    case lunch = "LUNCH"
    case dinner = "DINNER"
    case snack = "SNACK"

    var title: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snack: "Snack"
        }
    }
}

struct MealPlanEntry: Codable, Identifiable, Hashable {
    let id: UUID
    /** `YYYY-MM-DD`, kept as the string the API sends and parsed where a Date is needed. */
    let date: String
    let mealType: MealType
    let recipeId: UUID?
    let recipeName: String?
    let placeName: String?
    let itemName: String?
    let time: String?
    let servings: Int?

    /** What the web calls entryLabel: a meal is a recipe, a place, or a bare item. */
    var label: String { recipeName ?? placeName ?? itemName ?? "Something" }
}

struct GroceryItem: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let quantity: Double?
    let unit: String?
    let checked: Bool
    let checkedByName: String?
    let categoryId: UUID?
    let inCupboard: Bool

    /** "450 g", "2 cloves", or nothing at all. */
    var amount: String? {
        let number = quantity.map { $0 == $0.rounded() ? String(Int($0)) : String($0) }
        let parts = [number, unit].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }
}

struct GroceryCategory: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
}

enum RecipeSection: String, Codable, CaseIterable, Hashable {
    case breakfast = "BREAKFAST"
    case lunch = "LUNCH"
    case dinner = "DINNER"
    case snacks = "SNACKS"
    case drinks = "DRINKS"
    case other = "OTHER"

    var title: String { rawValue.prefix(1) + rawValue.dropFirst().lowercased() }
}

struct Recipe: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let description: String?
    /// One step per line, the way the web writes and reads them.
    let instructions: String?
    let prepTimeMinutes: Int?
    let cookTimeMinutes: Int?
    let servings: Int
    let section: RecipeSection?
    let categories: [String]
    let shared: Bool
    let ownerName: String?
    let coverImageId: UUID?
    let ingredients: [RecipeIngredient]

    /** "Serves 4 · 45 min", the same facts line the web shows. */
    var facts: String {
        var parts = ["Serves \(servings)"]
        let total = (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0)
        if total > 0 { parts.append("\(total) min") }
        return parts.joined(separator: " · ")
    }
}

struct RecipeIngredient: Codable, Identifiable, Hashable {
    let id: UUID
    let ingredientName: String
    let quantity: Double?
    let unit: String?
    let notes: String?
    let optional: Bool

    var amount: String? {
        let number = quantity.map { $0 == $0.rounded() ? String(Int($0)) : String($0) }
        let parts = [number, unit].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }
}

struct CupboardItem: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let runningLow: Bool
    let staple: Bool
    let categoryId: UUID?
    /// Waiting on the grocery list, unticked.
    let onList: Bool
    /// Null means this item uses the simple Have / Low toggle instead of an exact amount.
    let quantity: Double?
    let unit: String?

    var tracksQuantity: Bool { quantity != nil }

    /// "Always have · On the list", the same line the web shows under the name.
    var detail: String? {
        var parts: [String] = []
        if staple { parts.append("Always have") }
        if onList { parts.append("On the list") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var amount: String? {
        guard let quantity else { return nil }
        let number = quantity == quantity.rounded() ? String(Int(quantity)) : String(quantity)
        return [number, unit].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}

/// A group inside a drawer — "Main", and "Chicken" inside it. `parentId` is the group it sits
/// in; `section` is the drawer it belongs to, null meaning it shows in every drawer.
struct RecipeCategory: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let recipeCount: Int
    let parentId: UUID?
    let section: RecipeSection?
}
