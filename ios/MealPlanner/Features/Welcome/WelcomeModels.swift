import Foundation

/// Whether the signed-in person is in an invite's house already — and if so, which it is.
struct InviteStanding: Codable, Hashable {
    let alreadyMember: Bool
    let householdId: UUID?
}

/**
 A recipe as its public link shows it (/api/public/recipes/{token}): what anybody with the link
 may read, with no ids or household in it.
 */
struct PublicRecipe: Codable, Hashable {
    let name: String
    let description: String?
    let instructions: String?
    let prepTimeMinutes: Int?
    let cookTimeMinutes: Int?
    let servings: Int
    var links: [SourceLink]? = nil
    let coverImageId: UUID?
    var photoIds: [UUID]? = nil
    let ingredients: [PublicIngredient]

    /// The cover first, then the other photos, each once.
    var pictures: [UUID] {
        var seen = Set<UUID>()
        return ([coverImageId].compactMap { $0 } + (photoIds ?? [])).filter { seen.insert($0).inserted }
    }

    /// One step per line, with any numbering the writer added taken off (the web's
    /// instructionSteps).
    var steps: [String] {
        (instructions ?? "")
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces).replacing(/^(\d+[.)]|[-*•])\s*/, with: "") }
            .filter { !$0.isEmpty }
    }
}

struct PublicIngredient: Codable, Hashable {
    let ingredientName: String
    let quantity: Double?
    let unit: String?
    let notes: String?
    var optional: Bool? = nil
}

/// A link opened in the app is shown as a sheet (or the whole screen) of its own.
extension AppLink: Identifiable {
    var id: Self { self }
}
