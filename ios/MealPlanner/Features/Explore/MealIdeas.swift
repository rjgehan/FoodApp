import SwiftUI

/*
 Meal ideas: Explore's third door for a household that doesn't plan ahead, where Meal plans would
 be — the web's MealIdeasPage. A handful of recipes the kitchen can make, the household's own
 first, each ticked to go on the grocery list. Swap one, Shuffle for five new ones, then Add puts
 every ticked one's ingredients on Groceries, as the recipe page's Add to groceries does.

 What the kitchen can make is the server's call (KitchenMachines.missing on POST /meal-ideas): a
 recipe that needs a slow cooker never comes up in a house without one.
 */

/// What POST /api/households/{id}/meal-ideas answers.
struct MealIdeas: Codable, Hashable {
    let meal: MealType
    /// Best first: the household's own, then what other households have published.
    let ideas: [Recipe]
    /// How many recipes for this meal the kitchen can make: what the ideas are chosen from.
    let canMake: Int
    /// How many recipes for this meal need a machine the kitchen doesn't have.
    let leftOut: Int
}

extension APIClient {
    /// A few recipes the household's kitchen can make for a meal, none of `exclude`. Nothing is saved.
    func mealIdeas(household: UUID, meal: MealType, count: Int, exclude: [UUID]) async throws -> MealIdeas {
        try await send("POST", "/api/households/\(household.uuidString)/meal-ideas",
                       body: ["meal": meal.rawValue, "count": count, "exclude": exclude.map(\.uuidString)])
    }
}

extension MealType {
    /// The meals ideas are offered for, in the order the chips show them.
    static let ideaMeals: [MealType] = [.breakfast, .lunch, .dinner]

    /// "dinners": how a sentence counts them.
    var plural: String {
        switch self {
        case .breakfast: "breakfasts"
        case .lunch: "lunches"
        case .dinner: "dinners"
        case .snack: "snacks"
        }
    }

    /// The door's chips: the web's coffee, sandwich and soup.
    var ideaSymbol: String {
        switch self {
        case .breakfast: "cup.and.saucer"
        case .lunch: "takeoutbag.and.cup.and.straw"
        case .dinner, .snack: "fork.knife"
        }
    }
}

// MARK: - The door

/// Meal ideas' door: its tile, name and line, then a chip straight into each meal's ideas.
struct MealIdeasDoor: View {
    /// The kitchen has said what it has, so the ideas are only what it can make.
    var kitchenKnown: Bool
    var open: (MealType) -> Void

