import SwiftUI

/**
 A planned dish's options (the mockup's 2.9): hold a meal on the plan, or tap a dish in the day
 sheet. Everything you can do to one dish, one full-width row each — swap it, its servings, its
 time, which optional extras, put it on the list, open it, take it off.

 A single food like "eggs" gets its own Add to groceries here: planning eggs does not mean
 needing eggs, so the week's button leaves it alone.
*/
struct MealOptionsSheet: View {
    let store: PlanStore
    let entryId: UUID

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var swapping: SlotTarget?
    @State private var timing = false
    @State private var extras: Recipe?
    @State private var viewing: UUID?
    @State private var fillingIn: RecipeRef?
    @State private var busy = false
    @State private var notice: String?
    @State private var draft = ServingsDraft()

    private var entry: MealPlanEntry? { store.entries.first { $0.id == entryId } }

    var body: some View {
        NavigationStack {
            Group {
                if let entry {
                    content(entry)
                } else {
                    // Removed — from here, or from another phone meanwhile.
                    Color.clear.onAppear { dismiss() }
                }
            }
            .pageBackground()
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $viewing) { id in PlannedRecipeView(recipeId: id, session: store.session) }
        }
        .kitchenSheet([.fraction(0.75), .large])
        .fullScreenCover(item: $swapping) { target in FillSlotView(store: store, target: target) }
        .sheet(isPresented: $timing) {
            if let entry {
                TimeSheet(title: "\(entry.mealType.title) time", initial: entry.time) { time in
                    try? await store.patch([entry], time.map { ["time": $0] } ?? ["clearTime": true])
                }
            }
        }
        .sheet(item: $extras) { recipe in
            if let entry {
                ExtrasSheet(recipe: recipe, selected: Set(entry.includedOptionalIngredientIds ?? []), editing: true) { chosen in
                    try? await store.patch([entry], ["includedOptionalIngredientIds": chosen.map(\.uuidString)])
                    extras = nil
                }
            }
        }
        .sheet(item: $fillingIn) { ref in
            PlannedRecipeEditor(recipeId: ref.id, session: store.session) {
                Task { await store.reload() }
            }
        }
    }

    private func content(_ entry: MealPlanEntry) -> some View {
        let recipe = entry.recipeId.flatMap { store.recipeById[$0] }
        let place = entry.placeId.flatMap { store.placeById[$0] }
        let optional = recipe?.ingredients.filter(\.optional) ?? []
        let chosen = optional.filter { (entry.includedOptionalIngredientIds ?? []).contains($0.id) }.count
        let shopping = store.shopping?[entry.id]
        let day = Day.date(entry.date) ?? Date()
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    MealPicture(entry: entry, recipe: recipe, size: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.label).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(2)
                        Text("\(PlanText.longDay(day)) · \(entry.mealType.title)").font(.system(size: 13)).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    IconButton("xmark", style: .plain, size: 32, label: "Close") { dismiss() }
                }
                if entry.recipeDeleted == true {
                    NoteBox((entry.savedLinkDeleted == true
                             ? "It was deleted from Saved links, so there is nothing to open. "
                             : "The household that shared this recipe has deleted it, so there is nothing to open. ")
                            + "Swap it for something else, or remove it.", tone: .accent, systemImage: "exclamationmark.circle")
                }
                if let notice {
                    NoteBox(notice, tone: .herb, systemImage: "checkmark.circle")
                }
                ListGroup {
                    rowButton { swapping = SlotTarget(date: entry.date, meal: entry.mealType, replacing: entry,
                                                      side: store.entries(on: entry.date).first { $0.mealType == entry.mealType }?.id != entry.id) } label: {
                        ListRow("Swap for something else", tile: ("arrow.left.arrow.right", .accent))
                    }
                    if entry.recipeId != nil {
                        ListRow("Servings", tile: ("person.2", .sky)) {
                            ServingsStepper(value: draft.binding(saved: entry.servings ?? store.defaultServings) { value in
                                try? await store.patch([entry], ["servings": value])
                            })
                        }
                    }
                    rowButton { timing = true } label: {
                        ListRow("Time", detail: PlanText.clock(entry.time) ?? "None", chevron: true, tile: ("clock", .mustard))
                    }
                    if !optional.isEmpty, let recipe {
                        rowButton { extras = recipe } label: {
                            ListRow("Optional ingredients", detail: "\(chosen) of \(optional.count)", chevron: true, tile: ("leaf", .herb))
                        }
                    }
                    if entry.contributes {
                        rowButton { add(entry) } label: {
                            ListRow("Add to groceries", subtitle: shopping.map(groceriesLine), tile: ("cart", .accent))
                        }
                    }
                    if let item = entry.itemName {
                        rowButton { add(entry) } label: {
                            ListRow("Add \(item) to groceries",
                                    subtitle: shopping?.status == .onList ? "Already on the list"
                                        : entry.runningLow == true ? "Running low"
                                        : entry.inCupboard == true ? "In the cupboard" : "Not in the cupboard",
                                    tile: ("cart", .accent))
                        }
                        .disabled(shopping?.status == .onList)
                    }
                    if let recipeId = entry.recipeId {
                        let empty = entry.needsIngredients == true
                        rowButton { if empty { fillingIn = RecipeRef(id: recipeId) } else { viewing = recipeId } } label: {
                            ListRow(empty ? "Add ingredients" : "Open recipe", chevron: true,
                                    tile: (empty ? "square.and.pencil" : "book", .plum))
                        }
                    }
                    if let link = entry.savedLinkUrl, let url = URL(string: link), entry.savedLinkId != nil {
                        rowButton { openURL(url) } label: {
                            ListRow("Open on \(SavedLink.label(source: entry.savedLinkSource, url: link))", tile: ("link", .plum)) {
                                Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
                            }
                        }
                    }
                    if let menu = place?.menuUrl, let url = URL(string: menu) {
                        rowButton { openURL(url) } label: { ListRow("Menu", tile: ("menucard", .plum)) }
                    }
                    if let phone = place?.phone, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                        rowButton { openURL(url) } label: { ListRow("Call \(phone)", tile: ("phone", .plum)) }
                    }
                    rowButton { remove(entry) } label: {
                        ListRow("Remove from plan", titleColor: Palette.accentInk, tile: ("trash", .accent))
                    }
                }
                .disabled(busy)
                if entry.savedLinkId != nil && entry.recipeDeleted != true {
                    Text("A saved link has no ingredients, so it adds nothing to Groceries.")
                        .font(.footnote).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 16)
        }
    }

    private func rowButton<L: View>(action: @escaping () -> Void, @ViewBuilder label: () -> L) -> some View {
        Button(action: action, label: label).buttonStyle(PressFade())
    }

    /// "11 items, 3 already in cupboard"
    private func groceriesLine(_ s: PlannedShopping) -> String {
        if s.needs == 0 { return "Nothing to buy — all staples" }
        let items = "\(s.needs) \(s.needs == 1 ? "item" : "items")"
        if s.status == .onList { return "\(items), already on the list" }
        return s.inCupboard > 0 ? "\(items), \(s.inCupboard) already in cupboard" : items
    }

    private func add(_ entry: MealPlanEntry) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await store.addToGroceries([entry])
                withAnimation { notice = "Added to Groceries" }
            } catch {
                withAnimation { notice = nil }
            }
        }
    }

    private func remove(_ entry: MealPlanEntry) {
        busy = true
        Task {
            defer { busy = false }
            try? await store.remove([entry])
            dismiss()
        }
    }
}

#Preview("Meal options") {
    let store = PlanStore(session: .preview, sample: SampleData.plan)
    return Color.clear.sheet(isPresented: .constant(true)) {
        MealOptionsSheet(store: store, entryId: store.entries[0].id)
    }
}
