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
    /// Only /api/households sends the settings — the sign-in screen has no business knowing
    /// how many a house cooks for.
    let defaultServings: Int?
    let planningHorizonDays: Int?
    /// Your role in this house — "OWNER" or "MEMBER". Only /api/households sends it; the owner
    /// is the one who can reset somebody's password.
    let role: String?

    init(id: UUID, name: String, memberCount: Int? = nil,
         defaultServings: Int? = nil, planningHorizonDays: Int? = nil, role: String? = nil) {
        self.id = id
        self.name = name
        self.memberCount = memberCount
        self.defaultServings = defaultServings
        self.planningHorizonDays = planningHorizonDays
        self.role = role
    }

    var isOwner: Bool { role == "OWNER" }
}

/// Somewhere you eat that is not this kitchen — the pub, the Thai place on the corner.
struct Place: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let menuUrl: String?
    let phone: String?
    let notes: String?
    let imageId: UUID?
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
    /// Whether the name-and-PIN screens are still on. An older server does not say, and only
    /// had those, so nil means yes.
    let legacyPinLogin: Bool?
}

struct AuthResponse: Codable {
    let token: String
    let userId: UUID
    let displayName: String?
    /// The house they were last in, if they still are — where signing in should land.
    let lastHouseholdId: UUID?
}

/// You, from /api/users/me: what the "add an email" prompt and Settings need.
struct Me: Codable, Hashable {
    let userId: UUID
    let username: String
    let displayName: String?
    let email: String?
    let hasPassword: Bool

    var needsCredentials: Bool { email == nil || !hasPassword }
}

/// Someone in a household, from /api/households/{id}/members — which, unlike the sign-in
/// screen's roster, still works once the PIN screens are switched off.
struct HouseholdMember: Codable, Identifiable, Hashable {
    let userId: UUID
    let username: String
    let displayName: String?
    let role: String?
    let pinSet: Bool
    /// Absent from an older server, which never had emails.
    let hasEmail: Bool?
    let hasPassword: Bool?

    var id: UUID { userId }
    /// No PIN and no password: the account has never been signed into.
    var neverSignedIn: Bool { !pinSet && hasPassword != true }
    var shown: String { displayName ?? username }
}

/// A one-time link an owner hands to someone who forgot their password.
struct PasswordResetLink: Codable, Hashable {
    let token: String
    let expiresAt: String
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
    /// A recipe saved with just its name: planned, but it adds nothing to the list yet.
    /// Optional only because an older server did not send it.
    let needsIngredients: Bool?
    let placeId: UUID?
    let placeName: String?
    let itemName: String?
    /// For a single item: whether the cupboard has it, and whether it is running low.
    let inCupboard: Bool?
    let runningLow: Bool?
    let time: String?
    let servings: Int?
    let notes: String?
    /// Which of the recipe's optional ingredients are being bought this time.
    let includedOptionalIngredientIds: [UUID]?

    /// Everything past the basics defaults, so the sample data does not have to spell it out.
    init(id: UUID, date: String, mealType: MealType, recipeId: UUID?, recipeName: String?,
         needsIngredients: Bool? = nil, placeId: UUID? = nil, placeName: String?, itemName: String?,
         inCupboard: Bool? = nil, runningLow: Bool? = nil, time: String?, servings: Int?,
         notes: String? = nil, includedOptionalIngredientIds: [UUID]? = nil) {
        self.id = id
        self.date = date
        self.mealType = mealType
        self.recipeId = recipeId
        self.recipeName = recipeName
        self.needsIngredients = needsIngredients
        self.placeId = placeId
        self.placeName = placeName
        self.itemName = itemName
        self.inCupboard = inCupboard
        self.runningLow = runningLow
        self.time = time
        self.servings = servings
        self.notes = notes
        self.includedOptionalIngredientIds = includedOptionalIngredientIds
    }

