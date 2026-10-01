import SwiftUI

/**
 What the catalogue shows, held once for every screen of it: the front of Recipes, each level of
 a drawer pushed on top, Edit groups and the split sheet all read and reload the same store, so
 a group filed or renamed on one is right on the screen underneath when you come back to it.
*/
@Observable
final class CatalogueStore {
    let session: Session?
    /// Previews and the Gallery: sample data, and nothing sent anywhere.
    let isSample: Bool
    var recipes: [Recipe] = []
    var categories: [RecipeCategory] = []
    /// The drawers somebody picked an icon for; the rest wear `RecipeSection.defaultIcon`.
    var sectionIcons: [RecipeSection: String] = [:]
    /// Nil until known, and from a server from before saved links, so no row says 0.
    var savedLinks: [SavedLink]?
    var loaded = false
    var error: String?

    init(session: Session?, sample: [Recipe]? = nil, sampleCategories: [RecipeCategory]? = nil,
         sampleLinks: [SavedLink]? = nil) {
        self.session = session
        isSample = sample != nil
        if let sample {
            recipes = sample
            categories = sampleCategories ?? []
            savedLinks = sampleLinks ?? SampleData.savedLinks
            loaded = true
        }
    }

    var household: UUID? { isSample ? nil : session?.household?.id }

    func load() async {
        guard let household else { return }
        do {
            error = nil
            async let all = APIClient.shared.recipes(household: household)
            async let groups = APIClient.shared.recipeCategories(household: household)
            // A drawer with no choice on record just wears its default, so a failure here is
            // not worth an error over the whole catalogue.
            async let icons = try? APIClient.shared.sectionIcons(household: household)
            (recipes, categories) = try await (all, groups)
            sectionIcons = await icons ?? [:]
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadSavedLinks() async {
        guard let household else { return }
        savedLinks = try? await APIClient.shared.savedLinks(household: household)
    }

    func loadIcons() async {
        guard let household, let icons = try? await APIClient.shared.sectionIcons(household: household) else { return }
        sectionIcons = icons
    }

    // MARK: - The tree

    /// The groups a drawer shows: its own, and any that belong to every drawer.
    func groups(in section: RecipeSection) -> [RecipeCategory] {
        categories.filter { $0.section == section || $0.section == nil }
    }

    /// The groups directly inside one (nil: the top of the drawer), alphabetical.
    func children(of parent: UUID?, in section: RecipeSection) -> [RecipeCategory] {
        let mine = groups(in: section)
        let ids = Set(mine.map(\.id))
        return mine
            // A parent that is not here (deleted a moment ago on another phone) means top level.
            .filter { ($0.parentId.flatMap { ids.contains($0) ? $0 : nil }) == parent }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// The group and every group inside it, at any depth, as lowercased names.
    func namesWithin(_ group: RecipeCategory, in section: RecipeSection) -> Set<String> {
        var names: Set<String> = []
        var seen: Set<UUID> = []
        var stack = [group]
        while let current = stack.popLast() {
            guard seen.insert(current.id).inserted else { continue }
            names.insert(current.name.lowercased())
            stack.append(contentsOf: children(of: current.id, in: section))
        }
        return names
    }

    /// Whether a recipe is filed anywhere inside a group — in it, or in one inside it.
    func isIn(_ recipe: Recipe, _ group: RecipeCategory, in section: RecipeSection) -> Bool {
        let names = namesWithin(group, in: section)
        return recipe.categories.contains { names.contains($0.lowercased()) }
    }

    /// From the top of the drawer down to this group.
    func path(to group: RecipeCategory) -> [RecipeCategory] {
        var out: [RecipeCategory] = []
        var seen: Set<UUID> = []
        var current: RecipeCategory? = group
        while let c = current, seen.insert(c.id).inserted {
            out.insert(c, at: 0)
            current = c.parentId.flatMap { id in categories.first { $0.id == id } }
        }
        return out
    }

    /// Where a recipe is filed, as a trail: "Dinner › Main dish › Chicken" — the deepest of its
    /// groups, since recipes carry them by name.
    func trail(_ recipe: Recipe) -> String {
        guard let section = recipe.section else {
            return recipe.ownerName.map { "Shared by \($0)" } ?? "Shared with you"
        }
        let mine = groups(in: section)
        var deepest: [RecipeCategory] = []
        for name in recipe.categories {
            guard let group = mine.first(where: { $0.name.lowercased() == name.lowercased() }) else { continue }
            let p = path(to: group)
            if p.count > deepest.count { deepest = p }
        }
        return ([section.title] + deepest.map(\.name)).joined(separator: " › ")
    }
}

extension RecipeSection {
    /// Each drawer's colour, as the mockup paints them.
    var tone: Tone {
        switch self {
        case .breakfast: .mustard
        case .lunch: .herb
        case .dinner: .accent
        case .snacks: .plum
        case .drinks: .sky
        case .other: .mustard
        }
    }
}

extension RecipeCategory {
    /// A group's colour: the same group, the same colour — the web's hash over the same five.
    var tone: Tone {
        var hash: UInt32 = 0
        for scalar in id.uuidString.lowercased().unicodeScalars { hash = hash &* 31 &+ scalar.value }
        return [Tone.accent, .mustard, .herb, .sky, .plum][Int(hash % 5)]
    }
}

extension Recipe {
    /// Prep and cook together, as "45 min" or "1 hr 20 min"; nil when neither is known.
    var totalTime: String? {
        let total = (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0)
        guard total > 0 else { return nil }
        let hours = total / 60, minutes = total % 60
        if hours == 0 { return "\(minutes) min" }
        return minutes == 0 ? "\(hours) hr" : "\(hours) hr \(minutes) min"
    }
}
