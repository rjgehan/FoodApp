import SwiftUI

/**
 A recipe somebody sent as a public link (/r/<token>), opened in the app (1.8): the picture, the
 quick facts, its links, the ingredients with a servings stepper, and the method — read-only,
 with "Save to my recipes" pinned along the bottom. In more than one household, saving asks
 which (1.9); in one, it goes straight there. The copy then opens like any recipe of yours.
 */
struct PublicRecipeScreen: View {
    var session: Session
    let token: String

    @Environment(\.dismiss) private var dismiss
    @State private var recipe: PublicRecipe?
    @State private var loadFailure: APIError?
    @State private var servings: Int?
    @State private var choosing: Bool = {
        #if DEBUG
        // -mp_debug_expand 1 with -mp_debug_screen public: "Save a copy to…" open, for screenshots.
        return UserDefaults.standard.string(forKey: "mp_debug_expand") == "1"
            && UserDefaults.standard.string(forKey: "mp_debug_screen") == "public"
        #else
        return false
        #endif
    }()
    @State private var saving = false
    @State private var error: String?
    @State private var copy: Recipe?

    /// `sample` draws it without the network, for the Gallery and previews.
    init(session: Session, token: String, sample: PublicRecipe? = nil) {
        self.session = session
        self.token = token
        _recipe = State(initialValue: sample)
    }

    /// Lemon herb chicken, as the mockup shows it.
    static let sample = PublicRecipe(
        name: "Lemon herb chicken", description: nil,
        instructions: "Zest the lemon and mix with the oil and garlic.\nCoat the chicken and roast for 40 minutes.",
        prepTimeMinutes: 15, cookTimeMinutes: 40, servings: 4,
        links: [SourceLink(url: "https://www.tiktok.com/@cook/video/1", label: nil),
                SourceLink(url: "https://www.example.com/lemon-chicken", label: "Recipe site")],
        coverImageId: nil, photoIds: [],
        ingredients: [
            PublicIngredient(ingredientName: "chicken thighs", quantity: 4, unit: nil, notes: nil),
            PublicIngredient(ingredientName: "olive oil", quantity: 2, unit: "tbsp", notes: nil),
            PublicIngredient(ingredientName: "lemon", quantity: 1, unit: nil, notes: "zested"),
            PublicIngredient(ingredientName: "garlic", quantity: 3, unit: "cloves", notes: nil),
        ])

