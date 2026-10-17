import SwiftUI

/**
 Tag, from select mode: every tag in the drawer, each with a box saying whether all, some or
 none of the picked recipes wear it. A tap goes some → all → none (and back to some, as it was),
 a new tag can be typed at the bottom, and Save sends one request per tag that changed — all at
 once, not one after another.
*/
struct TagRecipesSheet: View {
    var store: CatalogueStore
    let section: RecipeSection
    let recipes: [Recipe]
    var onSaved: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    /// What each tag becomes: true, on all of them; false, on none. A tag left as it was is absent.
    @State private var wanted: [UUID: Bool] = [:]
    @State private var newTags: [String] = []
    @State private var typed = ""
    @FocusState private var typing: Bool
    @State private var busy = false
    @State private var error: String?

    fileprivate enum Mark { case all, partly, off }

    private var tags: [RecipeCategory] { store.tags(in: section) }

    /// The picked recipes as the store has them now, so what a save already did counts.
    private var live: [Recipe] {
        let ids = Set(recipes.map(\.id))
        return store.recipes.filter { ids.contains($0.id) }
    }

    /// How many of the picked recipes wear it now.
    private func wearing(_ tag: RecipeCategory) -> Int { live.filter { store.has($0, tag) }.count }

    private func worn(_ tag: RecipeCategory) -> Mark {
        let n = wearing(tag)
        return n == 0 ? .off : n == recipes.count ? .all : .partly
    }

    private func mark(_ tag: RecipeCategory) -> Mark {
        wanted[tag.id].map { $0 ? Mark.all : Mark.off } ?? worn(tag)
    }

    /// Some → all → none → some; a tag that started on all or on none just flips.
    private func tap(_ tag: RecipeCategory) {
        let was = worn(tag)
        switch mark(tag) {
        case .partly: wanted[tag.id] = true
        case .all: wanted[tag.id] = was == .off ? nil : false
        case .off: wanted[tag.id] = was == .off ? true : nil
        }
    }

    private func subtitle(_ tag: RecipeCategory) -> String? {
        let n = recipes.count
        switch (wanted[tag.id], worn(tag)) {
        case (true?, _): return n == 1 ? "Goes on" : "Goes on all \(n)"
        case (false?, _): return n == 1 ? "Comes off" : "Comes off all \(n)"
        case (nil, .partly): return "On \(wearing(tag)) of \(n)"
        default: return nil
        }
    }

    private var changes: Int { wanted.count + newTags.count }

    var body: some View {
        let n = recipes.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Tag \(n) \(n == 1 ? "recipe" : "recipes")", subtitle: "Tags in \(section.title)",
                            onClose: { dismiss() })
                if tags.isEmpty && newTags.isEmpty {
                    Text("No tags in \(section.title) yet — type one below.")
                        .font(.system(size: 14)).foregroundStyle(Palette.muted)
                } else {
                    ListGroup {
                        ForEach(tags) { tag in
                            Button { tap(tag) } label: {
                                ListRow(tag.name, subtitle: subtitle(tag), leading: {
                                    FoodTile(iconKey: tag.iconKey, tone: tag.tone, size: 34)
                                }) {
                                    TriBox(mark: mark(tag))
                                }
                            }
                            .buttonStyle(PressFade())
                            .accessibilityValue(mark(tag) == .all ? "On all" : mark(tag) == .partly ? "On some" : "Off")
                        }
                        ForEach(newTags, id: \.self) { name in
                            ListRow(name, subtitle: n == 1 ? "New tag, goes on" : "New tag, goes on all \(n)", leading: {
                                FoodTile(iconKey: nil, tone: .herb, size: 34)
                            }) {
                                Button { newTags.removeAll { $0 == name } } label: {
                                    Image(systemName: "xmark").font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Palette.faint).frame(width: 28, height: 28)
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel("Don't make \(name)")
                                TriBox(mark: .all)
                            }
                        }
                    }
                }
                HStack(spacing: 8) {
                    TextField("New tag", text: $typed)
                        .focused($typing)
                        .submitLabel(.done)
                        .onSubmit { addTyped() }
                        .padding(.horizontal, 14)
                        .frame(height: 44)
                        .fieldSurface(focused: typing)
                    Button("Add") { addTyped() }
                        .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                        .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                Button(busy ? "Saving…" : "Save") { Task { await save() } }
                    .buttonStyle(.primary)
                    .disabled(busy || (changes == 0 && typed.trimmingCharacters(in: .whitespaces).isEmpty))
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .kitchenSheet([.medium, .large])
    }

