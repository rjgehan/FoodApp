import SwiftUI

/**
 A day (the mockup's 2.4): pick a meal along the top — Breakfast, Lunch, Dinner, each saying what
 is in it — and work on that one meal underneath. Its main and sides with their roles, the
 servings, the optional extras being skipped, Swap, Time and Delete, and the one big action:
 putting this meal on the grocery list. Tap a dish for its options.
*/
struct PlanDaySheet: View {
    let store: PlanStore
    let date: String

    @Environment(\.dismiss) private var dismiss
    @State private var meal: MealType
    @State private var filling: SlotTarget?
    @State private var options: UUID?
    @State private var timing = false
    @State private var removing = false
    @State private var busy = false
    @State private var notice: String?
    @State private var draft = ServingsDraft()

    init(store: PlanStore, date: String, meal: MealType? = nil) {
        self.store = store
        self.date = date
        let planned = store.entries(on: date)
        let start = meal ?? (planned.contains { $0.mealType == .dinner } ? .dinner : planned.first?.mealType ?? .dinner)
        _meal = State(initialValue: start)
    }

    private var day: Date { Day.date(date) ?? Date() }
    private func dishes(_ m: MealType) -> [MealPlanEntry] { store.entries(on: date).filter { $0.mealType == m } }

    private var subtitle: String {
        let cal = Calendar.current
        if cal.isDateInToday(day) { return "Today" }
        if cal.isDateInTomorrow(day) { return "Tomorrow" }
        if cal.isDateInYesterday(day) { return "Yesterday" }
        return cal.isDate(day, equalTo: Date(), toGranularity: .year)
            ? day.formatted(.dateTime.month(.wide)) : day.formatted(.dateTime.month(.wide).year())
    }

