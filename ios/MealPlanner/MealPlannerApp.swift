import SwiftUI

@main
struct MealPlannerApp: App {
    @State private var session = Session()
    @State private var restored = false

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
                .task {
                    guard !restored else { return }
                    await session.restore()
                    restored = true
                }
        }
    }
}

/// Signed out: the PIN flow. Signed in: the same tabs as the web, in the same order, so the
/// two do not have to be learned separately.
struct RootView: View {
    @Bindable var session: Session

    var body: some View {
        if session.isSignedIn {
            TabView {
                PlanView(session: session)
                    .tabItem { Label("Plan", systemImage: "calendar") }
                RecipesView(session: session)
                    .tabItem { Label("Recipes", systemImage: "book") }
                GroceriesView(session: session)
                    .tabItem { Label("Groceries", systemImage: "cart") }
                HouseholdView(session: session)
                    .tabItem { Label("Household", systemImage: "person.2") }
                #if DEBUG
                // Ships in debug only: the whole interface, on sample data.
                GalleryView()
                    .tabItem { Label("Gallery", systemImage: "square.grid.2x2") }
                #endif
            }
        } else {
            SignInView(session: session)
        }
    }
}

/// Who is signed in, which house, and the way back out. The web has more here; this is the
/// part a phone actually needs.
struct HouseholdView: View {
    var session: Session

    var body: some View {
        NavigationStack {
            List {
                Section("You") {
                    LabeledContent("Signed in as", value: session.displayName ?? "—")
                    LabeledContent("Household", value: session.household?.name ?? "—")
                }
                Section("Server") {
                    LabeledContent("Address", value: Config.baseURL)
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                }
            }
            .navigationTitle("Household")
        }
    }
}

#Preview("Signed in") {
    RootView(session: .preview)
}

#Preview("Household") {
    HouseholdView(session: .preview)
}
