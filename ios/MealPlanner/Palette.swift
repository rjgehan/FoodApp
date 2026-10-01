import SwiftUI
import UIKit

/**
 The app's colours: the 21 tokens of the theme in force (Features/Design/ThemeTokens.swift),
 each one light or dark as the screen is. Views take every colour from here, never a hex value
 or one of UIKit's greys, so a theme repaints all of it.

   bg / surface / surface2   the page, a card on it, a well or a segmented control's track
   text / muted / faint      body text, secondary text, placeholders and quiet icons
   border                    hairlines and card edges
   accent                    the filled primary button, the selected thing
   accentSoft / accentInk    tinted fills / accent-coloured text, links, the tab you are on
   onAccent                  text and icons on a filled accent
   herb, mustard, plum, sky  good, warning, eating out, cupboard — each with a Soft fill
   tab, scrim                the tab bar's frosted fill, the shade behind a sheet

 They are read from ThemeStore each time, which is also what redraws a view when the theme
 changes. `Palette.ui` has the same colours for UIKit.
 */
enum Palette {
    static var bg: Color { token(\.bg) }
    static var surface: Color { token(\.surface) }
    static var surface2: Color { token(\.surface2) }
    static var text: Color { token(\.text) }
    static var muted: Color { token(\.muted) }
    static var faint: Color { token(\.faint) }
    static var border: Color { token(\.border) }
    static var accent: Color { token(\.accent) }
    static var accentSoft: Color { token(\.accentSoft) }
    static var onAccent: Color { token(\.onAccent) }
    static var accentInk: Color { token(\.accentInk) }
    static var herb: Color { token(\.herb) }
    static var herbSoft: Color { token(\.herbSoft) }
    static var mustard: Color { token(\.mustard) }
    static var mustardSoft: Color { token(\.mustardSoft) }
    static var plum: Color { token(\.plum) }
    static var plumSoft: Color { token(\.plumSoft) }
    static var sky: Color { token(\.sky) }
    static var skySoft: Color { token(\.skySoft) }
    static var tab: Color { token(\.tab) }
    static var scrim: Color { token(\.scrim) }

    /// Something wrong — a failed save, a destructive action. The mockup has no red of its own
    /// and uses the accent's ink, which in Tomato is already a tomato red.
    static var danger: Color { accentInk }

    /// The card shadow (`--shadow`): a soft two-layer drop in light, nothing visible in dark.
    static var shadow: Color { Color(dynamic(light: RGBA(rgb: 0x2B211A, alpha: 0.06), dark: RGBA(rgb: 0, alpha: 0))) }

    /// A token as a SwiftUI colour that follows light and dark.
    static func token(_ key: KeyPath<ThemeTokens, RGBA>) -> Color {
        Color(ui(key))
    }

    /// A token for UIKit: the bars, the switch, the segmented control.
    static func ui(_ key: KeyPath<ThemeTokens, RGBA>, in style: ThemeStyle? = nil) -> UIColor {
        let style = style ?? ThemeStore.shared.style
        return dynamic(light: style.light[keyPath: key], dark: style.dark[keyPath: key])
    }

    private static func dynamic(light: RGBA, dark: RGBA) -> UIColor {
        let l = light.uiColor, d = dark.uiColor
        return UIColor { $0.userInterfaceStyle == .dark ? d : l }
    }

    /**
     A recognisable soft fill for a group or section tile, by position: the five tones' Soft
     colours and the well, in the theme's colours. A tile on it takes `coverInk` for its icon.
    */
    private static let coverTones: [Tone] = [.accent, .mustard, .herb, .plum, .sky, .neutral]

    static func cover(index: Int) -> Color { coverTones[index % coverTones.count].soft }

    /// The same hash the web's `coverClass` uses, so a group keeps its colour across both — and
    /// keeps it between launches, which is what makes it useful.
    static func cover(for id: String) -> Color { coverTone(for: id).soft }

    static func coverTone(for id: String) -> Tone {
        var hash: UInt32 = 0
        for scalar in id.unicodeScalars { hash = hash &* 31 &+ scalar.value }
        return coverTones[Int(hash % UInt32(coverTones.count))]
    }
}

/**
 The meaning-carrying colours as a pair each — the soft fill and the ink that reads on it — the
 mockup's `pill(…, tone)`, `tile(…, tone)` and `noteBox(…, tone)`.
 */
enum Tone: String, CaseIterable, Hashable {
    case accent, herb, mustard, plum, sky, neutral

    /// The fill behind it.
    var soft: Color {
        switch self {
        case .accent: return Palette.accentSoft
        case .herb: return Palette.herbSoft
        case .mustard: return Palette.mustardSoft
        case .plum: return Palette.plumSoft
        case .sky: return Palette.skySoft
        case .neutral: return Palette.surface2
        }
    }

    /// Text and icons on `soft` (and the tone on its own, as text).
    var ink: Color {
        switch self {
        case .accent: return Palette.accentInk
        case .herb: return Palette.herb
        case .mustard: return Palette.mustard
        case .plum: return Palette.plum
        case .sky: return Palette.sky
        case .neutral: return Palette.muted
        }
    }
}
