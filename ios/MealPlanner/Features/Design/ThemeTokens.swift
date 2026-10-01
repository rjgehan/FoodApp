import SwiftUI
import UIKit

/**
 The five themes of the redesign ("Tomato Kitchen" and its four siblings) and Custom, as the 21
 colour tokens every screen is drawn with, plus each theme's title face.

 The values are the mockup's THEMES table, token for token and in its order (TOKEN_KEYS), and the
 web's twin of this file uses the same table — so a colour changes in both or in neither. Palette
 hands them to views; nothing outside this file should spell out a hex value for UI chrome.

 What each colour means, kept the same in every theme:
   accent    tomato: primary actions, the tab you are on, links (accentInk is it as text)
   herb      good / done / "have it" / switches on
   mustard   warnings, "not on the list", running low
   plum      eating out, places
   sky       the cupboard, information
 */
struct ThemeTokens: Hashable {
    var bg: RGBA
    var surface: RGBA
    var surface2: RGBA
    var text: RGBA
    var muted: RGBA
    var faint: RGBA
    var border: RGBA
    var accent: RGBA
    var accentSoft: RGBA
    var onAccent: RGBA
    var accentInk: RGBA
    var herb: RGBA
    var herbSoft: RGBA
    var mustard: RGBA
    var mustardSoft: RGBA
    var plum: RGBA
    var plumSoft: RGBA
    var sky: RGBA
    var skySoft: RGBA
    var tab: RGBA
    var scrim: RGBA

    /// In the mockup's TOKEN_KEYS order, so a row of its THEMES table can be pasted in as is.
    init(_ values: [String]) {
        precondition(values.count == 21, "A theme has 21 tokens")
        let v = values.map { RGBA($0) }
        bg = v[0]; surface = v[1]; surface2 = v[2]; text = v[3]; muted = v[4]; faint = v[5]
        border = v[6]; accent = v[7]; accentSoft = v[8]; onAccent = v[9]; accentInk = v[10]
        herb = v[11]; herbSoft = v[12]; mustard = v[13]; mustardSoft = v[14]; plum = v[15]
        plumSoft = v[16]; sky = v[17]; skySoft = v[18]; tab = v[19]; scrim = v[20]
    }
}

/// One colour as the mockup writes it: "#RRGGBB" or "rgba(r,g,b,a)".
struct RGBA: Hashable {
    var rgb: UInt32
    var alpha: Double = 1

    init(rgb: UInt32, alpha: Double = 1) {
        self.rgb = rgb
        self.alpha = alpha
    }

    init(_ css: String) {
        let s = css.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("rgba(") {
            let parts = s.dropFirst(5).dropLast().split(separator: ",").map {
                Double($0.trimmingCharacters(in: .whitespaces)) ?? 0
            }
            rgb = UInt32(parts[0]) << 16 | UInt32(parts[1]) << 8 | UInt32(parts[2])
            alpha = parts.count > 3 ? parts[3] : 1
        } else {
            rgb = ThemeColors.rgb(s) ?? 0xFF00FF
        }
    }

    var uiColor: UIColor {
        UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }

    var color: Color { Color(uiColor) }
}

/// Which typeface a theme sets its titles in. UI text is always SF Pro.
enum TitleFamily: String, Hashable {
    case fraunces, nunito, inter

    /// The PostScript name of the variable font's default instance; the axes do the rest.
    var postScriptName: String {
        switch self {
        case .fraunces: return "Fraunces-9ptBlack"
        case .nunito: return "Nunito-ExtraLight"
        case .inter: return "Inter-Regular"
        }
    }
}

/**
 A theme's title face: the family and its variable axes, as the mockup's `font` entry for it.
 `opticalSize` nil follows the point size, which is what a browser does with Fraunces by default.
 */
struct TitleFace: Hashable {
    var family: TitleFamily
    var weight: CGFloat
    var soft: CGFloat? = nil
    var wonk: CGFloat? = nil
    var opticalSize: CGFloat? = nil
    /// Letter-spacing in ems: -0.01 is -1% of the point size.
    var tracking: CGFloat
}

/// A whole theme: both modes and the title face.
struct ThemeStyle: Hashable, Identifiable {
    let key: String
    /// "Tomato" — what the Theme screen and Settings row say.
    let name: String
    /// "Tomato Kitchen" — the mockup's full name, for a longer description.
    let fullName: String
    let light: ThemeTokens
    let dark: ThemeTokens
    let title: TitleFace
    var id: String { key }

