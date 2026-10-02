import Foundation

/// The Nutrition screens' calls, beside them rather than in APIClient.swift (as the recipe
/// page's and the Plan's are). The same ones the web's Nutrition pages make.
extension APIClient {
    /// Answers on a server that has Nutrition facts; an older one says 404.
    func nutritionStatus() async throws -> NutritionStatus {
        try await get("/api/nutrition")
    }

    /// Ingredients and your recipes as you type; packets (Open Food Facts) only with `products`.
    func nutritionSearch(_ query: String, household: UUID?, products: Bool) async throws -> NutritionSearchAnswer {
        var items = [URLQueryItem(name: "q", value: query)]
        if let household { items.append(URLQueryItem(name: "householdId", value: household.uuidString)) }
        if products { items.append(URLQueryItem(name: "products", value: "true")) }
        return try await get("/api/nutrition/search?\(Self.query(items))")
    }

    func food(_ fdcId: Int) async throws -> FoodLabel {
        try await get("/api/nutrition/foods/\(fdcId)")
    }

    /// A packet's label. 404 when Open Food Facts has never heard of it; 429 when it is busy.
    func nutritionProduct(barcode: String) async throws -> ProductLabel {
        let escaped = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? barcode
        return try await get("/api/nutrition/products/\(escaped)")
    }

    /// `include`: optional lines to count in this time. Repeated `include=` as Spring reads a list.
    func recipeNutrition(_ recipe: UUID, household: UUID?, servings: Int = 1, include: [UUID] = []) async throws -> RecipeNutrition {
        var items = [URLQueryItem(name: "servings", value: String(servings))]
        if let household { items.append(URLQueryItem(name: "householdId", value: household.uuidString)) }
        items += include.map { URLQueryItem(name: "include", value: $0.uuidString) }
        return try await get("/api/nutrition/recipes/\(recipe.uuidString)?\(Self.query(items))")
    }

    /// One person's share of the plan from `start` to `end` (yyyy-MM-dd), per day and on average.
    func planNutrition(household: UUID, start: String, end: String) async throws -> PlanNutrition {
        try await get("/api/nutrition/households/\(household.uuidString)/plan?start=\(start)&end=\(end)")
    }

    /// Your latest lookups; with a household, only the recipes it can open (a recipe looked up in
    /// another house stays there). An older server ignores the household and lists everything.
    func recentLookups(household: UUID? = nil) async throws -> [RecentLookup] {
        try await get("/api/nutrition/recent" + (household.map { "?householdId=\($0.uuidString)" } ?? ""))
    }

    /// Puts something at the top of your recent lookups. The server fills in a food's or a
    /// recipe's name and numbers itself; a packet's come from the phone, which has just read them.
    func rememberLookup(kind: String, ref: String, label: String? = nil, kcal: Double? = nil,
                        protein: Double? = nil, household: UUID? = nil) async throws {
        var body: [String: Any] = ["kind": kind, "ref": ref]
        if let label { body["label"] = String(label.prefix(200)) }
        if let kcal { body["kcal"] = kcal }
        if let protein { body["protein"] = protein }
        if let household { body["householdId"] = household.uuidString }
        _ = try await sendNoContent("POST", "/api/nutrition/recent", body: body)
    }

    /// An ingredient's food, and the shortlist a better one may be chosen from.
    func ingredientMatch(_ ingredient: UUID) async throws -> IngredientMatch {
        try await get("/api/nutrition/ingredients/\(ingredient.uuidString)/match")
    }

    /// Which food an ingredient is, for everyone on the server. `source` "ai" when this phone's
    /// model chose it: the server takes only a food from the shortlist, and never lets a model
    /// overrule a person (409).
    func setIngredientMatch(_ ingredient: UUID, fdcId: Int, source: String) async throws -> IngredientMatch {
        try await send("PUT", "/api/nutrition/ingredients/\(ingredient.uuidString)/match",
                       body: ["fdcId": fdcId, "source": source])
    }

    /// What ONE of `unit` weighs for this ingredient ("knob" → 12). "" is one of the thing itself.
    func setIngredientGrams(_ ingredient: UUID, unit: String, grams: Double, source: String) async throws -> LearnedGrams {
        try await send("PUT", "/api/nutrition/ingredients/\(ingredient.uuidString)/grams",
                       body: ["unit": unit, "grams": grams, "source": source])
    }

    private nonisolated static func query(_ items: [URLQueryItem]) -> String {
        var parts = URLComponents()
        parts.queryItems = items
        // URLComponents leaves "+" alone, which a server reads as a space.
        return (parts.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
    }
}

/**
 Whether the server this phone talks to has Nutrition facts.

 A phone outlives the server it was built against in both directions: a TestFlight build can
 reach the house server before the server has been updated. So the doors to Nutrition — on
 Explore and on the recipe page — are only drawn once the server has said it has them. A 404
 is remembered (for that address) until the app is next opened; anything else that goes wrong
 is asked again next time, so a moment without wifi does not hide the doors for good.
 */
@MainActor
@Observable
final class NutritionAvailability {
    static let shared = NutritionAvailability()

    /// Nil until the server has answered.
    private(set) var available: Bool?
    private var askedOf: String?
    private var asking: Task<Void, Never>?

    #if DEBUG
    /// Previews and the Gallery: as though the server had answered.
    static func preview(_ yes: Bool = true) -> NutritionAvailability {
        let a = NutritionAvailability()
        a.available = yes
        a.askedOf = Config.baseURL
        return a
    }
    #endif

    /// Asks the server once per address; later calls wait for the same answer.
    func check() async {
        let address = Config.baseURL
        if askedOf == address, available != nil { return }
        if askedOf != address { available = nil; asking = nil }
        askedOf = address
        if asking == nil {
            asking = Task {
                do {
                    _ = try await APIClient.shared.nutritionStatus()
                    available = true
                } catch let error as APIError where error.status == 404 {
                    available = false
                } catch {
                    // Unreachable, or signed out: say nothing yet and ask again next time.
                    available = nil
                    askedOf = nil
                }
                asking = nil
            }
        }
        await asking?.value
    }
}