    var body: some View {
        Card(padding: 16, spacing: 12) {
            Button { open(.dinner) } label: {
                HStack(spacing: 12) {
                    Tile("fork.knife", tone: .mustard, size: 44)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Meal ideas").titleFont(20).foregroundStyle(Palette.text)
                        Text(kitchenKnown ? "Meals your kitchen can make, straight onto Groceries"
                             : "Meals from your recipes, straight onto Groceries")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.muted).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Meal ideas")
            ChipFlow(spacing: 8) {
                ForEach(MealType.ideaMeals, id: \.self) { meal in
                    Button { open(meal) } label: {
                        HStack(spacing: 6) {
                            Image(systemName: meal.ideaSymbol).font(.system(size: 13, weight: .medium))
                            Text(meal.title).lineLimit(1)
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Palette.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(PressFade())
                }
            }
        }
    }
}

// MARK: - The screen

struct MealIdeasScreen: View {
    var session: Session
    /// Drawn from these and nothing sent (previews and the Gallery).
    var sample: MealIdeas?

    /// How many ideas at once.
    static let count = 5

    @State private var meal: MealType
    @State private var ideas: MealIdeas?
    @State private var failed = false
    /// Ticked to go on the list: every new idea starts ticked.
    @State private var ticked: Set<UUID> = []
    /// Every idea shown since the meal was chosen, so Shuffle and swaps bring new ones.
    @State private var seen: Set<UUID> = []
    /// "shuffle", "add", or the id of the idea being swapped.
    @State private var busy: String?
    @State private var servings: Int
    @State private var error: String?
    @State private var toast: String?
    @State private var opened: Recipe?

    init(session: Session, meal: MealType = .dinner, sample: MealIdeas? = nil) {
        self.session = session
        self.sample = sample
        _meal = State(initialValue: meal)
        _servings = State(initialValue: max(1, session.household?.defaultServings ?? 2))
    }

    private var chosen: [Recipe] { (ideas?.ideas ?? []).filter { ticked.contains($0.id) } }

    /// The line over the chips: what the ideas are drawn from.
    private var intro: String {
        if session.kitchen != nil {
            return "\(meal.title) ideas your kitchen can make. Swap any you don't fancy, then put them on Groceries."
        }
        return "\(meal.title) ideas from your recipes and Explore. Swap any you don't fancy, then put them on Groceries."
    }

    /// The bottom bar's button: "Add 3 to Groceries".
    private var addTitle: String {
        if busy == "add" { return "Adding…" }
        if chosen.isEmpty { return "Add to Groceries" }
        return "Add \(chosen.count) to Groceries"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(intro)
                    .font(.system(size: 15)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    ForEach(MealType.ideaMeals, id: \.self) { m in
                        Chip(m.title, isOn: meal == m) { meal = m }
                    }
                }
                content
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
                kitchenLine
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom) {
            MealPlanBottomBar {
                ServingsStepper(value: $servings, disabled: busy != nil)
                Button { Task { await add() } } label: {
                    Label(addTitle, systemImage: "cart")
                }
                .buttonStyle(.primary)
                .disabled(busy != nil || chosen.isEmpty)
            }
        }
        .pageBackground()
        .centeredTitle("Meal ideas")
        .textBackButton("Explore")
        .toolbar(.hidden, for: .tabBar)
        .mealPlanToast(toast)
        .navigationDestination(item: $opened) { recipe in
            if recipe.shared && recipe.section == nil {
                GlobalRecipeScreen(recipe: recipe, session: session)
            } else {
                RecipeDetailView(recipe: recipe, session: session)
            }
        }
        .task(id: meal) {
            ideas = nil
            _ = await load(excluding: [])
        }
    }

    @ViewBuilder
    private var content: some View {
        if let ideas {
            if ideas.ideas.isEmpty {
                VStack(spacing: 12) {
                    Tile("fork.knife", tone: .mustard, size: 48)
                    Text(emptyWords(ideas))
                        .font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.vertical, 32)
                .cardSurface()
            } else {
                HStack {
                    SectionLabel("\(ideas.ideas.count) \(ideas.ideas.count == 1 ? "idea" : "ideas")")
                    Spacer()
                    Button { Task { await shuffle() } } label: {
                        Label(busy == "shuffle" ? "Shuffling…" : "Shuffle", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.kitchen(.ghost, size: .small, fill: false))
                    .disabled(busy != nil)
                }
                .padding(.bottom, -6)
                ListGroup(dividerInset: 68) {
                    ForEach(ideas.ideas) { recipe in row(recipe) }
                }
            }
        } else if failed {
            MealPlansLoadFailed(message: "Couldn't load meal ideas.") { Task { _ = await load(excluding: []) } }
        } else {
            MealPlansLoading(text: "Finding ideas…")
        }
    }

    private func row(_ r: Recipe) -> some View {
        let on = ticked.contains(r.id)
        return MealRowView(title: r.name, subtitle: line(r),
                           picture: PlanMealPicture(recipeId: r.id, name: r.name, section: r.section,
                                                    coverImageId: r.coverImageId, meal: meal)) {
            SwapButton(label: "Another instead of \(r.name)", busy: busy == r.id.uuidString) { Task { await swap(r) } }
                .disabled(busy != nil && busy != r.id.uuidString)
            Button {
                if on { ticked.remove(r.id) } else { ticked.insert(r.id) }
            } label: {
                CheckCircle(isOn: on).frame(width: 36, height: 36).contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Add \(r.name) to Groceries")
            .accessibilityAddTraits(on ? .isSelected : [])
            .padding(.trailing, -6)
        }
        .onTapGesture { opened = r }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(r.name)
    }

    /// "Yours · 25 min · Oven", "From the Smiths": whose it is, and what there is to know.
    private func line(_ r: Recipe) -> String {
        var parts: [String] = []
        if !r.shared {
            parts.append("Yours")
        } else if r.section != nil {
            parts.append("In your recipes")
        } else {
            parts.append("From \(r.ownerName ?? "Explore")")
        }
        let total = (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0)
        if total > 0 { parts.append("\(total) min") }
        let machines = KitchenMachine.ordered(r.appliances ?? []).map(\.short).joined(separator: ", ")
        if !machines.isEmpty { parts.append(machines) }
        return parts.joined(separator: " · ")
    }

    /// Nothing to suggest: none the kitchen can make, or every one is on the list already.
    private func emptyWords(_ ideas: MealIdeas) -> String {
        if ideas.canMake == 0 { return "No \(meal.plural) your kitchen can make yet." }
        return "Every \(meal.title.lowercased()) your kitchen can make is on Groceries already."
    }

    /// Under the ideas: what they are chosen from, and the way to the kitchen's machines.
    private var kitchenLine: some View {
        NavigationLink {
            KitchenScreen(session: session)
        } label: {
            kitchenWords
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
                .multilineTextAlignment(.leading)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
    }

    /// "Only recipes your kitchen can make: 3 need machines you don't have. Your kitchen", or the
    /// way to set the kitchen up while it has not said what it has.
    private var kitchenWords: Text {
        let link: Text
        let said: String
        if session.kitchen == nil {
            link = Text("Set up your kitchen").foregroundColor(Palette.accentInk).underline()
            said = "Say what's in your kitchen and ideas will only be what you can make. "
        } else {
            link = Text("Your kitchen").foregroundColor(Palette.accentInk).underline()
            let leftOut = ideas?.leftOut ?? 0
            if leftOut == 1 {
                said = "Only recipes your kitchen can make: 1 needs a machine you don't have. "
            } else if leftOut > 1 {
                said = "Only recipes your kitchen can make: \(leftOut) need machines you don't have. "
            } else {
                said = "Only recipes your kitchen can make. "
            }
        }
        return Text(said) + link
    }

    // MARK: - Asking

    /// Ideas leaving out `exclude`; how many came, or nil when they could not be loaded.
    private func load(excluding exclude: Set<UUID>) async -> Int? {
        if let sample {
            ideas = sample
            ticked = Set(sample.ideas.map(\.id))
            return sample.ideas.count
        }
        guard let household = session.household?.id else { return nil }
        failed = false
        error = nil
        do {
            let next = try await APIClient.shared.mealIdeas(household: household, meal: meal, count: Self.count,
                                                            exclude: Array(exclude))
            ideas = next
            ticked = Set(next.ideas.map(\.id))
            seen = exclude.union(next.ideas.map(\.id))
            return next.ideas.count
        } catch {
            failed = true
            return nil
        }
    }

    private func shuffle() async {
        busy = "shuffle"
        // Nothing new left: start again from the top rather than showing nothing.
        if await load(excluding: seen) == 0 { _ = await load(excluding: []) }
        busy = nil
    }

    private func swap(_ old: Recipe) async {
        guard let household = session.household?.id, let current = ideas else { return }
        busy = old.id.uuidString
        error = nil
        defer { busy = nil }
        do {
            let next = try await APIClient.shared.mealIdeas(household: household, meal: meal, count: 1, exclude: Array(seen))
            guard let idea = next.ideas.first else {
                say("No other \(meal.plural) to suggest.")
                return
            }
            ideas = MealIdeas(meal: next.meal, ideas: current.ideas.map { $0.id == old.id ? idea : $0 },
                              canMake: next.canMake, leftOut: next.leftOut)
            seen.insert(idea.id)
            ticked.remove(old.id)
            ticked.insert(idea.id)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Couldn't find another idea. Try again."
        }
    }

    /// One recipe at a time, as its page would: one already on the list is left as it is.
    private func add() async {
        guard let household = session.household?.id else { return }
        busy = "add"
        error = nil
        defer { busy = nil }
        var added = 0
        do {
            for recipe in chosen {
                do {
                    _ = try await APIClient.shared.addRecipeToGroceries(household: household, recipe: recipe.id,
                                                                        servings: servings, extras: [])
                    added += 1
                } catch let refused as APIError where refused.alreadyOnList {
                    continue
                }
            }
            say(added > 0 ? "Added \(added) \(added == 1 ? "recipe" : "recipes") to Groceries" : "Those are on Groceries already")
            NotificationCenter.default.post(name: .showTab, object: "groceries")
            _ = await load(excluding: [])
        } catch {
            self.error = (error as? APIError)?.errorDescription
                ?? "Couldn't add \(added > 0 ? "the rest" : "them") to Groceries. Try again."
        }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(2.5))
            if toast == text { toast = nil }
        }
    }
}

#if DEBUG
#Preview("Meal ideas") {
    NavigationStack {
        MealIdeasScreen(session: .preview, sample: MealIdeas(meal: .dinner, ideas: Array(SampleData.recipes.prefix(5)),
                                                            canMake: 12, leftOut: 3))
    }
}

#Preview("Meal ideas door") {
    MealIdeasDoor(kitchenKnown: true) { _ in }.padding(20).pageBackground()
}
#endif
