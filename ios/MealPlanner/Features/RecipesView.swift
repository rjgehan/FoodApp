import SwiftUI

/// Where the catalogue can push: a level of a drawer, Saved links (with a search already in it),
/// or what other households shared.
enum CatalogueRoute: Hashable {
    case drawer(RecipeSection, group: UUID?)
    case savedLinks(query: String)
    case shared
}

/**
 The front of the catalogue (the mockup's 3.1): six drawers with their counts, then Saved links
 and Shared with you. Searching skips straight to results (3.2) — the recipes with where each is
 filed, and any saved links that match gathered into one row — because when you already know
 what you want, browsing is in the way. The same drawers and groups as the web.
*/
struct RecipesView: View {
    var session: Session
    @State private var store: CatalogueStore
    @State private var path: [CatalogueRoute] = []
    @State private var query = ""
    @FocusState private var searchFocused: Bool
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    @State private var addingOne = false

    init(session: Session, sample: [Recipe]? = nil, sampleCategories: [RecipeCategory]? = nil) {
        self.session = session
        _store = State(initialValue: CatalogueStore(session: session, sample: sample, sampleCategories: sampleCategories))
    }

    private var q: String { query.trimmingCharacters(in: .whitespaces).lowercased() }
    private var searching: Bool { searchFocused || !q.isEmpty }

    private var matches: [Recipe] {
        store.recipes.filter {
            $0.name.lowercased().contains(q)
                || ($0.description ?? "").lowercased().contains(q)
                || $0.categories.contains { $0.lowercased().contains(q) }
                || $0.ingredients.contains { $0.ingredientName.lowercased().contains(q) }
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var linkMatches: [SavedLink] {
        (store.savedLinks ?? []).filter { $0.name.lowercased().contains(q) }
    }

    private var shared: [Recipe] { store.recipes.filter { $0.section == nil } }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Searching takes the top of the screen, the way iOS search does.
                    if !searching {
                        TopBar(session: session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
                        LargeTitle("Recipes") {
                            Button { addingOne = true } label: {
                                Image(systemName: "plus").font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(Palette.onAccent)
                                    .frame(width: 36, height: 36)
                                    .background(Palette.accent, in: Circle())
                            }
                            .buttonStyle(PressFade())
                            .accessibilityLabel("New recipe")
                        }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        searchRow
                        if let error = store.error {
                            Text(error).font(.footnote).foregroundStyle(Palette.danger)
                        }
                        if !q.isEmpty {
                            results
                        } else {
                            catalogue
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, searching ? 6 : 0)
                    .padding(.bottom, 24)
                }
                .animation(.snappy(duration: 0.25), value: searching)
            }
            .scrollDismissesKeyboard(.immediately)
            .pageBackground()
            .hidesNavigationBar()
            .refreshable {
                await store.load()
                await store.loadSavedLinks()
            }
            // A recipe deleted from its own page, however deep in a drawer that was.
            .onReceive(NotificationCenter.default.publisher(for: .recipesChanged)) { _ in
                Task { await store.load() }
            }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
            // Household › Recipe icons lives in that sheet, over this tab, so closing it is when a
            // drawer's new picture has to show — not on the next pull to refresh.
            .onChange(of: showingAccount) { _, open in
                if !open { Task { await store.loadIcons() } }
            }
            .navigationDestination(for: CatalogueRoute.self) { route in
                switch route {
                case .drawer(let section, let group):
                    DrawerView(store: store, section: section, parentId: group)
                case .savedLinks(let query):
                    SavedLinksView(session: session, sample: store.isSample ? SampleData.savedLinks : nil,
                                   initialQuery: query) {
                        await store.loadSavedLinks()
                    }
                case .shared:
                    SharedWithYouView(store: store)
                }
            }
            .sheet(isPresented: $addingOne) {
                // The web's three ways in: type it out, from a link, or paste one.
                NewRecipeView(session: session) { _ in Task { await store.load() } }
            }
        }
        .task {
            await store.load()
            await store.loadSavedLinks()
            #if DEBUG
            debugOpen()
            #endif
        }
    }

