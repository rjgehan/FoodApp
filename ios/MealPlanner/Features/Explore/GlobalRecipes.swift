import SwiftUI

/*
 Global recipes (the mockup's 5.2 and 5.3): everything every household here has published,
 a published recipe opened read-only, and the sheet that moves one into your recipes — asking
 which household when you are in more than one. The same as the web's, piece for piece.
*/

extension Recipe {
    /// Kept already: another household's recipe that is in one of this household's drawers.
    var isKept: Bool { shared && section != nil }

    /// The faint mark on a published recipe's picture. Which drawer its publisher keeps it in is
    /// theirs to know, so until you file it yourself it gets the pan the recipe page uses.
    var exploreSymbol: String {
        section.map { PlanText.icon(section: $0, meal: .dinner) } ?? "frying.pan"
    }
}

// MARK: - The list

/**
 Global recipes (5.2): search what any household has published, open one, or move it straight
 into your own recipes with its +. The chips narrow it to what is newest (all of it, as the
 server sends it), what you have not kept yet, and what this house published itself.
 */
struct GlobalRecipesScreen: View {
    var session: Session
    var sample: [Recipe]?

    enum Filter: Hashable { case newest, notKept, yours }

    @State private var recipes: [Recipe]?
    @State private var query = ""
    @State private var filter: Filter = .newest
    @State private var moving: Recipe?
    @State private var toast: String?
    #if DEBUG
    @State private var debugOpened = false
    @State private var debugOpen: Recipe?
    #endif

    private var shown: [Recipe] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return (recipes ?? []).filter { r in
            if filter == .notKept && (!r.shared || r.isKept) { return false }
            if filter == .yours && r.shared { return false }
            guard !q.isEmpty else { return true }
            return r.name.lowercased().contains(q)
                || (r.description ?? "").lowercased().contains(q)
                || (r.ownerName ?? "").lowercased().contains(q)
                || r.ingredients.contains { $0.ingredientName.lowercased().contains(q) }
        }
    }

    var body: some View {
        let count = recipes?.count ?? 0
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SearchBox(text: $query, prompt: recipes == nil ? "Search published recipes"
                          : "Search \(count) \(count == 1 ? "recipe" : "recipes")")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Chip("Newest", isOn: filter == .newest) { filter = .newest }
                        Chip("Not kept yet", isOn: filter == .notKept) { filter = .notKept }
                        if (recipes ?? []).contains(where: { !$0.shared }) {
                            Chip("Published by you", isOn: filter == .yours) { filter = .yours }
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.horizontal, -20)
                .padding(.bottom, 2)

                if recipes == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
                } else if shown.isEmpty {
                    Text(emptyText)
                        .font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                        .cardSurface()
                } else {
                    VStack(spacing: 12) {
                        ForEach(shown) { recipe in
                            GlobalRecipeCard(recipe: recipe, session: session) { moving = recipe }
                        }
                    }
                }

                Text("Anyone signed in here can read a published recipe and move it into their own recipes. It stays the publisher's to change.")
                    .font(.system(size: 13)).foregroundStyle(Palette.faint)
                    .padding(.horizontal, 4)
                    .padding(.top, 10)
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .pageBackground()
        .centeredTitle("Global recipes")
        .navigationDestination(for: Recipe.self) { recipe in
            if recipe.shared {
                GlobalRecipeScreen(recipe: recipe, session: session) { saved in replace(saved) }
            } else {
                RecipeDetailView(recipe: recipe, session: session)
            }
        }
        #if DEBUG
        .navigationDestination(item: $debugOpen) { recipe in
            GlobalRecipeScreen(recipe: recipe, session: session) { saved in replace(saved) }
        }
        #endif
        .sheet(item: $moving) { recipe in
            MoveIntoMineSheet(recipe: recipe, session: session) { saved, household in
                if household.id == session.household?.id {
                    replace(saved)
                    say("Moved into your recipes")
                } else {
                    say("Moved into \(household.name)")
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .task { await load() }
        .refreshable { await load() }
    }

    private var emptyText: String {
        if !query.trimmingCharacters(in: .whitespaces).isEmpty { return "Nothing matches that." }
        if filter == .notKept && !(recipes ?? []).isEmpty { return "You keep every one of them already." }
        return "Nothing published yet. Open one of your recipes and choose ••• › Share › In Explore to put the first one here."
    }

    private func load() async {
        if let sample {
            recipes = sample
        } else if let household = session.household?.id {
            recipes = (try? await APIClient.shared.explore(household: household)) ?? recipes ?? []
        } else {
            recipes = []
        }
        #if DEBUG
        // -mp_debug_screen explore-recipe | explore-move: the first one from another house, opened.
        if !debugOpened, ["explore-recipe", "explore-move"].contains(UserDefaults.standard.string(forKey: "mp_debug_screen")) {
            debugOpened = true
            try? await Task.sleep(for: .milliseconds(400))
            debugOpen = recipes?.first { $0.shared && !$0.isKept }
        }
        #endif
    }

    /// The recipe as this household now sees it — filed, after a move.
    private func replace(_ saved: Recipe) {
        recipes = recipes?.map { $0.id == saved.id ? saved : $0 }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(2.5))
            if toast == text { toast = nil }
        }
    }
}

