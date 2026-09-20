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
        } catch {
            self.error = error.localizedDescription
        }
    }
}

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

/// One day: what is on it, and the ways to change that. The web opens the same thing.
struct DaySheet: View {
    let date: String
    var session: Session
    let meals: [MealPlanEntry]
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var picking: MealType?
    @State private var recipes: [Recipe] = []
    @State private var busy = false
    @State private var error: String?

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
                            HStack {
                                Text(entry.label)
                                Spacer()
                                if let servings = entry.servings {
                                    Text("serves \(servings)").font(.subheadline).foregroundStyle(.secondary)
                                }
                            }
                            .swipeActions {
                                Button("Remove", systemImage: "trash", role: .destructive) {
                                    Task { await remove(entry) }
                                }
                            }
                        }
                        Button("Add", systemImage: "plus") { picking = meal }
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
        }
        // Full height: at .medium the meals below Breakfast were cut off and needed a scroll
        // before you could see what was on the day.
        .presentationDetents([.large])
        .task { await loadRecipes() }
        .sheet(item: $picking) { meal in
            RecipePicker(recipes: recipes) { recipe in
                Task { await add(recipe, to: meal) }
            }
        }
    }

    private func loadRecipes() async {
        guard let household = session.household?.id, recipes.isEmpty else { return }
        recipes = (try? await APIClient.shared.recipes(household: household)) ?? []
    }

    private func add(_ recipe: Recipe, to meal: MealType) async {
        guard let household = session.household?.id else { return }
        do {
            _ = try await APIClient.shared.addToPlan(household: household, date: date, meal: meal, recipeId: recipe.id)
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ entry: MealPlanEntry) async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.removeFromPlan(household: household, entry: entry.id)
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

extension MealType: Identifiable {
    public var id: String { rawValue }
}

/// Pick something to cook. Search, then tap.
struct RecipePicker: View {
    let recipes: [Recipe]
    var onPick: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var shown: [Recipe] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? recipes : recipes.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            List(shown) { recipe in
                Button {
                    onPick(recipe)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(recipe.name)
                        Text(recipe.facts).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            .searchable(text: $query, prompt: "Search recipes")
            .navigationTitle("Add a meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