    func tokens(_ scheme: ColorScheme) -> ThemeTokens { scheme == .dark ? dark : light }
}

extension ThemeStyle {
    static let tomato = ThemeStyle(
        key: "tomato", name: "Tomato", fullName: "Tomato Kitchen",
        light: ThemeTokens(["#FBF6EE", "#FFFFFF", "#F4ECDF", "#2B211A", "#7C6B5C", "#B3A596", "#EADFCF", "#D4512E", "#FBE4DA", "#FFFFFF", "#C2461F", "#4F7F43", "#E2EEDA", "#A87A0E", "#FAF0D3", "#8A4B78", "#F4E3EF", "#3F76A3", "#E1EDF6", "rgba(255,253,249,.94)", "rgba(43,33,26,.38)"]),
        dark: ThemeTokens(["#17120F", "#231C17", "#2E251E", "#F6EDE3", "#A99A8B", "#6E6155", "#3A3029", "#EE6D4A", "#42251C", "#FFFFFF", "#F2825F", "#8FBC7C", "#243220", "#E6B64B", "#3A2F14", "#D08FBE", "#35212F", "#86B6DD", "#1C2B38", "rgba(30,24,20,.94)", "rgba(0,0,0,.55)"]),
        title: TitleFace(family: .fraunces, weight: 600, soft: 100, wonk: 0, tracking: -0.01)
    )

    static let matcha = ThemeStyle(
        key: "matcha", name: "Matcha", fullName: "Matcha Café",
        light: ThemeTokens(["#F4F4EC", "#FFFFFF", "#E8EBDC", "#1E2A1F", "#5E6A5B", "#A2AB9B", "#DCE0CE", "#3D6B39", "#DDE9D6", "#FFFFFF", "#35602F", "#2C7E6C", "#D5ECE5", "#A3730D", "#F4EACD", "#B0553E", "#F6E0D8", "#4B6E91", "#DFE8F0", "rgba(252,252,247,.94)", "rgba(20,30,20,.36)"]),
        dark: ThemeTokens(["#111510", "#1A2019", "#242C22", "#EDF1E5", "#9CA794", "#5D6757", "#2E372C", "#8CC47E", "#233520", "#0F1F0D", "#9ED091", "#6CC6B1", "#152F29", "#E0B74D", "#342B11", "#E68E73", "#3A2018", "#8EB3D8", "#192633", "rgba(22,28,21,.94)", "rgba(0,0,0,.55)"]),
        title: TitleFace(family: .fraunces, weight: 500, soft: 0, wonk: 0, opticalSize: 72, tracking: -0.02)
    )

    static let blueberry = ThemeStyle(
        key: "blueberry", name: "Blueberry", fullName: "Blueberry Pancake",
        light: ThemeTokens(["#F6F4FC", "#FFFFFF", "#ECE8F7", "#211C3B", "#6B6589", "#AAA5C4", "#E1DCF1", "#4F46D8", "#E4E2FB", "#FFFFFF", "#453DC4", "#2D8A5E", "#DBF0E4", "#B5741A", "#F8E9D1", "#C0457E", "#F8DEEA", "#2C7DB2", "#DCEDF8", "rgba(252,251,255,.94)", "rgba(30,24,60,.36)"]),
        dark: ThemeTokens(["#110F22", "#1B1832", "#252140", "#EEEBFB", "#A29EC2", "#615C84", "#2E2A4D", "#8F89FF", "#29255A", "#13113A", "#A39EFF", "#6FD4A2", "#16302A", "#F1B55B", "#382914", "#F28FBC", "#3B1C2E", "#7DC0EB", "#15283A", "rgba(22,20,42,.94)", "rgba(0,0,0,.55)"]),
        title: TitleFace(family: .nunito, weight: 800, tracking: -0.01)
    )