/**
 A published recipe as a card (5.2): its picture, its name, the household that published it, and
 the round + that moves it into your recipes without opening it. One you keep already says which
 drawer it is in instead, and one of your own needs neither.
 */
struct GlobalRecipeCard: View {
    let recipe: Recipe
    var session: Session
    var onMove: () -> Void

    private var owner: String {
        recipe.shared ? (recipe.ownerName ?? "Another household") : (session.household?.name ?? "You")
    }

    var body: some View {
        HStack(spacing: 12) {
            NavigationLink(value: recipe) {
                HStack(spacing: 12) {
                    ExplorePicture(recipe: recipe, radius: 14).frame(width: 84, height: 84)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(recipe.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            Avatar(owner, tone: .sky, size: 18)
                            Text(owner).lineLimit(1)
                        }
                        .font(.system(size: 12)).foregroundStyle(Palette.muted)
                        if let section = recipe.section, recipe.isKept {
                            Label("In your \(section.title) drawer", systemImage: "checkmark")
                                .labelStyle(TightLabel())
                                .font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.herb)
                        } else {
                            HStack(spacing: 10) {
                                if let time = recipe.totalTime {
                                    Label(time, systemImage: "clock").labelStyle(TightLabel())
                                }
                                Label("Serves \(recipe.servings)", systemImage: "person.2").labelStyle(TightLabel())
                            }
                            .font(.system(size: 12)).foregroundStyle(Palette.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            if recipe.shared && !recipe.isKept {
                Button(action: onMove) {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.accentInk)
                        .frame(width: 34, height: 34)
                        .background(Palette.accentSoft, in: Circle())
                        .contentShape(Circle().inset(by: -6))
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Move \(recipe.name) into my recipes")
                .padding(.trailing, 4)
            }
        }
        .padding(10)
        .cardSurface()
    }
}

/// A published recipe's picture: its cover, or its colour with its mark.
struct ExplorePicture: View {
    let recipe: Recipe
    var radius: CGFloat = 14

    var body: some View {
        if recipe.coverImageId != nil {
            RecipePicture(recipe: recipe, radius: radius)
        } else {
            RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString.lowercased()), systemImage: recipe.exploreSymbol, radius: radius)
        }
    }
}

/// An icon and its text with the mockup's 4pt gap.
private struct TightLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon.font(.system(size: 11))
            configuration.title
        }
    }
}

// MARK: - One, opened

/**
 A published recipe opened from Global recipes (5.3): read-only, with one thing to do — move it
 into your recipes. Its own screen rather than the recipe page, because nothing on that page is
 yours to use yet: no plan, no editing, no next and previous through your catalogue. Once it is
 kept, the one button opens it where it now lives, as one of yours.
 */
struct GlobalRecipeScreen: View {
    @State var recipe: Recipe
    var session: Session
    /// Tells the list it is kept now.
    var onMoved: (Recipe) -> Void = { _ in }

    @State private var moving = false
    @State private var opening = false
    @State private var toast: String?
    @State private var heroGone = false
    @Environment(\.dismiss) private var dismiss
    #if DEBUG
    @State private var debugOpened = false
    #endif

