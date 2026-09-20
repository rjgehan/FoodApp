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
    @State private var explore: [Recipe] = []
    @State private var query = ""
    @State private var error: String?
    @State private var switchingHousehold = false
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
                            NavigationLink {
                                DrawerView(
                                    section: section,
                                    parent: nil,
                                    recipes: recipes,
                                    categories: categories,
                                    session: session
                                )
                            } label: {
                                DrawerTile(
                                    title: section.title,
                                    symbol: section.symbol,
                                    tint: section.tint,
                                    count: recipes.filter { $0.section == section }.count
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    // Everything every household here has published — the one place recipes
                    // travel between houses without anyone sending a link.
                    NavigationLink {
                        ExploreView(recipes: explore, session: session)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Explore").font(.headline)
                            Text("\(explore.count) published here")
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text("What every household on this server has published")
                                .font(.footnote).foregroundStyle(.tertiary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .padding(16)
                }
            }
            .navigationTitle("Recipes")
            .searchable(text: $query, prompt: "Search recipes and ingredients")
            .refreshable { await load() }
            .householdHeader(session, switching: $switchingHousehold)
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
                DrawerView(section: section, parent: nil, recipes: recipes, categories: categories, session: session)
            }
            #endif
        }
        .task { await load() }
    }

    private func load() async {
        if let sample {
            recipes = sample
            categories = sampleCategories ?? []
            explore = []
            return
        }
        guard let household = session.household?.id else { return }
        do {
            error = nil
            async let all = APIClient.shared.recipes(household: household)
            async let groups = APIClient.shared.recipeCategories(household: household)
            async let published = APIClient.shared.explore(household: household)
            (recipes, categories, explore) = try await (all, groups, published)
        } catch {
            self.error = error.localizedDescription
        }
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
                            DrawerView(section: section, parent: group, recipes: recipes, categories: categories, session: session)
                        } label: {
                            GroupTile(
                                name: group.name,
                                tint: Palette.cover(for: group.id.uuidString),
                                recipes: count(group),
                                groups: categories.filter { $0.parentId == group.id }.count
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
                ContentUnavailableView(
                    "Nothing in here yet",
                    systemImage: "tray",
                    description: Text("Recipes filed under \(parent?.name ?? section.title) will show up here.")
                )
                .padding(.top, 48)
            }
        }
        .navigationTitle(parent?.name ?? section.title)
        .navigationBarTitleDisplayMode(.large)
    }
}

struct ExploreView: View {
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
        .navigationTitle("Explore")
    }
}

// MARK: - Pieces

struct DrawerTile: View {
    let title: String
    let symbol: String
    let tint: Color
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Image(systemName: symbol).font(.title3).foregroundStyle(.secondary)
            Spacer(minLength: 10)
            Text(title).font(.title3.weight(.semibold))
            Text("\(count) \(count == 1 ? "recipe" : "recipes")")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
        .padding(14)
        // A colour per drawer, the way the web has it: you learn where Dinner is by its colour
        // long before you read the word.
        .background(tint, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct GroupTile: View {
    let name: String
    let tint: Color
    let recipes: Int
    let groups: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Spacer(minLength: 8)
            Text(name).font(.title3.weight(.semibold))
            Text("\(recipes) \(recipes == 1 ? "recipe" : "recipes")" + (groups > 0 ? " · \(groups) \(groups == 1 ? "group" : "groups")" : ""))
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
        .padding(14)
        .background(tint, in: RoundedRectangle(cornerRadius: 16))
    }
}

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

    /// The drawer icons, as close to the web's as SF Symbols get.
    var symbol: String {
        switch self {
        case .breakfast: "sun.horizon"
        case .lunch: "takeoutbag.and.cup.and.straw"
        case .dinner: "fork.knife"
        case .snacks: "carrot"
        case .drinks: "cup.and.saucer"
        case .other: "square.grid.2x2"
        }
    }
}

#Preview("Recipes") {
    RecipesView(session: .preview, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
}
