import SwiftUI

/*
 Cook from your cupboard (the mockup's 5.8 and 5.9): choose the days, the meals, what to use up
 first and how much you are willing to buy; the server builds a draft from your existing recipes;
 swap any meal, put the few missing things on the grocery list, and apply it to the Plan.

 On a phone with Apple Intelligence the model takes part where it helps (MealPlanAssist.swift):
 it guesses which undated things want using soon, chooses the week from the server's candidates
 and chooses swaps — every pick checked here and again by the server. Without it, or if it fails,
 this is the server's plan, exactly as the web shows it.
*/

/// A draft on its way to the result screen: what was asked, what came back, what the model chose.
struct CupboardDraft: Hashable, Identifiable {
    let id = UUID()
    let request: CupboardPlanRequest
    var plan: CupboardPlan
    /// Slots whose meal is the model's own pick.
    var marked: Set<String> = []
}

// MARK: - 5.8 Setup

struct CupboardSetupScreen: View {
    var session: Session
    @Binding var path: NavigationPath
    /// Previews: this instead of the server.
    var sample: CupboardSetup?

    @State private var setup: CupboardSetup?
    @State private var failed = false
    @State private var dates: Set<String> = []
    @State private var meals: Set<MealType> = []
    @State private var useFirst: [UUID] = []
    @State private var buyLimit: Int? = 5
    @State private var onlyMine = true
    @State private var servings = 4
    @State private var editing = false
    @State private var busy = false
    @State private var working: String?
    @State private var error: String?
    @State private var guessing = false
    @State private var result: CupboardDraft?
    @State private var availability = MealPlansAvailability.shared
    #if DEBUG
    @State private var debugOpened = false
    #endif

