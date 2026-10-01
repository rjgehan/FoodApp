import Observation
import SwiftUI
import UIKit

/**
 Each person's theme, the same one the web uses: kept on the server (PUT /api/users/me/theme) so
 it follows you between the phone and the web, and cached here so the app opens in it.

 A theme is one of the five presets (Tomato, Matcha, Blueberry, Brunch, Nordic — their colours
 are in Features/Design/ThemeTokens.swift) or Custom, your own accent on Tomato's neutrals; and
 Light, Dark or System on top. Everything nil is Tomato following the phone.
 */
struct Theme: Codable, Hashable {
    /// A preset's key, "custom", or nil for Tomato. Older apps and servers used other keys
    /// ("classic", "basil"…); `activeKey` reads those as the theme that replaced them.
    var preset: String?
    /// Custom's accent as #RRGGBB, kept while a preset is on so Custom finds it again.
    var primary: String?
    /// The server wants two colours for Custom (the old design had a second one). Sent as the
    /// accent when there is nothing else, and otherwise left alone.
    var secondary: String?
    var mode: ThemeMode?

    static let standard = Theme()

    /// Which one is on, in the new keys: "tomato" for the default, "custom" for your own colour.
    var activeKey: String {
        if preset == ThemePreset.custom, primary != nil { return ThemePreset.custom }
        return ThemePreset.canonical(preset)
    }

    /// Every colour and the title face in force.
    var style: ThemeStyle {
        if activeKey == ThemePreset.custom, let primary { return .custom(accent: primary) }
        return ThemeStyle.preset(activeKey) ?? .tomato
    }

    /// The same choice with the preset in the new keys — what is cached, shown and sent back.
    var normalized: Theme {
        var next = self
        if let preset, preset != ThemePreset.custom { next.preset = ThemePreset.canonical(preset) }
        if next.preset == ThemePreset.custom, next.primary == nil { next.preset = ThemePreset.tomato }
        return next
    }

    /// What the Settings row says: "Tomato · System".
    var summary: String {
        "\(style.name) · \((mode ?? .system).label)"
    }
}

enum ThemeMode: String, Codable, CaseIterable, Hashable {
    case system = "SYSTEM"
    case light = "LIGHT"
    case dark = "DARK"

    var label: String {
        switch self {
        case .system: return "System"
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

/// The preset keys the web, this app and the server share.
enum ThemePreset {
    static let tomato = "tomato"
    static let custom = "custom"
    static let keys = ["tomato", "matcha", "blueberry", "brunch", "nordic"]

    /**
     The eight presets of the old design, read as the theme that replaced each. The server
     migrates its rows once, but an account can still arrive with an old key — from a server not
     yet updated, or saved by an old build of this app — and it should look like what it became.
     */
    static let legacy: [String: String] = [
        "classic": "tomato", "mocha": "tomato",
        "basil": "matcha", "lagoon": "matcha",
        "ocean": "blueberry", "blueberry": "blueberry", "plum": "blueberry",
        "graphite": "nordic",
    ]

    /// A key in the new set; anything unknown or missing is Tomato.
    static func canonical(_ key: String?) -> String {
        guard let key = key?.lowercased() else { return tomato }
        if keys.contains(key) { return key }
        return legacy[key] ?? tomato
    }
}

// MARK: - The one theme in force

/**
 The theme the whole app is drawn in. Observable, so every view that reads a Palette colour is
 redrawn when it changes — Palette's colours read from here. The UIKit bars, which do not watch
 it, are repainted from `set` (Chrome.swift).
 */
@Observable
final class ThemeStore {
    static let shared = ThemeStore()

    private(set) var theme: Theme
    /// Worked out once per change rather than on every draw.
    private(set) var style: ThemeStyle

    private static let key = "mp_theme"
    /// Bumped by every pick here. A /me fetched before the latest pick carries the theme from
    /// before it, and adopting that would undo what was just tapped.
    private var picks = 0

    init(theme: Theme? = nil) {
        let start = (theme ?? Self.cached()).normalized
        self.theme = start
        self.style = start.style
    }

    /// Light or dark as chosen; nil follows the phone.
    var colorScheme: ColorScheme? { (theme.mode ?? .system).colorScheme }

    /// A pick on the Theme screen: in force at once, kept for the next launch. Saving is separate.
    func pick(_ next: Theme) {
        picks += 1
        set(next.normalized)
    }

    /// What the server says, unless something has been picked since `since` was read.
    func adopt(_ server: Theme?, since: Int) {
        guard let server = server?.normalized, since == picks, server != theme else { return }
        set(server)
    }

    var pickCount: Int { picks }

    /// Signing out: the next person gets the app's own colours until theirs load — in the light
    /// or dark this phone was set to on its first run, which belongs to the phone, not to them.
    func reset() { set(Theme(mode: DeviceThemeMode.current)) }

    private func set(_ next: Theme) {
        // Sign-out finishes wherever its last await left it; the screen is only changed from main.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.set(next) }
            return
        }
        theme = next
        style = next.style
        // Only the shared store owns the phone's defaults and windows; a preview's own store
        // (ThemeStore(theme:)) must not repaint the app around it.
        guard self === ThemeStore.shared else { return }
        if next == .standard {
            UserDefaults.standard.removeObject(forKey: Self.key)
        } else if let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
        applyInterfaceStyle()
        Chrome.apply(style)
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
            for window in scene.windows {
                window.overrideUserInterfaceStyle = style
                // A sheet already up keeps the style it was presented with — which is where the
                // Theme screen itself lives, so picking Dark there would change everything but it.
                // Going back to System it needs the phone's own style spelled out: "unspecified"
                // leaves it in the one it was pinned to.
                let sheetStyle = style == .unspecified ? scene.screen.traitCollection.userInterfaceStyle : style
                var presented = window.rootViewController?.presentedViewController
                while let controller = presented {
                    controller.overrideUserInterfaceStyle = sheetStyle
                    // The clock and battery would otherwise stay dark on a page now dark too.
                    controller.setNeedsStatusBarAppearanceUpdate()
                    presented = controller.presentedViewController
                }
                window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
            }
        }
    }

    private static func cached() -> Theme {
        guard let data = UserDefaults.standard.data(forKey: key),
              let theme = try? JSONDecoder().decode(Theme.self, from: data) else { return .standard }
        return theme
    }
}
