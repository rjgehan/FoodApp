import SwiftUI

/**
 What the catalogue shows, held once for every screen of it: the front of Recipes, each drawer
 pushed on top, Manage tags and the Tag and Move sheets all read the same store, so a tag made
 or renamed on one is right on the screen underneath when you come back to it.

 Loaded once, and after that kept up to date from what each change sends back — a tag made,
 renamed, put on three recipes — rather than fetching every recipe again after every tap, which
 is what made organising feel slow. The screen changes as the request goes, and changes back
 with a message if the server says no. Pull to refresh still fetches everything.
*/
@MainActor
@Observable
final class CatalogueStore {
    let session: Session?
    /// Previews and the Gallery: sample data, and nothing sent anywhere — changes stay on screen.
    let isSample: Bool
    var recipes: [Recipe] = []
    /// Every tag, in every drawer.
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
            async let tags = APIClient.shared.recipeCategories(household: household)
            // A drawer with no choice on record just wears its default, so a failure here is
            // not worth an error over the whole catalogue.
            async let icons = try? APIClient.shared.sectionIcons(household: household)
            (recipes, categories) = try await (all, tags)
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

    /// Just the tags — after a recipe saved from a form brought new ones with it.
    func loadTags() async {
        guard let household, let tags = try? await APIClient.shared.recipeCategories(household: household) else { return }
        categories = tags
    }

    // MARK: - Reading

