import Foundation

/// The recipe page's own calls, beside it rather than in APIClient.swift (as the Plan's and the
/// catalogue's are). Both are the ones the web's recipe page has always made.
extension APIClient {
    /// Files a recipe in one of this household's drawers with its tags (names, looked up in that
    /// drawer; a new one is made there) — Organise, "Move into my recipes" for one another
    /// household shared, and select mode's Move.
    func fileRecipe(household: UUID, recipe: UUID, section: RecipeSection, categories: [String]) async throws -> Recipe {
        try await send("PUT", "/api/households/\(household.uuidString)/recipes/\(recipe.uuidString)/filing",
                       body: ["section": section.rawValue, "categories": categories])
    }

    /// Replaces the recipe's links, and only its links.
    func setLinks(recipe: UUID, links: [LinkDraft]) async throws -> Recipe {
        try await send("PUT", "/api/recipes/\(recipe.uuidString)/links", body: ["links": LinkDraft.body(links)])
    }

    /**
     A recipe's ingredients straight onto the grocery list, for this many servings and with the
     optional extras ticked — no Plan needed. The rows it touched come back. If this recipe's
     things are on the list already (unticked) the server says 409 `alreadyOnList` instead, and
     `again` is how somebody says yes, add them on top.
     */
    func addRecipeToGroceries(household: UUID, recipe: UUID, servings: Int, extras: [UUID],
                              again: Bool = false) async throws -> [GroceryItem] {
        var body: [String: Any] = ["servings": servings, "includedOptionalIngredientIds": extras.map(\.uuidString)]
        if again { body["again"] = true }
        return try await send("POST", "/api/households/\(household.uuidString)/grocery-list/add-recipe/\(recipe.uuidString)",
                              body: body)
    }
}

extension APIError {
    /// Add to groceries was refused because this recipe's things are on the list already.
    var alreadyOnList: Bool {
        struct Body: Decodable { let alreadyOnList: Bool? }
        guard status == 409, let data = body.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(Body.self, from: data) else { return false }
        return decoded.alreadyOnList == true
    }
}
