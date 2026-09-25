import SwiftUI

/// The recipe, and the one thing you usually want to do with it: put it on a day.
struct RecipeDetailView: View {
    @State var recipe: Recipe
    var session: Session?

    @State private var planning = false
    @State private var planned: String?
    @State private var editing = false
    @State private var changingPhoto = false

    /// One step per line, the way it was written.
    private var steps: [String] {
        (recipe.instructions ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color(.secondarySystemGroupedBackground)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .onTapGesture { if !recipe.shared { changingPhoto = true } }
                } else if !recipe.shared {
                    /*
                     Offered where the missing picture would be, rather than four taps deep
                     inside the edit form. This is for the recipes written down months ago
                     that never got one, which is most of them.
                    */
                    Button {
                        changingPhoto = true
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: "photo.badge.plus").font(.system(size: 28))
                            Text("Add a photo").font(.subheadline.weight(.medium))
                        }
                        .foregroundStyle(Color.accentColor)
                        .frame(maxWidth: .infinity)
                        .frame(height: 120)
                        // A dashed outline, because the card colour is the same white as
                        // the page behind it and an invisible box is not an invitation.
                        .background(Color.accentColor.opacity(0.06),
                                    in: RoundedRectangle(cornerRadius: 18))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .strokeBorder(
                                    Color.accentColor.opacity(0.35),
                                    style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])
                                )
                        }
                    }
                    .buttonStyle(.plain)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(recipe.name).font(.largeTitle.weight(.bold))
                    if let description = recipe.description, !description.isEmpty {
                        Text(description).foregroundStyle(.secondary)
                    }
                    Text(recipe.facts).font(.subheadline).foregroundStyle(.secondary)
                    if let owner = recipe.ownerName, recipe.shared {
                        Text("from \(owner)").font(.subheadline).foregroundStyle(.secondary)
                    }
                }

                if let planned {
                    Label("On the plan for \(planned)", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.green)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }

                // The one filled button on the screen: the step the whole app is built around.
                Button {
                    planning = true
                } label: {
                    Label("Add to plan", systemImage: "calendar.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                // Where it came from and the videos of it — every link, not just the first.
                RecipeLinksList(links: recipe.allLinks)

                if !recipe.ingredients.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Ingredients · \(recipe.ingredients.count)").font(.headline)
                        ForEach(recipe.ingredients) { ingredient in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(ingredient.amount ?? "")
                                    .font(.subheadline.monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .frame(width: 74, alignment: .leading)
                                Text(ingredient.ingredientName)
                                if ingredient.optional {
                                    Text("optional").font(.caption).foregroundStyle(.tertiary)
                                }
                                Spacer(minLength: 0)
                            }
                            Divider()
                        }
                    }
                }

                if !steps.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Method").font(.headline)
                        ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.subheadline.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .frame(width: 20, alignment: .trailing)
                                StepText(step: step, names: recipe.ingredients.map(\.ingredientName))
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .navigationTitle(recipe.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Only the household that owns a recipe can change it; a shared one is read-only.
            if !recipe.shared {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editing = true }
                }
            }
        }
        .sheet(isPresented: $changingPhoto) {
            CoverPhotoSheet(recipe: recipe, session: session) { saved in
                recipe = saved
            }
        }
        .sheet(isPresented: $editing) {
            EditRecipeView(recipe: recipe, session: session) { saved in
                recipe = saved
            }
        }
        .sheet(isPresented: $planning) {
            AddToPlanSheet(recipe: recipe, session: session) { label in
                planned = label
            }
        }
    }
}

/// Day, then meal, then done — the same two-tap shape as the web sheet.
struct AddToPlanSheet: View {
    let recipe: Recipe
    var session: Session?
    var onPlanned: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var day = Date()
    @State private var meal: MealType
    /// Which optional ingredients to buy this time. None, unless somebody ticks them.
    @State private var extras: Set<UUID> = []
    @State private var busy = false
    @State private var error: String?

    init(recipe: Recipe, session: Session?, onPlanned: @escaping (String) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onPlanned = onPlanned
        // The meal it most likely goes on, from where it is filed — the web's MEAL_FOR_SECTION.
        let likely: MealType = switch recipe.section {
        case .breakfast: .breakfast
        case .lunch: .lunch
        case .snacks, .drinks: .snack
        case .dinner, .other, nil: .dinner
        }
        _meal = State(initialValue: likely)
    }

    private var days: [Date] { (0..<14).map { Day.adding($0, to: Date()) } }
    private var optional: [RecipeIngredient] { recipe.ingredients.filter(\.optional) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Day") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(days, id: \.self) { candidate in
                                let picked = Calendar.current.isDate(candidate, inSameDayAs: day)
                                Button {
                                    day = candidate
                                } label: {
                                    Text(label(for: candidate))
                                        .font(.subheadline.weight(picked ? .semibold : .regular))
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(
                                            picked ? Color.accentColor : Color(.tertiarySystemFill),
                                            in: Capsule()
                                        )
                                        .foregroundStyle(picked ? Color.white : Color.primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 0))
                }

                Section("Meal") {
                    Picker("Meal", selection: $meal) {
                        ForEach(MealType.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                if !optional.isEmpty {
                    Section("Buying the optional extras?") {
                        ForEach(optional) { ingredient in
                            OptionalExtraRow(ingredient: ingredient, isOn: extras.contains(ingredient.id)) {
                                if extras.contains(ingredient.id) { extras.remove(ingredient.id) }
                                else { extras.insert(ingredient.id) }
                            }
                        }
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    Button {
                        Task { await add() }
                    } label: {
                        if busy {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Add to \(label(for: day)) · \(meal.title)").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(busy)
                }
            }
            .navigationTitle("Add to plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
        }
        // Full height from the start when there are extras to tick: at .medium the Add button
        // sat under the sheet's corner with one extra and off the screen with two.
        .presentationDetents(optional.isEmpty ? [.medium] : [.large])
    }

    private func label(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return "Today" }
        if Calendar.current.isDateInTomorrow(date) { return "Tomorrow" }
        return date.formatted(.dateTime.weekday(.abbreviated).day())
    }

    private func add() async {
        guard let household = session?.household?.id else {
            error = "No household."
            return
        }
        busy = true
        defer { busy = false }
        do {
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
            onPlanned("\(label(for: day)) · \(meal.title)")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Recipe") {
    NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0], session: .preview) }
}