    /// A drawer's recipes, by name.
    func recipes(in section: RecipeSection) -> [Recipe] {
        recipes.filter { $0.section == section }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// A drawer's tags, alphabetical. Only its own: a tag belongs to one drawer.
    func tags(in section: RecipeSection) -> [RecipeCategory] {
        categories.filter { $0.section == section }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// The drawer's tag with that name, whatever its capitals — names are unique per drawer.
    func tag(named name: String, in section: RecipeSection) -> RecipeCategory? {
        categories.first { $0.section == section && Self.same($0.name, name) }
    }

    /// Whether a recipe wears a tag. Recipes carry their tags by name.
    func has(_ recipe: Recipe, _ tag: RecipeCategory) -> Bool {
        recipe.section == tag.section && recipe.categories.contains { Self.same($0, tag.name) }
    }

    /// How many recipes wear it, counted here so it is right the moment a tag goes on or off.
    func count(_ tag: RecipeCategory) -> Int {
        recipes.filter { has($0, tag) }.count
    }

    /// Where a recipe is filed, for a search result: "Dinner · Chicken, Quick", or who shared it.
    func filingLine(_ recipe: Recipe) -> String {
        recipe.filingLine ?? recipe.ownerName.map { "Shared by \($0)" } ?? "Shared with you"
    }

    // MARK: - Changing tags

    /**
     A new tag in a drawer; `recipeIds` are tagged in the same request — the quick-tag card's one
     tap, and a new tag typed into the Tag sheet.
    */
    @discardableResult
    func createTag(_ name: String, in section: RecipeSection, iconKey: String? = nil,
                   recipeIds: Set<UUID> = []) async throws -> RecipeCategory {
        let made: RecipeCategory
        if isSample {
            made = RecipeCategory(id: UUID(), name: name, recipeCount: recipeIds.count, parentId: nil,
                                  section: section, iconKey: iconKey)
        } else {
            guard let household else { throw CancellationError() }
            do {
                made = try await APIClient.shared.createTag(household: household, name: name, section: section,
                                                            iconKey: iconKey, recipeIds: Array(recipeIds))
            } catch {
                // Usually "There's already a tag called Quick in Dinner": made on another phone
                // since these were loaded. The tags as the server has them, so the one it means
                // is on screen to use rather than only named in an error.
                await loadTags()
                throw error
            }
        }
        categories.removeAll { $0.id == made.id }
        categories.append(made)
        edit(recipeIds, in: section) { Self.add(made.name, to: &$0) }
        return made
    }

    /// Puts a tag on some recipes and takes it off others, in one request.
    func tagRecipes(_ tag: RecipeCategory, add: Set<UUID>, remove: Set<UUID>) async throws {
        guard let section = tag.section else { return }
        let inDrawer = recipes(in: section)
        // Only what actually changes, so a failure undoes exactly that.
        let adding = Set(inDrawer.filter { add.contains($0.id) && !has($0, tag) }.map(\.id))
        let removing = Set(inDrawer.filter { remove.contains($0.id) && has($0, tag) }.map(\.id))
        guard !adding.isEmpty || !removing.isEmpty else { return }
        edit(adding, in: section) { Self.add(tag.name, to: &$0) }
        edit(removing, in: section) { Self.remove(tag.name, from: &$0) }
        guard !isSample else { return }
        do {
            guard let household else { throw CancellationError() }
            let saved = try await APIClient.shared.tagRecipes(household: household, tag: tag.id,
                                                              add: Array(adding), remove: Array(removing))
            replace(saved)
        } catch {
            edit(adding, in: section) { Self.remove(tag.name, from: &$0) }
            edit(removing, in: section) { Self.add(tag.name, to: &$0) }
            // Perhaps deleted or renamed on another phone: the tags as they are now.
            await loadTags()
            throw error
        }
    }

    /**
     The Tag sheet's Save: each tag that changed goes on (true) or comes off (false) the chosen
     recipes, and each new name becomes a tag on them — every request at once, not one after
     another. Says what could not be done, if anything.
    */
    func applyTags(_ wanted: [UUID: Bool], newTags: [String], to ids: Set<UUID>,
                   in section: RecipeSection) async -> [String] {
        let tags = categories
        return await withTaskGroup(of: String?.self) { group in
            for (id, on) in wanted {
                guard let tag = tags.first(where: { $0.id == id }) else { continue }
                group.addTask {
                    do {
                        try await self.tagRecipes(tag, add: on ? ids : [], remove: on ? [] : ids)
                        return nil
                    } catch {
                        return "Could not change \(tag.name). \(error.localizedDescription)"
                    }
                }
            }
            for name in newTags {
                group.addTask {
                    do {
                        try await self.createTag(name, in: section, recipeIds: ids)
                        return nil
                    } catch {
                        // Made on another phone a moment ago, and fetched again just now: that
                        // one goes on them instead, which is what typing its name meant.
                        guard let there = await self.tag(named: name, in: section) else {
                            return "Could not make \(name). \(error.localizedDescription)"
                        }
                        do {
                            try await self.tagRecipes(there, add: ids, remove: [])
                            return nil
                        } catch {
                            return "Could not change \(there.name). \(error.localizedDescription)"
                        }
                    }
                }
            }
            var failures: [String] = []
            for await failure in group {
                if let failure { failures.append(failure) }
            }
            return failures
        }
    }

    /// A new name for a tag, on every recipe wearing it too.
    func renameTag(_ tag: RecipeCategory, to name: String) async throws {
        let wanted = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !wanted.isEmpty, wanted != tag.name, let section = tag.section else { return }
        let wearing = Set(recipes.filter { has($0, tag) }.map(\.id))
        var renamed = tag
        renamed.name = wanted
        replace(renamed)
        edit(wearing, in: section) { Self.rename(tag.name, to: wanted, in: &$0) }
        guard !isSample else { return }
        do {
            guard let household else { throw CancellationError() }
            let saved = try await APIClient.shared.renameRecipeCategory(household: household, category: tag.id, name: wanted)
            // The server tidies spaces; its spelling is the one recipes come back with.
            if saved.name != wanted { edit(wearing, in: section) { Self.rename(wanted, to: saved.name, in: &$0) } }
            replace(saved)
        } catch {
            replace(tag)
            edit(wearing, in: section) { Self.rename(wanted, to: tag.name, in: &$0) }
            // A clash with a name another phone just gave a tag shows that tag, not only the error.
            await loadTags()
            throw error
        }
    }

    /// The drawing a tag wears; nil takes it off.
    func setTagIcon(_ tag: RecipeCategory, to iconKey: String?) async throws {
        var drawn = tag
        drawn.iconKey = iconKey
        replace(drawn)
        guard !isSample else { return }
        do {
            guard let household else { throw CancellationError() }
            let saved = try await APIClient.shared.setRecipeCategoryIcon(household: household, category: tag.id, iconKey: iconKey)
            replace(saved)
        } catch {
            replace(tag)
            throw error
        }
    }

    /// Gone, and off every recipe that wore it. The recipes themselves stay where they are.
    func deleteTag(_ tag: RecipeCategory) async throws {
        guard let section = tag.section else { return }
        let wearing = Set(recipes.filter { has($0, tag) }.map(\.id))
        categories.removeAll { $0.id == tag.id }
        edit(wearing, in: section) { Self.remove(tag.name, from: &$0) }
        guard !isSample else { return }
        do {
            guard let household else { throw CancellationError() }
            try await APIClient.shared.deleteRecipeCategory(household: household, category: tag.id)
        } catch {
            categories.append(tag)
            edit(wearing, in: section) { Self.add(tag.name, to: &$0) }
            throw error
        }
    }

    // MARK: - Moving recipes

    /**
     Moves recipes to another drawer, every one at once. A recipe keeps only the tags the new
     drawer already has — never a new, empty copy of one made there — and the rest come off,
     which the caller says out loud. Returns how many moved and the tag names that came off.
    */
    func move(_ ids: Set<UUID>, to target: RecipeSection) async -> (moved: Int, dropped: [String], failed: Int) {
        let moving = recipes.filter { ids.contains($0.id) && $0.section != target }
        var dropped: [String] = []
        var plans: [(recipe: Recipe, keep: [String])] = []
        for recipe in moving {
            let keep = recipe.categories.compactMap { tag(named: $0, in: target)?.name }
            for name in recipe.categories where !keep.contains(where: { Self.same($0, name) })
                && !dropped.contains(where: { Self.same($0, name) }) {
                dropped.append(name)
            }
            plans.append((recipe, keep))
        }
        if isSample {
            for plan in plans {
                guard let i = recipes.firstIndex(where: { $0.id == plan.recipe.id }) else { continue }
                recipes[i].section = target
                recipes[i].categories = plan.keep
            }
            return (plans.count, dropped, 0)
        }
        guard let household else { return (0, [], plans.count) }
        let saved: [Recipe] = await withTaskGroup(of: Recipe?.self) { group in
            for plan in plans {
                let id = plan.recipe.id, keep = plan.keep
                group.addTask {
                    try? await APIClient.shared.fileRecipe(household: household, recipe: id, section: target, categories: keep)
                }
            }
            var out: [Recipe] = []
            for await recipe in group {
                if let recipe { out.append(recipe) }
            }
            return out
        }
        for recipe in saved { upsert(recipe) }
        return (saved.count, dropped, plans.count - saved.count)
    }

    // MARK: - Recipes saved elsewhere

    /**
     A recipe the new-recipe form just saved: on screen straight away. A tag typed into the form
     is made by the server as the recipe is saved, so if it brought a name this drawer has no tag
     for yet, the tags are fetched — just those.
    */
    func saved(_ recipe: Recipe) {
        upsert(recipe)
        guard let section = recipe.section else { return }
        if recipe.categories.contains(where: { tag(named: $0, in: section) == nil }) {
            Task { await self.loadTags() }
        }
    }

    // MARK: - Plumbing

    private func upsert(_ recipe: Recipe) {
        if let i = recipes.firstIndex(where: { $0.id == recipe.id }) { recipes[i] = recipe } else { recipes.append(recipe) }
    }

    private func replace(_ tag: RecipeCategory) {
        if let i = categories.firstIndex(where: { $0.id == tag.id }) { categories[i] = tag }
    }

    /// Changes the tag names of the recipes with these ids, in this drawer only.
    private func edit(_ ids: Set<UUID>, in section: RecipeSection, _ change: (inout [String]) -> Void) {
        guard !ids.isEmpty else { return }
        for i in recipes.indices where ids.contains(recipes[i].id) && recipes[i].section == section {
            change(&recipes[i].categories)
        }
    }

    private static func same(_ a: String, _ b: String) -> Bool { a.caseInsensitiveCompare(b) == .orderedSame }

    /// Sorted as the server sends them, so the screen does not reshuffle when it answers.
    private static func add(_ name: String, to names: inout [String]) {
        guard !names.contains(where: { same($0, name) }) else { return }
        names.append(name)
        names.sort { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private static func remove(_ name: String, from names: inout [String]) {
        names.removeAll { same($0, name) }
    }

    private static func rename(_ old: String, to new: String, in names: inout [String]) {
        guard names.contains(where: { same($0, old) }) else { return }
        remove(old, from: &names)
        add(new, to: &names)
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
    /// A tag's colour: the same tag, the same colour — the web's hash over the same five.
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

    /// "Dinner · Chicken, Quick": its drawer, then its tags — the web's filingLine, word for word.
    /// Nil while it is shared with you and not in a drawer of yours.
    var filingLine: String? {
        guard let section else { return nil }
        return categories.isEmpty ? section.title : "\(section.title) · \(categories.joined(separator: ", "))"
    }

    /// The machines it needs, known to this build, in the catalogue's order.
    var machines: [KitchenMachine] { KitchenMachine.ordered(appliances ?? []) }
}
