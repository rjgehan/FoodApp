import Foundation

/// The recipe page's own calls, beside it rather than in APIClient.swift (as the Plan's and the
/// catalogue's are). Both are the ones the web's recipe page has always made.
extension APIClient {
    /// Files a recipe in this household's drawers and groups — Organise, and "Move into my
    /// recipes" for one another household shared.
    func fileRecipe(household: UUID, recipe: UUID, section: RecipeSection, categories: [String]) async throws -> Recipe {
        try await send("PUT", "/api/households/\(household.uuidString)/recipes/\(recipe.uuidString)/filing",
                       body: ["section": section.rawValue, "categories": categories])
    }

    /// Replaces the recipe's links, and only its links.
    func setLinks(recipe: UUID, links: [LinkDraft]) async throws -> Recipe {
        try await send("PUT", "/api/recipes/\(recipe.uuidString)/links", body: ["links": LinkDraft.body(links)])
    }
}