    private var searchRow: some View {
        HStack(spacing: 10) {
            SearchBox(text: $query, prompt: "Search recipes and saved links")
                .focused($searchFocused)
            if searching {
                Button("Cancel") {
                    query = ""
                    searchFocused = false
                }
                .font(.system(size: 17))
                .foregroundStyle(Palette.accentInk)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
    }

    // MARK: - Drawers

    private var catalogue: some View {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(RecipeSection.allCases, id: \.self) { section in
                    NavigationLink(value: CatalogueRoute.drawer(section, group: nil)) {
                        DrawerCard(section: section,
                                   count: store.recipes.filter { $0.section == section }.count,
                                   iconKey: store.sectionIcons[section] ?? section.defaultIcon)
                    }
                    .buttonStyle(PressFade())
                }
            }

            // Not drawers of yours: what you mean to cook that is not a recipe yet, and what
            // other households sent over. Rows rather than cards, so they never pass for a drawer.
            if store.savedLinks != nil || !shared.isEmpty {
                ListGroup {
                    if let links = store.savedLinks {
                        NavigationLink(value: CatalogueRoute.savedLinks(query: "")) {
                            ListRow("Saved links", subtitle: "Recipes to try later", detail: "\(links.count)",
                                    chevron: true, tile: ("link", .plum))
                        }
                        .buttonStyle(PressFade())
                    }
                    if !shared.isEmpty {
                        NavigationLink(value: CatalogueRoute.shared) {
                            ListRow("Shared with you", subtitle: fromWhom(shared), detail: "\(shared.count)",
                                    chevron: true, tile: ("person.2", .sky))
                        }
                        .buttonStyle(PressFade())
                    }
                }
            }

            if store.loaded && store.recipes.isEmpty {
                Text("No recipes yet. Tap + to add your first.")
                    .font(.system(size: 15)).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
            }
        }
    }

    // MARK: - Search

    @ViewBuilder
    private var results: some View {
        let recipes = matches
        let links = linkMatches
        if recipes.isEmpty && links.isEmpty {
            Text("Nothing matches that.").font(.system(size: 15)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        }
        if !recipes.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel("Recipes · \(recipes.count)")
                ListGroup {
                    ForEach(recipes) { recipe in
                        NavigationLink {
                            RecipeDetailView(recipe: recipe, session: session)
                        } label: {
                            RecipeResultRow(recipe: recipe, subtitle: store.trail(recipe))
                        }
                        .buttonStyle(PressFade())
                    }
                }
            }
        }
        if !links.isEmpty {
            ListGroup {
                NavigationLink(value: CatalogueRoute.savedLinks(query: query.trimmingCharacters(in: .whitespaces))) {
                    ListRow("\(links.count) saved \(links.count == 1 ? "link matches" : "links match") \"\(query.trimmingCharacters(in: .whitespaces))\"",
                            subtitle: countBySource(links), chevron: true) {
                        Tile("link", tone: .plum, size: 44, radius: 12)
                    } trailing: {
                        EmptyView()
                    }
                }
                .buttonStyle(PressFade())
            }
        }
    }

    /// "TikTok · 2, BBC Good Food · 1" — where the matching links are from, most first.
    private func countBySource(_ links: [SavedLink]) -> String {
        var counts: [String: Int] = [:]
        var order: [String] = []
        for link in links {
            if counts[link.sourceLabel] == nil { order.append(link.sourceLabel) }
            counts[link.sourceLabel, default: 0] += 1
        }
        return order.sorted { counts[$0]! > counts[$1]! }.map { "\($0) · \(counts[$0]!)" }.joined(separator: ", ")
    }

    /// "From Beach crew and 1 other" — the households that shared them.
    private func fromWhom(_ recipes: [Recipe]) -> String {
        var names: [String] = []
        for name in recipes.compactMap(\.ownerName) where !names.contains(name) { names.append(name) }
        guard let first = names.first else { return "From other households" }
        if names.count == 1 { return "From \(first)" }
        return "From \(first) and \(names.count - 1) \(names.count == 2 ? "other" : "others")"
    }

    #if DEBUG
    /**
     For screenshot runs: `-mp_debug_drawer dinner` opens that drawer, and `-mp_debug_group Main`
     (a name, or "Main/Beef") a group in it. `-mp_debug_screen savedlinks|shared` opens those,
     `new` the new-recipe form, and `-mp_debug_query pasta` searches.
    */
    private func debugOpen() {
        let defaults = UserDefaults.standard
        if let q = defaults.string(forKey: "mp_debug_query") { query = q }
        switch defaults.string(forKey: "mp_debug_screen") {
        case "new": addingOne = true
        case "savedlinks", "linkactions": path = [.savedLinks(query: "")]
        case "shared": path = [.shared]
        default: break
        }
        guard let section = defaults.string(forKey: "mp_debug_drawer").flatMap({ RecipeSection(rawValue: $0.uppercased()) })
        else { return }
        var routes: [CatalogueRoute] = [.drawer(section, group: nil)]
        var parent: UUID?
        for name in (defaults.string(forKey: "mp_debug_group") ?? "").split(separator: "/") where defaults.string(forKey: "mp_debug_screen") != "add" {
            guard let group = store.children(of: parent, in: section).first(where: { $0.name == String(name) }) else { break }
            routes.append(.drawer(section, group: group.id))
            parent = group.id
        }
        path = routes
    }
    #endif
}

