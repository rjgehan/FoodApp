import SwiftUI

/// The catalog, the way the web files it: six drawers, then the groups inside a drawer, then the
/// recipes. A flat grid of everything is fine with twelve recipes and useless with two hundred —
/// and it throws away the filing the household already did.
struct RecipesView: View {
    var session: Session
    var sample: [Recipe]?
    var sampleCategories: [RecipeCategory]?

    @State private var recipes: [Recipe] = []
    @State private var categories: [RecipeCategory] = []
    /// The drawers somebody picked an icon for; the rest wear `RecipeSection.defaultIcon`.
    @State private var sectionIcons: [RecipeSection: String] = [:]
    @State private var query = ""
    @State private var error: String?
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var writingOne = false
    #if DEBUG
    /// `-mp_debug_drawer dinner` opens that drawer on launch, for screenshot runs.
    @State private var debugDrawer: RecipeSection? = UserDefaults.standard.string(forKey: "mp_debug_drawer")
        .flatMap { RecipeSection(rawValue: $0.uppercased()) }
    #endif

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    private var matches: [Recipe] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return recipes.filter {
            $0.name.lowercased().contains(q)
                || ($0.description ?? "").lowercased().contains(q)
                || $0.ingredients.contains { $0.ingredientName.lowercased().contains(q) }
        }
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let error {
                    Text(error).foregroundStyle(.red).font(.callout).padding(.horizontal, 16)
                }

