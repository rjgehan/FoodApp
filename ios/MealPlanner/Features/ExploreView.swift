import SwiftUI

/**
 The front door of Explore (the mockup's 5.1): three doors.

 The other four tabs each hold one thing this household owns — its plan, its recipes, its list,
 its cupboard. Explore is the opposite: everything here is bigger than the house, and there is
 more than one kind of it. So the tab opens on a choice rather than a list, and a new kind can
 arrive later without anything having to move.

 Global recipes is the open one, so it is first and biggest, with how many there are on it.
 Nutrition facts and Meal plans are not built yet, and their doors say so rather than showing
 numbers that are not real. The same three doors as the web, in the same order and colours.
*/
struct ExploreView: View {
    var session: Session
    /// Published recipes to show without a server — previews and the Gallery.
    var sample: [Recipe]?

    @State private var path = NavigationPath()
    @State private var count: Int?
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    #if DEBUG
    @State private var debugOpened = false
    #endif

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(session: session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
                    LargeTitle("Explore")
                    VStack(spacing: 14) {
                        NavigationLink(value: ExploreRoute.globalRecipes) {
                            GlobalRecipesDoor(count: count)
                        }
                        .buttonStyle(PressFade())
                        ForEach(SoonDestination.all) { destination in
                            NavigationLink(value: ExploreRoute.soon(destination.kind)) {
                                SoonDoor(destination: destination)
                            }
                            .buttonStyle(PressFade())
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
            }
            .pageBackground()
            .hidesNavigationBar()
            // The bar is hidden here, but its title is what the next screen's back button says.
            .navigationTitle("Explore")
            .refreshable { await loadCount() }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
            .navigationDestination(for: ExploreRoute.self) { route in
                switch route {
                case .globalRecipes:
                    GlobalRecipesScreen(session: session, sample: sample)
                case .soon(let kind):
                    if let destination = SoonDestination.all.first(where: { $0.kind == kind }) {
                        SoonScreen(destination: destination)
                    }
                }
            }
        }
        .task {
            await loadCount()
            #if DEBUG
            debugOpen()
            #endif
        }
    }

    private func loadCount() async {
        if let sample { count = sample.count; return }
        guard let household = session.household?.id else { return }
        if let all = try? await APIClient.shared.explore(household: household) { count = all.count }
    }

    #if DEBUG
    /// Screenshot runs: -mp_debug_screen explore-recipes | explore-recipe | explore-move opens Global
    /// recipes (then its first published recipe from another house, then Move into my recipes on
    /// it); explore-nutrition | explore-meal-plans opens that door's page.
    private func debugOpen() {
        guard !debugOpened else { return }
        debugOpened = true
        switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
        case "explore-recipes", "explore-recipe", "explore-move": path.append(ExploreRoute.globalRecipes)
        case "explore-nutrition": path.append(ExploreRoute.soon(.nutrition))
        case "explore-meal-plans": path.append(ExploreRoute.soon(.mealPlans))
        default: break
        }
    }
    #endif
}

/// Where Explore's doors lead.
enum ExploreRoute: Hashable {
    case globalRecipes
    case soon(SoonDestination.Kind)
}

// MARK: - The doors

/**
 Nutrition facts and Meal plans: the mockup's 5.4–5.11, still to be built. Their doors are on
 Explore now, and each opens on a page that says what is coming, so the place the work lands
 already exists. The words come from the designer's notes for those screens, as on the web.
 */
struct SoonDestination: Identifiable, Hashable {
    enum Kind: Hashable { case nutrition, mealPlans }

    let kind: Kind
    let title: String
    let blurb: String
    let symbol: String
    let tone: Tone
    /// The door's one line about what is coming, where the finished one shows a teaser of your data.
    let teaser: String
    /// What it is for, in a sentence, on the page behind the door.
    let plan: String
    /// What it will do, a row each.
    let will: [Promise]

    struct Promise: Hashable {
        let symbol: String
        let title: String
        let detail: String
    }

    var id: Kind { kind }

