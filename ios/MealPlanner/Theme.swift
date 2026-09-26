import Observation
import SwiftUI
import UIKit

/**
 Each person's colours, the same ones the web uses: kept on the server (PUT /api/users/me/theme)
 so they follow you between the phone and the web, and cached here so the app opens in them.

 What the two colours drive is written up in web/src/theme/colors.ts, and the arithmetic below is
 that file's, step for step, so a custom pair comes out the same on both:

   primary    Palette.accent — buttons, links, the tab you are on, ticks, switches.
   secondary  Palette.secondarySoft — the tinted fills: your initial, notices, a selected icon —
              with Palette.secondary for the text and icons on them.

 Everything nil is the app as it has always looked: Classic, following the phone's light or dark.
 */
struct Theme: Codable, Hashable {
    /// A preset's key, "custom", or nil for Classic.
    var preset: String?
    /// The custom pair as #RRGGBB, kept while a preset is on so Custom finds them again.
    var primary: String?
    var secondary: String?
    var mode: ThemeMode?

    static let standard = Theme()

    /// Which one is on: "classic" for the default, "custom" for your own pair.
    var activeKey: String {
        if preset == ThemePreset.custom, primary != nil, secondary != nil { return ThemePreset.custom }
        if let preset, ThemePreset.named(preset) != nil { return preset }
        return "classic"
    }

    /// The pair in force, for a swatch.
    var pair: (primary: String, secondary: String) {
        if activeKey == ThemePreset.custom, let primary, let secondary { return (primary, secondary) }
        let p = ThemePreset.named(activeKey) ?? ThemePreset.all[0]
        return (p.primary, p.secondary)
    }

    /// Classic is Palette's own values; anything else is worked out from its pair.
    var colors: ThemeColors? {
        activeKey == "classic" ? nil : ThemeColors(primary: pair.primary, secondary: pair.secondary)
    }

    /// What the Settings row says.
    var summary: String {
        let name = activeKey == ThemePreset.custom ? "Custom" : ThemePreset.named(activeKey)?.name ?? "Classic"
        switch mode {
        case .light: return "\(name), light"
        case .dark: return "\(name), dark"
        default: return name
        }
    }
}

enum ThemeMode: String, Codable, CaseIterable, Hashable {
    case system = "SYSTEM"
    case light = "LIGHT"
    case dark = "DARK"

