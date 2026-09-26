import SwiftUI
import UIKit

/**
 Settings → Appearance: light or dark, and the app's colours — eight pairs chosen to read well,
 or your own. The same choices as the web's, saved to your account so both follow.

 Every tap takes effect at once, across the whole app, and is saved as it is made; the colour
 wells save once a drag has settled. There is no Save to hunt for.
 */
struct AppearanceScreen: View {
    var store = ThemeStore.shared

    @State private var saveError: String?
    /// A colour drag still settling, saved once it stops.
    @State private var pendingSave: Task<Void, Never>?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)

    var body: some View {
        let theme = store.theme
        List {
            Section {
                Picker("Light or dark", selection: Binding(
                    get: { theme.mode ?? .system },
                    set: { mode in
                        var next = store.theme
                        next.mode = mode
                        choose(next)
                    }
                )) {
                    ForEach([ThemeMode.light, .dark, .system], id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } footer: {
                Text("Auto follows the phone's own setting.")
            }

            Section("Colours") {
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(ThemePreset.all) { preset in
                        Button {
                            var next = store.theme
                            next.preset = preset.key
                            choose(next)
                        } label: {
                            VStack(spacing: 6) {
                                ThemeSwatch(pair: (preset.primary, preset.secondary), size: 50)
                                    .padding(3)
                                    .overlay {
                                        if theme.activeKey == preset.key {
                                            Circle().strokeBorder(.primary, lineWidth: 2)
                                            Image(systemName: "checkmark")
                                                .font(.headline.weight(.bold))
                                                .foregroundStyle(.white)
                                                .shadow(radius: 1)
                                        }
                                    }
                                Text(preset.name)
                                    .font(.caption)
                                    .fontWeight(theme.activeKey == preset.key ? .semibold : .regular)
                                    .foregroundStyle(theme.activeKey == preset.key ? .primary : .secondary)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(preset.name)
                        .accessibilityAddTraits(theme.activeKey == preset.key ? .isSelected : [])
                    }
                }
                .padding(.vertical, 6)

                Button {
                    // Starts from the colours on screen, so it is a nudge away from what you had.
                    var next = theme
                    let pair = theme.pair
                    next.preset = ThemePreset.custom
                    next.primary = theme.primary ?? pair.primary
                    next.secondary = theme.secondary ?? pair.secondary
                    choose(next)
                } label: {
                    HStack(spacing: 12) {
                        Circle()
                            .fill(AngularGradient(colors: [.red, .orange, .yellow, .green, .teal, .blue, .purple, .red],
                                                  center: .center))
                            .frame(width: 28, height: 28)
                        Text("Your own colours").foregroundStyle(.primary)
                        Spacer()
                        if theme.activeKey == ThemePreset.custom {
                            Image(systemName: "checkmark").foregroundStyle(Palette.accent)
                        }
                    }
                }
            }

            if theme.activeKey == ThemePreset.custom {
                Section {
                    ColorPicker(selection: colorBinding(\.primary), supportsOpacity: false) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Main colour")
                            Text("Buttons, links and the tab you're on.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    ColorPicker(selection: colorBinding(\.secondary), supportsOpacity: false) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Second colour")
                            Text("Highlights: your initial, badges, a selected icon.").font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("Adjusted where it has to be so text on it stays readable, in light and in dark.")
                }
            }

            Section("Preview") {
                HStack(spacing: 10) {
                    ThemePreview(colors: (theme.colors ?? .classic).light, dark: false)
                    ThemePreview(colors: (theme.colors ?? .classic).dark, dark: true)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let saveError {
                Section { Text(saveError).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        // A drag still settling when the screen closes is saved on the way out, not dropped.
        .onDisappear {
            guard pendingSave != nil else { return }
            pendingSave?.cancel()
            let latest = store.theme
            Task { _ = try? await APIClient.shared.updateTheme(latest) }
        }
    }

    /// On screen now; on the server now, or once a colour drag has stopped for a moment.
    private func choose(_ next: Theme, settle: Bool = false) {
        store.pick(next)
        pendingSave?.cancel()
        pendingSave = Task {
            if settle {
                try? await Task.sleep(for: .milliseconds(600))
                if Task.isCancelled { return }
            }
            do {
                _ = try await APIClient.shared.updateTheme(next)
                await MainActor.run {
                    saveError = nil
                    pendingSave = nil
                }
            } catch {
                await MainActor.run { saveError = "Could not save that. It is on this phone for now." }
            }
        }
    }

    private func colorBinding(_ keyPath: WritableKeyPath<Theme, String?>) -> Binding<Color> {
        Binding(
            get: { Color(hex: store.theme[keyPath: keyPath] ?? "#EA580C") },
            set: { color in
                guard let hex = color.hexString, hex != store.theme[keyPath: keyPath] else { return }
                var next = store.theme
                next[keyPath: keyPath] = hex
                choose(next, settle: true)
            }
        )
    }
}

/// Two colours as one round swatch: the main one, with the second across its lower corner —
/// the web's PairSwatch.
struct ThemeSwatch: View {
    let pair: (primary: String, secondary: String)
    var size: CGFloat = 24

    var body: some View {
        Circle()
            .fill(LinearGradient(
                stops: [
                    .init(color: Color(hex: pair.primary), location: 0),
                    .init(color: Color(hex: pair.primary), location: 0.58),
                    .init(color: Color(hex: pair.secondary), location: 0.58),
                    .init(color: Color(hex: pair.secondary), location: 1),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/**
 A corner of the app in the chosen colours, light and dark side by side, so a custom pick can be
 judged in the mode you are not in too. Drawn with the colours directly, since the screen itself
 is only ever in one of the two.
 */
struct ThemePreview: View {
    let colors: ModeColors
    let dark: Bool

    var body: some View {
        let surface = Color(hex: dark ? "#1C1C1E" : "#FFFFFF")
        let ink = Color(hex: dark ? "#F5F5F7" : "#1D1D1F")
        let muted = Color(hex: dark ? "#98989D" : "#6E6E73")
        let soft = Color(rgb: colors.secondarySoft)
        let onSoft = Color(rgb: colors.secondary)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("R")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(onSoft)
                    .frame(width: 26, height: 26)
                    .background(soft, in: Circle())
                Text(dark ? "Dark" : "Light").font(.footnote.weight(.medium)).foregroundStyle(muted)
            }
            Text("Today")
                .font(.caption.weight(.medium))
                .foregroundStyle(onSoft)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(soft, in: Capsule())
            Text("See recipe").font(.subheadline.weight(.semibold)).foregroundStyle(Color(rgb: colors.accent))
            Text("Add to plan")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color(rgb: colors.accentInk))
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(Color(rgb: colors.accent), in: RoundedRectangle(cornerRadius: 8))
        }
        .foregroundStyle(ink)
        .padding(12)
        .background(surface, in: RoundedRectangle(cornerRadius: 12))
        .padding(8)
        .background(Color(hex: dark ? "#000000" : "#F2F2F7"), in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dark ? "Dark preview" : "Light preview")
    }
}

extension Color {
    /// "#RRGGBB"; anything unreadable is Classic's orange rather than a crash.
    init(hex: String) {
        self.init(rgb: ThemeColors.rgb(hex) ?? 0xEA580C)
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

#Preview("Appearance") {
    NavigationStack { AppearanceScreen(store: ThemeStore(theme: Theme(preset: "ocean"))) }
}

#Preview("Appearance — your own") {
    NavigationStack {
        AppearanceScreen(store: ThemeStore(theme: Theme(preset: "custom", primary: "#FFD60A", secondary: "#7E22CE")))
    }
}