    var body: some View {
        Group {
            if let recipe {
                page(recipe)
            } else if let loadFailure, !loadFailure.isUnreachable, loadFailure.status == 404 {
                MessageScreen(image: Image("LinkBroken"), title: "This recipe is no longer shared",
                              message: "Whoever sent it has turned its link off, so there is nothing to see here any more.") {
                    Button("Close") { dismiss() }.buttonStyle(.secondary)
                }
            } else if let loadFailure {
                MessageScreen(image: Image(systemName: "wifi"), tone: .mustard, title: "Connection problem",
                              message: loadFailure.isUnreachable
                                  ? "Couldn't reach the server. The link may be fine: check your connection and try again."
                                  : loadFailure.localizedDescription) {
                    Button { Task { await load() } } label: { Label("Retry", systemImage: "arrow.clockwise") }
                        .buttonStyle(.primary)
                    // The page's own Close is on the picture, which is not here.
                    Button("Close") { dismiss() }.buttonStyle(.secondary)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).pageBackground()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        // The mockup's scrim behind "Save a copy to…": the system's own dimming behind a
        // half-height sheet is faint, and in dark mode the recipe behind read as clearly as the
        // sheet. (The sheet itself floats inset on iOS 26 — the system's look, kept.)
        .overlay {
            if choosing {
                Palette.scrim.ignoresSafeArea().allowsHitTesting(false).transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: choosing)
        .navigationDestination(item: $copy) { saved in
            RecipeDetailView(recipe: saved, session: session)
        }
        .sheet(isPresented: $choosing) {
            if let recipe {
                SaveCopySheet(session: session, recipeName: recipe.name) { household in
                    choosing = false
                    Task { await save(into: household) }
                }
                .kitchenSheet([.medium, .large])
            }
        }
        .task { if recipe == nil { await load() } }
    }

    private func page(_ recipe: PublicRecipe) -> some View {
        let shown = servings ?? recipe.servings
        let scale = recipe.servings > 0 ? Double(shown) / Double(recipe.servings) : 1
        return ScrollView {
            VStack(spacing: 0) {
                hero(recipe)
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(recipe.name).titleFont(28).foregroundStyle(Palette.text)
                            .accessibilityAddTraits(.isHeader)
                        HStack(spacing: 12) {
                            if let prep = recipe.prepTimeMinutes, prep > 0 {
                                Label("\(minutes(prep)) prep", systemImage: "clock")
                            }
                            if let cook = recipe.cookTimeMinutes, cook > 0 {
                                Label("\(minutes(cook)) cook", systemImage: "flame")
                            }
                        }
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.muted)
                        .labelStyle(TightLabel())
                        if let description = recipe.description, !description.isEmpty {
                            Text(description).font(.system(size: 15)).foregroundStyle(Palette.muted)
                        }
                    }

                    let links = (recipe.links ?? []).filter { $0.destination != nil }
                    if !links.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(links, id: \.url) { link in
                                    Link(destination: link.destination!) {
                                        Label(link.isVideo && link.label != nil ? "\(link.name) · \(link.site ?? "")" : link.name,
                                              systemImage: link.isVideo ? "play" : "link")
                                    }
                                    .buttonStyle(.kitchen(.secondary, size: .small))
                                }
                            }
                        }
                    }

                    HStack {
                        Text("Ingredients").titleFont(20).foregroundStyle(Palette.text)
                        Spacer()
                        // The Plan's shared stepper; the amounts follow it, nothing is saved.
                        ServingsStepper(value: Binding(get: { shown }, set: { servings = $0 }), label: true)
                    }
                    .padding(.top, 4)
                    ListGroup {
                        ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { _, item in
                            ingredientRow(item, scale: scale)
                        }
                    }

                    let steps = recipe.steps
                    if !steps.isEmpty {
                        SectionHead("Method").padding(.top, 8)
                        Card(spacing: 16) {
                            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                                HStack(alignment: .top, spacing: 12) {
                                    StepNumber(number: index + 1)
                                    Text(step).font(.system(size: 16)).foregroundStyle(Palette.text)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .padding(.top, 2)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 24)
                .frame(maxWidth: 600)
            }
        }
        .ignoresSafeArea(edges: .top)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button { startSave() } label: {
                    if saving { ProgressView().tint(Palette.onAccent) } else { Label("Save to my recipes", systemImage: "bookmark") }
                }
                .buttonStyle(.primary)
                .disabled(saving)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(Palette.bg)
            .overlay(alignment: .top) { Rectangle().fill(Palette.border).frame(height: 1) }
        }
        .pageBackground()
    }

    /// The pictures (swipe through several) or the recipe's colour, the pill and the buttons over it.
    private func hero(_ recipe: PublicRecipe) -> some View {
        HeroPictures(pictures: recipe.pictures, name: recipe.name)
            .frame(height: 300)
            .overlay(alignment: .top) {
                HStack {
                    // The mockup says "Shared by Gehan house". A public link says nothing about
                    // the house that owns the recipe (RecipeLinkService.view), so it says what it is.
                    Pill("Shared recipe", tone: .mustard, systemImage: "link")
                    Spacer()
                    if let url = URL(string: "\(Config.baseURL)/r/\(token)") {
                        ShareLink(item: url) { heroButton("square.and.arrow.up") }
                            .accessibilityLabel("Share")
                    }
                    Button { dismiss() } label: { heroButton("xmark") }
                        .accessibilityLabel("Close")
                }
                .padding(.horizontal, 16)
                .safeAreaPadding(.top)
                .padding(.top, 6)
            }
    }

    private func heroButton(_ systemImage: String) -> some View {
        Image(systemName: systemImage)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color(rgb: 0x2B211A))
            .frame(width: 36, height: 36)
            .background(.white.opacity(0.9), in: Circle())
    }

    private func ingredientRow(_ item: PublicIngredient, scale: Double) -> some View {
        let amount = [item.quantity.map { fraction($0 * scale) }, item.unit].compactMap { $0 }.filter { !$0.isEmpty }
            .joined(separator: " ")
        var line = Text("")
        if !amount.isEmpty { line = line + Text(amount + " ").fontWeight(.bold) }
        line = line + Text(item.ingredientName)
        if let notes = item.notes, !notes.isEmpty { line = line + Text(", \(notes)").foregroundStyle(Palette.muted) }
        return HStack(spacing: 10) {
            line.font(.system(size: 16)).foregroundStyle(Palette.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            if item.optional == true { Pill("Optional", tone: .neutral) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
    }

    // MARK: Behaviour

    private func load() async {
        loadFailure = nil
        do {
            recipe = try await APIClient.shared.publicRecipe(token: token)
        } catch let failure as APIError {
            loadFailure = failure
        } catch {
            loadFailure = APIError(status: 0, body: error.localizedDescription)
        }
    }

    /// One household: straight in. Several: they pick, the open one first and ticked.
    private func startSave() {
        error = nil
        if session.households.count > 1 {
            choosing = true
        } else if let only = session.households.first ?? session.household {
            Task { await save(into: only) }
        } else {
            error = "You're not in a household yet, so there's nowhere to keep it."
        }
    }

    private func save(into household: HouseholdSummary) async {
        saving = true
        defer { saving = false }
        do {
            copy = try await SharedRecipeLink.save(token: token, household: household.id)
            // The app is on the house the copy went into, so the recipe it opens is there.
            if session.household?.id != household.id { session.choose(household) }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func minutes(_ value: Int) -> String {
        value < 60 ? "\(value) min" : value % 60 == 0 ? "\(value / 60) hr" : "\(value / 60) hr \(value % 60) min"
    }
}

/// "0.5" reads like a spreadsheet; "½" reads like a recipe (the web's formatQuantity).
func fraction(_ value: Double) -> String {
    let whole = Int(value.rounded(.down))
    let rest = value - Double(whole)
    if rest < 0.02 { return "\(whole)" }
    let marks: [(Double, String)] = [(0.125, "⅛"), (0.25, "¼"), (0.333, "⅓"), (0.375, "⅜"), (0.5, "½"),
                                     (0.625, "⅝"), (0.667, "⅔"), (0.75, "¾"), (0.875, "⅞")]
    guard let mark = marks.first(where: { abs(rest - $0.0) < 0.02 }) else {
        return String(format: "%g", (value * 100).rounded() / 100)
    }
    return whole > 0 ? "\(whole)\(mark.1)" : mark.1
}

/// The cover and the other photos, swiped through with dots; the recipe's colour with none.
private struct HeroPictures: View {
    let pictures: [UUID]
    let name: String
    @State private var index = 0

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if pictures.isEmpty {
                RecipePhotoPlaceholder(hue: .of(name), systemImage: "fork.knife", radius: 0)
            } else {
                TabView(selection: $index) {
                    ForEach(Array(pictures.enumerated()), id: \.offset) { i, id in
                        AsyncImage(url: APIClient.shared.imageURL(id)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            RecipePhotoPlaceholder(hue: .of(name), systemImage: "fork.knife", radius: 0)
                        }
                        .clipped()
                        .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                // Shading at the top for the buttons, at the bottom for the dots.
                LinearGradient(stops: [.init(color: .black.opacity(0.3), location: 0), .init(color: .clear, location: 0.3),
                                       .init(color: .clear, location: 0.6), .init(color: .black.opacity(0.35), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                    .allowsHitTesting(false)
                if pictures.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(pictures.indices, id: \.self) { i in
                            Capsule().fill(.white.opacity(i == index ? 1 : 0.6))
                                .frame(width: i == index ? 18 : 6, height: 6)
                        }
                    }
                    .padding(16)
                    .animation(.snappy, value: index)
                }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

/// An icon and its text with the mockup's 4pt gap.
private struct TightLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon
            configuration.title
        }
    }
}

/**
 "Save a copy to…" (1.9): only asked when the person is in more than one household. The house
 the app is on comes first, ticked.
 */
struct SaveCopySheet: View {
    var session: Session
    let recipeName: String
    let onSave: (HouseholdSummary) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var picked: UUID?
    /// Each house's recipe count, fetched when the sheet opens; nil until then, or from an
    /// older server, when the line says how many people instead.
    @State private var recipeCounts: [UUID: Int]?

    private static let tones: [Tone] = [.herb, .sky, .plum, .mustard, .accent]

    private var households: [HouseholdSummary] {
        let current = session.household?.id
        return session.households.sorted { ($0.id == current ? 0 : 1) < ($1.id == current ? 0 : 1) }
    }

    var body: some View {
        let choice = households.first { $0.id == (picked ?? households.first?.id) }
        VStack(spacing: 16) {
            SheetHeader("Save a copy to…", subtitle: recipeName, onClose: { dismiss() })
            ListGroup {
                ForEach(Array(households.enumerated()), id: \.element.id) { index, house in
                    Button {
                        picked = house.id
                    } label: {
                        ListRow(house.name, subtitle: facts(house),
                                leading: { Avatar(house.name, tone: Self.tones[index % Self.tones.count], size: 40) }) {
                            CheckCircle(isOn: house.id == choice?.id)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(house.id == choice?.id ? [.isSelected] : [])
                }
            }
            Button(choice.map { "Save to \($0.name)" } ?? "Save") {
                if let choice { onSave(choice) }
            }
            .buttonStyle(.primary)
            .disabled(choice == nil)
            Text("It's your own copy: changes to it don't touch the one that was shared.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .task {
            guard let counts = try? await APIClient.shared.householdRecipeCounts() else { return }
            recipeCounts = Dictionary(counts.compactMap { c in c.recipeCount.map { (c.id, $0) } },
                                      uniquingKeysWith: { a, _ in a })
        }
    }

    /**
     The line under a house: how many recipes it has, which is what tells two houses apart when
     the question is where a recipe goes. (The mockup adds "· Dinner drawer" to the ticked one; a
     public link does not say how the recipe was filed, so that part is left out.)
     */
    private func facts(_ house: HouseholdSummary) -> String {
        if let recipes = recipeCounts?[house.id] { return "\(recipes) \(recipes == 1 ? "recipe" : "recipes")" }
        let members = house.memberCount ?? 0
        return "\(members) \(members == 1 ? "person" : "people")"
    }
}

#Preview("Shared recipe") {
    NavigationStack { PublicRecipeScreen(session: .preview, token: "preview", sample: PublicRecipeScreen.sample) }
}

#Preview("Save a copy to…") {
    SaveCopySheet(session: .preview, recipeName: "Lemon herb chicken") { _ in }
        .pageBackground()
}