/**
 One level of a drawer (the mockup's 3.3 and 3.4). A drawer or a group shows the groups directly
 inside it as cards; once there is nothing smaller to open, its recipes as photo cards. Recipes at
 a level that are in none of the groups below get a card of one-tap suggestions for where they go,
 likely group first. Back goes up a level.
*/
struct DrawerView: View {
    var store: CatalogueStore
    let section: RecipeSection
    /// Nil at the top of the drawer; a group when you have stepped into one.
    let parentId: UUID?

    @State private var query = ""
    @State private var editingGroups: UUID??
    @State private var addingGroup = false
    @State private var addingRecipe = false
    @State private var splitting = false

    /// Sample data only, for the Gallery: the drawer on its own.
    init(section: RecipeSection, parent: RecipeCategory?, recipes: [Recipe], categories: [RecipeCategory]) {
        store = CatalogueStore(session: nil, sample: recipes, sampleCategories: categories)
        self.section = section
        parentId = parent?.id
    }

    init(store: CatalogueStore, section: RecipeSection, parentId: UUID?) {
        self.store = store
        self.section = section
        self.parentId = parentId
    }

    private var parent: RecipeCategory? { parentId.flatMap { id in store.categories.first { $0.id == id } } }
    private var place: String { parent?.name ?? section.title }