    var body: some View {
        let current = dishes(meal)
        let slots: [MealType] = [.breakfast, .lunch, .dinner] + (meal == .snack || !dishes(.snack).isEmpty ? [.snack] : [])
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(PlanText.longDay(day), subtitle: subtitle, onClose: { dismiss() })

                HStack(spacing: 8) {
                    ForEach(slots, id: \.self) { m in
                        let on = m == meal
                        Button { withAnimation(.snappy(duration: 0.2)) { meal = m } } label: {
                            VStack(spacing: 4) {
                                Text(m.title).font(.system(size: 13, weight: .semibold))
                                Text(PlanText.count(dishes(m))).font(.system(size: 11)).opacity(0.7)
                            }
                            .foregroundStyle(on ? Palette.bg : Palette.text)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(on ? Palette.text : Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                if !on { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1) }
                            }
                            .contentShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }

                if let notice {
                    NoteBox(notice, tone: .herb, systemImage: "checkmark.circle")
                }
                if let error = store.error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }

                if current.isEmpty {
                    empty
                } else {
                    mealCard(current)
                    actions(current)
                }

                if !slots.contains(.snack) {
                    Button { meal = .snack } label: { Label("Add a snack", systemImage: "plus") }
                        .buttonStyle(.ghost)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
        .kitchenSheet([.large])
        .fullScreenCover(item: $filling) { target in FillSlotView(store: store, target: target) }
        .sheet(item: Binding(get: { options.map { RecipeRef(id: $0) } }, set: { options = $0?.id })) { ref in
            MealOptionsSheet(store: store, entryId: ref.id)
        }
        .sheet(isPresented: $timing) {
            TimeSheet(title: "\(meal.title) time", initial: PlanText.time(current)) { time in
                try? await store.patch(current, time.map { ["time": $0] } ?? ["clearTime": true])
            }
        }
        .alert("Remove \(meal.title.lowercased())?", isPresented: $removing) {
            Button("Remove", role: .destructive) {
                Task {
                    busy = true
                    try? await store.remove(current)
                    busy = false
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(current.count <= 1 ? "\(current.first?.label ?? "It") comes off \(day.formatted(.dateTime.weekday(.wide)))."
                 : "\(current[0].label) and \(current.count - 1) \(current.count == 2 ? "side" : "sides") come off \(day.formatted(.dateTime.weekday(.wide))).")
        }
        #if DEBUG
        .onAppear {
            // -mp_debug_expand 1: the first dish's options straight away, for screenshot runs.
            if UserDefaults.standard.bool(forKey: "mp_debug_expand"), options == nil {
                options = current.first?.id
            }
        }
        #endif
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Text("Nothing planned for \(meal.title.lowercased()) yet.")
                .font(.system(size: 15)).foregroundStyle(Palette.muted)
            Button {
                filling = SlotTarget(date: date, meal: meal)
            } label: {
                Label("Plan \(meal.title.lowercased())", systemImage: "plus")
            }
            .buttonStyle(.kitchen(.primary, size: .small, fill: false))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    private func mealCard(_ dishes: [MealPlanEntry]) -> some View {
        let main = dishes[0]
        let hasRecipe = dishes.contains { $0.recipeId != nil }
        let skipped: [RecipeIngredient] = dishes.filter(\.contributes).flatMap { d in
            (d.recipeId.flatMap { store.recipeById[$0] }?.ingredients ?? [])
                .filter { $0.optional && !(d.includedOptionalIngredientIds ?? []).contains($0.id) }
        }
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(meal.title + (PlanText.clock(PlanText.time(dishes)).map { " · \($0)" } ?? ""))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.text)
                Spacer(minLength: 8)
                if hasRecipe {
                    ServingsStepper(value: draft.binding(saved: dishes.first { $0.recipeId != nil }?.servings ?? store.defaultServings) { value in
                        try? await store.patch(dishes.filter { $0.recipeId != nil }, ["servings": value])
                    }, label: true)
                }
            }
            ForEach(Array(dishes.enumerated()), id: \.element.id) { index, dish in
                let recipe = dish.recipeId.flatMap { store.recipeById[$0] }
                Button { options = dish.id } label: {
                    HStack(spacing: 12) {
                        MealPicture(entry: dish, recipe: recipe, size: 44, radius: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(dish.label).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                            Text(dish.placeId != nil ? (dish.placeId.flatMap { store.placeById[$0]?.notes } ?? "Eat out")
                                 : PlanText.detail(dish, recipe: recipe))
                                .font(.system(size: 12))
                                .foregroundStyle(dish.needsIngredients == true || dish.recipeDeleted == true ? Palette.accentInk : Palette.muted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if dish.placeId == nil {
                            Pill(index == 0 ? "Main" : "Side", tone: index == 0 ? .accent : .mustard)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("\(dish.label), \(index == 0 ? "main" : "side")")
                .accessibilityHint("Shows what you can do with it")
            }
            if PlanText.takesSides(dishes) {
                Button {
                    filling = SlotTarget(date: date, meal: meal, side: true)
                } label: {
                    Label("Add a side", systemImage: "plus").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(Palette.accentInk)
                .buttonStyle(PressFade())
            }
            if main.placeId != nil {
                NoteBox("Eating out, so there is nothing to buy.", tone: .plum, systemImage: "fork.knife")
            }
            if !skipped.isEmpty {
                NoteBox(text: Text("Skipping this time: ")
                        + skipped.enumerated().reduce(Text("")) { acc, pair in
                            acc + Text(pair.offset > 0 ? ", " : "") + Text(pair.element.ingredientName).bold()
                        }
                        + Text(" (optional)"),
                        tone: .mustard, systemImage: "leaf")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func actions(_ dishes: [MealPlanEntry]) -> some View {
        let cooked = dishes.filter(\.contributes)
        let listed = SlotMark.of(dishes, shopping: store.shopping)?.label == "On grocery list"
        return VStack(spacing: 12) {
            HStack(spacing: 8) {
                Button { filling = SlotTarget(date: date, meal: meal, replacing: dishes[0]) } label: {
                    Label("Swap", systemImage: "arrow.left.arrow.right")
                }
                .buttonStyle(.kitchen(.secondary, size: .small))
                Button { timing = true } label: { Label("Time", systemImage: "clock") }
                    .buttonStyle(.kitchen(.secondary, size: .small))
                Button { removing = true } label: { Image(systemName: "trash") }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                    .frame(width: 52)
                    .accessibilityLabel("Remove \(meal.title.lowercased())")
            }
            .disabled(busy)
            if !cooked.isEmpty {
                Button {
                    Task {
                        busy = true
                        defer { busy = false }
                        do {
                            try await store.addToGroceries(cooked)
                            withAnimation { notice = "\(meal.title) added to Groceries" }
                        } catch {
                            store.error = "Could not add that to Groceries."
                        }
                    }
                } label: {
                    Label(listed ? "\(meal.title) is on the list" : "Add \(meal.title.lowercased()) to groceries",
                          systemImage: listed ? "checkmark" : "cart")
                }
                .buttonStyle(listed ? .secondary : .primary)
                .disabled(busy)
            }
        }
    }
}

#Preview("Day") {
    let store = PlanStore(session: .preview, sample: SampleData.plan)
    return Color.clear.sheet(isPresented: .constant(true)) {
        PlanDaySheet(store: store, date: Day.iso(Date()))
    }
}
