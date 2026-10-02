import SwiftUI

/**
 The recipes at a level that are in none of the groups below, each on one line with where it most
 likely goes as the first, filled chip and one other beside it (3.3) — one tap files it and it
 drops off the card. Tapping the name offers every group, and the recipe itself. A long list starts
 folded to the first few.
*/
struct UnfiledCard: View {
    var store: CatalogueStore
    let section: RecipeSection
    let recipes: [Recipe]
    let groups: [RecipeCategory]
    /// The group this level is, so filing takes the recipe out of it; nil at the drawer's top.
    let from: RecipeCategory?

    @State private var filed: Set<UUID> = []
    @State private var showAll = false
    @State private var choosingFor: Recipe?
    @State private var opening: Recipe?
    @State private var error: String?

    private var left: [Recipe] { recipes.filter { !filed.contains($0.id) } }

    var body: some View {
        let left = left
        if !left.isEmpty || error != nil {
            VStack(alignment: .leading, spacing: 10) {
                Label("\(left.count) unfiled \(left.count == 1 ? "recipe" : "recipes")", systemImage: "folder")
                    .labelStyle(GapLabel())
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.mustard)
                    .accessibilityAddTraits(.isHeader)
                ForEach(showAll ? left : Array(left.prefix(5))) { recipe in
                    row(recipe)
                }
                if left.count > 5 && !showAll {
                    Button("Show all \(left.count)") { showAll = true }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Palette.mustard)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.mustardSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.mustard, lineWidth: 1))
            .confirmationDialog(choosingFor?.name ?? "", isPresented: Binding(
                get: { choosingFor != nil }, set: { if !$0 { choosingFor = nil } }), titleVisibility: .visible) {
                if let recipe = choosingFor {
                    ForEach(ordered(recipe).all) { group in
                        Button("Put it in \(group.name)") { Task { await file(recipe, in: group) } }
                    }
                    Button("Open the recipe") { opening = recipe }
                }
            }
            .navigationDestination(item: $opening) { recipe in
                RecipeDetailView(recipe: recipe, session: store.session)
            }
        }
    }

    /// Likeliest first, then the rest in their usual order.
    private func ordered(_ recipe: Recipe) -> (likely: [RecipeCategory], all: [RecipeCategory]) {
        let likely = CategoryKinds.suggestGroups(recipe, among: groups) { store.namesWithin($0, in: section) }
        return (likely, likely + groups.filter { g in !likely.contains { $0.id == g.id } })
    }

    private func row(_ recipe: Recipe) -> some View {
        let (likely, all) = ordered(recipe)
        return HStack(spacing: 8) {
            Button { choosingFor = recipe } label: {
                Text(recipe.name).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.text)
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Every group for \(recipe.name)")
            ForEach(Array(all.prefix(2).enumerated()), id: \.element.id) { index, group in
                smallChip(group.name, filled: index == 0 && !likely.isEmpty) {
                    Task { await file(recipe, in: group) }
                }
                .accessibilityLabel("Put \(recipe.name) in \(group.name)")
            }
        }
    }

    /// The mockup's compact chip, the likely group filled with the text colour.
    private func smallChip(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: filled ? .semibold : .medium))
                .lineLimit(1)
                .foregroundStyle(filled ? Palette.bg : Palette.text)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(filled ? Palette.text : Palette.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(filled ? Palette.text : Palette.border, lineWidth: 1))
                .fixedSize()
        }
        .buttonStyle(PressFade())
    }

    private func file(_ recipe: Recipe, in group: RecipeCategory) async {
        error = nil
        filed.insert(recipe.id)
        guard let household = store.household else { return }
        do {
            try await APIClient.shared.fileRecipes(household: household, in: group.id, recipes: [recipe.id], from: from?.id)
            await store.load()
        } catch {
            filed.remove(recipe.id)
            self.error = "Could not file \(recipe.name). \(error.localizedDescription)"
        }
    }
}

/**
 "Your Main dish looks like Chicken, Beef and Seafood — make those?" (3.5). Read from the recipes'
 names and ingredients, so it costs nothing, and every group can be unticked before anything
 happens. Closing it is "not now", remembered on this phone.
*/
struct SplitSheet: View {
    var store: CatalogueStore
    let group: RecipeCategory
    let total: Int
    let suggestions: [(name: String, recipeIds: [UUID])]
    /// The recipes being split, to name one from each suggestion.
    let examples: [Recipe]