    private var inSection: [Recipe] {
        store.recipes.filter { $0.section == section }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var here: [Recipe] {
        guard let parent else { return inSection }
        return inSection.filter { store.isIn($0, parent, in: section) }
    }

    private var children: [RecipeCategory] { store.children(of: parentId, in: section) }

    /// Here, but in none of the groups below: filed on this group itself, or on nothing at all.
    private var loose: [Recipe] {
        let kids = children
        return here.filter { recipe in !kids.contains { store.isIn(recipe, $0, in: section) } }
    }

    private var splits: [(name: String, recipeIds: [UUID])] {
        guard let parent, children.isEmpty, here.count >= 3 else { return [] }
        let taken = Set(store.path(to: parent).map { $0.name.lowercased() })
        return CategoryKinds.suggestSplit(here, skip: taken)
    }

    /// A recipe started in here starts filed in here — or, in a debug run, in -mp_debug_group.
    private var addGroups: [String] {
        if let parent { return [parent.name] }
        #if DEBUG
        return UserDefaults.standard.string(forKey: "mp_debug_group").map { [$0] } ?? []
        #else
        return []
        #endif
    }

    var body: some View {
        let recipesLevel = children.isEmpty
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let parent {
                    Breadcrumbs(steps: [section.title] + store.path(to: parent).map(\.name))
                }
                if !recipesLevel && !here.isEmpty {
                    SearchBox(text: $query, prompt: "Search \(place)")
                }
                if !q.isEmpty {
                    found(q)
                } else if here.isEmpty && recipesLevel {
                    empty
                } else if recipesLevel {
                    RecipePhotoGrid(recipes: here, session: store.session)
                } else {
                    groupsGrid
                    if here.isEmpty {
                        Text("Nothing filed in \(place) yet. Add a recipe, or open a group.")
                            .font(.system(size: 15)).foregroundStyle(Palette.muted)
                    }
                    if !loose.isEmpty {
                        UnfiledCard(store: store, section: section, recipes: loose, groups: children, from: parent)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, parent == nil ? 24 : 96)
        }
        .scrollDismissesKeyboard(.immediately)
        .pageBackground()
        .overlay(alignment: .bottomTrailing) {
            if parent != nil { FloatingAddRecipe { addingRecipe = true } }
        }
        .centeredTitle(place)
        .toolbar { toolbar }
        .refreshable { await store.load() }
        .sheet(item: Binding(get: { editingGroups.map { EditingTarget(selected: $0) } },
                             set: { editingGroups = $0.map(\.selected) })) { target in
            EditGroupsView(store: store, section: section, parent: parent, groups: children, selected: target.selected)
        }
        .sheet(isPresented: $addingGroup) {
            NewGroupSheet(store: store, section: section, parent: parent).kitchenSheet([.medium, .large])
        }
        .sheet(isPresented: $addingRecipe) {
            // All three ways in, each with the drawer picked and the group ticked, both still
            // changeable in the editor.
            NewRecipeView(session: store.session, initialSection: section, initialGroups: addGroups) { _ in
                Task { await store.load() }
            }
        }
        .sheet(isPresented: $splitting, onDismiss: rememberSplit) {
            if let parent {
                SplitSheet(store: store, group: parent, total: here.count, suggestions: splits, examples: here)
                    .kitchenSheet([.large])
            }
        }
        .task(id: store.loaded) { offerSplit() }
        #if DEBUG
        .task {
            switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
            case "add" where parent == nil:
                addingRecipe = true
            case "groups" where !children.isEmpty && isDebugLeaf:
                editingGroups = .some(nil)
            case "newgroup" where isDebugLeaf:
                addingGroup = true
            default: break
            }
        }
        #endif
    }

    #if DEBUG
    /// The level a debug run asked for — the deepest one pushed.
    private var isDebugLeaf: Bool {
        let wanted = UserDefaults.standard.string(forKey: "mp_debug_group")?.split(separator: "/").last.map(String.init)
        return wanted == parent?.name || (wanted == nil && parent == nil)
    }
    #endif

