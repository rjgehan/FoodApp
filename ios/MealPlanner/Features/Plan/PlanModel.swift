import SwiftUI

/*
 The Plan's shared vocabulary, the same as the web's planModel.ts: a day's meals grouped into
 slots, what each slot means for the shopping, and the calls the redesigned Plan makes. Every
 Plan screen reads these, so a slot reads the same in Coming up, Upcoming, the day sheet and the
 add sheet.
*/

/// Where one planned meal stands with the shopping (GET …/grocery-list/plan-status).
struct PlannedShopping: Codable, Hashable {
    enum Status: String, Codable {
        case onList = "ON_LIST"
        case notOnList = "NOT_ON_LIST"
        case inCupboard = "IN_CUPBOARD"
        case noIngredients = "NO_INGREDIENTS"
        case eatOut = "EAT_OUT"
        case link = "LINK"
        case deleted = "DELETED"
        case other

        init(from decoder: Decoder) throws {
            // A status a newer server adds reads as "other" rather than failing the whole plan.
            self = Status(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
        }
    }

    let entryId: UUID
    let status: Status
    /// The ingredients the week's button would still put on the list for it.
    let toAdd: [UUID]
    /// Its ingredients as its own Add to groceries counts them, and how many the cupboard has.
    let needs: Int
    let inCupboard: Int
}

typealias ShoppingMap = [UUID: PlannedShopping]

/// One meal of one day: a main and the sides planned with it, in the order they were added.
struct PlanSlot: Identifiable, Hashable {
    let meal: MealType
    let dishes: [MealPlanEntry]
    var id: MealType { meal }
    var main: MealPlanEntry { dishes[0] }
}

/// What can go in a slot.
enum Filling {
    case recipe(UUID, extras: [UUID])
    case item(String)
    case link(UUID)
    case place(UUID, time: String?)
}

extension MealPlanEntry {
    /// A recipe with ingredients: what the week's button puts on the list.
    var contributes: Bool { recipeId != nil && needsIngredients != true }
    /// Planned at all (an emptied slot comes back with nothing named).
    var isPlanned: Bool { recipeName != nil || placeName != nil || itemName != nil }
}

enum PlanText {
    /// A day's planned meals, breakfast to snack. Empty slots are left out.
    static func slots(_ entries: [MealPlanEntry]) -> [PlanSlot] {
        MealType.allCases.compactMap { meal in
            let dishes = entries.filter { $0.mealType == meal && $0.isPlanned }
            return dishes.isEmpty ? nil : PlanSlot(meal: meal, dishes: dishes)
        }
    }

    /// A side goes with something cooked; a night out or a single food takes none.
    static func takesSides(_ dishes: [MealPlanEntry]) -> Bool {
        dishes.contains { $0.recipeId != nil || $0.recipeDeleted == true || $0.savedLinkId != nil }
    }

    /// The time a slot is at: the first of its dishes that has one.
    static func time(_ dishes: [MealPlanEntry]) -> String? { dishes.first { $0.time != nil }?.time }

    /// "6:30 pm" — the mockup writes times in lower case.
    static func clock(_ time: String?) -> String? {
        guard let time else { return nil }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2,
              let date = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date())
        else { return nil }
        return date.formatted(date: .omitted, time: .shortened).lowercased()
    }

    /// "+ Roasted potatoes, Green salad"
    static func sides(_ dishes: [MealPlanEntry]) -> String? {
        let names = dishes.dropFirst().map(\.label)
        return names.isEmpty ? nil : "+ " + names.joined(separator: ", ")
    }

    /// "Tue 29"
    static func shortDay(_ date: Date) -> String {
        "\(date.formatted(.dateTime.weekday(.abbreviated))) \(date.formatted(.dateTime.day()))"
    }

    /// "Thursday 1"
    static func longDay(_ date: Date) -> String {
        "\(date.formatted(.dateTime.weekday(.wide))) \(date.formatted(.dateTime.day()))"
    }

