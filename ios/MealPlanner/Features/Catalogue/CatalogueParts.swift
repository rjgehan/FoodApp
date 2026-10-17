import SwiftUI

/*
 The catalogue's own pieces (the mockup's 3.1–3.6): the drawer cards, the tag chips a drawer is
 filtered by, a recipe as a photo card (and as one to pick in select mode), a search result row,
 and the card that offers a tag for untagged recipes. Built from the design system's parts;
 nothing here restyles them.
*/

/// The mockup's icon tile with one of the hand-drawn food icons on it, or a plain tag mark for a
/// tag nobody has given a picture.
struct FoodTile: View {
    var iconKey: String?
    var tone: Tone
    var size: CGFloat = 40

    var body: some View {
        Group {
            if let icon = FoodIcon.named(iconKey) {
                icon.image.resizable().scaledToFit().frame(width: size * 0.66, height: size * 0.66)
            } else {
                Image(systemName: "tag").font(.system(size: size * 0.42, weight: .medium))
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

/**
 A tag in a drawer's chip row: its little drawing if it has one, its name and how many recipes
 wear it — "All", "Untagged" and every tag look alike. Filled with the text colour while on,
 as every chip is.
*/
struct TagChip: View {
    let title: String
    var iconKey: String?
    var count: Int?
    var isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let icon = FoodIcon.named(iconKey) {
                    icon.image.resizable().scaledToFit().frame(width: 16, height: 16)
                }
                Text(title)
                if let count {
                    Text("\(count)").foregroundStyle(isOn ? Palette.bg.opacity(0.75) : Palette.muted)
                }
            }
            .font(.system(size: 13, weight: isOn ? .semibold : .medium))
            .lineLimit(1)
            .foregroundStyle(isOn ? Palette.bg : Palette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(isOn ? Palette.text : Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
            .fixedSize()
            .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(count.map { "\(title), \($0)" } ?? title)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// The dashed "+ Tag" at the end of the chip row: make one here, without leaving the drawer.
struct AddTagChip: View {
    var title = "Tag"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: "plus").font(.system(size: 12, weight: .semibold))
                Text(title)
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Palette.accentInk)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .overlay(Capsule().strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
            .fixedSize()
            .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .accessibilityLabel("New tag")
    }
}

/**
 "4 untagged recipes look like Chicken" with one button that tags them all: read from the
 recipes' names and ingredients, so it costs nothing. Only ever a card in the page — it never
 opens anything by itself — and × is "not now", remembered on this phone.
*/
struct QuickTagCard: View {
    let name: String
    let count: Int
    var busy = false
    let onTag: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            (Text("\(count) untagged recipes look like ") + Text(name).fontWeight(.semibold))
                .font(.system(size: 14))
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(busy ? "Tagging…" : "Tag them", action: onTag)
                .buttonStyle(.kitchen(.dark, size: .small, fill: false))
                .disabled(busy)
            Button(action: onDismiss) {
                Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.mustard)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Not now")
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .padding(.vertical, 12)
        .background(Palette.mustardSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.mustard, lineWidth: 1))
    }
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

/// The same grid in select mode: a tap picks a recipe rather than opening it, and a box on its
/// picture says which are picked.
struct SelectableRecipeGrid: View {
    let recipes: [Recipe]
    @Binding var picked: Set<UUID>

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
            ForEach(recipes) { recipe in
                let on = picked.contains(recipe.id)
                Button {
                    if on { picked.remove(recipe.id) } else { picked.insert(recipe.id) }
                } label: {
                    RecipePhotoCard(recipe: recipe)
                        .overlay(alignment: .topTrailing) {
                            CheckBox(isOn: on)
                                .background(on ? Color.clear : Palette.surface,
                                            in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                                .padding(8)
                        }
                }
                .buttonStyle(PressFade())
                .accessibilityAddTraits(on ? .isSelected : [])
                .accessibilityHint(on ? "Picked. Tap to leave it out." : "Tap to pick it.")
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

/// An icon and its title 8pt apart, rather than SwiftUI's wider default.
struct GapLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.icon; configuration.title }
    }
}

private struct CataloguePartsPreview: View {
    @State private var on: Set<String> = ["Chicken"]
    @State private var picked: Set<UUID> = [SampleData.recipes[0].id]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    DrawerCard(section: .breakfast, count: 24, iconKey: "pancakes")
                    DrawerCard(section: .dinner, count: 88, iconKey: "pot")
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        TagChip(title: "All", count: 12, isOn: on.isEmpty) { on = [] }
                        ForEach(SampleData.recipeCategories.filter { $0.section == .dinner }) { tag in
                            TagChip(title: tag.name, iconKey: tag.iconKey, count: 3, isOn: on.contains(tag.name)) {
                                if on.contains(tag.name) { on.remove(tag.name) } else { on.insert(tag.name) }
                            }
                        }
                        AddTagChip {}
                    }
                }
                QuickTagCard(name: "Chicken", count: 4, onTag: {}, onDismiss: {})
                RecipePhotoGrid(recipes: SampleData.recipes)
                SelectableRecipeGrid(recipes: SampleData.recipes, picked: $picked)
            }
            .padding(20)
        }
        .pageBackground()
    }
}

#Preview("Catalogue parts") { CataloguePartsPreview() }

#Preview("Catalogue parts — dark") { CataloguePartsPreview().preferredColorScheme(.dark) }