    private var steps: [String] {
        (recipe.instructions ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .map { $0.replacingOccurrences(of: #"^(\d+[.)]|[-*•])\s*"#, with: "", options: .regularExpression) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        GeometryReader { outer in
            let top = outer.safeAreaInsets.top
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ExploreHero(recipe: recipe, topInset: top) { dismiss() }
                        .padding(.top, -top)
                        .background {
                            GeometryReader { geo in
                                Color.clear.preference(key: ExploreHeroBottom.self, value: geo.frame(in: .global).maxY)
                            }
                        }
                    content.padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 24)
                }
            }
            .onPreferenceChange(ExploreHeroBottom.self) { bottom in heroGone = bottom < top + 20 }
            .overlay(alignment: .top) {
                Palette.bg.frame(height: top).ignoresSafeArea(edges: .top).opacity(heroGone ? 1 : 0)
                    .allowsHitTesting(false)
            }
        }
        .pageBackground()
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .navigationTitle(recipe.name)
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .sheet(isPresented: $moving) {
            MoveIntoMineSheet(recipe: recipe, session: session) { saved, household in
                if household.id == session.household?.id {
                    recipe = saved
                    onMoved(saved)
                    say("Moved into your recipes")
                } else {
                    say("Moved into \(household.name)")
                }
            }
        }
        .navigationDestination(isPresented: $opening) { RecipeDetailView(recipe: recipe, session: session) }
        #if DEBUG
        .task {
            guard !debugOpened, UserDefaults.standard.string(forKey: "mp_debug_screen") == "explore-move" else { return }
            debugOpened = true
            try? await Task.sleep(for: .milliseconds(500))
            moving = true
        }
        #endif
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                if let time = recipe.totalTime { Pill(time, tone: .sky, systemImage: "clock") }
                Pill("Serves \(recipe.servings)", tone: .herb, systemImage: "person.2")
                if let section = recipe.section, recipe.isKept {
                    Pill("In your \(section.title) drawer", tone: .mustard, systemImage: "bookmark")
                }
            }
            if let description = recipe.description, !description.isEmpty {
                Text(description).font(.system(size: 15)).foregroundStyle(Palette.muted)
            }
            Text("Ingredients").titleFont(20).foregroundStyle(Palette.text).accessibilityAddTraits(.isHeader)
            if recipe.ingredients.isEmpty {
                Text("No ingredients written down.").font(.system(size: 15)).foregroundStyle(Palette.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(recipe.ingredients) { ingredientRow($0) }
                }
            }
            if !steps.isEmpty {
                Text("Method").titleFont(20).foregroundStyle(Palette.text).accessibilityAddTraits(.isHeader)
                    .padding(.top, 10)
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                        HStack(alignment: .top, spacing: 12) {
                            StepNumber(number: i + 1)
                            Text(step).font(.system(size: 16)).foregroundStyle(Palette.text).lineSpacing(3)
                                .padding(.top, 1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
    }

    /// The mockup's ingredient line: the amount in bold in its own column, the name, "Optional".
    private func ingredientRow(_ item: RecipeIngredient) -> some View {
        let amount = [item.quantity.map { fraction($0) }, item.unit].compactMap { $0 }.filter { !$0.isEmpty }
            .joined(separator: " ")
        var name = Text(item.ingredientName)
        if let notes = item.notes, !notes.isEmpty { name = name + Text(", \(notes)").foregroundColor(Palette.muted) }
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(amount).font(.system(size: 15, weight: .semibold)).monospacedDigit()
                .frame(width: 74, alignment: .leading)
            name.font(.system(size: 15)).frame(maxWidth: .infinity, alignment: .leading)
            if item.optional { Pill("Optional", tone: .mustard) }
        }
        .foregroundStyle(Palette.text)
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private var bottomBar: some View {
        Group {
            if recipe.isKept {
                Button { opening = true } label: { Label("Open in my recipes", systemImage: "book") }
                    .buttonStyle(.secondary)
            } else {
                Button { moving = true } label: { Label("Move into my recipes", systemImage: "arrow.right") }
                    .buttonStyle(.primary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(Palette.bg)
        .overlay(alignment: .top) { Rectangle().fill(Palette.border).frame(height: 1) }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(2.5))
            if toast == text { toast = nil }
        }
    }
}

private struct ExploreHeroBottom: PreferenceKey {
    static let defaultValue: CGFloat = .infinity
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/**
 The top of a published recipe: its picture edge to edge and up under the status bar, the round
 back button over it, and at its foot where it is from and its name. The recipe page's hero's
 size, so the two feel like the same kind of page.
 */
struct ExploreHero: View {
    let recipe: Recipe
    var topInset: CGFloat
    var back: () -> Void

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            picture
            VStack(alignment: .leading, spacing: 4) {
                Pill("From \(recipe.ownerName ?? "another household")", tone: .sky, systemImage: "globe")
                Text(recipe.name)
                    .titleFont(32)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .frame(height: 253 + topInset)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay(alignment: .topLeading) {
            Button(action: back) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color(rgb: 0x2B211A))
                    .frame(width: 36, height: 36)
                    .background(.white.opacity(0.92), in: Circle())
                    .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
                    .contentShape(Circle().inset(by: -4))
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Back")
            .padding(.leading, 16)
            .padding(.top, topInset + 4)
        }
    }

    @ViewBuilder private var picture: some View {
        let placeholder = RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString.lowercased()),
                                                 systemImage: recipe.exploreSymbol, radius: 0)
        if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
            Color.clear
                .overlay {
                    AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { placeholder }
                }
                .clipped()
                .overlay {
                    // A real photo can be any colour: shade it where the button and the name sit.
                    LinearGradient(colors: [.black.opacity(0.32), .clear, .clear, .black.opacity(0.62)],
                                   startPoint: .top, endPoint: .bottom)
                        .allowsHitTesting(false)
                }
        } else {
            placeholder
        }
    }
}