    /// The line under a dish in the day sheet: what kind of thing it is, and what it means.
    static func detail(_ entry: MealPlanEntry, recipe: Recipe?) -> String {
        if entry.recipeDeleted == true { return entry.savedLinkDeleted == true ? "Saved link was deleted" : "Recipe was deleted" }
        if entry.placeId != nil { return "Eat out" }
        if entry.savedLinkId != nil {
            return "Saved link · \(SavedLink.label(source: entry.savedLinkSource, url: entry.savedLinkUrl))"
        }
        if entry.itemName != nil {
            if entry.runningLow == true { return "Running low" }
            return entry.inCupboard == true ? "In the cupboard" : "Not in the cupboard"
        }
        if entry.needsIngredients == true { return "No ingredients yet" }
        let minutes = (recipe?.prepTimeMinutes ?? 0) + (recipe?.cookTimeMinutes ?? 0)
        return minutes > 0 ? "Recipe · \(minutes < 60 ? "\(minutes) min" : "\(minutes / 60) hr\(minutes % 60 > 0 ? " \(minutes % 60) min" : "")")" : "Recipe"
    }

    /// The tile under a slot's meal in the day sheet.
    static func count(_ dishes: [MealPlanEntry]) -> String {
        if dishes.isEmpty { return "Empty" }
        if dishes.contains(where: { $0.placeId != nil }) { return "Eat out" }
        return dishes.count == 1 ? "1 dish" : "\(dishes.count) dishes"
    }