    /** What the web calls entryLabel: a meal is a recipe, a place, or a bare item. */
    var label: String { recipeName ?? placeName ?? itemName ?? "Something" }
}

struct GroceryItem: Codable, Identifiable, Hashable {
    let id: UUID
    /// The ingredient behind the row. Aisles are set on the ingredient, not on the line, so
    /// placing "onion" once places it on every future list.
    let ingredientId: UUID?
    /// False means neither the keyword list nor a model has placed it yet.
    let sorted: Bool?
    let name: String
    let quantity: Double?
    let unit: String?
    let checked: Bool
    let checkedByName: String?
    let categoryId: UUID?
    let inCupboard: Bool

    /// The two newest fields carry defaults so the sample data, and anywhere else building
    /// one of these by hand, does not have to care about them.
    init(id: UUID, ingredientId: UUID? = nil, sorted: Bool? = nil, name: String,
         quantity: Double?, unit: String?, checked: Bool, checkedByName: String?,
         categoryId: UUID?, inCupboard: Bool) {
        self.id = id
        self.ingredientId = ingredientId
        self.sorted = sorted
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.checked = checked
        self.checkedByName = checkedByName
        self.categoryId = categoryId
        self.inCupboard = inCupboard
    }

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
    /// The other photos. Decoded and sent back untouched on save — the server replaces the
    /// whole list with whatever it is given, so not sending them deletes them.
    let photoIds: [UUID]?
    let ingredients: [RecipeIngredient]
    /// Every link, in order — where it came from, videos of it. Absent from servers older than
    /// the list, which is why it is optional and why the two single links are kept below.
    var links: [SourceLink]? = nil
    /// The first link that is not a video, and the first that is: all an older server knows.
    var sourceUrl: String? = nil
    var videoUrl: String? = nil

    /// The links to show and to edit, from the list when the server sends one.
    var allLinks: [SourceLink] {
        if let links { return links }
        return [sourceUrl, videoUrl].compactMap { $0 }.map { SourceLink(url: $0, label: nil) }
    }

    /** "Serves 4 · 45 min", the same facts line the web shows. */
    var facts: String {
        var parts = ["Serves \(servings)"]
        let total = (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0)
        if total > 0 { parts.append("\(total) min") }
        return parts.joined(separator: " · ")
    }
}

/// Somewhere a recipe lives on the web. Always http(s) once the server has it; a nil label
/// means "call it after the site" — see `SourceLink.name`.
struct SourceLink: Codable, Hashable {
    let url: String
    let label: String?
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

/// What the catalogue knows about a barcode. Mirrors BarcodeLookup.Product on the server.
struct Product: Codable, Hashable {
    let barcode: String
    let name: String
    let brand: String
    let size: String
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
    /// Which of the food drawings (`FoodIcon`) its tile wears. Nil for a plain tile, and from a
    /// server older than group icons.
    var iconKey: String? = nil
}

/// A draft read off a link by the server, to be checked in the editor before it is saved.
struct ImportedRecipe: Codable {
    let name: String
    let description: String?
    let prepTimeMinutes: Int?
    let cookTimeMinutes: Int?
    let servings: Int
    let instructions: String?
    let ingredients: [ImportedIngredient]
    /// "PUBLISHED" or "SPOKEN". Absent from older servers, which is why it is optional.
    let methodSource: String?
    /// The page it was read from, as its first link. Older servers put it in `description`.
    let links: [SourceLink]?
    /// Everything said in the video, one sentence each, before the server threw any of it
    /// away. Only sent for a spoken method, and only so the phone can do better than the
    /// rules did — half of what a rule drops is the other half of a broken sentence.
    let spokenLines: [String]?

    /// Steps pieced together from somebody narrating a video, rather than a list anybody
    /// wrote down. Worth offering to rewrite; a publisher's own steps are not.
    var methodWasSpoken: Bool { methodSource == "SPOKEN" }
}

struct ImportedIngredient: Codable {
    let ingredientName: String
    let quantity: Double?
    let unit: String?
}
