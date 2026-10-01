import CoreText
import SwiftUI
import UIKit

/**
 Titles in the theme's title face, everything else in SF Pro.

 The title faces are variable fonts bundled in MealPlanner/Fonts (registered in the Info.plist):
 Fraunces for most themes — at "SOFT" 100, "WONK" 0 and weight 600 in Tomato — Nunito for
 Blueberry and Inter for Nordic. A variable font opens at its default instance (Fraunces' is a
 black, wonky 9pt), so every size is asked for with its axes set; that is what `TitleFont` does.

 Sizes from the mockup: 34 for a page's large title, 26 for a sheet's, 20 for a section head,
 and the recipe name on a hero or card wherever it sits. They grow with Dynamic Type.

     Text("Plan").titleFont(34)
     Text("Coming up").titleFont(20)
     LargeTitle("Plan", over: "Tuesday, September 29")
 */
enum TitleFont {
    // The axes by their four-letter tags, as CoreText wants them: 'wght', 'opsz', 'SOFT', 'WONK'.
    private static let wght = tag("wght"), opsz = tag("opsz"), soft = tag("SOFT"), wonk = tag("WONK")

    private static func tag(_ s: String) -> NSNumber {
        NSNumber(value: s.utf8.reduce(UInt32(0)) { $0 << 8 | UInt32($1) })
    }

    /// The title face at a size, in the theme in force unless another is given.
    static func uiFont(size: CGFloat, face: TitleFace? = nil, weight: CGFloat? = nil) -> UIFont {
        let face = face ?? ThemeStore.shared.style.title
        var axes: [NSNumber: CGFloat] = [wght: weight ?? face.weight]
        if face.family == .fraunces {
            axes[opsz] = min(144, max(9, face.opticalSize ?? size))
            if let s = face.soft { axes[soft] = s }
            if let w = face.wonk { axes[wonk] = w }
        }
        let attributes: [UIFontDescriptor.AttributeName: Any] = [
            .name: face.family.postScriptName,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): axes,
        ]
        // Missing from the bundle (a target that does not carry the fonts): the system's serif
        // is the nearest thing, rather than Helvetica.
        guard UIFont(name: face.family.postScriptName, size: size) != nil else {
            let system = UIFont.systemFont(ofSize: size, weight: .semibold)
            let serif = system.fontDescriptor.withDesign(face.family == .fraunces ? .serif : .default)
            return serif.map { UIFont(descriptor: $0, size: size) } ?? system
        }
        return UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
    }

    static func font(size: CGFloat, face: TitleFace? = nil) -> Font {
        Font(uiFont(size: size, face: face) as CTFont)
    }

    /// Letter-spacing for a size, in points.
    static func tracking(size: CGFloat, face: TitleFace? = nil) -> CGFloat {
        (face ?? ThemeStore.shared.style.title).tracking * size
    }

    #if DEBUG
    /// The bundled families as the system sees them — a quick check that UIAppFonts took.
    static var registered: [String] {
        ["Fraunces", "Nunito", "Inter"].flatMap { family in
            UIFont.familyNames.filter { $0.hasPrefix(family) }.map { "\($0): \(UIFont.fontNames(forFamilyName: $0).joined(separator: ", "))" }
        }
    }
    #endif
}

/// Title-face text at a size that grows with Dynamic Type, with the theme's letter-spacing.
private struct TitleFontModifier: ViewModifier {
    @ScaledMetric private var size: CGFloat
    var face: TitleFace?
    /// Read so a theme change redraws the title in the new face.
    private var store = ThemeStore.shared

    init(size: CGFloat, relativeTo style: Font.TextStyle, face: TitleFace?) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.face = face
    }

    func body(content: Content) -> some View {
        let face = face ?? store.style.title
        content
            .font(TitleFont.font(size: size, face: face))
            .tracking(TitleFont.tracking(size: size, face: face))
    }
}

extension View {
    /// The theme's title face — 34 large title, 26 sheet title, 20 section head (the mockup's).
    func titleFont(_ size: CGFloat, face: TitleFace? = nil) -> some View {
        let style: Font.TextStyle = size >= 30 ? .largeTitle : size >= 24 ? .title : size >= 19 ? .title3 : .headline
        return modifier(TitleFontModifier(size: size, relativeTo: style, face: face))
    }
}

/**
 The mockup's UI type sizes, in SF Pro. Its body text is 15–17 and its labels small and
 semibold; these keep the same numbers so a screen can be read off the mockup's CSS.
 */
extension Font {
    /// `.lbl` — 11.5 semibold, upper-cased and letter-spaced by `SectionLabel`.
    static let label = Font.system(size: 11.5, weight: .semibold)
    /// `.lr .tt` — a list row's title.
    static let rowTitle = Font.system(size: 16, weight: .medium)
    /// `.lr .st` — the line under it.
    static let rowSubtitle = Font.system(size: 13)
}

#Preview("Title faces") {
    ScrollView {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(ThemeStyle.presets) { style in
                VStack(alignment: .leading, spacing: 4) {
                    Text(style.fullName).font(.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                    Text("Lemon herb chicken").titleFont(34, face: style.title)
                    Text("Coming up").titleFont(20, face: style.title)
                }
            }
            #if DEBUG
            Text(TitleFont.registered.joined(separator: "\n")).font(.caption2).foregroundStyle(Palette.muted)
            #endif
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .foregroundStyle(Palette.text)
    .background(Palette.bg)
}
