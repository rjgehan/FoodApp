import SwiftUI

/*
 The catalogue's own pieces (the mockup's 3.1–3.6): the drawer and group cards, a recipe as a
 photo card, a search result row, the trail of where you are, and the floating Add recipe.
 Built from the design system's parts; nothing here restyles them.
*/

/// The mockup's icon tile with one of the hand-drawn food icons on it, or a folder for a group
/// nobody has given a picture.
struct FoodTile: View {
    var iconKey: String?
    var tone: Tone
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let icon = FoodIcon.named(iconKey) {
                icon.image.resizable().scaledToFit().frame(width: size * 0.66, height: size * 0.66)
            } else {
                Image(systemName: "folder").font(.system(size: size * 0.42, weight: .medium))
            }
        }
        .foregroundStyle(tone.ink)
        .frame(width: size, height: size)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: (size * 0.3).rounded(), style: .continuous))
        .accessibilityHidden(true)
    }
}

/// A drawer on the front of Recipes: its tile, its name in the title face, and how many.
struct DrawerCard: View {
    let section: RecipeSection
    let count: Int
    let iconKey: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FoodTile(iconKey: iconKey, tone: section.tone)
            VStack(alignment: .leading, spacing: 2) {
                Text(section.title).titleFont(20).foregroundStyle(Palette.text).lineLimit(1)
                Text("\(count) \(count == 1 ? "recipe" : "recipes")")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .combine)
    }
}

/// A group inside a drawer: a smaller card, its tile beside the name.
struct GroupCard: View {
    let group: RecipeCategory
    let detail: String

    var body: some View {
        HStack(spacing: 10) {
            FoodTile(iconKey: group.iconKey, tone: group.tone, size: 36)
            VStack(alignment: .leading, spacing: 0) {
                Text(group.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .cardSurface()
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .combine)
    }
}

/// The dashed tile at the end of the groups: make another one here.
struct NewGroupTile: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("New group", systemImage: "plus")
                .font(.system(size: 14, weight: .semibold))
                .labelStyle(GapLabel())
                .foregroundStyle(Palette.accentInk)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(minHeight: 60)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressFade())
    }
}

/// An icon and its title 8pt apart, rather than SwiftUI's wider default.
struct GapLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.icon; configuration.title }
    }
}

/// "41 recipes · 3 groups" — the recipes, then whether it opens further.
func groupDetail(recipes: Int, groups: Int) -> String {
    "\(recipes) \(recipes == 1 ? "recipe" : "recipes")"
        + (groups > 0 ? " · \(groups) \(groups == 1 ? "group" : "groups")" : "")
}

/**
 A recipe's picture: its cover if it has one, otherwise the mockup's food-coloured gradient with a
 mark for the dish — a bowl for a soup, a leaf for a salad, the chef's hat for a dinner — the same
 hue and mark as on the web, by the recipe's id and name.
*/
struct RecipePicture: View {
    let recipe: Recipe
    var radius: CGFloat = 14

    var body: some View {
        if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
            Color.clear
                .overlay {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            placeholder
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .accessibilityHidden(true)
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        // A shared recipe has no drawer here yet; the one it is in at home picks its mark.
        RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString.lowercased()),
                               systemImage: PlanText.dishIcon(name: recipe.name, section: recipe.section ?? recipe.ownerSection,
                                                              groups: recipe.categories, meal: .dinner),
                               radius: radius)
    }
}

/// A recipe as a photo card (3.4): the picture, the name under it, and how long it takes.
struct RecipePhotoCard: View {
    let recipe: Recipe

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RecipePicture(recipe: recipe, radius: 16)
                .aspectRatio(171 / 124, contentMode: .fit)
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                HStack(spacing: 4) {
                    if let time = recipe.totalTime {
                        Image(systemName: "clock").font(.system(size: 11))
                        Text(time)
                    } else {
                        Text("Serves \(recipe.servings)")
                    }
                }
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
                if recipe.shared, let owner = recipe.ownerName {
                    Text("from \(owner)").font(.system(size: 12)).foregroundStyle(Palette.faint).lineLimit(1)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Two across, the mockup's 16 between rows and 12 between columns.
struct RecipePhotoGrid: View {
    let recipes: [Recipe]
    var session: Session?

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
            ForEach(recipes) { recipe in
                NavigationLink {
                    RecipeDetailView(recipe: recipe, session: session)
                } label: {
                    RecipePhotoCard(recipe: recipe)
                }
                .buttonStyle(PressFade())
            }
        }
    }
}

/// One search result: the picture small, the name, and where it is filed.
struct RecipeResultRow: View {
    let recipe: Recipe
    let subtitle: String

    var body: some View {
        ListRow(recipe.name, subtitle: subtitle) {
            RecipePicture(recipe: recipe, radius: 10).frame(width: 44, height: 44)
        } trailing: {
            EmptyView()
        }
    }
}

/// "Dinner › Main dish › Chicken" under the bar, the last step in the text colour.
struct Breadcrumbs: View {
    let steps: [String]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                if index > 0 {
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                }
                Text(step)
                    .fontWeight(index == steps.count - 1 ? .semibold : .regular)
                    .foregroundStyle(index == steps.count - 1 ? Palette.text : Palette.muted)
                    .lineLimit(1)
            }
        }
        .font(.system(size: 13))
        .foregroundStyle(Palette.muted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The floating "+ Add recipe" over a group's recipes, above the tab bar.
struct FloatingAddRecipe: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Add recipe", systemImage: "plus")
                .labelStyle(GapLabel())
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Palette.onAccent)
                .padding(.horizontal, 20)
                .frame(height: 52)
                .background(Palette.accent, in: Capsule())
                .shadow(color: .black.opacity(0.18), radius: 15, y: 10)
        }
        .buttonStyle(PressFade())
        .padding(.trailing, 20)
        .padding(.bottom, 12)
    }
}

#Preview("Catalogue parts") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                DrawerCard(section: .breakfast, count: 24, iconKey: "pancakes")
                DrawerCard(section: .dinner, count: 88, iconKey: "pot")
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(SampleData.recipeCategories.prefix(3)) { GroupCard(group: $0, detail: "41 recipes · 3 groups") }
                NewGroupTile {}
            }
            Breadcrumbs(steps: ["Dinner", "Main dish", "Chicken"])
            RecipePhotoGrid(recipes: SampleData.recipes)
            FloatingAddRecipe {}
        }
        .padding(20)
    }
    .pageBackground()
}
