import SwiftUI

/// Writing a recipe down, or fixing one you already have: the fields worth changing on a
/// phone, and the ingredient list, which is the part that actually gets corrected while
/// cooking ("that was 3 cloves, not 2").
///
/// A nil recipe is a new one. Same form either way — there is nothing about writing a recipe
/// that wants a different screen from editing it.
struct EditRecipeView: View {
    let recipe: Recipe?
    var session: Session?
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var summary: String
    @State private var servings: Int
    @State private var prep: Int
    @State private var cook: Int
    @State private var instructions: String
    @State private var ingredients: [Draft]
    @State private var coverImageId: UUID?
    @State private var busy = false
    @State private var error: String?

    /// An ingredient being edited: amounts are text while you type, numbers only on save.
    struct Draft: Identifiable, Hashable {
        let id = UUID()
        var amount: String
        var unit: String
        var name: String
        var optional: Bool
    }

    init(recipe: Recipe?, session: Session?, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onSaved = onSaved
        _name = State(initialValue: recipe?.name ?? "")
        _summary = State(initialValue: recipe?.description ?? "")
        _servings = State(initialValue: recipe?.servings ?? 4)
        _prep = State(initialValue: recipe?.prepTimeMinutes ?? 0)
        _cook = State(initialValue: recipe?.cookTimeMinutes ?? 0)
        _instructions = State(initialValue: recipe?.instructions ?? "")
        _coverImageId = State(initialValue: recipe?.coverImageId)
        // One empty row, so a new recipe has somewhere to start typing.
        _ingredients = State(initialValue: recipe.map { $0.ingredients.map {
            Draft(
                amount: $0.quantity.map { q in q == q.rounded() ? String(Int(q)) : String(q) } ?? "",
                unit: $0.unit ?? "",
                name: $0.ingredientName,
                optional: $0.optional
            )
        } } ?? [Draft(amount: "", unit: "", name: "", optional: false)])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $name)
                    TextField("Description", text: $summary, axis: .vertical)
                    Stepper("Serves \(servings)", value: $servings, in: 1...40)
                }

                // Straight after the name, because the name is what it has to work from.
                CoverPhotoSection(dishName: name, session: session, coverImageId: $coverImageId)

                Section("Time") {
                    Stepper("Prep \(prep) min", value: $prep, in: 0...600, step: 5)
                    Stepper("Cook \(cook) min", value: $cook, in: 0...600, step: 5)
                }

                Section("Ingredients") {
                    ForEach($ingredients) { $row in
                        HStack(spacing: 8) {
                            TextField("1", text: $row.amount)
                                .keyboardType(.decimalPad)
                                .frame(width: 48)
                            TextField("unit", text: $row.unit)
                                .frame(width: 60)
                            TextField("ingredient", text: $row.name)
                        }
                    }
                    .onDelete { ingredients.remove(atOffsets: $0) }
                    Button("Add an ingredient", systemImage: "plus") {
                        ingredients.append(Draft(amount: "", unit: "", name: "", optional: false))
                    }
                    .buttonStyle(.borderless)
                }

                Section("Method") {
                    TextField("One step per line", text: $instructions, axis: .vertical)
                        .lineLimit(6...20)
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(recipe == nil ? "New recipe" : "Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }

        // The backend takes the whole recipe back, so anything not on this screen is sent as
        // it came: the section and groups this household filed it under, and its photos.
        let rows: [[String: Any]] = ingredients
            .filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { row in
                var out: [String: Any] = [
                    "ingredientName": row.name.trimmingCharacters(in: .whitespaces),
                    "quantity": Double(row.amount.replacingOccurrences(of: ",", with: ".")) ?? 1,
                    "optional": row.optional,
                ]
                let unit = row.unit.trimmingCharacters(in: .whitespaces)
                if !unit.isEmpty { out["unit"] = unit }
                return out
            }

        var body: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespaces),
            "servings": servings,
            "categories": recipe?.categories ?? [],
            "ingredients": rows,
        ]
        // A new recipe has to be filed somewhere, and dinner is what the web defaults to.
        body["section"] = (recipe?.section ?? .dinner).rawValue
        let trimmedSummary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSummary.isEmpty { body["description"] = trimmedSummary }
        let trimmedSteps = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSteps.isEmpty { body["instructions"] = trimmedSteps }
        if prep > 0 { body["prepTimeMinutes"] = prep }
        if cook > 0 { body["cookTimeMinutes"] = cook }
        // Explicitly null rather than absent, so removing the photo actually removes it.
        // `nil as Any` would not do — JSONSerialization refuses it.
        body["coverImageId"] = coverImageId.map { $0.uuidString as Any } ?? NSNull()
        // The server replaces the photo list with whatever arrives, so the ones this screen
        // does not show still have to be sent. Leaving them out deleted them on every edit.
        body["photoIds"] = (recipe?.photoIds ?? []).map(\.uuidString)

        do {
            let saved: Recipe
            if let recipe {
                saved = try await APIClient.shared.updateRecipe(recipe, body: body)
            } else if let household = session?.household?.id {
                saved = try await APIClient.shared.createRecipe(household: household, body: body)
            } else {
                error = "No household to save it to."
                return
            }
            onSaved(saved)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Edit") {
    EditRecipeView(recipe: SampleData.recipes[0], session: .preview) { _ in }
}

#Preview("New") {
    EditRecipeView(recipe: nil, session: .preview) { _ in }
}
