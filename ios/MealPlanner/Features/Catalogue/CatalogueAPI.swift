import Foundation

/// The catalogue's own calls, beside it rather than in APIClient.swift (as Plan/PlanAPI.swift does).
extension APIClient {
    /// Files recipes in a group, taking them out of `from` (the level they were sorted at) — the
    /// one tap on an unfiled recipe, and a split putting each kind in its new group.
    func fileRecipes(household: UUID, in category: UUID, recipes: [UUID], from: UUID?) async throws {
        var body: [String: Any] = ["recipeIds": recipes.map(\.uuidString)]
        if let from { body["fromCategoryId"] = from.uuidString }
        _ = try await sendNoContent(
            "POST", "/api/households/\(household.uuidString)/recipe-categories/\(category.uuidString)/recipes", body: body)
    }

    /// Puts a group inside another — an unused "Vegetarian" moved into Main when Main is split.
    func moveRecipeCategory(household: UUID, category: UUID, into parent: UUID) async throws {
        _ = try await sendNoContent(
            "PATCH", "/api/households/\(household.uuidString)/recipe-categories/\(category.uuidString)",
            body: ["parentId": parent.uuidString])
    }
}
