import SwiftUI

/// Where the catalogue can push: a drawer (with one of its tags already chosen, or none), Saved
/// links (with a search already in it), or what other households shared.
enum CatalogueRoute: Hashable {
    case drawer(RecipeSection, tag: UUID?)
    case savedLinks(query: String)
    case shared
}

/**
 The front of the catalogue (the mockup's 3.1), and the app's home tab: six drawers with their
 counts, then Saved links and Shared with you — under a "Set up your kitchen" card while nobody in
 the house has answered the kitchen questions. Searching skips straight to results (3.2) — the recipes with where each is
 filed, and any saved links that match gathered into one row — because when you already know
 what you want, browsing is in the way. The same drawers and tags as the web.
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
    /// Houses whose "Set up your kitchen" card was put away while this screen was up.
    @State private var kitchenCardClosed: Set<UUID> = []
    @Environment(\.scenePhase) private var scenePhase
    /// The app went to the background since Recipes last looked.
    @State private var wasAway = false
    /// When coming back last fetched everything, so flicking in and out does not fetch each time.
    @State private var lastWakeLoad = Date.distantPast

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

    /// A house nobody has answered the kitchen questions for, whose card nobody here put away —
    /// and whose questions are not already on their way.
    private var kitchenCardFor: UUID? {
        guard !store.isSample, let house = session.household, house.kitchenSetUp == false,
              session.kitchenSetupFor != house.id, !kitchenCardClosed.contains(house.id),
              !KitchenSetupCard.isClosed(for: house.id) else { return nil }
        return house.id
    }

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
            // A recipe deleted from its own page, however deep in a drawer that was, or one saved
            // from the share sheet. One that says which recipe it was (Organise on its page, a
            // shared one saved into this house) is just put right, not fetched again; otherwise
            // everything is, Saved links too (a link kept from the share sheet).
            .onReceive(NotificationCenter.default.publisher(for: .recipesChanged)) { note in
                if let recipe = note.object as? Recipe {
                    store.saved(recipe)
                } else {
                    Task {
                        await store.load()
                        await store.loadSavedLinks()
                    }
                }
            }
            // Back from the background — a recipe may have been saved on the web, another phone or
            // the share sheet meanwhile: everything again, at most every 30 seconds.
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .background:
                    wasAway = true
                case .active where wasAway:
                    wasAway = false
                    guard !store.isSample, Date.now.timeIntervalSince(lastWakeLoad) >= 30 else { return }
                    lastWakeLoad = .now
                    Task {
                        await store.load()
                        await store.loadSavedLinks()
                    }
                default:
                    break
                }
            }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
            // Household › Recipe icons lives in that sheet, over this tab, so closing it is when a
            // drawer's new picture has to show — not on the next pull to refresh.
            .onChange(of: showingAccount) { _, open in
                if !open { Task { await store.loadIcons() } }
            }
            .navigationDestination(for: CatalogueRoute.self) { route in
                switch route {
                case .drawer(let section, let tag):
                    DrawerView(store: store, section: section, tag: tag)
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
                NewRecipeView(session: session) { saved in store.saved(saved) }
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
            // Never in the way: the questions only come up when Start is pressed.
            if let house = kitchenCardFor {
                KitchenSetupCard {
                    session.askKitchenSetup(for: house)
                } onClose: {
                    KitchenSetupCard.close(for: house)
                    kitchenCardClosed.insert(house)
                }
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(RecipeSection.allCases, id: \.self) { section in
                    NavigationLink(value: CatalogueRoute.drawer(section, tag: nil)) {
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
                            let seenAt = SharedNews.seenAt(store.household)
                            let fresh = shared.filter { SharedNews.isNew($0, seenAt: seenAt) }.count
                            ListRow("Shared with you", subtitle: fromWhom(shared), detail: "\(shared.count)",
                                    chevron: true, tile: ("person.2", .sky)) {
                                if fresh > 0 { Pill("\(fresh) new", tone: .accent) }
                            }
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
                            RecipeResultRow(recipe: recipe, subtitle: store.filingLine(recipe))
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
     For screenshot runs: `-mp_debug_drawer dinner` opens that drawer, with `-mp_debug_tag Chicken`
     chosen (DrawerView.debugOpen has the rest). `-mp_debug_screen savedlinks|shared` opens those,
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
        // A form started from the drawer gets the tag ticked instead of the drawer filtered by it.
        let tag = defaults.string(forKey: "mp_debug_screen") == "add" ? nil
            : defaults.string(forKey: "mp_debug_tag").flatMap { store.tag(named: $0, in: section)?.id }
        path = [.drawer(section, tag: tag)]
    }
    #endif
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

#Preview("Recipes — dark") {
    RecipesView(session: .preview, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
        .preferredColorScheme(.dark)
}
