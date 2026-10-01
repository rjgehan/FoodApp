import SwiftUI

/**
 "Add 5 days to groceries?" (the mockup's 2.3). It asks first, and names the days that will put
 something on the list — each with its meals and how many things it adds — so it is obvious at a
 glance whether you meant one day or seven. A day the list already has is shown unticked, so you
 can see why it is not counted. Counted by ingredient, as the list is: garlic on Tuesday and
 garlic on Thursday is one row. What adds nothing is said underneath.
*/
struct AddWindowSheet: View {
    let store: PlanStore
    let entries: [MealPlanEntry]
    let shopping: ShoppingMap?
    var onAdded: (Int) -> Void

    private struct Line: Identifiable {
        let date: String
        let slots: String
        let dishes: String
        let ingredients: Set<UUID>
        let allInCupboard: Bool
        var id: String { date }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var ticked: Set<String>
    @State private var busy = false
    @State private var error: String?
    private let lines: [Line]

    init(store: PlanStore, entries: [MealPlanEntry], shopping: ShoppingMap?, onAdded: @escaping (Int) -> Void) {
        self.store = store
        self.entries = entries
        self.shopping = shopping
        self.onAdded = onAdded
        let cooked = Dictionary(grouping: entries.filter(\.contributes), by: \.date)
        let lines = cooked.keys.sorted().map { date -> Line in
            let dishes = cooked[date] ?? []
            return Line(
                date: date,
                slots: PlanText.slots(dishes).map(\.meal.title).joined(separator: " + "),
                dishes: dishes.map(\.label).joined(separator: ", "),
                ingredients: Set(dishes.flatMap { shopping?[$0.id]?.toAdd ?? [] }),
                allInCupboard: dishes.allSatisfy { shopping?[$0.id]?.status == .inCupboard }
            )
        }
        self.lines = lines
        // A day that would add nothing starts unticked: the list already has it.
        _ticked = State(initialValue: Set(lines.filter { shopping == nil || !$0.ingredients.isEmpty }.map(\.date)))
    }

    var body: some View {
        let count = Set(lines.filter { ticked.contains($0.date) }.flatMap(\.ingredients)).count
        let days = ticked.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(days == 0 ? "Add to groceries" : "Add \(days) \(days == 1 ? "day" : "days") to groceries?",
                            subtitle: "Ingredients are combined by item and sorted into aisles.", onClose: { dismiss() })
                if lines.isEmpty {
                    Text("Nothing planned here has anything to buy.")
                        .foregroundStyle(Palette.muted).frame(maxWidth: .infinity).padding(.vertical, 16)
                } else {
                    ListGroup {
                        ForEach(lines) { line in
                            let on = ticked.contains(line.date)
                            let nothing = shopping != nil && line.ingredients.isEmpty
                            Button {
                                if on { ticked.remove(line.date) } else { ticked.insert(line.date) }
                            } label: {
                                ListRow("\(PlanText.shortDay(Day.date(line.date) ?? Date())) · \(line.slots)",
                                        subtitle: nothing ? "Already on the list" : line.allInCupboard ? "\(line.dishes) · all in cupboard" : line.dishes,
                                        detail: shopping != nil && !nothing ? "\(line.ingredients.count)" : nil,
                                        titleColor: nothing && !on ? Palette.muted : nil,
                                        leading: { CheckBox(isOn: on) }, trailing: { EmptyView() })
                            }
                            .buttonStyle(PressFade())
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
                ForEach(notes, id: \.text) { note in
                    NoteBox(note.text, tone: note.tone, systemImage: note.icon)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
                Button {
                    Task { await add() }
                } label: {
                    Text(busy ? "Adding…" : days == 0 ? "Nothing to add"
                         : shopping == nil ? "Add to groceries" : "Add \(count) \(count == 1 ? "item" : "items")")
                }
                .buttonStyle(.primary)
                .disabled(busy || days == 0)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
        .kitchenSheet([.large])
    }

    private var notes: [(text: String, tone: Tone, icon: String)] {
        var out: [(String, Tone, String)] = []
        let out_ = entries.filter { $0.placeId != nil }
            .map { "\(PlanText.shortDay(Day.date($0.date) ?? Date())) \($0.mealType.title.lowercased())" }
        if !out_.isEmpty {
            out.append(("\(Self.listOf(out_)) \(out_.count == 1 ? "is" : "are") eat out, so nothing to buy.", .plum, "fork.knife"))
        }
        let names = Array(Set(entries.filter { $0.needsIngredients == true }.compactMap(\.recipeName))).sorted()
        if !names.isEmpty {
            out.append(("\(Self.listOf(names)) \(names.count == 1 ? "has no ingredients yet, so it adds" : "have no ingredients yet, so they add") nothing.",
                        .mustard, "pencil"))
        }
        if let single = entries.first(where: { $0.itemName != nil })?.itemName {
            out.append(("Single foods like \(single) aren’t included. Add one from its meal’s options.", .sky, "cabinet"))
        }
        if entries.contains(where: { $0.savedLinkId != nil && $0.recipeDeleted != true }) {
            out.append(("Saved links have no ingredients, so they add nothing. Make one a recipe to shop for it.", .sky, "link"))
        }
        return out.map { (text: $0.0, tone: $0.1, icon: $0.2) }
    }

    /// "Wed 30 dinner, Fri 2 lunch and Sat 3 dinner"
    private static func listOf(_ things: [String]) -> String {
        guard let last = things.last else { return "" }
        return things.count == 1 ? last : things.dropLast().joined(separator: ", ") + " and " + last
    }

    private func add() async {
        busy = true
        defer { busy = false }
        do {
            let dates = ticked.sorted()
            try await store.addDaysToGroceries(dates)
            onAdded(dates.count)
            dismiss()
        } catch {
            self.error = "Could not add that to Groceries."
        }
    }
}
