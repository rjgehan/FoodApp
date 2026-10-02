import SwiftUI

/**
 "Add 5 days to groceries?" (the mockup's 2.3). It asks first, and names the days that will put
 something on the list — each with its meals and how many things it adds — so it is obvious at a
 glance whether you meant one day or seven. A day the list already has is shown unticked, so you
 can see why it is not counted. Counted by ingredient, as the list is: garlic on Tuesday and
 garlic on Thursday is one row. What adds nothing is said underneath, in one note.

 A day whose meals are all in the cupboard starts unticked too. The list does take things the
 cupboard has when you ask (having some oats is not having enough), so its number is what ticking
 it would really add — but nothing of it goes on unless you tick it, which is what "all in
 cupboard" promises.
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
        // A day that would add nothing starts unticked (the list already has it), and so does one
        // the cupboard already covers.
        _ticked = State(initialValue: Set(lines.filter { shopping == nil || (!$0.ingredients.isEmpty && !$0.allInCupboard) }.map(\.date)))
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
                                        subtitle: line.allInCupboard ? "\(line.dishes) · all in cupboard" : nothing ? "Already on the list" : line.dishes,
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

    /**
     Everything that adds nothing, in one sentence rather than a stack of boxes pushing the button
     down: "Nothing to buy for Fri 2 dinner (eat out), Green salad (single food) and Honey garlic
     chicken (saved link)." Only eating out keeps the mockup's plum note of its own.
     */
    private var notes: [(text: String, tone: Tone, icon: String)] {
        let eatingOut = entries.filter { $0.placeId != nil }
            .map { "\(PlanText.shortDay(Day.date($0.date) ?? Date())) \($0.mealType.title.lowercased())" }
        let names = Self.unique(entries.filter { $0.needsIngredients == true }.compactMap(\.recipeName))
        let singles = Self.unique(entries.compactMap(\.itemName))
        let links = Self.unique(entries.filter { $0.savedLinkId != nil && $0.recipeDeleted != true }.map(\.label))
        let all = Self.tagged(eatingOut, "eat out") + Self.tagged(names, "no ingredients yet")
            + Self.tagged(singles, singles.count == 1 ? "single food" : "single foods")
            + Self.tagged(links, links.count == 1 ? "saved link" : "saved links")
        if all.isEmpty { return [] }
        if !eatingOut.isEmpty && all.count == 1 {
            return [(text: "\(Self.listOf(eatingOut)) \(eatingOut.count == 1 ? "is" : "are") eat out, so nothing to buy.",
                     tone: .plum, icon: "fork.knife")]
        }
        let hint = singles.isEmpty ? "" : " A single food has its own button in its meal’s options."
        return [(text: "Nothing to buy for \(Self.listOf(all, capitalise: false)).\(hint)", tone: .sky, icon: "info.circle")]
    }

    /// In the order planned, each once.
    private static func unique(_ things: [String]) -> [String] {
        var seen = Set<String>()
        return things.filter { seen.insert($0).inserted }
    }

    /// "Fri 2 dinner and Sun 4 dinner (eat out)": a kind of thing, said once after the last of them.
    private static func tagged(_ things: [String], _ what: String) -> [String] {
        guard let last = things.last else { return [] }
        return things.dropLast() + ["\(last) (\(what))"]
    }

    /// "Wed 30 dinner, Fri 2 lunch and Sat 3 dinner"
    private static func listOf(_ things: [String], capitalise: Bool = true) -> String {
        guard let last = things.last else { return "" }
        let joined = things.count == 1 ? last : things.dropLast().joined(separator: ", ") + " and " + last
        return capitalise ? joined.prefix(1).uppercased() + joined.dropFirst() : joined
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
