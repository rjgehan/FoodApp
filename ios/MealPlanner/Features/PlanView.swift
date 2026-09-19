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
                                    DayCard(day: entry.day, meals: entry.meals)
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                        .scrollClipDisabled()
                    }

                    MonthGrid(monthCursor: $monthCursor, byDate: byDate)
                        .padding(.horizontal, 16)
                }
                .padding(.vertical, 8)
            }
            .navigationTitle("Plan")
            .refreshable { await load() }
        }
        .task(id: monthCursor) { await load() }
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