    static let brunch = ThemeStyle(
        key: "brunch", name: "Brunch", fullName: "Sunday Brunch",
        light: ThemeTokens(["#FFF8E6", "#FFFFFF", "#FBEFCC", "#2A2112", "#7B6A45", "#BAA982", "#F0E1B9", "#F5B800", "#FDECB0", "#2A2112", "#8F6A00", "#3C8A4D", "#DCF0DC", "#C5480F", "#FDE2D2", "#1E708C", "#D8ECF3", "#5A63D3", "#E3E5FA", "rgba(255,252,242,.94)", "rgba(42,33,18,.36)"]),
        dark: ThemeTokens(["#16120A", "#211B0F", "#2C2414", "#FBF1D8", "#B4A37E", "#6D6146", "#3A301C", "#F7C521", "#3B3010", "#221A04", "#F7C521", "#7DCB8A", "#1A2F1E", "#F59A5B", "#3A2214", "#6CC4DE", "#142F39", "#9CA6F6", "#1D2140", "rgba(28,23,13,.94)", "rgba(0,0,0,.55)"]),
        title: TitleFace(family: .fraunces, weight: 700, soft: 100, wonk: 1, tracking: -0.02)
    )

    static let nordic = ThemeStyle(
        key: "nordic", name: "Nordic", fullName: "Nordic Pantry",
        light: ThemeTokens(["#F6F6F3", "#FFFFFF", "#EDEDE9", "#141413", "#6A6A66", "#ADADA7", "#E3E3DE", "#1A1A19", "#EAEAE6", "#FFFFFF", "#1A1A19", "#4A7A5E", "#E1ECE4", "#9A6A14", "#F4EAD6", "#8C5B45", "#F1E5DF", "#46708F", "#E2EBF1", "rgba(250,250,248,.94)", "rgba(20,20,19,.34)"]),
        dark: ThemeTokens(["#0D0D0C", "#171716", "#222220", "#F2F2EF", "#9A9A94", "#5A5A55", "#2A2A28", "#F2F2EF", "#272725", "#111110", "#F2F2EF", "#82C29E", "#15271D", "#E2B15C", "#2F2412", "#D39D84", "#2E211B", "#8EB8D5", "#162430", "rgba(20,20,19,.94)", "rgba(0,0,0,.6)"]),
        title: TitleFace(family: .inter, weight: 700, tracking: -0.035)
    )

    /// The five, in the Theme screen's order. Custom is built from a colour (`custom(accent:)`).
    static let presets: [ThemeStyle] = [.tomato, .matcha, .blueberry, .brunch, .nordic]

    static func preset(_ key: String) -> ThemeStyle? { presets.first { $0.key == key } }

    /**
     Your own accent on Tomato's neutrals: everything but the four accent tokens is Tomato's, and
     those four are worked out from the one colour so text stays readable on and in it — darkened
     until it reads on cream in light, lightened until it reads on the dark surface in dark, with
     white or near-black on a filled button, whichever reads.
     */
    static func custom(accent hex: String) -> ThemeStyle {
        let p = ThemeColors.rgb(hex) ?? 0xD4512E
        var light = tomato.light
        var dark = tomato.dark

        let lightAccent = ThemeColors.untilReadable(p, against: light.surface.rgb, min: 3, towards: -1)
        light.accent = RGBA(rgb: lightAccent)
        light.accentInk = RGBA(rgb: ThemeColors.untilReadable(p, against: light.bg.rgb, min: 4.5, towards: -1))
        light.accentSoft = RGBA(rgb: ThemeColors.tint(p, lightness: 0.92, maxSaturation: 0.85))
        light.onAccent = RGBA(rgb: ThemeColors.inkOn(lightAccent, dark: light.text.rgb))

        let darkAccent = ThemeColors.untilReadable(p, against: dark.surface.rgb, min: 4, towards: 1)
        dark.accent = RGBA(rgb: darkAccent)
        dark.accentInk = RGBA(rgb: ThemeColors.untilReadable(p, against: dark.bg.rgb, min: 5.5, towards: 1))
        dark.accentSoft = RGBA(rgb: ThemeColors.tint(p, lightness: 0.18, maxSaturation: 0.45))
        dark.onAccent = RGBA(rgb: ThemeColors.inkOn(darkAccent, dark: dark.bg.rgb))

        return ThemeStyle(key: ThemePreset.custom, name: "Custom", fullName: "Your own colour",
                          light: light, dark: dark, title: tomato.title)
    }
}

// MARK: - Colour arithmetic