    private struct EditingTarget: Identifiable {
        let selected: UUID?
        var id: String { selected?.uuidString ?? "first" }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if let parent {
            BareToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if !children.isEmpty {
                        Button("Edit groups inside \(parent.name)", systemImage: "pencil") { editingGroups = .some(nil) }
                    }
                    Button("Add a group inside \(parent.name)", systemImage: "plus") { addingGroup = true }
                    if !splits.isEmpty {
                        Button("Split \(parent.name) into groups", systemImage: "sparkles") { splitting = true }
                    }
                    Button("Edit \(parent.name)", systemImage: "folder") { editingParentLevel = true }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.accentInk).frame(width: 36, height: 36)
                }
                .accessibilityLabel("Options for \(parent.name)")
                .sheet(isPresented: $editingParentLevel) {
                    // The group's own name, icon and delete live in its level's Edit groups.
                    EditGroupsView(store: store, section: section,
                                   parent: parent.parentId.flatMap { id in store.categories.first { $0.id == id } },
                                   groups: store.children(of: parent.parentId, in: section), selected: parent.id)
                }
            }
        } else {
            BareToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button { editingGroups = .some(nil) } label: {
                        Image(systemName: "pencil.line").font(.system(size: 19, weight: .medium))
                    }
                    .accessibilityLabel("Edit groups")
                    Button { addingRecipe = true } label: {
                        Image(systemName: "plus").font(.system(size: 20, weight: .medium))
                    }
                    .accessibilityLabel("Add recipe")
                }
                .foregroundStyle(Palette.accentInk)
            }
        }
    }

    @State private var editingParentLevel = false

    private var groupsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(children) { group in
                NavigationLink(value: CatalogueRoute.drawer(section, group: group.id)) {
                    GroupCard(group: group, detail: groupDetail(
                        recipes: here.filter { store.isIn($0, group, in: section) }.count,
                        groups: store.children(of: group.id, in: section).count))
                }
                .buttonStyle(PressFade())
            }
            NewGroupTile { addingGroup = true }
        }
    }

    private var empty: some View {
        VStack(spacing: 14) {
            Text(parent.map { "Nothing from \(section.title) in \($0.name) yet." } ?? "Nothing filed here yet.")
                .font(.system(size: 15)).foregroundStyle(Palette.muted)
            Button { addingRecipe = true } label: { Label("Add a recipe", systemImage: "plus") }
                .buttonStyle(.kitchen(.soft, size: .small))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    @ViewBuilder
    private func found(_ q: String) -> some View {
        let found = here.filter {
            $0.name.lowercased().contains(q)
                || $0.categories.contains { $0.lowercased().contains(q) }
                || $0.ingredients.contains { $0.ingredientName.lowercased().contains(q) }
        }
        if found.isEmpty {
            Text("Nothing in \(place) matches that.").font(.system(size: 15)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel("Recipes · \(found.count)")
                ListGroup {
                    ForEach(found) { recipe in
                        NavigationLink {
                            RecipeDetailView(recipe: recipe, session: store.session)
                        } label: {
                            RecipeResultRow(recipe: recipe, subtitle: store.trail(recipe))
                        }
                        .buttonStyle(PressFade())
                    }
                }
            }
        }
    }

    // MARK: - Split, offered once

    private static let dismissedKey = "mp_dismissedSplits"

    /// Offered by itself the first time a group is opened — when it would really split, into two
    /// groups or more. After that (or for a single group) it is in the •••.
    private func offerSplit() {
        guard store.loaded, let parent, splits.count > 1 else { return }
        let dismissed = UserDefaults.standard.stringArray(forKey: Self.dismissedKey) ?? []
        if !dismissed.contains(parent.id.uuidString) { splitting = true }
    }

    private func rememberSplit() {
        guard let parent else { return }
        var dismissed = UserDefaults.standard.stringArray(forKey: Self.dismissedKey) ?? []
        if !dismissed.contains(parent.id.uuidString) { dismissed.append(parent.id.uuidString) }
        UserDefaults.standard.set(Array(dismissed.suffix(200)), forKey: Self.dismissedKey)
    }
}

/// The published recipes themselves, shown both from inside Recipes and from the Explore tab.
struct PublishedRecipeGrid: View {
    let recipes: [Recipe]
    var session: Session?

    var body: some View {
        ScrollView {
            if recipes.isEmpty {
                ContentUnavailableView(
                    "Nothing published yet",
                    systemImage: "globe",
                    description: Text("Recipes other households here publish will show up in Explore.")
                )
                .padding(.top, 48)
            } else {
                RecipeGrid(recipes: recipes, session: session).padding(16)
            }
        }
    }
}

// MARK: - Pieces

struct RecipeGrid: View {
    let recipes: [Recipe]
    var session: Session?
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 16) {
            ForEach(recipes) { recipe in
                NavigationLink {
                    RecipeDetailView(recipe: recipe, session: session)
                } label: {
                    RecipeTile(recipe: recipe)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct RecipeTile: View {
    let recipe: Recipe

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Palette.surface)
                if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        ProgressView()
                    }
                } else {
                    Image(systemName: "fork.knife").font(.title).foregroundStyle(.tertiary)
                }
            }
            .frame(height: 118)
            .clipShape(RoundedRectangle(cornerRadius: 14))

            Text(recipe.name).font(.subheadline.weight(.medium)).lineLimit(2)
            Text(recipe.facts).font(.caption).foregroundStyle(.secondary)
            if let owner = recipe.ownerName, recipe.shared {
                Text("from \(owner)").font(.caption2).foregroundStyle(.tertiary)
            }
        }
    }
}

#Preview("Recipes") {
    RecipesView(session: .preview, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
}

#Preview("Dinner drawer") {
    NavigationStack {
        DrawerView(section: .dinner, parent: nil, recipes: SampleData.recipes, categories: SampleData.recipeCategories)
    }
}
