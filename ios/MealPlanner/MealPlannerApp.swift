import Combine
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
    /// The page the shared text came from, kept as the saved recipe's link.
    @State private var sharedLink: String?
    /// "Keep as saved link" was picked in the share sheet rather than "Read as recipe".
    @State private var sharedKeep = false
    /// An invite or reset link the app was opened with (mealplanner://invite/<token>).
    @State private var openedLink: AppLink? = {
        #if DEBUG
        // -mp_debug_link "mealplanner://invite/<token>": opened with that link, for screenshot runs.
        return UserDefaults.standard.string(forKey: "mp_debug_link").flatMap(AppLink.parse)
        #else
        return nil
        #endif
    }()

    init() {
        // Before anything is drawn: somebody already signed in never gets the tutorial.
        FirstRun.settle()
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session, openedLink: $openedLink)
                .task {
                    guard !restored else { return }
                    await session.restore()
                    restored = true
                    await session.loadHouseholds()
                }
                // mealplanner://paste?text=… — what the share extension sends.
                .onOpenURL { url in
                    // mealplanner://invite/<token> and mealplanner://reset/<token>: the links a
                    // person is handed, opened in the app rather than on the web.
                    if url.scheme == "mealplanner", let link = AppLink.parse(url.absoluteString) {
                        openedLink = link
                        return
                    }
                    guard url.scheme == "mealplanner", url.host == "paste" else { return }
                    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
                    // What the share sheet handed over, on its way to the import log. An
                    // app that offers nothing useful looks the same as one that offers
                    // nothing at all, and only the note tells them apart.
                    sharedDiagnostic = items?.first(where: { $0.name == "diag" })?.value
                    sharedLink = items?.first(where: { $0.name == "link" })?.value
                    sharedKeep = items?.first(where: { $0.name == "keep" })?.value == "1"
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
                        // One of this app's own public links: the recipe as its page shows it,
                        // with Save to my recipes, rather than an import of the web app's page.
                        if sharedRecipe == nil,
                           let token = SharedRecipeLink.token(in: sharedLink) ?? SharedRecipeLink.token(in: incoming.text) {
                            PublicRecipeScreen(session: session, token: token)
                        } else {
                            sharedRecipeView(incoming)
                        }
                    }
                }
                // Every control in the app in the theme's colours, and light or dark, as chosen
                // on the Theme screen.
                .modifier(Themed())
        }
    }

    private func sharedRecipeView(_ incoming: SharedText) -> some View {
        SharedRecipeView(
            session: session,
            incoming: sharedRecipe == nil ? incoming.text : nil,
            structured: sharedRecipe,
            diagnostic: sharedDiagnostic,
            link: sharedLink,
            keepAsLink: sharedKeep
        )
    }
}

/// What "Time to restock?" is asking about, and in which house.
struct RestockDue: Identifiable {
    let household: UUID
    let items: [RestockReminder]
    var id: UUID { household }
}

/**
 The theme and mode on everything below: the tint, the switch's herb green, body text in the
 text token, and the UIKit bars (Chrome). Without the tint every control is Apple's blue, which
 is the clearest sign that nobody chose anything. A modifier rather than lines in the scene, so
 reading ThemeStore here redraws it when a new theme is picked.
 */
struct Themed: ViewModifier {
    var store = ThemeStore.shared

    func body(content: Content) -> some View {
        // Read here so a new theme redraws everything below with its colours.
        let _ = store.style
        content
            // The accent's ink rather than the fill: tint colours text (links, Back, toolbar
            // buttons), and Brunch's yellow fill does not read as text on cream.
            .tint(Palette.accentInk)
            .toggleStyle(.herb)
            .foregroundStyle(Palette.text)
            .preferredColorScheme(store.colorScheme)
            .onAppear {
                store.applyInterfaceStyle()
                Chrome.apply(store.style)
            }
    }
}

