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
    @State private var cover = CoverPhotoFlow()
    @State private var section: RecipeSection
    @State private var groups: Set<String>
    @State private var allGroups: [RecipeCategory] = []
    @State private var newGroup = ""
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
        // Dinner is what the web defaults a new recipe to.
        _section = State(initialValue: recipe?.section ?? .dinner)
        _groups = State(initialValue: Set(recipe?.categories ?? []))
        _name = State(initialValue: recipe?.name ?? "")
        _summary = State(initialValue: recipe?.description ?? "")
        _servings = State(initialValue: recipe?.servings ?? 4)
        _prep = State(initialValue: recipe?.prepTimeMinutes ?? 0)
        _cook = State(initialValue: recipe?.cookTimeMinutes ?? 0)
        _instructions = State(initialValue: recipe?.instructions ?? "")
        _coverImageId = State(initialValue: recipe?.coverImageId)
        // One empty row when there are none — a new recipe, or one planned as just a name and
        // opened from "Add ingredients" — so there is somewhere to start typing. Blank rows
        // are dropped on save.
        let existing = (recipe?.ingredients ?? []).map {
            Draft(
                amount: $0.quantity.map { q in q == q.rounded() ? String(Int(q)) : String(q) } ?? "",
                unit: $0.unit ?? "",
                name: $0.ingredientName,
                optional: $0.optional
            )
        }
        _ingredients = State(initialValue: existing.isEmpty
            ? [Draft(amount: "", unit: "", name: "", optional: false)]
            : existing)
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
                CoverPhotoSection(dishName: name, session: session, coverImageId: $coverImageId, flow: cover)

                /*
                 Where it goes in the catalog. Until now the phone sent whatever filing the
                 recipe already had straight back, which meant a recipe written here always
                 landed in Dinner with no groups and there was no way to move it.
                */
                Section {
                    Picker("Drawer", selection: $section) {
                        ForEach(RecipeSection.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    ForEach(groupsHere) { group in
                        Button {
                            if groups.contains(group.name) { groups.remove(group.name) }
                            else { groups.insert(group.name) }
                        } label: {
                            HStack {
                                Text(group.name).foregroundStyle(.primary)
                                Spacer()
                                if groups.contains(group.name) {
                                    Image(systemName: "checkmark").foregroundStyle(Palette.accent)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        // Without this the button tints the whole row, and a list of groups
                        // reads as a list of links.
                        .buttonStyle(.plain)
                    }
                    HStack {
                        TextField("New group", text: $newGroup)
                        Button("Add") { Task { await addGroup() } }
                            .disabled(newGroup.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } header: {
                    Text("Filed under")
                } footer: {
                    Text(groupsHere.isEmpty
                         ? "Groups are the shelves inside a drawer — \"Chicken\", \"Quick\". There are none in this drawer yet."
                         : "Tap a group to file it there. A recipe can be on more than one shelf.")
                }

                Section("Time") {
                    Stepper("Prep \(prep) min", value: $prep, in: 0...600, step: 5)
                    Stepper("Cook \(cook) min", value: $cook, in: 0...600, step: 5)
                }

                Section {
                    ForEach($ingredients) { $row in
                        HStack(spacing: 8) {
                            TextField("1", text: $row.amount)
                                .keyboardType(.decimalPad)
                                .frame(width: 48)
                            TextField("unit", text: $row.unit)
                                .frame(width: 60)
                            TextField("ingredient", text: $row.name)
                            OptionalTag(isOn: $row.optional)
                        }
                        // The list lines up its separator with the first text in the row, which
                        // the Opt pill's label had become — leaving a stub under the pill.
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
                    }
                    .onDelete { ingredients.remove(atOffsets: $0) }
                    Button("Add an ingredient", systemImage: "plus") {
                        ingredients.append(Draft(amount: "", unit: "", name: "", optional: false))
                    }
                    .buttonStyle(.borderless)
                } header: {
                    Text("Ingredients")
                } footer: {
                    // The web's hint, minus the part about typing a whole line.
                    Text("Opt marks an optional extra — the plan asks whether you are buying it each time the meal goes on.")
                }

                Section("Method") {
                    TextField("One step per line", text: $instructions, axis: .vertical)
                        .lineLimit(6...20)
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .coverPhotoFlow(cover, session: session, coverImageId: $coverImageId)
            .task { await loadGroups() }
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

    /// The groups that belong in the chosen drawer, plus the ones that belong everywhere.
    private var groupsHere: [RecipeCategory] {
        allGroups
            .filter { $0.section == nil || $0.section == section }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func loadGroups() async {
        guard let household = session?.household?.id else { return }
        allGroups = (try? await APIClient.shared.recipeCategories(household: household)) ?? []
    }

    private func addGroup() async {
        let wanted = newGroup.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session?.household?.id else { return }
        do {
            let made = try await APIClient.shared.createRecipeCategory(
                household: household, name: wanted, section: section)
            allGroups.append(made)
            groups.insert(made.name)
            newGroup = ""
        } catch {
            self.error = error.localizedDescription
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
            "categories": Array(groups),
            "ingredients": rows,
        ]
        body["section"] = section.rawValue
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

/**
 The web's "Opt" pill: off is a quiet grey, on is the accent, so a glance down the list shows
 which ones are extras. It is a button of its own in the row, borderless so a tap on the name
 beside it still goes to the text field.
*/
private struct OptionalTag: View {
    @Binding var isOn: Bool

    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            Text("Opt")
                .font(.caption.weight(.medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(isOn ? Palette.accentSoft : Color(.tertiarySystemFill), in: Capsule())
                .foregroundStyle(isOn ? Palette.accent : Color(.secondaryLabel))
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Optional")
        .accessibilityValue(isOn ? "On" : "Off")
        .accessibilityHint(isOn ? "Makes it a required ingredient" : "Marks it as an optional extra")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

#Preview("Edit") {
    EditRecipeView(recipe: SampleData.recipes[0], session: .preview) { _ in }
}

#Preview("New") {
    EditRecipeView(recipe: nil, session: .preview) { _ in }
}