    private var count: Int { dates.count * meals.count }
    /// Only the slots with nothing on the Plan yet: the draft never goes over a planned meal.
    private var open: Int {
        guard let setup else { return count }
        return dates.reduce(0) { n, date in
            let planned = setup.days.first { $0.date == date }?.planned ?? []
            return n + meals.filter { !planned.contains($0) }.count
        }
    }
    private var chosen: [UseFirstItem] { (setup?.useFirst ?? []).filter { useFirst.contains($0.ingredientId) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let setup {
                    form(setup)
                } else if failed {
                    MealPlansLoadFailed(message: "Could not open your cupboard.") { Task { await load() } }
                } else {
                    MealPlansLoading(text: "Opening your cupboard…")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("From your cupboard")
        .textBackButton("Plans")
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
        .sheet(isPresented: $editing) {
            if let setup { UseFirstSheet(items: setup.useFirst, chosen: $useFirst) }
        }
        .navigationDestination(item: $result) { draft in
            CupboardResultScreen(session: session, path: $path, draft: draft)
        }
    }

    @ViewBuilder private func form(_ setup: CupboardSetup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Days").padding(.horizontal, -4)
            HStack(spacing: 6) {
                ForEach(setup.days, id: \.date) { d in
                    DayTile(weekday: NutritionText.weekday(d.date), date: MealPlanText.dayOfMonth(d.date),
                            on: dates.contains(d.date), planned: !d.planned.isEmpty) { toggle(&dates, d.date) }
                        .accessibilityLabel("\(NutritionText.weekday(d.date, short: false)) \(MealPlanText.dayOfMonth(d.date))"
                                            + (d.planned.isEmpty ? "" : ", something planned already"))
                }
            }
            SectionLabel("Meals").padding(.horizontal, -4).padding(.top, 2)
            ChipFlow(spacing: 8) {
                ForEach(MealPlanText.order, id: \.self) { m in
                    Chip(MealPlanText.chip(m), isOn: meals.contains(m)) { toggle(&meals, m) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionLabel("Use these up first").padding(.horizontal, -4)
                Spacer()
                if !setup.useFirst.isEmpty {
                    Button("Edit") { editing = true }
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.accentInk)
                        .buttonStyle(PressFade())
                }
            }
            if !chosen.isEmpty {
                ChipFlow(spacing: 6) {
                    ForEach(chosen) { u in UseFirstChip(item: u) }
                }
            } else {
                Text(setup.useFirst.isEmpty
                     ? (setup.items == 0 ? "Your cupboard is empty, so every meal will need shopping for." : "Nothing needs using up soon.")
                     : "Nothing chosen: the plan just uses whatever is in.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
            }
            if let past = setup.pastDate, !past.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Past its date: check before eating", systemImage: "exclamationmark.triangle")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.danger)
                    Text("\(past.map(\.name).joined(separator: ", ")). \(past.count == 1 ? "It isn't" : "They aren't") used in the plan.")
                        .font(.system(size: 13)).foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.accentSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityElement(children: .combine)
            }
            if guessing {
                ModelWorkingNote(text: "Apple Intelligence is checking what else wants using soon…")
            } else if setup.useFirst.contains(where: { $0.reason == "ai" }) {
                HStack(spacing: 8) {
                    AppleIntelligenceMark()
                    Text("guessed the ones marked \(Image(systemName: "sparkles"))").font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Extra things to buy")
                Spacer()
                Text(MealPlanText.buyText(buyLimit))
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Palette.text)
            ChoiceTiles(selection: $buyLimit, options: [(0, "None"), (5, "5"), (10, "10"), (nil, "Any")])
            Rectangle().fill(Palette.border).frame(height: 1).padding(.vertical, 2)
            Toggle(isOn: $onlyMine) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Only my recipes").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    Text("Off: may use global recipes too").font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
            }
            .toggleStyle(.herb)
            HStack {
                Text("Servings").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                Spacer()
                ServingsStepper(value: $servings)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        if let error {
            NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle")
        }
        if let working {
            ModelWorkingNote(text: working)
        }
        Button {
            Task { await generate() }
        } label: {
            Label(busy ? "Building…" : count == 0 ? "Choose days and meals"
                  : open == 0 ? "Those meals are planned already" : "Generate \(open) \(open == 1 ? "meal" : "meals")",
                  systemImage: "sparkles")
        }
        .buttonStyle(.primary)
        .disabled(busy || open == 0)
        if open > 0 && open < count {
            Text("\(count - open) of the \(count) are on the Plan already and stay as they are.")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private func toggle<T: Hashable>(_ set: inout Set<T>, _ value: T) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }

    private func load() async {
        let loaded: CupboardSetup
        if let sample {
            loaded = sample
        } else {
            guard let household = session.household?.id else { return }
            do {
                loaded = try await APIClient.shared.cupboardSetup(household: household)
            } catch is CancellationError {
                return
            } catch {
                failed = setup == nil
                return
            }
        }
        // The server's starting point, the first time in.
        if setup == nil {
            dates = Set(loaded.days.prefix(loaded.defaultDays).map(\.date))
            meals = Set(loaded.defaultMeals)
            useFirst = loaded.useFirst.filter(\.selected).map(\.ingredientId)
            buyLimit = loaded.defaultBuyLimit
            onlyMine = loaded.defaultOnlyMine
            servings = loaded.defaultServings
        }
        setup = loaded
        failed = false
        await guessUseSoon(loaded)
        #if DEBUG
        if !debugOpened, UserDefaults.standard.string(forKey: "mp_debug_screen") == "meal-plans-result" {
            debugOpened = true
            await generate()
        }
        #endif
    }

    /// Apple Intelligence's turn: things nobody dated that the server's rule could not judge.
    private func guessUseSoon(_ loaded: CupboardSetup) async {
        guard let thinker = MealPlanAI.thinker, let unsure = loaded.unsure, !unsure.isEmpty else { return }
        let known = Set(loaded.useFirst.map(\.ingredientId))
        let ask = unsure.filter { !known.contains($0.ingredientId) }
        guard !ask.isEmpty else { return }
        guessing = true
        let guesses = await MealPlanAssist.useSoonGuesses(ask, today: NutritionText.day(0), thinker: thinker,
                                                          memory: DefaultsShelfMemory())
        guessing = false
        guard !guesses.isEmpty, var now = setup else { return }
        let added = guesses.map(MealPlanAssist.suggestion).filter { g in !now.useFirst.contains { $0.ingredientId == g.ingredientId } }
        now.useFirst.append(contentsOf: added)
        setup = now
        useFirst.append(contentsOf: added.map(\.ingredientId).filter { !useFirst.contains($0) })
    }

    private func generate() async {
        guard let household = session.household?.id, open > 0, setup != nil else { return }
        let request = CupboardPlanRequest(dates: dates.sorted(), meals: MealPlanText.order.filter { meals.contains($0) },
                                          useFirst: useFirst, buyLimit: buyLimit, onlyMine: onlyMine, servings: servings)
        busy = true
        error = nil
        defer {
            busy = false
            working = nil
        }
        // A sample has no server to ask.
        guard sample == nil else { return }
        do {
            let (plan, marked) = try await CupboardDraftMaker.build(household: household, request: request) { text in
                working = text
            }
            result = CupboardDraft(request: request, plan: plan, marked: marked)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Could not build a plan. Try again."
        }
    }
}

/// "Spinach  by Thu" on mustard: a thing to use up first, and why. The model's guesses wear ✨.
struct UseFirstChip: View {
    let item: UseFirstItem

    var body: some View {
        HStack(spacing: 6) {
            Text(item.name).fontWeight(.semibold)
            Text(item.label).fontWeight(.medium).opacity(0.75)
            if item.reason == "ai" {
                Image(systemName: "sparkles").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.plum)
                    .accessibilityLabel("guessed by Apple Intelligence")
            }
        }
        .font(.system(size: 13))
        .foregroundStyle(Palette.mustard)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Palette.mustardSoft, in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

/// "Use these up first": every suggestion, ticked or not.
private struct UseFirstSheet: View {
    let items: [UseFirstItem]
    @Binding var chosen: [UUID]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader("Use these up first", subtitle: "Meals that use these are chosen first.", onClose: { dismiss() })
            ScrollView {
                ListGroup(dividerInset: 50) {
                    ForEach(items) { u in
                        let on = chosen.contains(u.ingredientId)
                        Button {
                            if on { chosen.removeAll { $0 == u.ingredientId } } else { chosen.append(u.ingredientId) }
                        } label: {
                            ListRow(u.name, leading: { CheckBox(isOn: on) }) {
                                if u.reason == "ai" { ModelChoseMark() }
                                Pill(u.label, tone: u.reason == "plenty" ? .sky : .mustard)
                            }
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            Button("Done") { dismiss() }.buttonStyle(.primary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .kitchenSheet([.medium, .large])
    }
}

/**
 Asks for a draft: with Apple Intelligence, the model chooses the week from the server's
 candidates and the server checks every pick; without it, or if anything fails on the way, the
 server's own plan. Returns the plan and the slots whose meal is the model's.
 */
enum CupboardDraftMaker {
    @MainActor
    static func build(household: UUID, request: CupboardPlanRequest,
                      working: @escaping @MainActor (String?) -> Void) async throws -> (CupboardPlan, Set<String>) {
        await MealPlansAvailability.shared.check()
        if let thinker = MealPlanAI.thinker, MealPlansAvailability.shared.takesChoices,
           let candidates = try? await APIClient.shared.cupboardCandidates(household: household, setup: request) {
            working("Apple Intelligence is choosing from your recipes…")
            let picks = await MealPlanAssist.cupboardPlan(candidates, setup: request, thinker: thinker) { day, of in
                await working("Apple Intelligence is choosing… day \(day) of \(of)")
            }
            if let picks {
                var asked = request
                asked.chosen = picks
                if let plan = try? await APIClient.shared.cupboardPlan(household: household, request: asked) {
                    return (plan, MealPlanAssist.chosenByModel(plan.meals, picks: picks))
                }
            }
        }
        working(nil)
        return (try await APIClient.shared.cupboardPlan(household: household, request: request), [])
    }
}

// MARK: - 5.9 Result

struct CupboardResultScreen: View {
    var session: Session
    @Binding var path: NavigationPath
    @State var draft: CupboardDraft

    @State private var seen: [String: [UUID]] = [:]
    @State private var busy: String?
    @State private var adding = false
    @State private var words: String?
    @State private var working: String?
    @State private var toast: String?
    @State private var opened: OpenedRecipe?

    private var plan: CupboardPlan { draft.plan }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                summary
                if !draft.marked.isEmpty { ModelChoseNote(chosen: draft.marked.count, total: plan.meals.count) }
                if let working { ModelWorkingNote(text: working) }
                if let words { ModelWords(text: words) }
                ForEach(days, id: \.self) { date in dayCard(date) }
                if !plan.toBuy.isEmpty { toBuyCard }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom) {
            MealPlanBottomBar {
                Button { Task { await apply() } } label: {
                    Label(busy == "apply" ? "Planning…" : "Apply to Plan · \(MealPlanText.dateRange(plan.meals.map(\.date)))",
                          systemImage: "calendar")
                }
                .buttonStyle(.primary)
                .disabled(busy != nil || plan.meals.isEmpty)
            }
        }
        .pageBackground()
        .centeredTitle("Cupboard plan")
        .textBackButton("Setup")
        .toolbar {
            BareToolbarItem(placement: .topBarTrailing) {
                Button { Task { await regenerate() } } label: {
                    Group {
                        if busy == "all" { ProgressView().controlSize(.small) } else {
                            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 18, weight: .medium))
                        }
                    }
                    .foregroundStyle(Palette.accentInk)
                    .frame(width: 36, height: 36)
                }
                .disabled(busy != nil)
                .accessibilityLabel("Choose again")
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .mealPlanToast(toast)
        .navigationDestination(item: $opened) { o in MealRecipeScreen(session: session, recipeId: o.id, yours: o.yours) }
        .task { await describe() }
    }

    private var days: [String] {
        Array(Set(plan.meals.map(\.date) + plan.open.map(\.date))).sorted()
    }

    private var summary: some View {
        HStack(spacing: 14) {
            PercentRing(percent: plan.percentFromCupboard, tone: plan.percentFromCupboard >= 50 ? Palette.herb : Palette.mustard)
            VStack(alignment: .leading, spacing: 4) {
                Text(plan.meals.isEmpty ? "Nothing fits yet" : "\(plan.percentFromCupboard)% from your cupboard")
                    .font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                Text(plan.meals.isEmpty ? "Allow more things to buy, or global recipes, and try again." : plan.summary)
                    .font(.system(size: 13)).foregroundStyle(Palette.muted).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .cardSurface()
    }

    private enum Row: Hashable {
        case meal(DraftMeal)
        case open(OpenSlot)
        var type: MealType {
            switch self {
            case .meal(let m): return m.mealType
            case .open(let o): return o.mealType
            }
        }
    }

    private func dayCard(_ date: String) -> some View {
        let rows = (plan.meals.filter { $0.date == date }.map(Row.meal) + plan.open.filter { $0.date == date }.map(Row.open))
            .sorted { (MealPlanText.order.firstIndex(of: $0.type) ?? 0) < (MealPlanText.order.firstIndex(of: $1.type) ?? 0) }
        return VStack(alignment: .leading, spacing: 6) {
            SectionLabel(MealPlanText.dayAndDate(date)).padding(.horizontal, -4)
            ListGroup(dividerInset: 68) {
                ForEach(rows, id: \.self) { row in
                    switch row {
                    case .meal(let m): mealRow(m)
                    case .open(let o): openRow(o)
                    }
                }
            }
        }
    }

    private func mealRow(_ m: DraftMeal) -> some View {
        MealRowView(title: m.name, subtitle: m.yours ? m.mealType.title : "\(m.mealType.title) · Global recipe",
                    picture: PlanMealPicture(recipeId: m.recipeId, name: m.name, section: m.section,
                                         coverImageId: m.coverImageId, meal: m.mealType)) {
            if draft.marked.contains(m.slot) { ModelChoseMark() }
            CupboardPill(percent: m.percentFromCupboard)
            SwapButton(label: "Swap \(m.name)", busy: busy == m.slot) { Task { await swap(m) } }
                .padding(.trailing, -6)
                .disabled(busy != nil && busy != m.slot)
        }
        .onTapGesture { opened = OpenedRecipe(id: m.recipeId, yours: m.yours) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(m.mealType.title): \(m.name)")
    }

    private func openRow(_ o: OpenSlot) -> some View {
        let planned = o.reason == "PLANNED"
        return MealRowView(title: planned ? "Already planned" : "Nothing fits",
                           subtitle: planned ? "\(o.mealType.title) · left as it is" : "\(o.mealType.title) · allow more to buy for this one",
                           muted: true,
                           picture: Image(systemName: planned ? "calendar" : "nosign").font(.system(size: 17))
                            .foregroundStyle(Palette.faint).frame(width: 44, height: 44)
                            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))) {
            EmptyView()
        }
    }

    private var toBuyCard: some View {
        HStack(spacing: 12) {
            Tile("cart", tone: .mustard, size: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(plan.toBuy.count) \(plan.toBuy.count == 1 ? "thing" : "things") to buy")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                Text(adding ? "Going on the grocery list with the plan" : plan.toBuy.map(\.name).joined(separator: ", "))
                    .font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                adding.toggle()
            } label: {
                HStack(spacing: 4) {
                    if adding { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)) }
                    Text(adding ? "Adding" : "Add")
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(adding ? Palette.herb : Palette.accentInk)
            }
            .buttonStyle(PressFade())
            .accessibilityAddTraits(adding ? .isSelected : [])
            .accessibilityLabel(adding ? "Adding the things to buy to the grocery list" : "Add the things to buy to the grocery list")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .cardSurface()
    }

    // MARK: Doing things

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(2.4))
            if toast == text { toast = nil }
        }
    }

    /// The model's few words, once; the server's summary is there either way.
    private func describe() async {
        guard words == nil, let thinker = MealPlanAI.thinker else { return }
        words = await MealPlanAssist.words(MealPlanAssist.facts(plan), thinker: thinker)
    }

    private func regenerate() async {
        guard let household = session.household?.id else { return }
        busy = "all"
        defer {
            busy = nil
            working = nil
        }
        do {
            let (fresh, marked) = try await CupboardDraftMaker.build(household: household, request: draft.request) { text in
                working = text
            }
            draft.plan = fresh
            draft.marked = marked
            seen = [:]
            words = nil
            await describe()
        } catch {
            say((error as? APIError)?.errorDescription ?? "Could not build a plan.")
        }
    }

    private func swap(_ meal: DraftMeal) async {
        guard let household = session.household?.id else { return }
        let key = meal.slot
        let shown = Array(Set((seen[key] ?? []) + [meal.recipeId]))
        let slot = SlotRef(date: meal.date, mealType: meal.mealType)
        busy = key
        defer { busy = nil }
        var wanted: UUID?
        await MealPlansAvailability.shared.check()
        if let thinker = MealPlanAI.thinker, MealPlansAvailability.shared.takesChoices,
           let c = try? await APIClient.shared.cupboardCandidates(household: household, setup: draft.request, plan: plan,
                                                                  slot: slot, exclude: shown) {
            wanted = await MealPlanAssist.cupboardSwap(c, plan: plan, slot: slot, thinker: thinker)
        }
        do {
            let next = try await APIClient.shared.cupboardSwap(household: household, setup: draft.request, plan: plan,
                                                                slot: slot, exclude: shown, recipeId: wanted)
            if next.swapped == false {
                say("Nothing else fits \(meal.mealType.title.lowercased()) on \(MealPlanText.dayAndDate(meal.date)).")
            }
            draft.plan = next
            draft.marked.remove(key)
            if let wanted, next.meals.contains(where: { $0.slot == key && $0.recipeId == wanted }) { draft.marked.insert(key) }
            seen[key] = shown
        } catch {
            say((error as? APIError)?.errorDescription ?? "Could not swap that meal.")
        }
    }

    private func apply() async {
        guard let household = session.household?.id else { return }
        busy = "apply"
        do {
            let result = try await APIClient.shared.applyMeals(
                household: household,
                meals: plan.meals.map { ($0.date, $0.mealType, $0.recipeId, $0.servings) },
                addToGroceries: adding ? plan.toBuy.compactMap(\.ingredientId) : [])
            let meals = "\(result.added) \(result.added == 1 ? "meal" : "meals")"
            let groceries = result.groceriesAdded > 0
                ? " and \(result.groceriesAdded) \(result.groceriesAdded == 1 ? "thing" : "things") to buy" : ""
            say(result.added > 0 ? "Planned \(meals)\(groceries)" : "Those meals were planned already")
            try? await Task.sleep(for: .seconds(1.1))
            busy = nil
            MealPlansNavigation.showPlan(path: $path)
        } catch {
            busy = nil
            say((error as? APIError)?.errorDescription ?? "Could not put it on the Plan.")
        }
    }
}

/// A recipe opened from a plan: one of yours on the recipe page, a published one read-only.
struct OpenedRecipe: Hashable, Identifiable {
    let id: UUID
    let yours: Bool
}

struct MealRecipeScreen: View {
    var session: Session
    let recipeId: UUID
    let yours: Bool

    @State private var recipe: Recipe?
    @State private var error: String?

    var body: some View {
        Group {
            if let recipe {
                if yours { RecipeDetailView(recipe: recipe, session: session) } else { GlobalRecipeScreen(recipe: recipe, session: session) }
            } else {
                PlannedRecipeLoading(error: error)
            }
        }
        .task {
            do {
                recipe = try await APIClient.shared.recipe(recipeId, household: session.household?.id)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// After a plan goes on the Plan: back to Meal plans here, and the Plan tab to the front.
enum MealPlansNavigation {
    @MainActor
    static func showPlan(path: Binding<NavigationPath>) {
        NotificationCenter.default.post(name: .planChanged, object: nil)
        if path.wrappedValue.count > 1 { path.wrappedValue.removeLast(path.wrappedValue.count - 1) }
        NotificationCenter.default.post(name: .showTab, object: "plan")
    }
}

#Preview("Cupboard setup") {
    @Previewable @State var path = NavigationPath()
    NavigationStack { CupboardSetupScreen(session: .preview, path: $path, sample: MealPlanSamples.setup) }
}

#Preview("Cupboard setup — dark") {
    @Previewable @State var path = NavigationPath()
    NavigationStack { CupboardSetupScreen(session: .preview, path: $path, sample: MealPlanSamples.setup) }
        .preferredColorScheme(.dark)
}

#Preview("Cupboard plan") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        CupboardResultScreen(session: .preview, path: $path,
                             draft: CupboardDraft(request: MealPlanSamples.request, plan: MealPlanSamples.draft,
                                                  marked: [MealPlanSamples.draft.meals[0].slot]))
    }
}

#Preview("Cupboard plan — dark") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        CupboardResultScreen(session: .preview, path: $path,
                             draft: CupboardDraft(request: MealPlanSamples.request, plan: MealPlanSamples.draft))
    }
    .preferredColorScheme(.dark)
}