/**
 A tab's label as an outline icon, like the mockup's; a tab bar fills SF Symbols unless told not
 to. The tabs you are not on draw their icon already coloured in the theme's muted ink: from iOS 26
 the glass bar ignores the unselected colour Chrome gives it and draws them black, or filled,
 depending on what is scrolling underneath — and it fills the one you are on. So each icon is
 drawn already coloured, the tab you are on in the accent's ink.
*/
private struct TabLabel: View {
    let title: String
    let systemImage: String
    var selected = false

    init(_ title: String, systemImage: String, selected: Bool) {
        self.title = title
        self.systemImage = systemImage
        self.selected = selected
    }

    @Environment(\.colorScheme) private var scheme

    /**
     The icon flattened into a plain picture in its colour. Handed a symbol image, the bar draws
     the symbol its own way — filled and black — for its first few seconds, until a later update
     swaps the coloured one in; a picture it can only show as it is. Reading the theme's style here
     redraws it when the theme or light and dark change.
    */
    private var icon: UIImage? {
        let tokens = scheme == .dark ? ThemeStore.shared.style.dark : ThemeStore.shared.style.light
        let color = (selected ? tokens.accentInk : tokens.muted).uiColor
        guard let symbol = UIImage(systemName: systemImage,
                                   withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .regular, scale: .large))?
            .withTintColor(color, renderingMode: .alwaysOriginal) else { return nil }
        let format = UIGraphicsImageRendererFormat.preferred()
        let flat = UIGraphicsImageRenderer(size: symbol.size, format: format).image { _ in
            symbol.draw(in: CGRect(origin: .zero, size: symbol.size))
        }
        return flat.withRenderingMode(.alwaysOriginal)
    }

    var body: some View {
        if let icon {
            Label { Text(title) } icon: { Image(uiImage: icon) }
        } else {
            Label(title, systemImage: systemImage).environment(\.symbolVariants, .none)
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
    /// An invite or reset link the app was opened with, until it has been dealt with.
    @Binding var openedLink: AppLink?
    /// The first-run tutorial is still to come on this phone (Welcome/Tutorial.swift).
    @State private var firstRun = !FirstRun.seen

    /// Which tab is up. Seeded from `-mp_debug_tab` in debug builds so a screenshot run can
    /// land on any tab without tapping.
    @State private var tab: String = {
        #if DEBUG
        return UserDefaults.standard.string(forKey: "mp_debug_tab") ?? "plan"
        #else
        return "plan"
        #endif
    }()

    /// -mp_debug_screen "edit", "detail", "settings", "household" or "ideas" opens that screen straight
    /// away, so a screenshot run can see something that otherwise needs three taps to reach.
    /// "day" is handled by PlanView: today's day sheet, and -mp_debug_expand 1 opens its first
    /// dish's actions. With -mp_debug_tab.
    #if DEBUG
    @State private var debugSheet: String? = UserDefaults.standard.string(forKey: "mp_debug_screen")
    #endif

    /// Set when the signed-in person still has no email or password: the prompt asking for them.
    @State private var askingForCredentials: Me?
    @Environment(\.scenePhase) private var scenePhase

    /// "Time to restock?", when something has come due.
    @State private var restockDue: RestockDue?
    /// The households asked about since the app last came to the front — once each, like the
    /// web's once per session. Emptied when the app goes to the background.
    @State private var restockAsked: Set<UUID> = []

    var body: some View {
        Group {
            if session.isSignedIn {
                if firstRun {
                    // In through an invite (or a reset link) on a phone that has not had the
                    // tutorial: it comes now, after joining, on the way into the app.
                    TutorialView(finish: .app) { firstRun = false }
                } else {
                    signedIn
                }
            } else if let link = openedLink {
                // Somebody sent a link sees who invited them first — not the tutorial.
                NavigationStack { linkScreen(link) }
            } else if firstRun {
                TutorialView(finish: .signIn) { firstRun = false }
            } else {
                SignInView(session: session)
            }
        }
        // A link opened while signed in: over whatever was on screen.
        .sheet(item: Binding(get: { session.isSignedIn && !firstRun ? openedLink : nil },
                             set: { openedLink = $0 })) { link in
            NavigationStack { linkScreen(link) }
        }
    }

    @ViewBuilder private func linkScreen(_ link: AppLink) -> some View {
        switch link {
        case .invite(let token):
            JoinHouseholdView(session: session, token: token) { openedLink = nil }
        case .reset(let token):
            ResetPasswordView(session: session, token: token) { openedLink = nil }
        }
    }

    /*
     Split into steps rather than one long chain: every feature hangs something off the tabs, and
     past a point Swift gives up type-checking a single expression that long.
    */
    private var tabs: some View {
        TabView(selection: $tab) {
            PlanView(session: session)
                .tabItem { TabLabel("Plan", systemImage: "calendar", selected: tab == "plan") }
                .tag("plan")
            RecipesView(session: session)
                .tabItem { TabLabel("Recipes", systemImage: "book", selected: tab == "recipes") }
                .tag("recipes")
            GroceriesView(session: session)
                .tabItem { TabLabel("Groceries", systemImage: "cart", selected: tab == "groceries") }
                .tag("groceries")
            CupboardView(session: session)
                .tabItem { TabLabel("Cupboard", systemImage: "cabinet", selected: tab == "cupboard") }
                .tag("cupboard")
            ExploreView(session: session)
                .tabItem { TabLabel("Explore", systemImage: "safari", selected: tab == "explore") }
                .tag("explore")
        }
    }

    /// The tabs, with what runs behind them: sign-in checks, restock, colours, being removed.
    private var tabsAtWork: some View {
        tabs
        /*
         A new household is a new set of tabs. Each tab loads once when it appears, and the
         switcher is a sheet over it, so the tab never re-appeared: the header said the new
         house while the plan underneath was still the old one's, and editing it sent the
         old house's ids to the new house. The id only — a same-house refresh of its
         settings must not throw away where you were.
        */
        .id(session.household?.id)
        // After every sign-in (a new token) and on every launch.
        .task(id: session.token) { await checkCredentials() }
        // On launch, on switching house, and on coming back to the app.
        .task(id: session.household?.id) { await checkRestock() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { restockAsked = [] }
            if phase == .active { Task { await checkRestock() } }
        }
        .sheet(item: $restockDue) { due in
            RestockPrompt(household: due.household, items: due.items)
        }
        // Your colours, which may have been changed on the web or another phone.
        .task(id: session.token) { await loadTheme() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await loadTheme() } }
        }
        // A household that turns us away is one we were taken out of: fetch the list again,
        // which moves on to another house — or, with none left, back to the sign-in screen.
        .onReceive(NotificationCenter.default.publisher(for: .householdForbidden)
            .throttle(for: .seconds(3), scheduler: RunLoop.main, latest: false)) { _ in
            Task { await session.loadHouseholds() }
        }
    }

    /// ...and what they may ask on top of them.
    private var tabsWithPrompts: some View {
        tabsAtWork
        // Taken out of a household and moved to another (7.4).
        .kitchenAlert(isPresented: Binding(
            get: { session.removedFrom != nil },
            set: { if !$0 { session.removedFrom = nil } }
        )) {
            if let removed = session.removedFrom {
                HouseholdRemovedCard(removedFrom: removed.from, movedTo: removed.to) { session.removedFrom = nil }
            }
        }
        // Something to say after signing in — an invite that no longer worked, say.
        .alert("Meal Planner", isPresented: Binding(
            get: { session.isSignedIn && session.notice != nil },
            set: { if !$0 { session.notice = nil } }
        )) {
            Button("OK") { session.notice = nil }
        } message: {
            Text(session.notice ?? "")
        }
        .sheet(isPresented: Binding(
            get: { askingForCredentials != nil },
            set: { if !$0 { askingForCredentials = nil } }
        )) {
            if let me = askingForCredentials {
                CredentialsPrompt(session: session, me: me)
            }
        }
    }

    @ViewBuilder private var signedIn: some View {
        #if DEBUG
        debugSheets(tabsWithPrompts)
        #else
        tabsWithPrompts
        #endif
    }

    #if DEBUG
    private func debugSheets(_ content: some View) -> some View {
        content
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
        // -mp_debug_screen share -mp_debug_recipe <uuid>: that recipe, from the server, with
        // its Share sheet open.
        .sheet(isPresented: Binding(
            get: { debugSheet == "share" },
            set: { if !$0 { debugSheet = nil } }
        )) {
            DebugRecipeDetail(session: session)
        }
        // -mp_debug_screen recipe|recipe-options|recipe-plan|recipe-delete|recipe-method|recipe-nutrition
        // -mp_debug_recipe <uuid>: that recipe's page from the server, full screen as it is pushed,
        // with the named sheet or tab open.
        .fullScreenCover(isPresented: Binding(
            get: { (debugSheet ?? "").hasPrefix("recipe") },
            set: { if !$0 { debugSheet = nil } }
        )) {
            DebugRecipeDetail(session: session)
        }
        // Settings is behind the avatar now, which a screenshot run cannot tap.
        .sheet(isPresented: Binding(
            get: { debugSheet == "settings" },
            set: { if !$0 { debugSheet = nil } }
        )) {
            SettingsView(session: session)
        }
        // Over the whole screen, as Settings → Household settings opens it.
        .fullScreenCover(isPresented: Binding(
            get: { debugSheet == "household" },
            set: { if !$0 { debugSheet = nil } }
        )) {
            NavigationStack { HouseholdScreen(session: session) }
        }
        // The ideas board, from the server — the lightbulb is a tap a screenshot run cannot make.
        .fullScreenCover(isPresented: Binding(
            get: { debugSheet == "ideas" },
            set: { if !$0 { debugSheet = nil } }
        )) {
            IdeasView(session: session)
        }
        // -mp_debug_screen prompt-email|prompt-restock|prompt-starter|prompt-removed|prompt-ideas|
        // prompt-share|prompt-rewritten: section 07's screens from sample data, as the Gallery has them.
        .fullScreenCover(isPresented: Binding(
            get: { (debugSheet ?? "").hasPrefix("prompt-") },
            set: { if !$0 { debugSheet = nil } }
        )) {
            promptScreen(debugSheet ?? "")
        }
        // Settings → Theme, and the design system's catalogue and the Gallery, for screenshots.
        .fullScreenCover(isPresented: Binding(
            get: { ["theme", "design", "gallery"].contains(debugSheet ?? "") },
            set: { if !$0 { debugSheet = nil } }
        )) {
            switch debugSheet {
            case "theme": NavigationStack { ThemeScreen() }
            case "design": NavigationStack { DesignSystemView() }
            default: GalleryView()
            }
        }
        // -mp_debug_screen public -mp_debug_share_token <token>: a recipe's public link, opened
        // as though it had been shared into the app.
        .sheet(isPresented: Binding(
            get: { debugSheet == "public" },
            set: { if !$0 { debugSheet = nil } }
        )) {
            NavigationStack {
                PublicRecipeScreen(session: session, token: UserDefaults.standard.string(forKey: "mp_debug_share_token") ?? "")
            }
        }
        // As sheets: the household switcher, and Theme the way Settings shows it (pushed in a sheet).
        .sheet(isPresented: Binding(
            get: { ["switch", "theme-sheet"].contains(debugSheet ?? "") },
            set: { if !$0 { debugSheet = nil } }
        )) {
            if debugSheet == "switch" {
                HouseholdPicker(session: session)
            } else {
                NavigationStack { ThemeScreen() }
            }
        }
    }

    @ViewBuilder private func promptScreen(_ name: String) -> some View {
        let gallery = PromptGallery(session: .preview, twoHouses: {
            let two = Session.preview
            two.households = [SampleData.household, SampleData.otherHousehold]
            return two
        }())
        switch name {
        case "prompt-email": gallery.addEmail()
        case "prompt-restock": gallery.restock()
        case "prompt-starter": gallery.starter()
        case "prompt-removed": gallery.removed()
        case "prompt-ideas": IdeasView(session: .preview, sample: SampleData.ideasMockup)
        case "prompt-share": gallery.share()
        default: NavigationStack { gallery.rewritten() }
        }
    }
    #endif

    /// The server's copy of your colours. Quiet on failure: the cached ones are already on.
    private func loadTheme() async {
        guard session.isSignedIn else { return }
        let before = ThemeStore.shared.pickCount
        guard let me = try? await APIClient.shared.me() else { return }
        let theme = me.theme
        // Light or dark as answered on this phone's first run goes on an account that has
        // never said either — once, and only the first account signed in afterwards.
        if var server = theme, let asked = DeviceThemeMode.takeToSave(), server.mode == nil {
            server.mode = asked
            // Counts as a pick: another load already on its way (signing in and coming back into
            // view both start one) still has no light or dark, and would undo this one.
            await MainActor.run { ThemeStore.shared.pick(server) }
            _ = try? await APIClient.shared.updateTheme(server)
            return
        }
        await MainActor.run { ThemeStore.shared.adopt(theme, since: before) }
    }

    /// Asks who you are: whether the ideas board is open (and whether you are its admin), and
    /// then for an email and password if they are missing and "Not now" has not been said since
    /// launch. Quiet on failure: offline is no reason to nag.
    private func checkCredentials() async {
        let me = try? await APIClient.shared.me()
        if let me { session.learn(me) }
        guard session.isSignedIn, !session.credentialsPromptDismissed else { return }
        #if DEBUG
        // A screenshot run lands on a particular screen; the prompt would sit on top of it.
        // -mp_debug_screen credentials shows the prompt itself, from sample data if need be.
        if let debugSheet {
            if debugSheet == "credentials" {
                askingForCredentials = me ?? SampleData.me
            }
            return
        }
        #endif
        guard let me, me.needsCredentials else { return }
        // One sheet at a time: if "Time to restock?" got there first, this asks next launch.
        guard restockDue == nil else { return }
        askingForCredentials = me
    }

    /// Asks "Time to restock?" if anything has come due, once per household each time the app
    /// comes to the front. Quiet on failure, and it waits behind the credentials prompt.
    private func checkRestock() async {
        guard session.isSignedIn, let household = session.household?.id,
              !restockAsked.contains(household), askingForCredentials == nil, restockDue == nil
        else { return }
        #if DEBUG
        // A screenshot run lands on a particular screen; the question would sit on top of it.
        if debugSheet != nil { return }
        #endif
        // Marked before asking the server: launching fires both the task and the scene turning
        // active, and the second must not ask again while the first is on its way.
        restockAsked.insert(household)
        guard let due = try? await APIClient.shared.dueRestock(household: household) else {
            restockAsked.remove(household)
            return
        }
        // Still the same house, and nothing else came up while the question was on its way.
        guard !due.isEmpty, session.household?.id == household, askingForCredentials == nil else { return }
        restockDue = RestockDue(household: household, items: due)
    }
}

#Preview("Signed in") {
    RootView(session: .preview, openedLink: .constant(nil))
}

#if DEBUG
/// A real recipe by id (-mp_debug_recipe), for screenshot runs that need the server's answers —
/// the Share sheet's households, say — rather than sample data.
private struct DebugRecipeDetail: View {
    var session: Session
    @State private var recipe: Recipe?
    @State private var failed = false

    var body: some View {
        NavigationStack {
            if let recipe {
                RecipeDetailView(recipe: recipe, session: session)
            } else if failed {
                Text("No recipe for -mp_debug_recipe.").foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .task {
            guard let raw = UserDefaults.standard.string(forKey: "mp_debug_recipe"),
                  let id = UUID(uuidString: raw),
                  let found = try? await APIClient.shared.recipe(id, household: session.household?.id)
            else { failed = true; return }
            recipe = found
        }
    }
}
#endif
