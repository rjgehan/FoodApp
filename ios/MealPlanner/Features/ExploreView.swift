import SwiftUI

/**
 The front door of Explore: pick what you want to look into.

 The other four tabs each hold one thing this household owns — its plan, its recipes, its list,
 its cupboard. Explore is the opposite: everything here is bigger than the house, and there is
 more than one kind of it. So the tab opens on a choice rather than a list, and a new kind can
 arrive later without anything having to move.

 Two of the three are not built yet and say so. No mocked-up charts: a screen that looks
 finished and does nothing cannot be told apart from a broken one.

 The same three doors as the web, in the same order and the same colours.
*/
struct ExploreView: View {
    var session: Session

    @State private var switchingHousehold = false
    @State private var showingAccount = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(Destination.all) { destination in
                        NavigationLink(value: destination) {
                            DestinationTile(destination: destination)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Explore")
            .navigationDestination(for: Destination.self) { destination in
                switch destination.kind {
                case .globalRecipes: PublishedRecipesScreen(session: session)
                case .nutrition, .mealPlans: NotBuiltYetView(destination: destination)
                }
            }
            .householdHeader(session, switching: $switchingHousehold, account: $showingAccount)
        }
    }
}

// MARK: - The doors

struct Destination: Identifiable, Hashable {
    enum Kind: Hashable { case globalRecipes, nutrition, mealPlans }

    let kind: Kind
    let title: String
    let blurb: String
    let symbol: String
    let tint: Color
    /// What it will do, for the ones that do not do it yet. Nil means it is built.
    let plan: String?

    var id: Kind { kind }
    var ready: Bool { plan == nil }

    static let all: [Destination] = [
        Destination(
            kind: .globalRecipes,
            title: "Global recipes",
            blurb: "What every other household on this server has published.",
            symbol: "globe",
            tint: Palette.cover(index: 0),
            plan: nil
        ),
        Destination(
            kind: .nutrition,
            title: "Nutrition facts",
            blurb: "What is actually in the food you cook and keep.",
            symbol: "leaf",
            tint: Palette.cover(index: 2),
            plan: """
            Look up any ingredient or scanned product and see what is in it — calories, \
            protein, and the vitamins and minerals a label does not bother printing.
            """
        ),
        Destination(
            kind: .mealPlans,
            title: "Custom meal plans",
            blurb: "A week built around what you are short of.",
            symbol: "target",
            tint: Palette.cover(index: 4),
            plan: """
            Say what you want more of — iron, fibre, whatever a doctor mentioned — and get a \
            week of real meals from recipes this house already cooks that adds up to it.
            """
        ),
    ]
}

private struct DestinationTile: View {
    let destination: Destination

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: destination.symbol)
                .font(.title2)
                .foregroundStyle(.primary.opacity(0.55))
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(destination.title).font(.title3.weight(.semibold))
                Text(destination.blurb)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
                if !destination.ready {
                    Text("Being built")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.primary.opacity(0.6))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.primary.opacity(0.1), in: Capsule())
                        .padding(.top, 4)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(destination.tint, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }
}

/// Behind a door that is not open yet: what the thing will do, and nothing else.
struct NotBuiltYetView: View {
    let destination: Destination

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: destination.symbol)
                        .font(.largeTitle)
                        .foregroundStyle(.primary.opacity(0.55))
                    Text(destination.plan ?? "")
                        .font(.callout)
                        .foregroundStyle(.primary.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(destination.tint, in: RoundedRectangle(cornerRadius: 16))

                Text("Not built yet. This is where it will go.")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(destination.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/**
 Recipes every other household here has published.

 It loads its own list rather than borrowing the Recipes tab's, because it is a tab away from
 that one now and arriving here should not depend on having opened Recipes first.
*/
struct PublishedRecipesScreen: View {
    var session: Session

    @State private var recipes: [Recipe] = []
    @State private var loaded = false

    var body: some View {
        Group {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
            } else {
                PublishedRecipeGrid(recipes: recipes, session: session)
            }
        }
        .navigationTitle("Global recipes")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let household = session.household?.id else { loaded = true; return }
        recipes = (try? await APIClient.shared.explore(household: household)) ?? []
        loaded = true
    }
}