    static let all: [SoonDestination] = [
        SoonDestination(
            kind: .nutrition,
            title: "Nutrition facts",
            blurb: "Ingredients, scanned products and your recipes",
            symbol: "leaf",
            tone: .herb,
            teaser: "What this week's plan adds up to, day by day.",
            plan: "Look up what is in the food you cook and keep, and see how the week you have planned adds up.",
            will: [
                Promise(symbol: "magnifyingglass", title: "Any ingredient or product",
                        detail: "Search for it, or scan the barcode on the packet."),
                Promise(symbol: "calendar", title: "This week's plan",
                        detail: "Calories, protein and fibre a day, from what is on the Plan."),
                Promise(symbol: "fork.knife", title: "Your recipes",
                        detail: "Per serving, worked out from the ingredients, and where the calories come from."),
            ]
        ),
        SoonDestination(
            kind: .mealPlans,
            title: "Meal plans",
            blurb: "From your cupboard, or built for a goal",
            symbol: "target",
            tone: .plum,
            teaser: "A week cooked from your cupboard, or built around a goal.",
            plan: "A week of meals made for you, from your own recipes first, ready to put on the Plan in one go.",
            will: [
                Promise(symbol: "cabinet", title: "Cook from cupboard",
                        detail: "Meals that use what you already have, and the few things to buy for them."),
                Promise(symbol: "heart", title: "Plans for a health target",
                        detail: "Ready-made or your own, with daily targets worked out for you."),
                Promise(symbol: "calendar", title: "Apply it to your Plan",
                        detail: "Every meal goes on the Plan; swap any you do not fancy first."),
            ]
        ),
    ]
}

/// Global recipes' door: a big green picture with how many there are on it.
struct GlobalRecipesDoor: View {
    let count: Int?

    var body: some View {
        ZStack(alignment: .topLeading) {
            RecipePhotoPlaceholder(hue: .green, systemImage: "globe", radius: 24)
            VStack(alignment: .leading, spacing: 0) {
                if let count {
                    Pill("\(count) \(count == 1 ? "recipe" : "recipes")", tone: .herb, systemImage: "globe")
                }
                Spacer(minLength: 0)
                Text("Global recipes").titleFont(28).foregroundStyle(.white)
                Text("Published by households on this server")
                    .font(.system(size: 14)).foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(18)
        }
        .frame(height: 196)
        .frame(maxWidth: .infinity)
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Global recipes" + (count.map { ", \($0) published" } ?? ""))
    }
}

/// A door that is not open yet: its tile, name and line, and a plain note that it is coming.
struct SoonDoor: View {
    let destination: SoonDestination

    var body: some View {
        Card(padding: 16, spacing: 12) {
            HStack(spacing: 12) {
                Tile(destination.symbol, tone: destination.tone, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(destination.title).titleFont(20).foregroundStyle(Palette.text)
                    Text(destination.blurb).font(.system(size: 13)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            HStack(spacing: 10) {
                Pill("Coming soon", tone: destination.tone, systemImage: "clock")
                Text(destination.teaser).font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityElement(children: .combine)
    }
}

/// Behind a door that is not open yet: what the thing will do, and nothing else — no mocked-up
/// charts, which could not be told apart from broken ones.
struct SoonScreen: View {
    let destination: SoonDestination

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(spacing: 12) {
                    Tile(destination.symbol, tone: destination.tone, size: 64)
                    Pill("Coming soon", tone: destination.tone, systemImage: "clock")
                    Text(destination.title).titleFont(26).foregroundStyle(Palette.text)
                    Text(destination.plan).font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 24)
                .cardSurface()

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("What it will do")
                    ListGroup(dividerInset: 64) {
                        ForEach(destination.will, id: \.self) { promise in
                            ListRow(promise.title, subtitle: promise.detail, wrapSubtitle: true,
                                    leading: { Tile(promise.symbol, tone: destination.tone, size: 36) },
                                    trailing: { EmptyView() })
                        }
                    }
                }

                Text("Not built yet. This is where it will go.")
                    .font(.system(size: 13)).foregroundStyle(Palette.faint)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle(destination.title)
    }
}

#Preview("Explore") {
    ExploreView(session: .preview, sample: SampleData.published)
}

#Preview("Explore — dark") {
    ExploreView(session: .preview, sample: SampleData.published)
        .preferredColorScheme(.dark)
}

#Preview("Coming soon") {
    NavigationStack { SoonScreen(destination: SoonDestination.all[0]) }
}
