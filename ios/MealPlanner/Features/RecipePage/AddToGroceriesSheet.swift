import SwiftUI

/**
 Recipe → Groceries without the Plan (the web's sheet of the same name): how many servings — the
 page's own number to start with — then, if the recipe has any, which optional extras to buy, then
 "Add 9 items". The amounts are worked out on the server, as for a planned meal, and land on the
 one shared list everybody sees.

 Pressing it for a recipe already on the list asks first ("Already on the list — add again?"),
 because saying yes puts the amounts on top of the ones there.
 */
struct AddToGroceriesSheet: View {
    let recipe: Recipe
    var session: Session?
    /// Added: how many rows of the list it touched.
    var onAdded: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var servings: Int
    /// Which optional ingredients to buy this time. None, unless somebody ticks them.
    @State private var extras: Set<UUID> = []
    @State private var busy = false
    @State private var error: String?
    @State private var askingAgain = false
    /// As tall as what is in it, with the recipe still showing above.
    @State private var height: CGFloat = 420

    /// `servings` is how many the page is showing the amounts for.
    init(recipe: Recipe, session: Session?, servings: Int, onAdded: @escaping (Int) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onAdded = onAdded
        _servings = State(initialValue: max(1, servings))
    }

    private var optional: [RecipeIngredient] { recipe.ingredients.filter(\.optional) }
    /// What Add puts on the list: every ingredient that is not optional, and the extras ticked.
    private var adding: Int { recipe.ingredients.filter { !$0.optional || extras.contains($0.id) }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Add to groceries", subtitle: recipe.name, onClose: { dismiss() })

                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Servings").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                        Text("The amounts are worked out for this many").font(.system(size: 13)).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    ServingsStepper(value: $servings)
                }
                .padding(16)
                .cardSurface()

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

                if recipe.ingredients.isEmpty {
                    // Only the household that owns it can put them in.
                    NoteBox(recipe.shared ? "No ingredients yet, so there's nothing to add."
                                          : "No ingredients yet, so there's nothing to add. Put them in with Edit.",
                            tone: .mustard, systemImage: "exclamationmark.circle")
                }

                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }

                Button {
                    Task { await add(again: false) }
                } label: {
                    if busy {
                        ProgressView().tint(Palette.onAccent)
                    } else {
                        Label(adding == 0 ? "Nothing to add" : "Add \(adding) \(adding == 1 ? "item" : "items")",
                              systemImage: "cart")
                    }
                }
                .buttonStyle(.primary)
                .disabled(busy || adding == 0 || session?.household == nil)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 + 8 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .pageBackground()
        .kitchenSheet([.height(height)])
        .alert("Already on the list — add again?", isPresented: $askingAgain) {
            Button("Cancel", role: .cancel) {}
            Button("Add again") { Task { await add(again: true) } }
        } message: {
            // Named in quotes, as the web and the server name it: "wings's ingredients" reads badly.
            Text("“\(recipe.name)” is on Groceries already. Adding again puts these amounts on top.")
        }
    }

    private func add(again: Bool) async {
        guard let household = session?.household?.id else {
            error = "No household."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let rows = try await APIClient.shared.addRecipeToGroceries(household: household, recipe: recipe.id,
                                                                     servings: servings, extras: Array(extras),
                                                                     again: again)
            onAdded(rows.count)
            dismiss()
        } catch let failure as APIError where failure.alreadyOnList {
            error = nil
            askingAgain = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Add to groceries") {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddToGroceriesSheet(recipe: SampleData.recipes[0], session: .preview, servings: 4) { _ in }
    }
}

#Preview("Add to groceries — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        AddToGroceriesSheet(recipe: SampleData.recipes[1], session: .preview, servings: 2) { _ in }
    }
    .preferredColorScheme(.dark)
}
