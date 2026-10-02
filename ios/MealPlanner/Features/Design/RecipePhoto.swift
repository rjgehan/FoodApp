import SwiftUI

/**
 The food hues of the mockup (`HUES`): the two ends of a 135° gradient each, standing in for a
 recipe's photo when it has none. The same in light and dark — they are pictures, not chrome.
 */
enum Hue: String, CaseIterable, Hashable {
    case tomato, herb, mustard, plum, sky, bread, choc, green, berry, cream

    var colors: (Color, Color) {
        switch self {
        case .tomato: return (Color(rgb: 0xEE7854), Color(rgb: 0xC24A2D))
        case .herb: return (Color(rgb: 0xA2BE7A), Color(rgb: 0x577F46))
        case .mustard: return (Color(rgb: 0xF8CC6A), Color(rgb: 0xD38F27))
        case .plum: return (Color(rgb: 0xC987A9), Color(rgb: 0x7F426B))
        case .sky: return (Color(rgb: 0x8DB8D9), Color(rgb: 0x467599))
        case .bread: return (Color(rgb: 0xEDCB9C), Color(rgb: 0xBC8A56))
        case .choc: return (Color(rgb: 0xA0705A), Color(rgb: 0x5C3A29))
        case .green: return (Color(rgb: 0x7FB38A), Color(rgb: 0x3E7550))
        case .berry: return (Color(rgb: 0xD96C86), Color(rgb: 0x8E2F4F))
        case .cream: return (Color(rgb: 0xF1E2C8), Color(rgb: 0xCDB08A))
        }
    }

    var gradient: LinearGradient {
        let (a, b) = colors
        return LinearGradient(colors: [a, b], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// The same hue for the same recipe every time, and the same one the web gives it: the web's
    /// hueFor exactly — a signed 32-bit string hash, its absolute value, over the ten — by the
    /// recipe's id (or name, before it has one). Unsigned, as this was, a recipe wore one colour
    /// on the phone and another in the browser.
    static func of(_ key: String) -> Hue {
        var hash: Int32 = 0
        for unit in key.utf16 { hash = hash &* 31 &+ Int32(unit) }
        let index = Int(abs(Int64(hash)) % Int64(allCases.count))
        return allCases[index]
    }
}

/**
 A recipe's picture when there is no photo (`photo()`): its hue's gradient, a soft highlight in
 the top-left, and a faint icon — centred on a thumbnail, large and tucked into the corner on a
 hero.

     RecipePhotoPlaceholder(hue: .of(recipe.id.uuidString), systemImage: "fork.knife", size: 56)
     RecipePhotoPlaceholder(hue: .mustard, systemImage: "frying.pan").frame(height: 300)   // a hero
 */
struct RecipePhotoPlaceholder: View {
    var hue: Hue = .tomato
    var systemImage = "fork.knife"
    /// A fixed square, or nil to fill whatever frame it is given.
    var size: CGFloat?
    var radius: CGFloat = 14

    var body: some View {
        GeometryReader { geo in
            let m = min(geo.size.width, geo.size.height)
            ZStack {
                hue.gradient
                RadialGradient(colors: [.white.opacity(0.28), .clear],
                               center: UnitPoint(x: 0.3, y: 0.25), startRadius: 0,
                               endRadius: max(geo.size.width, geo.size.height) * 0.55)
                if m > 150 {
                    // A hero: a big, faint icon off the bottom-right corner.
                    glyph(m * 0.5)
                        .font(.system(size: m * 0.5, weight: .light))
                        .foregroundStyle(.white.opacity(0.18))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .offset(x: geo.size.width * 0.06, y: geo.size.height * 0.08)
                } else {
                    glyph(m * 0.36)
                        .font(.system(size: m * 0.36, weight: .regular))
                        .foregroundStyle(.white.opacity(0.9 * 0.92))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityHidden(true)
    }

    /// An SF Symbol, or one of the app's own drawings named "asset:ChefHat" — the chef's hat the
    /// mockup gives a dinner, which SF Symbols has no picture of.
    @ViewBuilder private func glyph(_ side: CGFloat) -> some View {
        if systemImage.hasPrefix("asset:") {
            Image(String(systemImage.dropFirst(6)))
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: side, height: side)
        } else {
            Image(systemName: systemImage)
        }
    }
}

#Preview("Recipe photos") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(56), spacing: 12), count: 5), spacing: 12) {
                ForEach(Hue.allCases, id: \.self) { hue in
                    RecipePhotoPlaceholder(hue: hue, systemImage: "fork.knife", size: 56)
                }
            }
            RecipePhotoPlaceholder(hue: .mustard, systemImage: "frying.pan", radius: 0)
                .frame(height: 260)
            RecipePhotoPlaceholder(hue: .berry, systemImage: "birthday.cake", radius: 18)
                .frame(height: 160)
        }
        .padding(20)
    }
    .pageBackground()
}
