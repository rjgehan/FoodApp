import SwiftUI

/**
 Recipe → Plan without leaving the recipe (the mockup's 3.10): a day inside the planning window
 as a row of tiles, a meal as four, then add — "Add to Tue · Dinner". If that meal already has
 something in it, it says so first: the recipe goes in beside it as a side. The same as the
 web's sheet.

 A saved link plans the same way, minus the servings and extras it has no ingredients for.
 */
struct AddToPlanSheet: View {
    let recipe: Recipe?
    var savedLink: SavedLink? = nil
    var session: Session?
    var onPlanned: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var dayIndex = 0
    @State private var meal: MealType
    /// Which optional ingredients to buy this time. None, unless somebody ticks them.
    @State private var extras: Set<UUID> = []
    /// What is planned in the window already, to say what a meal has in it.
    @State private var planned: [MealPlanEntry] = []
    @State private var busy = false
    @State private var error: String?

    init(recipe: Recipe, session: Session?, onPlanned: @escaping (String) -> Void) {
        self.init(recipe: recipe, savedLink: nil, section: recipe.section, session: session, onPlanned: onPlanned)
    }

    init(savedLink: SavedLink, session: Session?, onPlanned: @escaping (String) -> Void) {
        self.init(recipe: nil, savedLink: savedLink, section: savedLink.section, session: session, onPlanned: onPlanned)
    }

    private init(recipe: Recipe?, savedLink: SavedLink?, section: RecipeSection?, session: Session?,
                 onPlanned: @escaping (String) -> Void) {
        self.recipe = recipe
        self.savedLink = savedLink
        self.session = session
        self.onPlanned = onPlanned
        // The meal it most likely goes on, from where it is filed — the web's MEAL_FOR_SECTION.
        let likely: MealType = switch section {
        case .breakfast: .breakfast
        case .lunch: .lunch
        case .snacks, .drinks: .snack
        case .dinner, .other, nil: .dinner
        }
        _meal = State(initialValue: likely)
    }

    /// The household's planning window, from today.
    private var days: [Date] {
        let window = max(session?.household?.planningHorizonDays ?? 7, 1)
        return (0..<window).map { Day.adding($0, to: Date()) }
    }
    private var day: Date { days[min(dayIndex, days.count - 1)] }
    private var optional: [RecipeIngredient] { (recipe?.ingredients ?? []).filter(\.optional) }
    private var name: String { recipe?.name ?? savedLink?.name ?? "This" }

    /// "Tue", or "Tue 6" when the window has two Tuesdays in it.
    private var dayName: String {
        let weekday = day.formatted(.dateTime.weekday(.abbreviated))
        return days.count > 7 ? "\(weekday) \(Calendar.current.component(.day, from: day))" : weekday
    }
    private var when: String { "\(dayName) · \(meal.title)" }

    private var inSlot: [MealPlanEntry] {
        planned.filter { $0.date == Day.iso(day) && $0.mealType == meal && $0.recipeDeleted != true }
    }
    private func isThis(_ entry: MealPlanEntry) -> Bool {
        if let recipe { return entry.recipeId == recipe.id }
        if let savedLink { return entry.savedLinkId == savedLink.id }
        return false
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Add to plan", subtitle: name, onClose: { dismiss() })

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Day")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(days.enumerated()), id: \.offset) { i, date in
                                dayTile(date, on: i == dayIndex) { dayIndex = i }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.horizontal, -20)
                }

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Meal")
                    HStack(spacing: 8) {
                        ForEach(MealType.allCases, id: \.self) { kind in
                            mealTile(kind, on: kind == meal) { meal = kind }
                        }
                    }
                }

                if inSlot.contains(where: isThis) {
                    NoteBox("\(name) is already on \(dayName) \(meal.title.lowercased()).",
                            tone: .mustard, systemImage: "exclamationmark.circle")
                } else if let first = inSlot.first {
                    let more = inSlot.count > 1 ? " and \(inSlot.count - 1) more" : ""
                    NoteBox("\(dayName) \(meal.title.lowercased()) already has \(first.recipeName ?? first.placeName ?? first.itemName ?? "something")\(more) planned. This will be added as a side.",
                            tone: .mustard, systemImage: "exclamationmark.circle")
                }

                if !optional.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        SectionLabel("Buying the optional extras?")
                        ForEach(optional) { ingredient in
                            OptionalExtraRow(ingredient: ingredient, isOn: extras.contains(ingredient.id)) {
                                if extras.contains(ingredient.id) { extras.remove(ingredient.id) }
                                else { extras.insert(ingredient.id) }
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }

                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }

                Button {
                    Task { await add() }
                } label: {
                    if busy { ProgressView().tint(Palette.onAccent) } else { Text("Add to \(when)") }
                }
                .buttonStyle(.primary)
                .disabled(busy || inSlot.contains(where: isThis))
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
        .scrollBounceBehavior(.basedOnSize)
        .pageBackground()
        .task { await loadPlan() }
        // Full height from the start when there are extras to tick, so Add stays on screen.
        .kitchenSheet(optional.isEmpty ? [.medium, .large] : [.large])
    }

    private func dayTile(_ date: Date, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(date.formatted(.dateTime.weekday(.abbreviated)))
                    .font(.system(size: 11, weight: .semibold))
                    .opacity(0.8)
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.system(size: 17, weight: .semibold))
                    .monospacedDigit()
            }
            .foregroundStyle(on ? Palette.onAccent : Palette.text)
            .frame(width: 50)
            .padding(.vertical, 10)
            .background(on ? Palette.accent : Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                if !on { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1) }
            }
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func mealTile(_ kind: MealType, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol(kind)).font(.system(size: 19))
                Text(kind.title).font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Palette.bg : Palette.text)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(on ? Palette.text : Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                if !on { RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1) }
            }
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(kind.title)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func symbol(_ kind: MealType) -> String {
        switch kind {
        case .breakfast: "cup.and.saucer"
        case .lunch: "takeoutbag.and.cup.and.straw"
        case .dinner: "fork.knife"
        case .snack: "carrot"
        }
    }

    private func loadPlan() async {
        guard let household = session?.household?.id, let last = days.last else { return }
        planned = (try? await APIClient.shared.plan(household: household, from: Day.iso(days[0]), to: Day.iso(last))) ?? []
    }

    private func add() async {
        guard let household = session?.household?.id else {
            error = "No household."
            return
        }
        busy = true
        defer { busy = false }
        do {
            if let recipe {
                _ = try await APIClient.shared.addToPlan(
                    household: household,
                    date: Day.iso(day),
                    meal: meal,
                    recipeId: recipe.id,
                    // The household's usual number, like the web; the recipe's own if the server
                    // has not said.
                    servings: session?.defaultServings ?? recipe.servings,
                    includedOptionalIngredientIds: Array(extras)
                )
            } else if let savedLink {
                _ = try await APIClient.shared.addToPlan(
                    household: household, date: Day.iso(day), meal: meal, savedLinkId: savedLink.id)
            }
            onPlanned(when)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Add to plan") {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddToPlanSheet(recipe: SampleData.recipes[0], session: .preview) { _ in }
    }
}

#Preview("Add to plan — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddToPlanSheet(recipe: SampleData.recipes[1], session: .preview) { _ in }
    }
    .preferredColorScheme(.dark)
}