    @Environment(\.dismiss) private var dismiss
    @State private var unticked: Set<String> = []
    @State private var busy = false
    @State private var error: String?
    /// As tall as what is in it, with the group still showing behind, dimmed (the mockup's 3.5).
    @State private var height: CGFloat = 480

    private var picked: [(name: String, recipeIds: [UUID])] { suggestions.filter { !unticked.contains($0.name) } }

    var body: some View {
        let stay = total - picked.reduce(0) { $0 + $1.recipeIds.count }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Split \"\(group.name)\"?",
                            subtitle: "\(total) \(total == 1 ? "recipe" : "recipes"), no subgroups yet. We found these:",
                            onClose: { dismiss() })
                ListGroup {
                    ForEach(suggestions, id: \.name) { s in
                        let on = !unticked.contains(s.name)
                        Button {
                            if on { unticked.insert(s.name) } else { unticked.remove(s.name) }
                        } label: {
                            ListRow(s.name, subtitle: "\(s.recipeIds.count) \(s.recipeIds.count == 1 ? "recipe" : "recipes")") {
                                CheckBox(isOn: on)
                            } trailing: {
                                if let example = examples.first(where: { $0.id == s.recipeIds.first }) {
                                    Text(example.name + "…").font(.system(size: 13)).foregroundStyle(Palette.muted)
                                        .lineLimit(1).frame(maxWidth: 140, alignment: .trailing)
                                }
                            }
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                if stay > 0 {
                    Text("\(stay) \(stay == 1 ? "recipe doesn't match and stays" : "recipes don't match and stay") in \(group.name).")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                Button(busy ? "Making…" : "Create \(picked.count) \(picked.count == 1 ? "group" : "groups")") {
                    Task { await apply() }
                }
                .buttonStyle(.primary)
                .disabled(busy || picked.isEmpty || store.household == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 + 8 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .kitchenSheet([.height(height)])
    }

    private func apply() async {
        guard let household = store.household else { return }
        busy = true
        error = nil
        do {
            for s in picked {
                // A group with that name may exist already — an unused "Vegetarian", say. Move
                // it in rather than failing on the name.
                let existing = store.categories.first { $0.name.lowercased() == s.name.lowercased() }
                let target: UUID
                if let existing {
                    if existing.parentId != group.id {
                        try await APIClient.shared.moveRecipeCategory(household: household, category: existing.id, into: group.id)
                    }
                    target = existing.id
                } else {
                    target = try await APIClient.shared.createRecipeCategory(
                        household: household, name: s.name, section: nil, parent: group.id).id
                }
                try await APIClient.shared.fileRecipes(household: household, in: target, recipes: s.recipeIds, from: group.id)
            }
            await store.load()
            dismiss()
        } catch {
            self.error = "Could not make those groups. \(error.localizedDescription)"
            busy = false
        }
    }
}

/// A new group where you are: a name, and a picture if you want one.
struct NewGroupSheet: View {
    var store: CatalogueStore
    let section: RecipeSection
    let parent: RecipeCategory?

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var iconKey: String?
    @State private var choosingIcon = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(parent.map { "New group inside \($0.name)" } ?? "New group",
                            subtitle: parent == nil ? "It goes in \(section.title)." : nil, onClose: { dismiss() })
                FieldBox("Name", text: $name,
                         prompt: parent.map { "A kind of \($0.name.lowercased())…" } ?? "Main dish, Side…")
                if choosingIcon {
                    FoodIconPicker(selected: iconKey, allowNone: true) { key in
                        iconKey = key
                        choosingIcon = false
                    }
                } else {
                    Button { choosingIcon = true } label: {
                        HStack(spacing: 8) {
                            FoodTile(iconKey: iconKey, tone: .accent, size: 32)
                            Text(iconKey == nil ? "Pick an icon" : "Change icon")
                        }
                    }
                    .buttonStyle(.kitchen(.ghost, size: .small, fill: false))
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                Button(busy ? "Adding…" : "Add") { Task { await add() } }
                    .buttonStyle(.primary)
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty || store.household == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
    }

    private func add() async {
        guard let household = store.household else { return }
        busy = true
        do {
            // A group inside another joins its drawer; a top-level one joins the drawer it is made in.
            try await APIClient.shared.createRecipeCategory(
                household: household, name: name.trimmingCharacters(in: .whitespaces),
                section: parent == nil ? section : nil, parent: parent?.id, iconKey: iconKey)
            await store.load()
            dismiss()
        } catch {
            self.error = error.localizedDescription
            busy = false
        }
    }
}

/**
 Recipes other households shared into yours, by the household they came from (3.19). Read-only
 until you open one and save it to your own recipes, which files it in a drawer of yours.
*/
struct SharedWithYouView: View {
    var store: CatalogueStore
    /// What counted as new when the list opened stays new while you look at it; next time it won't.
    @State private var seenAt: Date? = SharedNews.seenAt(nil)
    @State private var marked = false

    private var byHousehold: [(String, [Recipe])] {
        let shared = store.recipes.filter { $0.section == nil }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return Dictionary(grouping: shared) { $0.ownerName ?? "another household" }
            .sorted { $0.key.localizedCaseInsensitiveCompare($1.key) == .orderedAscending }
            .map { ($0.key, $0.value) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if byHousehold.isEmpty {
                    Text("Nothing shared with you.").font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.vertical, 32)
                }
                ForEach(byHousehold, id: \.0) { from, recipes in
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("From \(from)")
                        ListGroup {
                            ForEach(recipes) { recipe in
                                NavigationLink {
                                    RecipeDetailView(recipe: recipe, session: store.session)
                                } label: {
                                    ListRow(recipe.name, subtitle: subtitle(recipe)) {
                                        RecipePicture(recipe: recipe, radius: 12).frame(width: 48, height: 48)
                                    } trailing: {
                                        if SharedNews.isNew(recipe, seenAt: seenAt) { Pill("New", tone: .accent) }
                                    }
                                }
                                .buttonStyle(PressFade())
                            }
                        }
                    }
                }
                if !byHousehold.isEmpty {
                    Text("Open one and choose Move into my recipes to keep it in a drawer of yours.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("Shared with you")
        .textBackButton("Recipes")
        .refreshable { await store.load() }
        .task(id: store.loaded) {
            guard !marked else { return }
            seenAt = SharedNews.seenAt(store.household)
            if store.loaded {
                marked = true
                SharedNews.markSeen(store.household)
            }
        }
    }

    /// Where it lives over there and when it came: "Dinner · shared 2 days ago".
    private func subtitle(_ recipe: Recipe) -> String? {
        let parts = [recipe.ownerSection?.title, timeAgo(recipe.sharedAt).map { "shared \($0)" }].compactMap { $0 }
        return parts.isEmpty ? recipe.totalTime : parts.joined(separator: " · ")
    }
}

/**
 Which shared recipes are new to you: shared since this phone last opened Shared with you. Kept
 on the phone rather than the server, the same as the web — it is only a nudge. Before the list
 has ever been opened here, anything shared in the last week counts.
*/
enum SharedNews {
    private static func key(_ household: UUID) -> String { "mp_sharedSeenAt_\(household.uuidString.lowercased())" }

    static func seenAt(_ household: UUID?) -> Date? {
        guard let household else { return nil }
        let stored = UserDefaults.standard.double(forKey: key(household))
        return stored > 0 ? Date(timeIntervalSince1970: stored) : nil
    }

    static func markSeen(_ household: UUID?) {
        guard let household else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: key(household))
    }

    static func isNew(_ recipe: Recipe, seenAt: Date?) -> Bool {
        guard let iso = recipe.sharedAt, let at = ISO8601DateFormatter.flexible(iso) else { return false }
        if let seenAt { return at > seenAt }
        return Date().timeIntervalSince(at) < 7 * 86_400
    }
}

#Preview("Split") {
    let store = CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
    return Color.clear.sheet(isPresented: .constant(true)) {
        SplitSheet(store: store, group: SampleData.recipeCategories[0], total: 41,
                   suggestions: [("Chicken", [SampleData.recipes[0].id]), ("Beef", [SampleData.recipes[1].id])],
                   examples: SampleData.recipes)
    }
}

#Preview("Shared with you") {
    NavigationStack {
        SharedWithYouView(store: CatalogueStore(session: nil, sample: SampleData.recipes.map {
            Recipe(id: $0.id, name: $0.name, description: nil, instructions: nil, prepTimeMinutes: $0.prepTimeMinutes,
                   cookTimeMinutes: $0.cookTimeMinutes, servings: $0.servings, section: nil, categories: [], shared: true,
                   ownerName: "Beach crew", coverImageId: nil, photoIds: nil, ingredients: [])
        }))
    }
}
