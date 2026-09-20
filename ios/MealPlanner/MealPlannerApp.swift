import SwiftUI

@main
struct MealPlannerApp: App {
    @State private var session = Session()
    @State private var restored = false
    /// Text handed over by the share extension, waiting to be read.
    @State private var shared: String?
    /// Or the page's own recipe data, which needs no reading at all.
    @State private var sharedRecipe: StructuredRecipe?
    /// What the share sheet handed over, sent once the session is up.
    @State private var sharedDiagnostic: String?

    var body: some Scene {
        WindowGroup {
            RootView(session: session)
                .task {
                    guard !restored else { return }
                    await session.restore()
                    restored = true
                    await session.loadHouseholds()
                }
                // mealplanner://paste?text=… — what the share extension sends.
                .onOpenURL { url in
                    guard url.scheme == "mealplanner", url.host == "paste" else { return }
                    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
                    // What the share sheet handed over, on its way to the import log. An
                    // app that offers nothing useful looks the same as one that offers
                    // nothing at all, and only the note tells them apart.
                    sharedDiagnostic = items?.first(where: { $0.name == "diag" })?.value
                    if let json = items?.first(where: { $0.name == "recipe" })?.value,
                       let data = json.data(using: .utf8),
                       let decoded = try? JSONDecoder().decode(StructuredRecipe.self, from: data) {
                        sharedRecipe = decoded
                        shared = decoded.name
                        return
                    }
                    let text = items?.first(where: { $0.name == "text" })?.value
                    // A share that produced nothing still deserves an answer on screen —
                    // and it is the case most worth knowing about.
                    shared = text ?? (items?.contains { $0.name == "diag" } == true
                        ? "That app gave us nothing we can read yet. What it did hand over has been noted."
                        : nil)
                }
                .sheet(item: Binding(get: { shared.map(SharedText.init) }, set: { shared = $0?.text })) { incoming in
                    NavigationStack {
                        LabsPasteView(
                            session: session,
                            incoming: sharedRecipe == nil ? incoming.text : nil,
                            structured: sharedRecipe,
                            diagnostic: sharedDiagnostic
                        )
                    }
                }
        }
    }
}

/// `sheet(item:)` needs something Identifiable, and a String is not.
struct SharedText: Identifiable {
    let text: String
    var id: String { text }
    init(_ text: String) { self.text = text }
}

/// Signed out: the PIN flow. Signed in: the same tabs as the web, in the same order, so the
/// two do not have to be learned separately.
struct RootView: View {
    @Bindable var session: Session

    /// Which tab is up. Seeded from `-mp_debug_tab` in debug builds so a screenshot run can
    /// land on any tab without tapping.
    @State private var tab: String = {
        #if DEBUG
        return UserDefaults.standard.string(forKey: "mp_debug_tab") ?? "plan"
        #else
        return "plan"
        #endif
    }()

    var body: some View {
        if session.isSignedIn {
            TabView(selection: $tab) {
                PlanView(session: session)
                    .tabItem { Label("Plan", systemImage: "calendar") }
                    .tag("plan")
                RecipesView(session: session)
                    .tabItem { Label("Recipes", systemImage: "book") }
                    .tag("recipes")
                GroceriesView(session: session)
                    .tabItem { Label("Groceries", systemImage: "cart") }
                    .tag("groceries")
                CupboardView(session: session)
                    .tabItem { Label("Cupboard", systemImage: "cabinet") }
                    .tag("cupboard")
                HouseholdView(session: session)
                    .tabItem { Label("Household", systemImage: "person.2") }
                    .tag("household")
                #if DEBUG
                // Temporary: Apple Intelligence experiments. Delete this and LabsView.swift.
                LabsView(session: session)
                    .tabItem { Label("Labs", systemImage: "flask") }
                    .tag("labs")
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
                #if DEBUG
                // The whole interface on sample data. A debug tool, so it lives here rather
                // than spending one of the five tabs the web has.
                Section {
                    NavigationLink("Gallery — every screen") { GalleryView() }
                }
                #endif

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
