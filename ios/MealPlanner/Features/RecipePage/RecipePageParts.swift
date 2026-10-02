import SwiftUI

/*
 The pieces of the recipe page (the mockup's 3.7, Option 1): the photo hero with the name on it,
 the tabs that stick under the status bar, and the toast that says something worked.
 */

/**
 The top of a recipe: its cover photo — or its colour, when it has none — edge to edge and up
 under the status bar, the round back, share and ••• buttons over it, and its drawer, name and
 quick facts set on the picture.
 */
struct RecipeHero: View {
    let recipe: Recipe
    /// The status bar's height: the picture runs under it, the buttons sit below it.
    var topInset: CGFloat
    var back: () -> Void
    /// Nil for a recipe that is not yours to share.
    var share: (() -> Void)?
    var options: () -> Void

    /// "Dinner › Chicken", or who shared it while it is not filed.
    private var filed: String? {
        guard let section = recipe.section else {
            return recipe.shared ? "Shared by \(recipe.ownerName ?? "another household")" : nil
        }
        return ([section.title] + recipe.categories).joined(separator: " › ")
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            picture
            LinearGradient(colors: recipe.coverImageId == nil
                           ? [.clear, .clear, .black.opacity(0.3)]
                           : [.black.opacity(0.32), .clear, .clear, .black.opacity(0.62)],
                           startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 6) {
                if let filed {
                    Pill(filed, tone: recipe.shared && recipe.section == nil ? .plum : .mustard)
                }
                Text(recipe.name)
                    .titleFont(32)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: 12) {
                    if let prep = recipe.prepTimeMinutes, prep > 0 { fact("clock", "\(short(prep)) prep") }
                    if let cook = recipe.cookTimeMinutes, cook > 0 { fact("flame", "\(short(cook)) cook") }
                    fact("person.2", "\(recipe.servings)")
                        .accessibilityLabel("Serves \(recipe.servings)")
                }
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.92))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .frame(height: 243 + topInset)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay(alignment: .top) {
            HStack(spacing: 8) {
                heroButton("chevron.left", "Back", back)
                Spacer()
                if let share { heroButton("square.and.arrow.up", "Share", share) }
                heroButton("ellipsis", "Recipe options", options)
            }
            .padding(.horizontal, 16)
            .padding(.top, topInset + 4)
        }
    }

    /// The web's hero placeholder: the hue from the lowercase id (as the web hashes it) and the
    /// chef's hat, so a recipe with no photo looks the same on both.
    private var placeholder: some View {
        RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString.lowercased()), systemImage: "asset:ChefHat", radius: 0)
    }

    @ViewBuilder private var picture: some View {
        if let id = recipe.coverImageId, let url = APIClient.shared.imageURL(id) {
            Color.clear.overlay {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    placeholder
                }
            }
            .clipped()
        } else {
            placeholder
        }
    }

    private func fact(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 12))
            Text(text)
        }
    }

    /// "15", "1 hr 10": the facts say "prep" and "cook" after them.
    private func short(_ minutes: Int) -> String {
        minutes < 60 ? "\(minutes)" : minutes % 60 == 0 ? "\(minutes / 60) hr" : "\(minutes / 60) hr \(minutes % 60)"
    }

    private func heroButton(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color(rgb: 0x2B211A))
                .frame(width: 36, height: 36)
                .background(.white.opacity(0.92), in: Circle())
                .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
                .contentShape(Circle().inset(by: -4))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
    }
}

/// Ingredients · Method · Photos with their counts, the chosen one underlined in the accent.
struct RecipeTabBar: View {
    @Binding var tab: RecipeDetailView.Tab
    var counts: (ingredients: Int, method: Int, photos: Int)

    var body: some View {
        HStack(spacing: 0) {
            item(.ingredients, "Ingredients", counts.ingredients)
            item(.method, "Method", counts.method)
            item(.photos, "Photos", counts.photos)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.border).frame(height: 1) }
        .padding(.horizontal, 20)
        .background(Palette.bg)
    }

    private func item(_ which: RecipeDetailView.Tab, _ title: String, _ count: Int) -> some View {
        let on = tab == which
        return Button { tab = which } label: {
            (Text(title).font(.system(size: 15, weight: on ? .semibold : .medium))
                .foregroundColor(on ? Palette.text : Palette.muted)
             + Text(" \(count)").font(.system(size: 12, weight: .medium)).foregroundColor(Palette.muted))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
                .padding(.bottom, 11)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(on ? Palette.accent : .clear).frame(height: 2.5)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}

/// The mockup's toast: a dark bar with a green tick, for "it worked" that needs no answer.
struct RecipeToast: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Palette.herb)
            Text(text).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.bg)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Palette.text, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 16, y: 6)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

#Preview("Hero") {
    VStack(spacing: 0) {
        RecipeHero(recipe: SampleData.recipes[0], topInset: 47, back: {}, share: {}, options: {})
        RecipeTabBar(tab: .constant(.ingredients), counts: (5, 4, 0))
        Spacer()
        RecipeToast(text: "On the plan for Tue · Dinner").padding()
    }
    .ignoresSafeArea(edges: .top)
    .pageBackground()
}