/// The colour sums Custom needs: WCAG contrast, and nudging a colour's lightness until it reads.
/// The same steps as the web's colors.ts, so a custom accent comes out the same on both.
enum ThemeColors {
    /// "#EA580C" or "ea580c" → 0xEA580C; anything else → nil.
    static func rgb(_ hex: String) -> UInt32? {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, h.allSatisfy(\.isHexDigit) else { return nil }
        return UInt32(h, radix: 16)
    }

    static func hex(_ rgb: UInt32) -> String { String(format: "#%06X", rgb) }

    private static func channels(_ c: UInt32) -> (Double, Double, Double) {
        (Double((c >> 16) & 0xFF), Double((c >> 8) & 0xFF), Double(c & 0xFF))
    }

    static func luminance(_ c: UInt32) -> Double {
        func lin(_ v: Double) -> Double {
            let s = v / 255
            return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        let (r, g, b) = channels(c)
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    static func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    static func hsl(_ c: UInt32) -> (Double, Double, Double) {
        let (r, g, b) = channels(c)
        let rn = r / 255, gn = g / 255, bn = b / 255
        let mx = max(rn, gn, bn), mn = min(rn, gn, bn)
        let l = (mx + mn) / 2
        if mx == mn { return (0, 0, l) }
        let d = mx - mn
        let s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
        var h: Double
        if mx == rn { h = (gn - bn) / d + (gn < bn ? 6 : 0) }
        else if mx == gn { h = (bn - rn) / d + 2 }
        else { h = (rn - gn) / d + 4 }
        return (h * 60, s, l)
    }

    static func fromHsl(_ h: Double, _ s: Double, _ l: Double) -> UInt32 {
        let c = (1 - abs(2 * l - 1)) * s
        let hp = (h.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360) / 60
        let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
        let (r1, g1, b1): (Double, Double, Double)
        switch hp {
        case ..<1: (r1, g1, b1) = (c, x, 0)
        case ..<2: (r1, g1, b1) = (x, c, 0)
        case ..<3: (r1, g1, b1) = (0, c, x)
        case ..<4: (r1, g1, b1) = (0, x, c)
        case ..<5: (r1, g1, b1) = (x, 0, c)
        default: (r1, g1, b1) = (c, 0, x)
        }
        let m = l - c / 2
        // JavaScript's Math.round: halves go up, which Swift's .rounded() does not do for negatives.
        func byte(_ v: Double) -> UInt32 { UInt32(max(0, min(255, floor((v + m) * 255 + 0.5)))) }
        return byte(r1) << 16 | byte(g1) << 8 | byte(b1)
    }

    /// Darker (-1) or lighter (+1) a percent of lightness at a time until it reads on `against`.
    static func untilReadable(_ color: UInt32, against: UInt32, min: Double, towards: Double) -> UInt32 {
        let (h, s, l0) = hsl(color)
        var out = color
        var step = 1.0
        while step <= 100, contrast(out, against) < min {
            let l = Swift.min(1, Swift.max(0, l0 + towards * step / 100))
            out = fromHsl(h, s, l)
            if l == 0 || l == 1 { break }
            step += 1
        }
        return out
    }

    /// The colour's hue at a set lightness — a soft fill behind text in that colour.
    static func tint(_ color: UInt32, lightness: Double, maxSaturation: Double = 1) -> UInt32 {
        let (h, s, _) = hsl(color)
        return fromHsl(h, Swift.min(s, maxSaturation), lightness)
    }

    /// White on a fill it reads on, otherwise the theme's dark ink — Brunch's yellow wants dark.
    static func inkOn(_ fill: UInt32, dark: UInt32) -> UInt32 {
        contrast(fill, 0xFFFFFF) >= 3 ? 0xFFFFFF : dark
    }
}

extension Color {
    /// "#RRGGBB"; anything unreadable is Tomato's accent rather than a crash.
    init(hex: String) {
        self.init(rgb: ThemeColors.rgb(hex) ?? 0xD4512E)
    }

    init(rgb: UInt32) {
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }

    /// As #RRGGBB in sRGB — what the server keeps. A wide-gamut pick is brought inside sRGB.
    var hexString: String? {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        func byte(_ v: CGFloat) -> UInt32 { UInt32((min(1, max(0, v)) * 255).rounded()) }
        return ThemeColors.hex(byte(r) << 16 | byte(g) << 8 | byte(b))
    }
}
