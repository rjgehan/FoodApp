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
    /// Your colours. Absent from an older server, which had none.
    var theme: Theme? = nil
    /// Whether you are the server's admin, signed in with your password. Absent from an older
    /// server; on the ideas board it is who can say where an idea is up to.
    var admin: Bool?
    /// Whether the beta's ideas board is open (IDEAS_BOARD). Absent from an older server, which
    /// has no board, so nil hides the lightbulb.
    var ideasBoard: Bool?

    var needsCredentials: Bool { email == nil || !hasPassword }
}

/// Where an idea on the board has got to. Only the admin moves it on from Open.
enum IdeaStatus: String, Codable, CaseIterable, Hashable {
    case open = "OPEN"
    case planned = "PLANNED"
    case done = "DONE"
    case notDoing = "NOT_DOING"

    /// A status this build has never heard of reads as Open, rather than the whole board
    /// failing to load on a phone that has not been updated.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = IdeaStatus(rawValue: raw) ?? .open
    }

    var label: String {
        switch self {
        case .open: return "Open"
        case .planned: return "Planned"
        case .done: return "Done"
        case .notDoing: return "Not doing"
        }
    }
}

/// One idea on the beta's ideas board, as you see it — from /api/ideas. The board is the whole
/// server's, not a household's.
struct Idea: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var details: String?
    var status: IdeaStatus
    /// "Someone" once the account that suggested it has been deleted.
    let authorName: String
    /// Yours: you can reword it or take it back.
    let mine: Bool
    var voteCount: Int
    var votedByMe: Bool
    /// ISO-8601, as the server sends it — with microseconds.
    let createdAt: String

    var created: Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        // Six places after the point is more than some versions of the formatter will read;
        // the seconds are plenty for "5 minutes ago".
        let whole = createdAt.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        return withFraction.date(from: createdAt) ?? ISO8601DateFormatter().date(from: whole)
    }
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

/// What a reset link says before it is used: whose it is, and whether it still works.
struct PasswordResetInfo: Codable, Hashable {
    let valid: Bool
    let displayName: String?
    /// False means the form asks for an email too — a password is no use without one.
    let hasEmail: Bool
}

/// A household's invite link, from /api/households/{id}/invite. Everyone in the house sees the
/// same one until the owner makes a new one.
struct InviteLink: Codable, Hashable {
    let token: String
    /// ISO-8601, as the server sends it.
    let expiresAt: String

    var expires: Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: expiresAt) ?? ISO8601DateFormatter().date(from: expiresAt)
    }
}

/// What an invite link tells whoever opens it, before they sign in. All nil but `valid` when
/// the link does not work.
struct InviteInfo: Codable, Hashable {
    let valid: Bool
    let householdName: String?
    let invitedByName: String?
    let memberCount: Int?
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
    /// The household that shared this recipe has deleted it. The meal stays on the plan under
    /// its old `recipeName`, with no `recipeId` to open. Optional because an older server did
    /// not send it.
    let recipeDeleted: Bool?
    /// A saved link planned as the meal — a recipe that is still only a link. Its name also
    /// comes as `recipeName`, for builds from before saved links. All nil from an older server.
    let savedLinkId: UUID?
    /// With `recipeDeleted`: what was deleted was a saved link, not a shared recipe.
    let savedLinkDeleted: Bool?
    let savedLinkUrl: String?
    let savedLinkSource: SavedLinkSource?
    let savedLinkImageId: UUID?

