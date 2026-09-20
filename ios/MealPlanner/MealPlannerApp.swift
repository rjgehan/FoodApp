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
                        SharedRecipeView(
                            session: session,
                            incoming: sharedRecipe == nil ? incoming.text : nil,
                            structured: sharedRecipe,
                            diagnostic: sharedDiagnostic
                        )
                    }
                }
                // Every control in the app, in the app's own colour. Without this they are
                // all Apple's blue, which is the clearest sign that nobody chose anything.
                .tint(Palette.accent)
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

    /// -mp_debug_screen "edit", "detail" or "settings" opens that screen straight away, so a screenshot
    /// run can see something that otherwise needs three taps to reach. With -mp_debug_tab.
    #if DEBUG
    @State private var debugSheet: String? = UserDefaults.standard.string(forKey: "mp_debug_screen")
    #endif

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
                ExploreView(session: session)
                    .tabItem { Label("Explore", systemImage: "safari") }
                    .tag("explore")
            }
            #if DEBUG
            .sheet(isPresented: Binding(
                get: { debugSheet == "edit" },
                set: { if !$0 { debugSheet = nil } }
            )) {
                EditRecipeView(recipe: SampleData.recipes[0], session: session) { _ in }
            }
            .sheet(isPresented: Binding(
                get: { debugSheet == "detail" },
                set: { if !$0 { debugSheet = nil } }
            )) {
                NavigationStack {
                    RecipeDetailView(recipe: SampleData.recipes[0], session: session)
                }
            }
            // Settings is behind the avatar now, which a screenshot run cannot tap.
            .sheet(isPresented: Binding(
                get: { debugSheet == "settings" },
                set: { if !$0 { debugSheet = nil } }
            )) {
                SettingsView(session: session)
            }
            #endif
        } else {
            SignInView(session: session)
        }
    }
}

/// Who is signed in, which house, and the way back out. The web has more here; this is the
/// part a phone actually needs.
struct SettingsView: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var editingServer = false
    @State private var serverDraft = Config.baseURL
    @State private var serverProblem: String?

    var body: some View {
        NavigationStack {
            List {
                Section("You") {
                    LabeledContent("Signed in as", value: session.displayName ?? "—")
                }
                /*
                 Changeable from here, not only from the sign-in screen.
                 
                 It used to be a toolbar button on SignInView, which meant the one moment you
                 could point the app somewhere else was the one moment you were signed out —
                 and once signed in the address was shown and could not be touched.
                */
                // Everything about the house itself. A page rather than rows here, because
                // it is where leaving and deleting live and those want room.
                Section {
                    NavigationLink {
                        HouseholdScreen(session: session)
                    } label: {
                        LabeledContent("Household settings", value: session.household?.name ?? "—")
                    }
                }

                Section {
                    AppleIntelligenceStatus()
                } header: {
                    Text("Apple Intelligence")
                } footer: {
                    Text("What the phone says it can do. Generating a cover photo needs the first one.")
                }

                Section("Server") {
                    Button {
                        serverDraft = Config.baseURL
                        editingServer = true
                    } label: {
                        // Looks like a row you can open, because otherwise it reads exactly
                        // like the two lines above it, which you cannot.
                        HStack {
                            Text("Address").foregroundStyle(.primary)
                            Spacer(minLength: 12)
                            Text(Config.baseURL)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    // Without this the button tints the whole row, and it stops looking
                    // like the drill-in row below it and starts looking like a link.
                    .buttonStyle(.plain)
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
            .navigationTitle("Settings")
            // It arrives as a sheet from the avatar, and a sheet needs a way out that is not
            // a swipe — swiping is a shortcut, not the control.
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .alert("Kitchen server", isPresented: $editingServer) {
                TextField(Config.fallback, text: $serverDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button("Cancel", role: .cancel) { serverDraft = Config.baseURL }
                Button("Switch") { switchServer() }
            } message: {
                // The session belongs to the server that issued it, so this signs out. Said
                // up front rather than leaving somebody wondering why they are back at the PIN.
                Text("""
                Just the address is enough — meals.gehan.cloud. Moving to another server signs \
                you out, because your session belongs to this one.
                """)
            }
        }
        // On the stack rather than on the List: two .alert modifiers on one view fight over
        // which gets shown, and the one that loses simply never appears.
        .alert("That is not an address", isPresented: Binding(
            get: { serverProblem != nil },
            set: { shown in if !shown { serverProblem = nil } }
        )) {
            Button("OK") { serverProblem = nil }
        } message: {
            Text(serverProblem ?? "")
        }
    }

    private func switchServer() {
        // "meals.gehan.cloud" is what anybody would type, and what used to be stored verbatim
        // and then fail every call. Config fills in the scheme and says no to the rest.
        guard let address = Config.address(from: serverDraft) else {
            serverProblem = "\(serverDraft.trimmingCharacters(in: .whitespaces)) is not a server address. "
                + "Try something like meals.gehan.cloud, or 192.168.1.10:8080."
            return
        }
        guard address != Config.baseURL else { return }
        Config.baseURL = address
        Task { await session.signOut() }
    }
}

#Preview("Signed in") {
    RootView(session: .preview)
}

#Preview("Settings") {
    SettingsView(session: .preview)
}