                if searching {
                    RecipeGrid(recipes: matches, session: session)
                        .padding(16)
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(RecipeSection.allCases, id: \.self) { section in
                            let count = recipes.filter { $0.section == section }.count
                            NavigationLink {
                                DrawerView(
                                    section: section,
                                    parent: nil,
                                    recipes: recipes,
                                    categories: categories,
                                    session: session,
                                    onChanged: { await load() }
                                )
                            } label: {
                                // A colour per drawer, the way the web has it: you learn where
                                // Dinner is by its colour and its picture long before the word.
                                CatalogTile(
                                    name: section.title,
                                    detail: "\(count) \(count == 1 ? "recipe" : "recipes")",
                                    tint: section.tint,
                                    iconKey: sectionIcons[section] ?? section.defaultIcon
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }
            .navigationTitle("Recipes")
            .searchable(text: $query, prompt: "Search recipes and ingredients")
            .refreshable { await load() }
            .householdHeader(session, switching: $switchingHousehold, account: $showingAccount)
            // Household › Recipe icons lives in that sheet, over this tab, so closing it is when a
            // drawer's new picture has to show — not on the next pull to refresh.
            .onChange(of: showingAccount) { _, open in
                if !open { Task { await loadIcons() } }
            }
            // Until now a recipe could only arrive on the phone by being pasted or shared
            // in. Some of them are just written down.
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Write one down", systemImage: "plus") { writingOne = true }
                }
            }
            .sheet(isPresented: $writingOne) {
                EditRecipeView(recipe: nil, session: session) { saved in
                    recipes.insert(saved, at: 0)
                }
            }
            #if DEBUG
            .navigationDestination(item: $debugDrawer) { section in
                DrawerView(section: section, parent: nil, recipes: recipes, categories: categories, session: session,
                           onChanged: { await load() })
            }
            #endif
        }
        .task { await load() }
    }

    private func load() async {
        if let sample {
            recipes = sample
            categories = sampleCategories ?? []
            return
        }
        guard let household = session.household?.id else { return }
        do {
            error = nil
            async let all = APIClient.shared.recipes(household: household)
            async let groups = APIClient.shared.recipeCategories(household: household)
            // A drawer with no choice on record just wears its default, so a failure here is
            // not worth an error over the whole catalog.
            async let icons = try? APIClient.shared.sectionIcons(household: household)
            (recipes, categories) = try await (all, groups)
            sectionIcons = await icons ?? [:]
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadIcons() async {
        guard sample == nil, let household = session.household?.id,
              let icons = try? await APIClient.shared.sectionIcons(household: household) else { return }
        sectionIcons = icons
    }
}

/// One level of a drawer: the groups directly inside it, then the recipes filed at this level.
struct DrawerView: View {
    let section: RecipeSection
    /// Nil at the top of the drawer; a group when you have stepped into one.
    let parent: RecipeCategory?
    let recipes: [Recipe]
    let categories: [RecipeCategory]
    var session: Session?
    /// Reload the catalog after the groups change under it.
    var onChanged: () async -> Void = {}

    @State private var editingGroups = false
    @State private var addingRecipe = false

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    /// Groups belonging to this drawer (or to every drawer) that sit directly inside `parent`.
    private var children: [RecipeCategory] {
        categories
            .filter { $0.section == section || $0.section == nil }
            .filter { $0.parentId == parent?.id }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Recipes in this drawer, filed here rather than in one of the groups below.
    private var here: [Recipe] {
        let childNames = Set(descendants().map(\.name))
        return recipes.filter { recipe in
            guard recipe.section == section else { return false }
            if let parent { return recipe.categories.contains(parent.name) && !recipe.categories.contains(where: { childNames.contains($0) }) }
            return !recipe.categories.contains { childNames.contains($0) }
        }
    }

    /// Every group under a given one, so a recipe filed deeper does not also show up here.
    private func descendants(of node: RecipeCategory? = nil) -> [RecipeCategory] {
        let start = node ?? parent
        let kids = categories.filter { $0.parentId == start?.id }
        return kids + kids.flatMap { descendants(of: $0) }
    }

    /// No group to start in, outside a debug screenshot run.
    private var debugGroups: [String] {
        #if DEBUG
        UserDefaults.standard.string(forKey: "mp_debug_group").map { [$0] } ?? []
        #else
        []
        #endif
    }

    /// What is inside, in the order you care: the recipes, then whether it opens further.
    private func detail(_ group: RecipeCategory) -> String {
        let recipes = count(group)
        let groups = categories.filter { $0.parentId == group.id }.count
        return "\(recipes) \(recipes == 1 ? "recipe" : "recipes")"
            + (groups > 0 ? " · \(groups) \(groups == 1 ? "group" : "groups")" : "")
    }

    private func count(_ group: RecipeCategory) -> Int {
        let names = Set([group.name] + descendants(of: group).map(\.name))
        return recipes.filter { $0.section == section && !$0.categories.filter { names.contains($0) }.isEmpty }.count
    }

    var body: some View {
        ScrollView {
            if !children.isEmpty {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(children) { group in
                        NavigationLink {
                            DrawerView(section: section, parent: group, recipes: recipes, categories: categories,
                                       session: session, onChanged: onChanged)
                        } label: {
                            CatalogTile(
                                name: group.name,
                                detail: detail(group),
                                tint: Palette.cover(for: group.id.uuidString),
                                iconKey: group.iconKey
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }

            if !here.isEmpty {
                RecipeGrid(recipes: here, session: session).padding(.horizontal, 16)
            }

            if children.isEmpty && here.isEmpty {
                ContentUnavailableView {
                    Label("Nothing in here yet", systemImage: "tray")
                } description: {
                    Text("Recipes filed under \(parent?.name ?? section.title) will show up here.")
                } actions: {
                    Button("Add a recipe") { addingRecipe = true }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.top, 48)
            }
        }
        .navigationTitle(parent?.name ?? section.title)
        .navigationBarTitleDisplayMode(.large)
        // At every level, for the groups on this screen: inside Main is where Chicken and Beef
        // are drawn, so it is where you give them a picture or add another next to them.
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit groups", systemImage: "folder.badge.gearshape") { editingGroups = true }
            }
            // At every level: a recipe started in here starts filed in here.
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add a recipe here", systemImage: "plus") { addingRecipe = true }
            }
        }
        .sheet(isPresented: $editingGroups) {
            EditGroupsView(section: section, parent: parent, groups: children, session: session, onChanged: onChanged)
        }
        .sheet(isPresented: $addingRecipe) {
            // The drawer picked and the group ticked, both still changeable in the form.
            EditRecipeView(
                recipe: nil,
                session: session,
                initialSection: section,
                initialGroups: parent.map { [$0.name] } ?? debugGroups
            ) { _ in
                Task { await onChanged() }
            }
        }
        #if DEBUG
        // -mp_debug_screen add (with -mp_debug_drawer) opens the new-recipe form from the
        // drawer — as if from inside the group named by -mp_debug_group, when there is one —
        // and "groups" its group editor, for screenshot runs.
        .task {
            guard parent == nil else { return }
            switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
            case "add": addingRecipe = true
            case "groups": editingGroups = true
            default: break
            }
        }
        #endif
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
                RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemGroupedBackground))
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

extension RecipeSection {
    /// The drawer colours. The web tints its tiles by their position in this same list, so
    /// hashing the position here is what makes Breakfast the same colour in both apps.
    var tint: Color {
        Palette.cover(for: String(Self.allCases.firstIndex(of: self) ?? 0))
    }
}

#Preview("Recipes") {
    RecipesView(session: .preview, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
}
