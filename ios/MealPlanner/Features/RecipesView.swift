import SwiftUI

/// The catalog, as the photos — a recipe with a picture is recognised faster than it is read.
struct RecipesView: View {
    var session: Session
    var sample: [Recipe]?

    @State private var recipes: [Recipe] = []
    @State private var query = ""
    @State private var error: String?

    private var shown: [Recipe] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return recipes }
        return recipes.filter {
            $0.name.lowercased().contains(q)
                || ($0.description ?? "").lowercased().contains(q)
                || $0.ingredients.contains { $0.ingredientName.lowercased().contains(q) }
        }
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let error {
                    Text(error).foregroundStyle(.red).font(.callout).padding()
                }
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(shown) { recipe in
                        NavigationLink(value: recipe) {
                            RecipeTile(recipe: recipe)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Recipes")
            .navigationDestination(for: Recipe.self) { RecipeDetailView(recipe: $0) }
            .searchable(text: $query, prompt: "Search recipes and ingredients")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        if let sample {
            recipes = sample
            return
        }
        guard let household = session.household?.id else { return }
        do {
            error = nil
            recipes = try await APIClient.shared.recipes(household: household)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RecipeTile: View {
    let recipe: Recipe

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemGroupedBackground))
                if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        ProgressView()
                    }
                } else {
                    Image(systemName: "fork.knife")
                        .font(.title)
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(height: 118)
            .clipShape(RoundedRectangle(cornerRadius: 14))

            Text(recipe.name).font(.subheadline.weight(.medium)).lineLimit(2)
            Text(recipe.facts).font(.caption).foregroundStyle(.secondary)
            if let owner = recipe.ownerName, recipe.shared {
                Text("from \(owner)").font(.caption2).foregroundStyle(.tertiary)
            }
        }
    }
}

struct RecipeDetailView: View {
    let recipe: Recipe

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color(.secondarySystemGroupedBackground)
                    }
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(recipe.name).font(.largeTitle.weight(.bold))
                    if let description = recipe.description, !description.isEmpty {
                        Text(description).foregroundStyle(.secondary)
                    }
                    Text(recipe.facts).font(.subheadline).foregroundStyle(.secondary)
                }

                if !recipe.ingredients.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Ingredients · \(recipe.ingredients.count)").font(.headline)
                        ForEach(recipe.ingredients) { ingredient in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(ingredient.amount ?? "")
                                    .font(.subheadline.monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .frame(width: 72, alignment: .leading)
                                Text(ingredient.ingredientName)
                                if ingredient.optional {
                                    Text("optional").font(.caption).foregroundStyle(.tertiary)
                                }
                            }
                            Divider()
                        }
                    }
                }
            }
            .padding(16)
        }
        .navigationTitle(recipe.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Recipes") {
    RecipesView(session: .preview, sample: SampleData.recipes)
}

#Preview("Recipe") {
    NavigationStack { RecipeDetailView(recipe: SampleData.recipes[0]) }
}
