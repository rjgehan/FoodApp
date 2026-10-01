import SwiftUI

/**
 The Plan, the app's home (the mockup's 2.1 and 2.2). Two views of the same meals:

 Calendar comes first — the month with the planning window tinted and a dot on every planned
 day, then the next planned days underneath ("Coming up"). Upcoming is the shopping view — the
 planning window as one card with the one big action, putting it on the grocery list, then only
 the days that have something planned, each meal saying where it stands with the shopping.

 Tapping a day, on either, opens the day sheet; holding a meal opens its options. The day sheet,
 a slot's fill screen and the options all work on the same PlanStore, so they always agree.
*/
struct PlanView: View {
    var session: Session
    @State private var store: PlanStore
    @AppStorage("mp_planView") private var view = "calendar"
    @State private var monthCursor = Date().startOfMonth
    @State private var openDay: DayOpen?
    @State private var options: RecipeRef?
    @State private var adding: AddingWindow?
    @State private var notice: String?
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    #if DEBUG
    @State private var debugFill: SlotTarget?
    @State private var debugCreate = false
    @State private var debugExtras: Recipe?
    #endif

    /// A day to open, and which of its meals.
    struct DayOpen: Identifiable {
        let date: String
        var meal: MealType?
        var id: String { date }
    }

    struct AddingWindow: Identifiable {
        let id = UUID()
        let entries: [MealPlanEntry]
        let shopping: ShoppingMap?
    }

    init(session: Session, sample: [MealPlanEntry]? = nil) {
        self.session = session
        _store = State(initialValue: PlanStore(session: session, sample: sample))
    }

    private var today: Date { Date().startOfDay }
    private var horizonEnd: Date { Day.adding(store.horizonDays - 1, to: today) }
    private var viewingThisMonth: Bool { Calendar.current.isDate(monthCursor, equalTo: today, toGranularity: .month) }

    /// The days with something on them, from `from` to `to`.
    private func plannedDays(_ from: Date, _ to: Date) -> [Date] {
        let byDate = store.byDate
        var days: [Date] = []
        var d = from
        while d <= to {
            if (byDate[Day.iso(d)] ?? []).contains(where: \.isPlanned) { days.append(d) }
            d = Day.adding(1, to: d)
        }
        return days
    }

    /*
     From today on — what you still have to cook — on this month; any other month is that whole
     month, which is how you look back at what you ate (or ahead at what is booked).
    */
    private var comingUp: [Date] {
        viewingThisMonth
            ? plannedDays(today, max(horizonEnd, monthCursor.endOfMonth))
            : plannedDays(monthCursor.startOfMonth, monthCursor.endOfMonth)
    }

