import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 Putting the unplaced things on the list into aisles, on the phone.

 The web spends one of twenty daily Gemini requests to do this. The phone does not have to:
 "which aisle does paprika go in" is a classification with a fixed, tiny answer set, which is
 exactly what a 3B model on the device is good at — and it is free, works on a train, and
 nothing about the list leaves the house.

 The server's sort stays as it is and is still the fallback. This does not replace it; it
 means a phone rarely needs it.
*/
struct SortIntoAislesSheet: View {
    var session: Session
    let items: [GroceryItem]
    let aisles: [GroceryCategory]
    var onDone: (Int) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var placing = false
    @State private var placed = 0
    @State private var error: String?

    /// Only things nobody has placed. Re-sorting what is already filed would undo somebody's
    /// deliberate choice — the one thing an automatic tidy must never do.
    private var unplaced: [GroceryItem] {
        items.filter { $0.categoryId == nil && $0.ingredientId != nil }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if unplaced.isEmpty {
                        Text("Everything on the list is already in an aisle.")
                    } else {
                        Text("\(unplaced.count) \(unplaced.count == 1 ? "thing is" : "things are") not in an aisle yet.")
                        ForEach(unplaced.prefix(12)) { item in
                            Text(item.name).font(.subheadline).foregroundStyle(.secondary)
                        }
                        if unplaced.count > 12 {
                            Text("and \(unplaced.count - 12) more")
                                .font(.subheadline).foregroundStyle(.tertiary)
                        }
                    }
                } footer: {
                    Text(canSortHere
                         ? "Done on this phone. Nothing is sent anywhere and it costs nothing."
                         : "This phone cannot do it on its own — Settings will say why. The list can "
                           + "still be sorted on the website, which uses one of the day's AI requests.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if placing {
                    Section {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Placed \(placed) of \(unplaced.count)…")
                        }
                    }
                }
            }
            .navigationTitle("Sort into aisles")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sort") { Task { await sort() } }
                        .disabled(placing || unplaced.isEmpty || !canSortHere)
                }
            }
        }
    }

    private var canSortHere: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability { return true }
        }
        #endif
        return false
    }

    private func sort() async {
        guard let household = session.household?.id, !aisles.isEmpty else { return }
        placing = true
        placed = 0
        error = nil
        defer { placing = false }

        let byName = Dictionary(uniqueKeysWithValues: aisles.map { ($0.name.lowercased(), $0.id) })
        for item in unplaced {
            guard let ingredient = item.ingredientId else { continue }
            guard let aisle = await aisle(for: item.name, among: aisles).flatMap({ byName[$0.lowercased()] })
            else { continue }
            do {
                try await APIClient.shared.placeIngredient(household: household, ingredient: ingredient, category: aisle)
                placed += 1
            } catch {
                self.error = error.localizedDescription
                break
            }
        }
        await onDone(placed)
        dismiss()
    }

    /**
     One item at a time rather than the whole list in one prompt.

     A batch would be one round trip instead of thirty, but a small model asked for thirty
     answers at once drops some and misaligns the rest, and a misaligned answer files the
     paprika under Frozen. One question with one answer is the shape it gets right, and on
     device each one costs nothing but a moment.
    */
    private func aisle(for name: String, among aisles: [GroceryCategory]) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let choices = aisles.map(\.name).joined(separator: ", ")
            let session = LanguageModelSession(instructions: """
            You put groceries into supermarket aisles. Answer with one aisle name, copied \
            exactly from this list and nothing else: \(choices)
            """)
            let answer = try? await session.respond(to: "Which aisle is \(name) in?")
            guard let text = answer?.content.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
            // The model is asked to copy a name; anything it invents is thrown away rather
            // than guessed at, so an odd answer leaves the item unplaced instead of wrong.
            return aisles.map(\.name).first { $0.caseInsensitiveCompare(text) == .orderedSame }
        }
        #endif
        return nil
    }
}