    var label: String {
        switch self {
        case .system: return "Auto"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: return .unspecified
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// The eight pairs, in the web's order and with the web's keys (web/src/theme/theme.ts, and
/// ThemeSettings.java on the server). Classic's colours are only for its swatch.
struct ThemePreset: Identifiable, Hashable {
    let key: String
    let name: String
    let primary: String
    let secondary: String
    var id: String { key }

    static let custom = "custom"

    static let all: [ThemePreset] = [
        ThemePreset(key: "classic", name: "Classic", primary: "#EA580C", secondary: "#FDBA74"),
        ThemePreset(key: "basil", name: "Basil", primary: "#15803D", secondary: "#EAB308"),
        ThemePreset(key: "lagoon", name: "Lagoon", primary: "#0F766E", secondary: "#F97316"),
        ThemePreset(key: "ocean", name: "Ocean", primary: "#0369A1", secondary: "#14B8A6"),
        ThemePreset(key: "blueberry", name: "Blueberry", primary: "#4F46E5", secondary: "#EC4899"),
        ThemePreset(key: "plum", name: "Plum", primary: "#7E22CE", secondary: "#F472B6"),
        ThemePreset(key: "mocha", name: "Mocha", primary: "#7C4A2D", secondary: "#D4A373"),
        ThemePreset(key: "graphite", name: "Graphite", primary: "#334155", secondary: "#0EA5E9"),
    ]

    static func named(_ key: String?) -> ThemePreset? { all.first { $0.key == key } }
}

// MARK: - Working out a palette from two colours

/// One mode's derived colours, as 0xRRGGBB.
struct ModeColors: Hashable {
    let accent: UInt32
    let accentInk: UInt32
    let secondary: UInt32
    let secondarySoft: UInt32
}

/// Both modes' colours from a pair. The same steps and numbers as colors.ts's deriveColors.
struct ThemeColors: Hashable {
    let light: ModeColors
    let dark: ModeColors

    private static let white: UInt32 = 0xFFFFFF
    private static let darkSurface: UInt32 = 0x1C1C1E
    private static let darkInk: UInt32 = 0x1C1917

    /// Palette's own values, for the preview of Classic.
    static let classic = ThemeColors(
        light: ModeColors(accent: 0xEA580C, accentInk: 0xFFFFFF, secondary: 0xEA580C, secondarySoft: 0xFFEDD5),
        dark: ModeColors(accent: 0xFF9F40, accentInk: 0x1C1917, secondary: 0xFF9F40, secondarySoft: 0x402008)
    )

    init(light: ModeColors, dark: ModeColors) {
        self.light = light
        self.dark = dark
    }

    init(primary: String, secondary: String) {
        let p = Self.rgb(primary) ?? 0xEA580C
        let s = Self.rgb(secondary) ?? 0xFDBA74

        let lightAccent = Self.untilReadable(p, against: Self.white, min: 3.5, towards: -1)
        let lightSoft = Self.tint(s, lightness: 0.92)
        let darkAccent = Self.untilReadable(p, against: Self.darkSurface, min: 6, towards: 1)
        let darkSoft = Self.tint(s, lightness: 0.15, maxSaturation: 0.75)

        light = ModeColors(
            accent: lightAccent,
            accentInk: Self.inkOn(lightAccent),
            secondary: Self.untilReadable(s, against: lightSoft, min: 4.5, towards: -1),
            secondarySoft: lightSoft
        )
        dark = ModeColors(
            accent: darkAccent,
            accentInk: Self.inkOn(darkAccent),
            secondary: Self.untilReadable(s, against: darkSoft, min: 4.5, towards: 1),
            secondarySoft: darkSoft
        )
    }

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

    private static func hsl(_ c: UInt32) -> (Double, Double, Double) {
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

    private static func fromHsl(_ h: Double, _ s: Double, _ l: Double) -> UInt32 {
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

    private static func tint(_ color: UInt32, lightness: Double, maxSaturation: Double = 1) -> UInt32 {
        let (h, s, _) = hsl(color)
        return fromHsl(h, Swift.min(s, maxSaturation), lightness)
    }

    private static func inkOn(_ fill: UInt32) -> UInt32 {
        contrast(fill, white) >= 3 ? white : darkInk
    }
}

// MARK: - The one theme in force

/**
 The theme the whole app is drawn in. Observable, so every view that reads a Palette colour is
 redrawn when it changes — Palette's colours read from here.
 */
@Observable
final class ThemeStore {
    static let shared = ThemeStore()

    private(set) var theme: Theme
    /// Worked out once per change rather than on every draw.
    private(set) var colors: ThemeColors?

    private static let key = "mp_theme"
    /// Bumped by every pick here. A /me fetched before the latest pick carries the theme from
    /// before it, and adopting that would undo what was just tapped.
    private var picks = 0

    init(theme: Theme? = nil) {
        let start = theme ?? Self.cached()
        self.theme = start
        self.colors = start.colors
    }

    /// Light or dark as chosen; nil follows the phone.
    var colorScheme: ColorScheme? { (theme.mode ?? .system).colorScheme }

    /// A pick in Appearance: in force at once, kept for the next launch. Saving is separate.
    func pick(_ next: Theme) {
        picks += 1
        set(next)
    }

    /// What the server says, unless something has been picked since `since` was read.
    func adopt(_ server: Theme?, since: Int) {
        guard let server, since == picks, server != theme else { return }
        set(server)
    }

    var pickCount: Int { picks }

    /// Signing out: the next person gets the app's own colours until theirs load.
    func reset() { set(.standard) }

    private func set(_ next: Theme) {
        // Sign-out finishes wherever its last await left it; the screen is only changed from main.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.set(next) }
            return
        }
        theme = next
        colors = next.colors
        if next == .standard {
            UserDefaults.standard.removeObject(forKey: Self.key)
        } else if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
        applyInterfaceStyle()
    }

    /**
     Light or dark on every window, sheets included. preferredColorScheme does the same for the
     view it is on, but going back from a pinned mode to nil does not always let go until the
     next launch; setting the windows directly always does.
     */
    func applyInterfaceStyle() {
        let style = (theme.mode ?? .system).interfaceStyle
        for scene in UIApplication.shared.connectedScenes {
            guard let scene = scene as? UIWindowScene else { continue }
            for window in scene.windows { window.overrideUserInterfaceStyle = style }
        }
    }

    private static func cached() -> Theme {
        guard let data = UserDefaults.standard.data(forKey: key),
              let theme = try? JSONDecoder().decode(Theme.self, from: data) else { return .standard }
        return theme
    }
}