    /// Everything past the basics defaults, so the sample data does not have to spell it out.
    init(id: UUID, date: String, mealType: MealType, recipeId: UUID?, recipeName: String?,
         needsIngredients: Bool? = nil, placeId: UUID? = nil, placeName: String?, itemName: String?,
         inCupboard: Bool? = nil, runningLow: Bool? = nil, time: String?, servings: Int?,
         notes: String? = nil, includedOptionalIngredientIds: [UUID]? = nil, recipeDeleted: Bool? = nil,
         savedLinkId: UUID? = nil, savedLinkDeleted: Bool? = nil, savedLinkUrl: String? = nil, savedLinkSource: SavedLinkSource? = nil,
         savedLinkImageId: UUID? = nil) {
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
        self.recipeDeleted = recipeDeleted
        self.savedLinkId = savedLinkId
        self.savedLinkDeleted = savedLinkDeleted
        self.savedLinkUrl = savedLinkUrl
        self.savedLinkSource = savedLinkSource
        self.savedLinkImageId = savedLinkImageId
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
    /// In Explore, where every household on the server can find it. Only the owner changes it.
    var published: Bool? = nil
    /// The households it is shared with. Only meaningful to the household that owns it.
    var sharedWith: [UUID]? = nil

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

/// One of your other households, and whether this recipe is shared with it — the Share sheet's
/// switches. The server only ever lists houses the person asking is in.
struct ShareTarget: Codable, Identifiable, Hashable {
    let householdId: UUID
    let name: String
    var shared: Bool

    var id: UUID { householdId }
}

/// A recipe's public link. A nil token means it has none.
struct RecipeLinkToken: Codable, Hashable {
    let token: String?
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
    /// The shared ingredient behind it — what a restock reminder hangs on. Optional and last,
    /// so sample data built by hand can leave it out.
    var ingredientId: UUID? = nil

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

/// One group of the starter list — "Baking", "Spices" — the common things a new cupboard is
/// offered. The list itself lives on the server, so the web offers the same one.
struct StarterGroup: Codable, Hashable {
    let name: String
    let items: [StarterItem]
}

struct StarterItem: Codable, Hashable {
    let name: String
    /// In this cupboard already.
    let have: Bool
}

/// What adding from the starter list did. `skipped` were here already, and are left as they were.
struct StartersAdded: Codable {
    let added: Int
    let skipped: Int
}

/// What copying another household's cupboard did. `skipped` were here already, and are left alone.
struct CupboardCopied: Codable {
    let copied: Int
    let skipped: Int
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

/// Where a saved link goes. Only the two apps recipes get shared from have a name of their own.
enum SavedLinkSource: String, Codable, Hashable {
    case tiktok = "TIKTOK"
    case instagram = "INSTAGRAM"
    case web = "WEB"
}

/**
 A recipe kept as just a link — a TikTok, a Reel, a website — with a name and its picture. The
 household's, unless `personal` ("Just me"), which only whoever saved it sees.
*/
struct SavedLink: Codable, Identifiable, Hashable {
    let id: UUID
    let url: String
    let name: String
    let source: SavedLinkSource
    let coverImageId: UUID?
    /// The drawer it would go in, for filtering.
    let section: RecipeSection?
    let personal: Bool
    /// You saved it — the only one who can make it "Just me".
    let mine: Bool
    let savedByName: String?
    /// When it was kept (an ISO instant); absent from an older server.
    var createdAt: String? = nil
    /// On a save only: the link was already there, and that one was updated.
    var alreadySaved: Bool? = nil

    /// "TikTok", "Instagram", or the site's address — what its badge says.
    var sourceLabel: String { Self.label(source: source, url: url) }

    static func label(source: SavedLinkSource?, url: String?) -> String {
        switch source {
        case .tiktok: return "TikTok"
        case .instagram: return "Instagram"
        default:
            let host = url.flatMap { URL(string: $0)?.host() } ?? ""
            return host.isEmpty ? "Website" : host.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
        }
    }
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
    /// The picture the link came with — a video's cover, a page's photo — which the server has
    /// already saved. The recipe's cover until somebody picks their own. Absent from older servers.
    let coverImageId: UUID?

    /// Steps pieced together from somebody narrating a video, rather than a list anybody
    /// wrote down. Worth offering to rewrite; a publisher's own steps are not.
    var methodWasSpoken: Bool { methodSource == "SPOKEN" }
}

struct ImportedIngredient: Codable {
    let ingredientName: String
    let quantity: Double?
    let unit: String?
}

/// "Remind me to buy it every 3 weeks", from /api/households/{id}/restock. One per ingredient,
/// so the grocery list and the cupboard show the same one.
struct RestockReminder: Codable, Identifiable, Hashable {
    let ingredientId: UUID
    let name: String
    let everyDays: Int
    /// ISO-8601, as the server sends it.
    let lastBoughtAt: String
    let dueAt: String?
    let snoozedUntil: String?
    /// Would be asked about now: its time has come, not snoozed, not waiting on the list.
    let due: Bool?

    var id: UUID { ingredientId }

    /// "every 3 weeks", lower case, for a line of detail.
    var every: String { Restock.every(everyDays) }

    /// "last bought Sep 2", with the year only when it is not this one.
    var lastBought: String {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = withFraction.date(from: lastBoughtAt) ?? ISO8601DateFormatter().date(from: lastBoughtAt)
        else { return "" }
        let sameYear = Calendar.current.isDate(date, equalTo: .now, toGranularity: .year)
        let format: Date.FormatStyle = sameYear
            ? .dateTime.month(.abbreviated).day()
            : .dateTime.month(.abbreviated).day().year()
        return "last bought \(date.formatted(format))"
    }
}

/// The lengths a restock reminder is offered in, and how they read.
enum Restock {
    /// Offered first, in days. Anything else is "every N days".
    static let presets = [7, 14, 21, 28]

    static func every(_ days: Int) -> String {
        if days == 1 { return "every day" }
        if days == 7 { return "every week" }
        if days % 7 == 0 { return "every \(days / 7) weeks" }
        return "every \(days) days"
    }

    /// The same, starting a line or a menu option.
    static func everyTitle(_ days: Int) -> String {
        let label = every(days)
        return label.prefix(1).uppercased() + label.dropFirst()
    }
}