    /**
     The icon on a recipe's drawn plate: what kind of dish it is, so a dinner of chicken, potatoes
     and a salad is three different plates rather than three of the same. Its name first (a curry
     is eaten from a bowl whatever drawer it is in), then its groups (a Side is a fork and knife),
     then its drawer — a dinner's main gets the chef's hat, as the mockup draws one. The web's
     dishIcon, in the same order.
     */
    static func dishIcon(name: String?, section: RecipeSection?, groups: [String], meal: MealType) -> String {
        let name = name ?? ""
        let filed = groups.joined(separator: " ")
        func has(_ pattern: String, _ text: String) -> Bool {
            text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
        }
        let greens = #"\b(salads?|slaw|greens|veg|veggies?|vegetables?)\b"#
        let spoon = #"\b(soups?|curry|curries|stews?|chil[il]i|ramen|pho|broth|dh?al|laksa|chowder|gumbo|risotto|porridge|oats)\b"#
        if has(greens, name) { return "leaf" }
        if has(spoon, name) { return "asset:FoodIcons/pot" }
        if has(#"\begg"#, name) { return "asset:FoodIcons/egg" }
        if has(#"\bside"#, filed) { return "fork.knife" }
        if has(greens, filed) { return "leaf" }
        if (section ?? sectionFor(meal)) == .dinner { return "asset:ChefHat" }
        return icon(section: section, meal: meal)
    }

    /// The SF Symbol a recipe's drawn plate carries: what kind of meal it is.
    static func icon(section: RecipeSection?, meal: MealType) -> String {
        switch section ?? sectionFor(meal) {
        case .breakfast: return "cup.and.saucer"
        case .lunch: return "takeoutbag.and.cup.and.straw"
        case .dinner: return "frying.pan"
        case .snacks: return "carrot"
        case .drinks: return "wineglass"
        default: return "fork.knife"
        }
    }

    /// A recipe made from a slot is filed where you would go looking for it.
    static func sectionFor(_ meal: MealType) -> RecipeSection {
        switch meal {
        case .breakfast: return .breakfast
        case .lunch: return .lunch
        case .dinner: return .dinner
        case .snack: return .snacks
        }
    }
}

/// The one pill a slot gets on the plan, worst news first.
struct SlotMark: Hashable {
    let label: String
    let tone: Tone
    let icon: String
    /// "+ Add" beside it: something is still to buy.
    let canAdd: Bool

    static func of(_ dishes: [MealPlanEntry], shopping: ShoppingMap?) -> SlotMark? {
        if dishes.contains(where: { $0.placeId != nil }) {
            return SlotMark(label: "Eat out", tone: .plum, icon: "fork.knife", canAdd: false)
        }
        guard let shopping else { return nil }
        let states = dishes.filter(\.contributes).compactMap { shopping[$0.id]?.status }
        if states.contains(.notOnList) {
            return SlotMark(label: "Not on list", tone: .mustard, icon: "exclamationmark.circle", canAdd: true)
        }
        if !states.isEmpty, states.allSatisfy({ $0 == .inCupboard }) {
            return SlotMark(label: "All in cupboard", tone: .sky, icon: "cabinet", canAdd: false)
        }
        if !states.isEmpty { return SlotMark(label: "On grocery list", tone: .herb, icon: "checkmark", canAdd: false) }
        if dishes.contains(where: { $0.needsIngredients == true }) {
            return SlotMark(label: "No ingredients yet", tone: .mustard, icon: "pencil", canAdd: false)
        }
        if dishes.contains(where: { $0.savedLinkId != nil && $0.recipeDeleted != true }) {
            return SlotMark(label: "Saved link", tone: .neutral, icon: "link", canAdd: false)
        }
        if let item = dishes.first(where: { $0.itemName != nil }) {
            switch shopping[item.id]?.status {
            case .onList: return SlotMark(label: "On grocery list", tone: .herb, icon: "checkmark", canAdd: false)
            case .inCupboard: return SlotMark(label: "In the cupboard", tone: .sky, icon: "cabinet", canAdd: false)
            default: return SlotMark(label: "Not on list", tone: .mustard, icon: "exclamationmark.circle", canAdd: false)
            }
        }
        return nil
    }
}

// MARK: - Calls

extension APIClient {
    /// Where each meal stands with the shopping. An older server has no such call: no marks.
    func planShopping(household: UUID, from: String, to: String) async -> ShoppingMap? {
        do {
            let all: [PlannedShopping] = try await get(
                "/api/households/\(household.uuidString)/grocery-list/plan-status?start=\(from)&end=\(to)")
            return Dictionary(all.map { ($0.entryId, $0) }, uniquingKeysWith: { a, _ in a })
        } catch {
            return nil
        }
    }

    /// Puts something in a slot, or (with `replacing`) swaps that dish for it.
    @discardableResult
    func fillSlot(household: UUID, date: String, meal: MealType, with filling: Filling,
                  replacing: MealPlanEntry?, servings: Int) async throws -> MealPlanEntry {
        var body: [String: Any] = [:]
        switch filling {
        case .recipe(let id, let extras):
            body["recipeId"] = id.uuidString
            body["includedOptionalIngredientIds"] = extras.map(\.uuidString)
            // A place or a single item has no servings; a recipe taking its place needs some.
            if replacing == nil || replacing?.servings == nil { body["servings"] = servings }
        case .item(let name):
            body["itemName"] = name
        case .link(let id):
            body["savedLinkId"] = id.uuidString
        case .place(let id, let time):
            body["placeId"] = id.uuidString
            if let time { body["time"] = time } else if replacing != nil { body["clearTime"] = true }
        }
        let household = household.uuidString
        if let replacing {
            return try await send("PATCH", "/api/households/\(household)/meal-plan/entries/\(replacing.id.uuidString)", body: body)
        }
        body["date"] = date
        body["mealType"] = meal.rawValue
        return try await send("POST", "/api/households/\(household)/meal-plan/entries", body: body)
    }

    /// Changes one planned dish: its servings, time or extras.
    @discardableResult
    func patchPlanned(household: UUID, entry: UUID, _ body: [String: Any]) async throws -> MealPlanEntry {
        try await send("PATCH", "/api/households/\(household.uuidString)/meal-plan/entries/\(entry.uuidString)", body: body)
    }

    /// One meal's own Add to groceries: everything it needs, whatever happened to it before.
    func addMealToGroceries(household: UUID, entry: UUID) async throws {
        _ = try await sendNoContent("POST", "/api/households/\(household.uuidString)/grocery-list/add-meal/\(entry.uuidString)")
    }

    /// A recipe saved with just its name, to plan now and fill in later.
    func createNamedRecipe(household: UUID, name: String, section: RecipeSection, servings: Int) async throws -> Recipe {
        try await createRecipe(household: household, body: [
            "name": name, "servings": servings, "section": section.rawValue, "categories": [String](), "ingredients": [[String: Any]](),
        ])
    }
}
