import SwiftUI


/**
 The month on a card (the mockup's 2.1): the planning window tinted green so "we plan a week
 ahead" is something you can see, a dot under each day with something on it, today in tomato.
 Every day is a button — that is how an empty Thursday gets its dinner. Days before the 1st are
 left blank; the grid runs on past the month's end as far as the planning window does.
*/
struct PlanCalendar: View {
    @Binding var monthCursor: Date
    let byDate: [String: [MealPlanEntry]]
    let horizonDays: Int
    var onPick: (String) -> Void

    private let today = Date().startOfDay
    private var horizonEnd: Date { Day.adding(horizonDays - 1, to: today) }
    private var thisMonth: Bool { Calendar.current.isDate(monthCursor, equalTo: today, toGranularity: .month) }

    /// Blanks before the 1st, then every day to the end of the week the month (or the window) ends in.
    private var cells: [Date?] {
        let first = monthCursor.startOfMonth
        let lead = (Calendar.current.component(.weekday, from: first) + 5) % 7
        let last = monthCursor.endOfMonth
        let runTo = horizonEnd > last && (Calendar.current.dateComponents([.day], from: last, to: horizonEnd).day ?? 99) < 40 ? horizonEnd : last
        let tail = 6 - (Calendar.current.component(.weekday, from: runTo) + 5) % 7
        let end = Day.adding(tail, to: runTo)
        let count = (Calendar.current.dateComponents([.day], from: first, to: end).day ?? 0) + 1
        return Array(repeating: nil, count: lead) + (0..<count).map { Day.adding($0, to: first) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(monthCursor.formatted(.dateTime.month(.wide).year()))
                    .titleFont(20)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Button("Today") { monthCursor = Date().startOfMonth }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.accentInk)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Palette.accentSoft, in: Capsule())
                    .buttonStyle(PressFade())
                IconButton("chevron.left", size: 32, label: "Previous month") { step(-1) }
                IconButton("chevron.right", size: 32, label: "Next month") { step(1) }
            }
            .padding(.leading, 4)

            let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, d in
                    Text(d).font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                        .accessibilityHidden(true)
                }
                ForEach(Array(cells.enumerated()), id: \.offset) { _, day in
                    if let day { cell(day) } else { Color.clear.frame(height: 38) }
                }
            }

            HStack(spacing: 14) {
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 4).fill(Palette.herbSoft).frame(width: 12, height: 12)
                    Text("Planning window · \(horizonDays) \(horizonDays == 1 ? "day" : "days")")
                }
                HStack(spacing: 6) {
                    Circle().fill(Palette.herb).frame(width: 6, height: 6)
                    Text("Planned")
                }
            }
            .font(.system(size: 12))
            .foregroundStyle(Palette.muted)
            .padding(.horizontal, 4)
            .padding(.top, 4)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .cardSurface()
    }

    private func cell(_ day: Date) -> some View {
        let key = Day.iso(day)
        let planned = (byDate[key] ?? []).filter(\.isPlanned)
        let isToday = Calendar.current.isDateInToday(day)
        let past = day < today
        let inWindow = day >= today && day <= horizonEnd
        let inMonth = Calendar.current.isDate(day, equalTo: monthCursor, toGranularity: .month)
        let ink: Color = isToday ? Palette.onAccent : (past || !inMonth) && !inWindow ? Palette.muted : Palette.text
        let dot: Color = planned.isEmpty ? .clear : isToday ? Palette.onAccent : past ? Palette.faint : Palette.herb
        return Button {
            onPick(key)
        } label: {
            VStack(spacing: 3) {
                Text(day.formatted(.dateTime.day()))
                    .font(.system(size: 15, weight: isToday || inWindow ? .semibold : .regular))
                Circle().fill(dot).frame(width: 5, height: 5)
            }
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity, minHeight: 38)
            .background {
                if isToday {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Palette.accent)
                } else if inWindow {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Palette.herbSoft)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(day.formatted(.dateTime.month(.wide).day()) + (planned.isEmpty ? "" : ", \(planned.count) planned"))
    }

    private func step(_ months: Int) {
        monthCursor = Calendar.current.date(byAdding: .month, value: months, to: monthCursor)?.startOfMonth ?? monthCursor
    }
}

/**
 The top of Upcoming (the mockup's 2.2): the planning window at a glance — how many of its days
 have something planned, how many meals are still not on the list, a strip of the days — and the
 one big action, putting it all on the grocery list.
*/
struct PlanWindowCard: View {
    let horizonDays: Int
    let byDate: [String: [MealPlanEntry]]
    let shopping: ShoppingMap?
    var onPick: (String) -> Void
    var onAdd: () -> Void

    var body: some View {
        let today = Date().startOfDay
        let days = (0..<horizonDays).map { Day.adding($0, to: today) }
        let planned = days.filter { (byDate[Day.iso($0)] ?? []).contains(where: \.isPlanned) }
        let notOnList = shopping == nil ? 0 : days
            .flatMap { PlanText.slots(byDate[Day.iso($0)] ?? []) }
            .filter { SlotMark.of($0.dishes, shopping: shopping)?.canAdd == true }
            .count
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    SectionLabel("Next \(horizonDays == 1 ? "day" : "\(horizonDays) days")")
                    Text("\(planned.count) of \(horizonDays) \(horizonDays == 1 ? "day" : "days") planned")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Palette.text)
                }
                Spacer(minLength: 8)
                if notOnList > 0 {
                    Pill("\(notOnList) not on list", tone: .mustard, systemImage: "exclamationmark.circle").padding(.top, 2)
                } else if shopping != nil && !planned.isEmpty {
                    Pill("All on the list", tone: .herb, systemImage: "checkmark").padding(.top, 2)
                }
            }
            // Seven fit across a phone, spread edge to edge; a longer window scrolls sideways.
            if horizonDays <= 7 {
                HStack(spacing: 0) {
                    ForEach(Array(days.enumerated()), id: \.offset) { index, day in
                        if index > 0 { Spacer(minLength: 2) }
                        dayButton(day, first: index == 0)
                    }
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(Array(days.enumerated()), id: \.offset) { index, day in dayButton(day, first: index == 0) }
                    }
                }
            }
            Button(action: onAdd) {
                Label(horizonDays == 7 ? "Add week to groceries" : "Add \(horizonDays) days to groceries", systemImage: "cart")
            }
            .buttonStyle(.primary)
        }
        .padding(16)
        .cardSurface()
        .shadow(color: Palette.shadow.opacity(2), radius: 14, y: 8)
    }

    private func dayButton(_ day: Date, first: Bool) -> some View {
        let has = (byDate[Day.iso(day)] ?? []).contains(where: \.isPlanned)
        return Button { onPick(Day.iso(day)) } label: {
            VStack(spacing: 4) {
                Text(day.formatted(.dateTime.weekday(.narrow)))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(first ? Palette.onAccent : Palette.muted)
                Text(day.formatted(.dateTime.day())).font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(first ? Palette.onAccent : Palette.text)
                Circle().fill(has ? (first ? Palette.onAccent : Palette.herb) : Palette.border)
                    .frame(width: 6, height: 6)
            }
            .frame(width: 38)
            .padding(.vertical, 8)
            .background {
                if first { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Palette.accent) }
            }
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(day.formatted(.dateTime.weekday(.wide).month(.wide).day()) + (has ? ", planned" : ""))
    }
}