    private var windowWords: String { store.horizonDays == 1 ? "1 day" : "\(store.horizonDays) days" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(session: session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
                    LargeTitle("Plan", over: today.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    VStack(alignment: .leading, spacing: 14) {
                        SegmentedControl(selection: $view, options: [("calendar", "Calendar"), ("upcoming", "Upcoming")])
                        if let notice {
                            NoteBox(notice, tone: .herb, systemImage: "checkmark.circle")
                        }
                        if let error = store.error, !store.sample {
                            Text(error).font(.footnote).foregroundStyle(Palette.danger)
                        }
                        if view == "upcoming" { upcoming } else { calendar }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
            }
            .pageBackground()
            .hidesNavigationBar()
            .refreshable { await store.reload() }
            // Deleting a recipe takes its planned meals with it.
            .onReceive(NotificationCenter.default.publisher(for: .recipesChanged)) { _ in
                Task {
                    await store.reload()
                    await store.loadPickings()
                }
            }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
        }
        .task(id: monthCursor) {
            await store.load(month: monthCursor)
            #if DEBUG
            debugOpen()
            #endif
        }
        .task { await store.loadPickings() }
        .sheet(item: $openDay) { open in PlanDaySheet(store: store, date: open.date, meal: open.meal) }
        .sheet(item: $options) { ref in MealOptionsSheet(store: store, entryId: ref.id) }
        .sheet(item: $adding) { window in
            AddWindowSheet(store: store, entries: window.entries, shopping: window.shopping) { days in
                withAnimation { notice = "Added \(days) \(days == 1 ? "day" : "days") to Groceries" }
            }
        }
        #if DEBUG
        .fullScreenCover(item: $debugFill) { target in FillSlotView(store: store, target: target) }
        .sheet(isPresented: $debugCreate) {
            CreateFromSlotSheet(store: store, initialName: "Chicken pot pie", meal: .dinner, day: Day.adding(2, to: today)) { _ in }
        }
        .sheet(item: $debugExtras) { recipe in
            ExtrasSheet(recipe: recipe, selected: Set(recipe.ingredients.filter(\.optional).prefix(2).map(\.id))) { _ in }
        }
        #endif
    }

    // MARK: - Calendar

    private var calendar: some View {
        VStack(alignment: .leading, spacing: 14) {
            PlanCalendar(monthCursor: $monthCursor, byDate: store.byDate, horizonDays: store.horizonDays) { key in
                openDay = DayOpen(date: key)
            }
            HStack {
                Text(viewingThisMonth ? "Coming up"
                     : monthCursor.formatted(Calendar.current.isDate(monthCursor, equalTo: today, toGranularity: .year)
                                             ? .dateTime.month(.wide) : .dateTime.month(.wide).year()))
                    .titleFont(20)
                    .foregroundStyle(Palette.text)
                Spacer()
                // Plan → Groceries covers the planning window — the days being shopped for — not
                // whichever month is on screen.
                Button { Task { await openAddWindow() } } label: { Label("Add \(windowWords)", systemImage: "cart") }
                    .buttonStyle(.kitchen(.soft, size: .small, fill: false))
                    .accessibilityLabel("Add the next \(windowWords) to groceries")
            }
            .padding(.top, 8)
            let days = comingUp
            if days.isEmpty {
                emptyLine(!store.loaded ? "Loading…"
                          : viewingThisMonth ? "Nothing planned from today on. Tap a day to start."
                          : monthCursor < today ? "Nothing was planned in \(monthCursor.formatted(.dateTime.month(.wide)))."
                          : "Nothing planned in \(monthCursor.formatted(.dateTime.month(.wide))) yet. Tap a day to start.")
            } else {
                ForEach(days, id: \.self) { dayBlock($0) }
            }
        }
    }

    // MARK: - Upcoming

    private var upcoming: some View {
        VStack(alignment: .leading, spacing: 16) {
            PlanWindowCard(horizonDays: store.horizonDays, byDate: store.byDate, shopping: store.shopping,
                           onPick: { openDay = DayOpen(date: $0) },
                           onAdd: { Task { await openAddWindow() } })
            let days = plannedDays(today, Day.adding(max(store.horizonDays, 31), to: today))
            if days.isEmpty {
                emptyLine(store.loaded ? "Nothing planned from today on. Tap a day above to start." : "Loading…")
            } else {
                ForEach(days, id: \.self) { dayBlock($0) }
            }
        }
    }

    private func dayBlock(_ day: Date) -> some View {
        PlanDayBlock(day: day, entries: store.byDate[Day.iso(day)] ?? [], recipes: store.recipeById,
                     places: store.placeById, shopping: store.shopping,
                     onOpen: { slot in openDay = DayOpen(date: Day.iso(day), meal: slot.meal) },
                     onOptions: { slot in options = RecipeRef(id: slot.main.id) },
                     onAdd: { slot in Task { await addSlot(slot) } })
    }

    private func emptyLine(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15))
            .foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
    }

    // MARK: - Groceries

    private func openAddWindow() async {
        let (entries, shopping) = await store.window()
        adding = AddingWindow(entries: entries, shopping: shopping)
    }

    /// "+ Add" beside "Not on list": just that meal's cooking, the way its own button does it.
    private func addSlot(_ slot: PlanSlot) async {
        do {
            try await store.addToGroceries(slot.dishes.filter(\.contributes))
            withAnimation { notice = "\(slot.meal.title) added to Groceries" }
        } catch {
            store.error = "Could not add that to Groceries."
        }
    }

    #if DEBUG
    /**
     Screenshot runs: -mp_debug_plan upcoming opens on Upcoming; -mp_debug_screen day | options |
     addweek | fill | fillout | create | extras opens that Plan screen once the plan is in —
     today's day sheet, the first dish's options, the add sheet, filling Thursday's dinner (eat in
     or out), a new recipe from a slot, and the extras question.
    */
    private func debugOpen() {
        guard !debugOpened else { return }
        debugOpened = true
        let defaults = UserDefaults.standard
        if let v = defaults.string(forKey: "mp_debug_plan") { view = v }
        let todayKey = Day.iso(today)
        switch defaults.string(forKey: "mp_debug_screen") {
        case "day":
            openDay = DayOpen(date: todayKey)
        case "options":
            let target = store.entries.first { $0.date >= todayKey && $0.contributes && ($0.recipeId.flatMap { store.recipeById[$0] }?.ingredients.contains(where: \.optional) ?? false) && $0.date != todayKey }
                ?? store.entries.first { $0.date >= todayKey && $0.isPlanned }
            options = target.map { RecipeRef(id: $0.id) }
        case "addweek":
            Task { await openAddWindow() }
        case "fill":
            let later = store.entries.first { $0.date > todayKey && $0.contributes && $0.mealType == .dinner }
            debugFill = SlotTarget(date: later?.date ?? Day.iso(Day.adding(2, to: today)), meal: .dinner, replacing: later)
        case "fillout":
            let out = store.entries.first { $0.placeId != nil }
            debugFill = SlotTarget(date: out?.date ?? Day.iso(Day.adding(1, to: today)), meal: .dinner, replacing: out)
        case "create":
            debugCreate = true
        case "extras":
            debugExtras = store.recipes.first { $0.ingredients.filter(\.optional).count >= 3 }
        default:
            break
        }
    }
    #endif
}

#if DEBUG
private var debugOpened = false
#endif

#Preview("Plan") {
    PlanView(session: .preview, sample: SampleData.plan)
}

#Preview("Plan — dark") {
    PlanView(session: .preview, sample: SampleData.plan).preferredColorScheme(.dark)
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


/// A planned saved link's cover, small, beside its name — or the link drawn where there is none.
struct PlannedLinkPicture: View {
    let imageId: UUID?

    var body: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Palette.surface2)
            .frame(width: 44, height: 44)
            .overlay {
                if let imageId, let url = APIClient.shared.imageURL(imageId) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                } else {
                    Image(systemName: "link").foregroundStyle(.secondary)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
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
struct PlannedRecipeView: View {
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
struct PlannedRecipeEditor: View {
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