// MARK: - Moving one in

/**
 "Move into my recipes" for a published recipe: which of your households (only asked when you
 are in more than one, the one you are looking at ticked first), then the drawer and groups it
 goes in there. It files the recipe rather than copying it, the same as a recipe shared with you:
 it stays the publisher's to change, and is yours to find and plan.
 */
struct MoveIntoMineSheet: View {
    let recipe: Recipe
    var session: Session
    var onMoved: (Recipe, HouseholdSummary) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var picked: UUID?
    // Dinner is the least surprising drawer to start in, as it is for a recipe shared with you.
    @State private var section: RecipeSection = .dinner
    @State private var groups: Set<String> = []
    @State private var parked: Set<String> = []
    @State private var allGroups: [RecipeCategory] = []
    @State private var busy = false
    @State private var error: String?

    private static let tones: [Tone] = [.herb, .sky, .plum, .mustard, .accent]

    /// The household on screen first.
    private var households: [HouseholdSummary] {
        let all = session.households.isEmpty ? [session.household].compactMap { $0 } : session.households
        let current = session.household?.id
        return all.sorted { ($0.id == current ? 0 : 1) < ($1.id == current ? 0 : 1) }
    }

    private var chosen: HouseholdSummary? {
        households.first { $0.id == (picked ?? session.household?.id) } ?? households.first
    }

    var body: some View {
        let several = households.count > 1
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Move into my recipes",
                            subtitle: "\(recipe.name), from \(recipe.ownerName ?? "another household"). Only they can change it.",
                            onClose: { dismiss() })
                if several {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Which household")
                        ListGroup {
                            ForEach(Array(households.enumerated()), id: \.element.id) { index, house in
                                Button {
                                    pick(house)
                                } label: {
                                    let members = house.memberCount ?? 0
                                    let open = house.id == session.household?.id ? " · open now" : ""
                                    ListRow(house.name, subtitle: "\(members) \(members == 1 ? "person" : "people")\(open)",
                                            leading: { Avatar(house.name, tone: Self.tones[index % Self.tones.count], size: 40) }) {
                                        CheckCircle(isOn: house.id == chosen?.id)
                                    }
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(house.id == chosen?.id ? [.isSelected] : [])
                            }
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Filing")
                    FilingPicker(section: $section, groups: $groups, allGroups: allGroups) { name in await addGroup(name) }
                }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
                Button {
                    Task { await save() }
                } label: {
                    if busy {
                        ProgressView().tint(Palette.onAccent)
                    } else {
                        Label(several ? "Move into \(chosen?.name ?? "my recipes")" : "Move into my recipes",
                              systemImage: "arrow.right")
                    }
                }
                .buttonStyle(.primary)
                .disabled(busy || chosen == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
        .pageBackground()
        .kitchenSheet(several ? [.large] : [.medium, .large])
        .task(id: chosen?.id) { await loadGroups() }
        .onChange(of: section) { _, next in moveGroups(&groups, parked: &parked, to: next, all: allGroups) }
    }

    private func pick(_ house: HouseholdSummary) {
        guard house.id != chosen?.id else { return }
        picked = house.id
        // Groups belong to a household: the ones ticked for the last one mean nothing in this one.
        groups = []
        parked = []
    }

    private func loadGroups() async {
        guard let household = chosen?.id, session.token != "preview" else { return }
        allGroups = (try? await APIClient.shared.recipeCategories(household: household)) ?? []
    }

    private func addGroup(_ name: String) async {
        guard let household = chosen?.id else { return }
        do {
            let made = try await APIClient.shared.createRecipeCategory(household: household, name: name, section: section)
            allGroups.append(made)
            groups.insert(made.name)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let household = chosen else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.fileRecipe(household: household.id, recipe: recipe.id,
                                                               section: section, categories: Array(groups))
            NotificationCenter.default.post(name: .recipesChanged, object: nil)
            onMoved(saved, household)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Global recipes") {
    NavigationStack { GlobalRecipesScreen(session: .preview, sample: SampleData.published) }
}

#Preview("Global recipes — dark") {
    NavigationStack { GlobalRecipesScreen(session: .preview, sample: SampleData.published) }
        .preferredColorScheme(.dark)
}

#Preview("A published recipe") {
    NavigationStack { GlobalRecipeScreen(recipe: SampleData.published[0], session: .preview) }
}

#Preview("Move into my recipes") {
    let session = Session.preview
    session.households = [SampleData.household, SampleData.otherHousehold]
    return MoveIntoMineSheet(recipe: SampleData.published[0], session: session) { _, _ in }
}
