import SwiftUI

/// The plan, shaped the way the web version now is: the days that actually have something on
/// them, then the month underneath for the whole picture.
struct PlanView: View {
    var session: Session
    /// Injected so the gallery can render this screen with sample data and no backend.
    var sample: [MealPlanEntry]?

    @State private var entries: [MealPlanEntry] = []
    @State private var monthCursor = Date().startOfMonth
    @State private var error: String?
    @State private var loading = false
    @State private var openDay: String?
    @State private var addingToGroceries = false
    @State private var added = false
    @State private var switchingHousehold = false
    @State private var showingAccount = false

    private var byDate: [String: [MealPlanEntry]] {
        Dictionary(grouping: entries, by: \.date)
    }

    /// Only the days with meals: on this month, from today forward; on any other, all of it.
    private var planDays: [(day: Date, meals: [MealPlanEntry])] {
        let today = Date().startOfDay
        let viewingThisMonth = Calendar.current.isDate(monthCursor, equalTo: today, toGranularity: .month)
        let from = viewingThisMonth ? today : monthCursor
        let to = monthCursor.endOfMonth
        return stride(from: 0, through: max(0, Calendar.current.dateComponents([.day], from: from, to: to).day ?? 0), by: 1)
            .map { Day.adding($0, to: from) }
            .compactMap { day in
                let meals = byDate[Day.iso(day)] ?? []
                return meals.isEmpty ? nil : (day, meals.sorted { $0.mealType.order < $1.mealType.order })
            }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let error {
                        Text(error).foregroundStyle(.red).font(.callout)
                    }

                    if planDays.isEmpty {
                        Text(loading ? "Loading…" : "Nothing planned from today on. Pick a day below to start.")
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 24)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(planDays, id: \.day) { entry in
                                    Button {
                                        openDay = Day.iso(entry.day)
                                    } label: {
                                        DayCard(day: entry.day, meals: entry.meals)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .scrollClipDisabled()
                    }

                    // Plan → Groceries, over the planning window rather than the month on
                    // screen: these are the days actually being shopped for.
                    Button {
                        addingToGroceries = true
                    } label: {
                        Label(added ? "Added to Groceries" : "Add \(windowLabel) to Groceries", systemImage: added ? "checkmark" : "cart")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(added)
                    .padding(.horizontal, 16)

                    MonthGrid(monthCursor: $monthCursor, byDate: byDate) { key in
                        openDay = key
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 8)
            }
            .navigationTitle("Plan")
            .refreshable { await load() }
            .householdHeader(session, switching: $switchingHousehold, account: $showingAccount)
        }
        .task(id: monthCursor) { await load() }
        .sheet(item: Binding(get: { openDay.map(DayKey.init) }, set: { openDay = $0?.value })) { key in
            DaySheet(date: key.value, session: session, meals: byDate[key.value] ?? []) {
                await load()
            }
        }
        .confirmationDialog(
            "Add \(windowLabel) to Groceries?",
            isPresented: $addingToGroceries,
            titleVisibility: .visible
        ) {
            Button("Add them") { Task { await addWindowToGroceries() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Everything planned in the window goes on the list, minus what the cupboard says you have.")
        }
    }

    /// The planning window from Settings, which runs from today — not the month on screen.
    private var horizonEnd: Date { Day.adding(6, to: Date().startOfDay) }
    private var windowLabel: String {
        let from = Date().formatted(.dateTime.month(.abbreviated).day())
        let to = horizonEnd.formatted(.dateTime.month(.abbreviated).day())
        return "\(from) – \(to)"
    }

    private func addWindowToGroceries() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.addRangeToGroceries(
                household: household,
                from: Day.iso(Date()),
                to: Day.iso(horizonEnd)
            )
            withAnimation { added = true }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func load() async {
        if let sample {
            entries = sample
            return
        }
        guard let household = session.household?.id else { return }
        loading = true
        defer { loading = false }
        do {
            error = nil
            entries = try await APIClient.shared.plan(
                household: household,
                from: Day.iso(monthCursor.startOfMonth),
                to: Day.iso(monthCursor.endOfMonth)
            )
            #if DEBUG
            // -mp_debug_screen day opens today's sheet once the plan is in, for screenshot runs.
            // Once: launch arguments cannot be removed, so without the flag every pull to
            // refresh would open it again.
            if UserDefaults.standard.string(forKey: "mp_debug_screen") == "day", !debugDayOpened {
                debugDayOpened = true
                openDay = Day.iso(Date())
            }
            #endif
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#if DEBUG
private var debugDayOpened = false
#endif

/// One planned day, wide enough to read the meals on it.
private struct DayCard: View {
    let day: Date
    let meals: [MealPlanEntry]

    private var isToday: Bool { Calendar.current.isDateInToday(day) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(isToday ? "Today" : day.formatted(.dateTime.weekday(.abbreviated)))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(isToday ? Color.accentColor : .secondary)
            Text(day.formatted(.dateTime.day()))
                .font(.title.weight(.semibold))

            VStack(alignment: .leading, spacing: 4) {
                ForEach(meals.prefix(3)) { meal in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(meal.mealType.title).font(.caption).foregroundStyle(.secondary)
                        Text(meal.label).font(.subheadline).lineLimit(1)
                    }
                }
                if meals.count > 3 {
                    Text("+\(meals.count - 3) more").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.top, 2)
        }
        .frame(width: 148, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isToday ? Color.accentColor.opacity(0.12) : Color(.secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isToday ? Color.accentColor : Color(.separator), lineWidth: isToday ? 1.5 : 0.5)
        )
    }
}

/// The month: the overview, and the way to reach a day that is not in the rail above.
private struct MonthGrid: View {
    @Binding var monthCursor: Date
    let byDate: [String: [MealPlanEntry]]
    /// Every square is tappable, empty ones included — that is how a day that is not in the
    /// rail above gets something on it.
    let onPick: (String) -> Void

    private var days: [Date] {
        let first = monthCursor.startOfMonth
        let leading = Calendar.current.component(.weekday, from: first) - 1
        let start = Day.adding(-leading, to: first)
        let last = monthCursor.endOfMonth
        let trailing = 7 - Calendar.current.component(.weekday, from: last)
        let count = (Calendar.current.dateComponents([.day], from: start, to: Day.adding(trailing, to: last)).day ?? 0) + 1
        return (0..<count).map { Day.adding($0, to: start) }
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button("Previous month", systemImage: "chevron.left") { step(-1) }
                    .labelStyle(.iconOnly)
                Spacer()
                Text(monthCursor.formatted(.dateTime.month(.wide).year()))
                    .font(.headline)
                Spacer()
                Button("Next month", systemImage: "chevron.right") { step(1) }
                    .labelStyle(.iconOnly)
            }

            HStack(spacing: 4) {
                ForEach(Array(Calendar.current.veryShortStandaloneWeekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(days, id: \.self) { day in
                    let meals = byDate[Day.iso(day)] ?? []
                    let inMonth = Calendar.current.isDate(day, equalTo: monthCursor, toGranularity: .month)
                    Button { onPick(Day.iso(day)) } label: {
                    VStack(spacing: 4) {
                        Text(day.formatted(.dateTime.day()))
                            .font(.subheadline)
                            .frame(width: 30, height: 30)
                            .background {
                                if Calendar.current.isDateInToday(day) {
                                    Circle().fill(Color.accentColor)
                                }
                            }
                            .foregroundStyle(Calendar.current.isDateInToday(day) ? Color.white : Color.primary)
                        HStack(spacing: 3) {
                            ForEach(0..<min(meals.count, 4), id: \.self) { _ in
                                Circle().fill(Color.accentColor).frame(width: 5, height: 5)
                            }
                        }
                        .frame(height: 6)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .opacity(inMonth ? 1 : 0.35)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func step(_ months: Int) {
        monthCursor = Calendar.current.date(byAdding: .month, value: months, to: monthCursor) ?? monthCursor
    }
}

extension MealType {
    /// Eating order, so a day reads top to bottom the way it happens.
    var order: Int {
        switch self {
        case .breakfast: 0
        case .lunch: 1
        case .dinner: 2
        case .snack: 3
        }
    }
}

extension Date {
    var startOfDay: Date { Calendar.current.startOfDay(for: self) }
    var startOfMonth: Date {
        Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: self)) ?? self
    }
    var endOfMonth: Date {
        let next = Calendar.current.date(byAdding: DateComponents(month: 1, day: -1), to: startOfMonth)
        return next ?? self
    }
}

#Preview("Plan") {
    PlanView(session: .preview, sample: SampleData.plan)
}


/// `sheet(item:)` needs something Identifiable; a date string is not.
struct DayKey: Identifiable, Hashable {
    let value: String
    var id: String { value }
    init(_ value: String) { self.value = value }
}

/// What the recipe picker is open for: a new dish on a meal, or another recipe in place of
/// one already planned.
enum PlanPick: Identifiable {
    case add(MealType)
    case change(MealPlanEntry)

    var id: String {
        switch self {
        case .add(let meal): "add:\(meal.rawValue)"
        case .change(let entry): "change:\(entry.id.uuidString)"
        }
    }
}

/**
 One day: what is on it, and the ways to change that. The web opens the same thing.

 Tapping a dish opens its actions underneath it, the way the web's day sheet does: look at the
 recipe, say how many it is for, swap it for another, or take it off. Remove is a button as
 well as a swipe, because a swipe is a shortcut for people who already know it is there.
*/
struct DaySheet: View {
    let date: String
    var session: Session
    let meals: [MealPlanEntry]
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var picking: PlanPick?
    @State private var busy = false
    @State private var error: String?
    /// The dish whose actions are showing. One at a time, like the web.
    @State private var expanded: UUID?
    /// The recipe pushed by "View recipe".
    @State private var viewing: UUID?
    /// The name-only recipe opened in the editor by "Add ingredients".
    @State private var fillingIn: RecipeRef?
    /// Servings as they are being stepped, ahead of the save. Shown instead of the entry's own
    /// number until the reloaded plan catches up, so the stepper never jumps backwards.
    @State private var servingsDraft: [UUID: Int] = [:]
    @State private var servingsSaves: [UUID: Task<Void, Never>] = [:]

    private var day: Date { Day.date(date) ?? Date() }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                ForEach(MealType.allCases, id: \.self) { meal in
                    Section(meal.title) {
                        ForEach(meals.filter { $0.mealType == meal }) { entry in
                            entryRow(entry)
                            if expanded == entry.id {
                                actions(for: entry)
                            }
                        }
                        Button("Add", systemImage: "plus") { picking = .add(meal) }
                            .font(.subheadline)
                    }
                }

                Section {
                    Button("Add this day to Groceries", systemImage: "cart") {
                        Task { await addDayToGroceries() }
                    }
                    .disabled(busy || meals.isEmpty)
                }
            }
            .navigationTitle(day.formatted(.dateTime.weekday(.wide).month().day()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .navigationDestination(item: $viewing) { id in
                PlannedRecipeView(recipeId: id, session: session)
            }
            .sheet(item: $fillingIn) { ref in
                PlannedRecipeEditor(recipeId: ref.id, session: session) {
                    expanded = nil
                    // The plan works out "No ingredients yet" itself, so it has to be asked again.
                    Task { await onChanged() }
                }
            }
        }
        // Full height: at .medium the meals below Breakfast were cut off and needed a scroll
        // before you could see what was on the day.
        .presentationDetents([.large])
        #if DEBUG
        // With -mp_debug_expand 1, the first recipe on the day opens its actions straight away —
        // one its owners deleted counts, so that state can be screenshotted too.
        .onAppear {
            if UserDefaults.standard.bool(forKey: "mp_debug_expand") {
                expanded = meals.first { $0.recipeId != nil || $0.recipeDeleted == true }?.id
            }
        }
        #endif
        .sheet(item: $picking) { pick in
            switch pick {
            case .add(let meal):
                RecipePicker(session: session, title: "Add to \(meal.title)", action: "Add to \(meal.title)") { recipe, extras in
                    Task { await add(recipe, extras: extras, to: meal) }
                }
            case .change(let entry):
                RecipePicker(
                    session: session,
                    title: "Change \(entry.label)",
                    action: "Change to this",
                    current: entry.recipeId,
                    // Picking the same recipe again keeps what was chosen for it last time.
                    chosen: { $0.id == entry.recipeId ? entry.includedOptionalIngredientIds ?? [] : [] }
                ) { recipe, extras in
                    Task { await change(entry, to: recipe, extras: extras) }
                }
            }
        }
    }

    /// The dish itself. Tapping it shows what can be done with it.
    private func entryRow(_ entry: MealPlanEntry) -> some View {
        let open = expanded == entry.id
        return Button {
            withAnimation(.snappy) { expanded = open ? nil : entry.id }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.label).foregroundStyle(.primary)
                    if let detail = detail(for: entry) {
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(entry.needsIngredients == true || entry.recipeDeleted == true
                                             ? Palette.accent : .secondary)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .contentShape(Rectangle())
        }
        // Plain, or the whole row turns the accent colour and reads as a link.
        .buttonStyle(.plain)
        .accessibilityHint(open ? "Hides what you can do with it" : "Shows what you can do with it")
        .swipeActions {
            Button("Remove", systemImage: "trash", role: .destructive) {
                Task { await remove(entry) }
            }
        }
    }

    /// The second line under a dish: what it means for the cooking or the shopping.
    private func detail(for entry: MealPlanEntry) -> String? {
        if entry.recipeDeleted == true { return "Recipe was deleted" }
        if entry.recipeId != nil {
            if entry.needsIngredients == true { return "No ingredients yet" }
            let servings = servingsDraft[entry.id] ?? entry.servings
            return servings.map { "Serves \($0)" }
        }
        if entry.itemName != nil {
            if entry.runningLow == true { return "Running low" }
            return entry.inCupboard == true ? "In the cupboard" : "Not in the cupboard"
        }
        if let time = entry.time { return String(time.prefix(5)) }
        return nil
    }

    /// What can be done with a planned dish, one row each so every one is a full-width target.
    @ViewBuilder
    private func actions(for entry: MealPlanEntry) -> some View {
        if entry.recipeDeleted == true {
            Text("The household that shared this recipe has deleted it, so there is nothing to open. Change it to something else, or remove it.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        if let recipeId = entry.recipeId {
            // A recipe that is only a name has nothing to look at yet, so this goes straight
            // to the editor instead, as the web's "Add ingredients" does.
            let empty = entry.needsIngredients == true
            Button {
                if empty { fillingIn = RecipeRef(id: recipeId) } else { viewing = recipeId }
            } label: {
                HStack {
                    Label(empty ? "Add ingredients" : "View recipe", systemImage: empty ? "square.and.pencil" : "book")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .accessibilityIdentifier(empty ? "day.addIngredients" : "day.viewRecipe")

            // Servings are about cooking; nobody portions a takeaway in the app.
            Stepper(value: servingsBinding(entry), in: 1...50) {
                Label("Serves \(servingsBinding(entry).wrappedValue)", systemImage: "person.2")
            }
        }

        HStack {
            Button {
                picking = .change(entry)
            } label: {
                Label("Change", systemImage: "arrow.triangle.2.circlepath")
            }
            Spacer()
            Button(role: .destructive) {
                Task { await remove(entry) }
            } label: {
                Label("Remove", systemImage: "trash")
            }
            .foregroundStyle(.red)
        }
        // Two buttons in one row: borderless, or the List makes the whole row one button
        // and a tap anywhere presses both.
        .buttonStyle(.borderless)
        .disabled(busy)
    }

    private func servingsBinding(_ entry: MealPlanEntry) -> Binding<Int> {
        Binding(
            get: { servingsDraft[entry.id] ?? entry.servings ?? session.defaultServings ?? 4 },
            set: { value in
                servingsDraft[entry.id] = value
                saveServings(entry, value)
            }
        )
    }

    /**
     Saved once the tapping stops, not on every tap. Going from 4 to 10 is six taps, and six
     requests racing each other can land out of order and leave it at 7.
    */
    private func saveServings(_ entry: MealPlanEntry, _ value: Int) {
        servingsSaves[entry.id]?.cancel()
        servingsSaves[entry.id] = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled, let household = session.household?.id else { return }
            do {
                try await APIClient.shared.setPlanServings(household: household, entry: entry.id, servings: value)
            } catch {
                // A newer tap cancelled this one mid-flight; that tap's own save follows. A 404
                // is a dish removed while the save waited, which is what the person wanted.
                if Task.isCancelled || (error as? APIError)?.status == 404 { return }
                self.error = error.localizedDescription
                return
            }
            // Outside this task: a tap that cancels the next save must not cancel the plan's
            // reload with it, or the plan behind the sheet shows "cancelled" as its error.
            Task {
                await onChanged()
                if servingsDraft[entry.id] == value { servingsDraft[entry.id] = nil }
            }
        }
    }

    /// A save still waiting to go must not land on a dish that has just been taken off.
    private func dropServingsSave(_ entry: MealPlanEntry) {
        servingsSaves[entry.id]?.cancel()
        servingsSaves[entry.id] = nil
        servingsDraft[entry.id] = nil
    }

    private func add(_ recipe: Recipe, extras: [UUID], to meal: MealType) async {
        guard let household = session.household?.id else { return }
        do {
            error = nil
            _ = try await APIClient.shared.addToPlan(
                household: household, date: date, meal: meal, recipeId: recipe.id,
                servings: session.defaultServings, includedOptionalIngredientIds: extras)
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func change(_ entry: MealPlanEntry, to recipe: Recipe, extras: [UUID]) async {
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            error = nil
            try await APIClient.shared.changePlannedRecipe(
                household: household, entry: entry.id, recipeId: recipe.id,
                includedOptionalIngredientIds: extras,
                // A place or a single item has no servings; a recipe replacing one needs some.
                servings: entry.servings == nil ? session.defaultServings : nil)
            await onChanged()
            expanded = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ entry: MealPlanEntry) async {
        guard let household = session.household?.id else { return }
        dropServingsSave(entry)
        busy = true
        defer { busy = false }
        do {
            error = nil
            try await APIClient.shared.removeFromPlan(household: household, entry: entry.id)
            if expanded == entry.id { expanded = nil }
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func addDayToGroceries() async {
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.addRangeToGroceries(household: household, from: date, to: date)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// `sheet(item:)` needs something Identifiable; a bare UUID is not.
struct RecipeRef: Identifiable, Hashable {
    let id: UUID
}

/**
 A planned dish's recipe, pushed from the day. It is always fetched by id: a dish on the plan
 can be one another household shared, which this household's own list does not have.
*/
private struct PlannedRecipeView: View {
    let recipeId: UUID
    var session: Session

    @State private var recipe: Recipe?
    @State private var error: String?

    var body: some View {
        Group {
            if let recipe {
                RecipeDetailView(recipe: recipe, session: session)
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

/// "Add ingredients": the editor for a planned recipe that is only a name so far.
private struct PlannedRecipeEditor: View {
    let recipeId: UUID
    var session: Session
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var recipe: Recipe?
    @State private var error: String?

    var body: some View {
        Group {
            if let recipe {
                // The editor brings its own navigation bar, Cancel and Save.
                EditRecipeView(recipe: recipe, session: session) { _ in onSaved() }
            } else {
                // Until then, a bar of our own so there is a way back out.
                NavigationStack {
                    PlannedRecipeLoading(error: error)
                        .navigationTitle("Edit recipe")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                        }
                }
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

private struct PlannedRecipeLoading: View {
    let error: String?

    var body: some View {
        if let error {
            ContentUnavailableView("Could not open it", systemImage: "exclamationmark.triangle",
                                   description: Text(error))
        } else {
            ProgressView()
        }
    }
}

extension MealType: Identifiable {
    public var id: String { rawValue }
}

/**
 Pick something to cook. Search, then tap — and for a recipe with optional ingredients, say
 which of them you are buying this time, the way the web asks.

 It loads the household's recipes itself. It used to be handed the day's copy, but a sheet's
 content is built from what its parent last drew, and the day never drew that list — so the
 picker opened on a blank page even once the recipes had arrived.
*/
struct RecipePicker: View {
    var session: Session
    var title = "Add a meal"
    /// The button at the bottom of the extras step.
    var action = "Add"
    /// The recipe being replaced, ticked in the list so it is clear what Change is changing.
    var current: UUID?
    /// Extras already chosen for a recipe, so re-picking the same one keeps them.
    var chosen: (Recipe) -> [UUID] = { _ in [] }
    /// Recipes to show instead of asking the server, for previews.
    var sample: [Recipe]?
    var onPick: (Recipe, [UUID]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var askingExtras: Recipe?
    @State private var recipes: [Recipe]?
    @State private var error: String?

    private var shown: [Recipe] {
        let all = recipes ?? []
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? all : all.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let recipes, recipes.isEmpty {
                    ContentUnavailableView("No recipes yet", systemImage: "book",
                                           description: Text("Write one down on the Recipes tab, then plan it from here."))
                } else if recipes != nil {
                    list
                } else if let error {
                    ContentUnavailableView("Could not load recipes", systemImage: "exclamationmark.triangle",
                                           description: Text(error))
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
            .navigationDestination(item: $askingExtras) { recipe in
                OptionalExtrasPicker(recipe: recipe, selected: Set(chosen(recipe)), action: action) { extras in
                    onPick(recipe, extras)
                    dismiss()
                }
            }
        }
        .task { await load() }
    }

    private var list: some View {
        List(shown) { recipe in
            Button {
                // Asked once, here, rather than every time the meal goes on a list.
                if recipe.ingredients.contains(where: \.optional) {
                    askingExtras = recipe
                } else {
                    onPick(recipe, [])
                    dismiss()
                }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(recipe.name).foregroundStyle(.primary)
                        Text(recipe.facts).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    if recipe.id == current {
                        Image(systemName: "checkmark").foregroundStyle(Palette.accent)
                    }
                }
                .contentShape(Rectangle())
            }
            // Plain, or every row turns the accent colour and reads as a link.
            .buttonStyle(.plain)
            .accessibilityAddTraits(recipe.id == current ? .isSelected : [])
        }
        .overlay {
            if shown.isEmpty { ContentUnavailableView.search(text: query) }
        }
        .searchable(text: $query, prompt: "Search recipes")
    }

    private func load() async {
        if let sample {
            recipes = sample
            return
        }
        guard recipes == nil, let household = session.household?.id else { return }
        do {
            recipes = try await APIClient.shared.recipes(household: household)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Buying the optional extras this time?" — a step of its own after picking a recipe.
struct OptionalExtrasPicker: View {
    let recipe: Recipe
    @State var selected: Set<UUID>
    let action: String
    var onDone: ([UUID]) -> Void

    var body: some View {
        List {
            Section {
                ForEach(recipe.ingredients.filter(\.optional)) { ingredient in
                    OptionalExtraRow(ingredient: ingredient, isOn: selected.contains(ingredient.id)) {
                        if selected.contains(ingredient.id) { selected.remove(ingredient.id) }
                        else { selected.insert(ingredient.id) }
                    }
                }
            } header: {
                Text("Buying the optional extras this time?")
            } footer: {
                Text("Only the ticked ones go on the grocery list with this meal.")
            }

            Section {
                Button {
                    onDone(Array(selected))
                } label: {
                    Text(action).frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle(recipe.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One optional ingredient, ticked or not. Shared by the day's picker and Add to plan.
struct OptionalExtraRow: View {
    let ingredient: RecipeIngredient
    let isOn: Bool
    var toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isOn ? Palette.accent : Color(.tertiaryLabel))
                Text(ingredient.ingredientName).foregroundStyle(.primary)
                Spacer()
                if let amount = ingredient.amount {
                    Text(amount).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

#Preview("Day") {
    DaySheet(date: Day.iso(Date()), session: .preview, meals: SampleData.plan.filter { $0.date == Day.iso(Date()) }) {}
}

#Preview("Picker") {
    RecipePicker(session: .preview, title: "Add to Dinner", sample: SampleData.recipes) { _, _ in }
}

#Preview("Extras") {
    NavigationStack {
        OptionalExtrasPicker(recipe: SampleData.recipes[0], selected: [], action: "Add to Dinner") { _ in }
    }
}
