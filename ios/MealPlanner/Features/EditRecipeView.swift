import SwiftUI

/// Editing a recipe you own: the fields worth changing on a phone, and the ingredient list,
/// which is the part that actually gets fixed while cooking ("that was 3 cloves, not 2").
struct EditRecipeView: View {
    let recipe: Recipe
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

    init(recipe: Recipe, session: Session?, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onSaved = onSaved
        _name = State(initialValue: recipe.name)
        _summary = State(initialValue: recipe.description ?? "")
        _servings = State(initialValue: recipe.servings)
        _prep = State(initialValue: recipe.prepTimeMinutes ?? 0)
        _cook = State(initialValue: recipe.cookTimeMinutes ?? 0)
        _instructions = State(initialValue: recipe.instructions ?? "")
        _ingredients = State(initialValue: recipe.ingredients.map {
            Draft(
                amount: $0.quantity.map { q in q == q.rounded() ? String(Int(q)) : String(q) } ?? "",
                unit: $0.unit ?? "",
                name: $0.ingredientName,
                optional: $0.optional
            )
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $name)
                    TextField("Description", text: $summary, axis: .vertical)
                    Stepper("Serves \(servings)", value: $servings, in: 1...40)
                }

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
            .navigationTitle("Edit recipe")
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
            "categories": recipe.categories,
            "ingredients": rows,
        ]
        if let section = recipe.section { body["section"] = section.rawValue }
        let trimmedSummary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSummary.isEmpty { body["description"] = trimmedSummary }
        let trimmedSteps = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedSteps.isEmpty { body["instructions"] = trimmedSteps }
        if prep > 0 { body["prepTimeMinutes"] = prep }
        if cook > 0 { body["cookTimeMinutes"] = cook }
        if let cover = recipe.coverImageId { body["coverImageId"] = cover.uuidString }

        do {
            let saved = try await APIClient.shared.updateRecipe(recipe, body: body)
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
