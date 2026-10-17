import Foundation

/// The catalogue's own calls, beside it rather than in APIClient.swift. Tags are still "recipe
/// categories" on the wire, so a phone from before tags keeps working against the same server.
extension APIClient {
    /**
     A new tag in a drawer. `recipeIds` are tagged in the same request — only recipes this
     household keeps in that drawer; the server skips any others. A name the drawer already has
     comes back as a 409 saying so.
    */
    func createTag(household: UUID, name: String, section: RecipeSection, iconKey: String? = nil,
                   recipeIds: [UUID] = []) async throws -> RecipeCategory {
        var body: [String: Any] = ["name": name, "section": section.rawValue]
        if let iconKey { body["iconKey"] = iconKey }
        if !recipeIds.isEmpty { body["recipeIds"] = recipeIds.map(\.uuidString) }
        return try await send("POST", "/api/households/\(household.uuidString)/recipe-categories", body: body)
    }

    /// Puts a tag on some recipes and takes it off others in one request — select mode's Tag,
    /// the quick-tag card for a tag that exists, and picking a new tag's recipes. Recipes in
    /// another drawer are skipped by the server. Answers with the tag as it now stands.
    func tagRecipes(household: UUID, tag: UUID, add: [UUID], remove: [UUID]) async throws -> RecipeCategory {
        try await send("PUT", "/api/households/\(household.uuidString)/recipe-categories/\(tag.uuidString)/recipes",
                       body: ["add": add.map(\.uuidString), "remove": remove.map(\.uuidString)])
    }
}