    /// A name the drawer already has ticks that tag rather than making a second one.
    private func addTyped() {
        let name = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        typed = ""
        if let existing = store.tag(named: name, in: section) {
            wanted[existing.id] = worn(existing) == .all ? nil : true
        } else if !newTags.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            newTags.append(name)
        }
    }

    private func save() async {
        addTyped()
        guard changes > 0 else {
            dismiss()
            return
        }
        busy = true
        error = nil
        let ids = Set(recipes.map(\.id))
        let onlyAdding = !wanted.values.contains(false)
        let failures = await store.applyTags(wanted, newTags: newTags, to: ids, in: section)
        busy = false
        if failures.isEmpty {
            let n = ids.count
            onSaved(onlyAdding ? "Tagged \(n) \(n == 1 ? "recipe" : "recipes")"
                               : "Changed the tags on \(n) \(n == 1 ? "recipe" : "recipes")")
            dismiss()
        } else {
            // What worked stays done; only the rest is said, and can be tried again.
            wanted = [:]
            newTags = []
            error = failures.joined(separator: "\n")
        }
    }
}

/// A box for all (ticked), some (a dash) or none (empty): the Tag sheet's three states.
private struct TriBox: View {
    let mark: TagRecipesSheet.Mark

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .strokeBorder(mark == .off ? Palette.faint : Palette.accent, lineWidth: 1.6)
            if mark != .off {
                RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Palette.accent)
                Image(systemName: mark == .all ? "checkmark" : "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Palette.onAccent)
            }
        }
        .frame(width: 22, height: 22)
        .animation(.easeOut(duration: 0.15), value: mark)
        .accessibilityHidden(true)
    }
}

/**
 Move, from select mode: the other drawers, and the button that moves every picked recipe at
 once. Tags belong to a drawer, so a recipe keeps only the ones its new drawer already has —
 never a new, empty copy made there — and the sheet says which come off before anything moves.
*/
struct MoveRecipesSheet: View {
    var store: CatalogueStore
    let section: RecipeSection
    let recipes: [Recipe]
    var onMoved: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var target: RecipeSection?
    @State private var busy = false
    @State private var error: String?

    /// The tag names the move takes off, because the new drawer has no tag by that name.
    private func dropped(in target: RecipeSection) -> [String] {
        var names: [String] = []
        for name in recipes.flatMap(\.categories) where store.tag(named: name, in: target) == nil
            && !names.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            names.append(name)
        }
        return names
    }

    /// A String, so Button is not left to guess what `map`'s closure makes.
    private var moveTitle: String {
        if busy { return "Moving…" }
        guard let target else { return "Pick a drawer" }
        return "Move to \(target.title)"
    }

    var body: some View {
        let n = recipes.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Move \(n) \(n == 1 ? "recipe" : "recipes")", subtitle: "From \(section.title) to…",
                            onClose: { dismiss() })
                ListGroup {
                    ForEach(RecipeSection.allCases.filter { $0 != section }, id: \.self) { drawer in
                        let count = store.recipes.filter { $0.section == drawer }.count
                        Button { target = drawer } label: {
                            ListRow(drawer.title, subtitle: "\(count) \(count == 1 ? "recipe" : "recipes")", leading: {
                                FoodTile(iconKey: store.sectionIcons[drawer] ?? drawer.defaultIcon, tone: drawer.tone, size: 36)
                            }) {
                                CheckCircle(isOn: target == drawer)
                            }
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(target == drawer ? .isSelected : [])
                    }
                }
                if let target {
                    let off = dropped(in: target)
                    if !off.isEmpty {
                        NoteBox("\(ListFormatter.localizedString(byJoining: off)) \(off.count == 1 ? "isn't a tag" : "aren't tags") in \(target.title), so \(off.count == 1 ? "it comes" : "they come") off.",
                                tone: .mustard, systemImage: "tag")
                    }
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                Button(moveTitle) {
                    Task { await move() }
                }
                .buttonStyle(.primary)
                .disabled(busy || target == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .kitchenSheet([.medium, .large])
    }

    private func move() async {
        guard let target else { return }
        busy = true
        error = nil
        let result = await store.move(Set(recipes.map(\.id)), to: target)
        busy = false
        if result.moved == 0 && result.failed > 0 {
            error = "Could not move \(result.failed == 1 ? "it" : "them"). Try again."
            return
        }
        var said = "Moved \(result.moved) to \(target.title)"
        if !result.dropped.isEmpty { said += " · took off \(ListFormatter.localizedString(byJoining: result.dropped))" }
        if result.failed > 0 { said += " · \(result.failed) could not move" }
        onMoved(said)
        dismiss()
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

#Preview("Tag recipes") {
    let store = CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
    return Color.clear.sheet(isPresented: .constant(true)) {
        TagRecipesSheet(store: store, section: .dinner, recipes: Array(SampleData.recipes.prefix(2))) { _ in }
    }
}

#Preview("Move recipes") {
    let store = CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
    return Color.clear.sheet(isPresented: .constant(true)) {
        MoveRecipesSheet(store: store, section: .dinner, recipes: Array(SampleData.recipes.prefix(2))) { _ in }
    }
    .preferredColorScheme(.dark)
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
