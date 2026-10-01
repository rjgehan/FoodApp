import SwiftUI

/**
 The hand-drawn food icons a drawer or a group can wear — the same drawings, under the same
 keys, as the web's `FoodIcons.tsx`. The art lives in the asset catalog (Assets.xcassets/
 FoodIcons), exported from the web file by `web/scripts/export-food-icons.mjs` as template
 vectors, so it takes any tint and stays sharp drawn as big as a tile.

 The server stores only the key and refuses one it does not know, so this list, the web's and
 the backend's `FoodIcons.KEYS` move together; the e2e suite checks the assets match the web.
*/
struct FoodIcon: Identifiable, Hashable {
    let key: String
    let label: String

    var id: String { key }
    var image: Image { Image("FoodIcons/\(key)") }

    /// In the web's order, so the picker reads the same on both.
    static let all: [FoodIcon] = [
        FoodIcon(key: "pancakes", label: "Pancakes"),
        FoodIcon(key: "egg", label: "Egg"),
        FoodIcon(key: "sandwich", label: "Sandwich"),
        FoodIcon(key: "salad", label: "Salad"),
        FoodIcon(key: "pot", label: "Pot"),
        FoodIcon(key: "fish", label: "Fish"),
        FoodIcon(key: "pizza", label: "Pizza"),
        FoodIcon(key: "bread", label: "Bread"),
        FoodIcon(key: "cookie", label: "Cookie"),
        FoodIcon(key: "cake", label: "Cake"),
        FoodIcon(key: "apple", label: "Apple"),
        FoodIcon(key: "cup", label: "Cup"),
        FoodIcon(key: "full-meal", label: "Full meal"),
        FoodIcon(key: "meat", label: "Meat"),
        FoodIcon(key: "drumstick", label: "Chicken"),
        FoodIcon(key: "veggie", label: "Veggie"),
        FoodIcon(key: "carrot", label: "Carrot"),
        FoodIcon(key: "side", label: "Side"),
        FoodIcon(key: "rice-bowl", label: "Rice bowl"),
        FoodIcon(key: "noodles", label: "Noodles"),
        FoodIcon(key: "taco", label: "Taco"),
        FoodIcon(key: "burger", label: "Burger"),
        FoodIcon(key: "ice-cream", label: "Ice cream"),
        FoodIcon(key: "glass", label: "Cold drink"),
    ]

    /// Nil for no key, and for a key this build has no drawing of — a newer server's, say —
    /// which then shows as a plain tile rather than a missing-image hole.
    static func named(_ key: String?) -> FoodIcon? {
        guard let key else { return nil }
        return all.first { $0.key == key }
    }
}

extension RecipeSection {
    /// What each drawer wears until somebody picks something else — the web's defaults.
    var defaultIcon: String {
        switch self {
        case .breakfast: "pancakes"
        case .lunch: "sandwich"
        case .dinner: "pot"
        case .snacks: "cookie"
        case .drinks: "cup"
        case .other: "apple"
        }
    }
}

/// Every drawing as a tap target, the chosen one ringed. `allowNone` adds "no icon" first, for
/// groups; a drawer always wears something. The chosen one is named under the grid, as on the
/// web: there is no hover on a phone, and a few of these are close cousins at this size.
struct FoodIconPicker: View {
    let selected: String?
    var allowNone = false
    let onPick: (String?) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            grid
            if let chosen = FoodIcon.named(selected)?.label ?? (allowNone ? "No icon" : nil) {
                Text(chosen).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            if allowNone {
                option(selected == nil, label: "No icon") {
                    Image(systemName: "circle.slash").font(.title3)
                } action: { onPick(nil) }
            }
            ForEach(FoodIcon.all) { icon in
                option(selected == icon.key, label: icon.label) {
                    icon.image.resizable().scaledToFit().padding(9)
                } action: { onPick(icon.key) }
            }
        }
    }

    private func option<Content: View>(
        _ isOn: Bool, label: String, @ViewBuilder content: () -> Content, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            content()
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fit)
                .foregroundStyle(isOn ? Palette.accentInk : Color.secondary)
                .background(isOn ? Palette.accentSoft : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(isOn ? Palette.accentInk : Palette.border, lineWidth: 1)
                )
        }
        // Borderless so a grid of these inside a Form row is many buttons, not one.
        .buttonStyle(.borderless)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

#Preview("Picker") {
    FoodIconPicker(selected: "taco", allowNone: true) { _ in }.padding()
}
