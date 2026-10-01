import SwiftUI
import UIKit

/**
 Settings → Theme (mockup 6.9): Light, Dark or System, and one of the five themes — Tomato,
 Matcha, Blueberry, Brunch, Nordic — or Custom, your own accent on Tomato's neutrals. The same
 choices as the web's, saved to your account so both follow.

 Every tap takes effect at once, across the whole app, and is saved as it is made; the colour
 well saves once a drag has settled. There is no Save to hunt for.
 */
struct ThemeScreen: View {
    var store = ThemeStore.shared

    @State private var saveError: String?
    /// A colour drag still settling, saved once it stops.
    @State private var pendingSave: Task<Void, Never>?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        let theme = store.theme
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SegmentedControl(selection: Binding(
                    get: { theme.mode ?? .system },
                    set: { mode in
                        var next = store.theme
                        next.mode = mode
                        choose(next)
                    }
                ), options: [ThemeMode.light, .dark, .system].map { ($0, $0.label) })

                SectionLabel("Colour").padding(.horizontal, -4)

                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(ThemeStyle.presets) { style in
                        swatchCard(name: style.name, isOn: theme.activeKey == style.key,
                                   fill: AnyShapeStyle(Color(rgb: style.light.accent.rgb)),
                                   tick: Color(rgb: style.light.onAccent.rgb)) {
                            var next = store.theme
                            next.preset = style.key
                            choose(next)
                        }
                    }
                    swatchCard(name: "Custom", isOn: theme.activeKey == ThemePreset.custom,
                               fill: AnyShapeStyle(AngularGradient(
                                colors: [Color(rgb: 0xD4512E), Color(rgb: 0xF5B800), Color(rgb: 0x3D6B39),
                                         Color(rgb: 0x4F46D8), Color(rgb: 0xD4512E)],
                                // From the top, clockwise, as CSS draws a conic gradient.
                                center: .center, startAngle: .degrees(-90), endAngle: .degrees(270))),
                               tick: .white) {
                        // Starts from the accent on screen, so it is a nudge away from what you had.
                        var next = store.theme
                        next.primary = theme.primary ?? ThemeColors.hex(store.style.light.accent.rgb)
                        next.preset = ThemePreset.custom
                        choose(next)
                    }
                }

                if theme.activeKey == ThemePreset.custom {
                    Card(spacing: 6) {
                        ColorPicker(selection: accentBinding, supportsOpacity: false) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Your colour").font(.rowTitle).foregroundStyle(Palette.text)
                                Text("Buttons, links and the tab you're on.")
                                    .font(.rowSubtitle).foregroundStyle(Palette.muted)
                            }
                        }
                        Text("Adjusted where it has to be so text on it stays readable, in light and in dark.")
                            .font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }
                }

                Card {
                    SectionLabel("Preview").padding(.horizontal, -4)
                    Text("Lemon herb chicken").titleFont(22).foregroundStyle(Palette.text)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) { previewParts }
                        VStack(alignment: .leading, spacing: 10) { previewParts }
                    }
                }

                if let saveError {
                    NoteBox(saveError, tone: .accent, systemImage: "exclamationmark.circle")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("Theme")
        // A drag still settling when the screen closes is saved on the way out, not dropped.
        .onDisappear {
            guard pendingSave != nil else { return }
            pendingSave?.cancel()
            let latest = store.theme
            Task { _ = try? await APIClient.shared.updateTheme(latest) }
        }
    }

    @ViewBuilder private var previewParts: some View {
        Button("Button") {}.buttonStyle(.kitchen(.primary, size: .small)).allowsHitTesting(false)
        HStack(spacing: 10) {
            Pill("On grocery list", tone: .herb, systemImage: "checkmark")
            Pill("Not on list", tone: .mustard, systemImage: "exclamationmark.circle")
        }
    }

    /// A theme's card: its accent as a round swatch, ticked and outlined when it is the one on.
    private func swatchCard(name: String, isOn: Bool, fill: AnyShapeStyle, tick: Color,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Circle()
                    .fill(fill)
                    .frame(width: 46, height: 46)
                    .overlay {
                        if isOn {
                            Image(systemName: "checkmark").font(.system(size: 19, weight: .bold)).foregroundStyle(tick)
                        }
                    }
                Text(name).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.text)
            }
            .frame(maxWidth: .infinity)
            .padding(12)
            .cardSurface()
            .overlay {
                if isOn {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.accent, lineWidth: 2)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(name)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    /// On screen now; on the server now, or once a colour drag has stopped for a moment.
    private func choose(_ next: Theme, settle: Bool = false) {
        store.pick(next)
        let next = store.theme
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
                guard !Task.isCancelled else { return }
                await MainActor.run { saveError = "Could not save that. It is on this phone for now." }
            }
        }
    }

    private var accentBinding: Binding<Color> {
        Binding(
            get: { Color(hex: store.theme.primary ?? "#D4512E") },
            set: { color in
                guard let hex = color.hexString, hex != store.theme.primary else { return }
                var next = store.theme
                next.primary = hex
                choose(next, settle: true)
            }
        )
    }
}

#Preview("Theme") {
    NavigationStack { ThemeScreen(store: ThemeStore(theme: Theme(preset: "tomato"))) }
}

#Preview("Theme — dark") {
    NavigationStack { ThemeScreen(store: ThemeStore(theme: Theme(preset: "tomato", mode: .dark))) }
        .preferredColorScheme(.dark)
}

#Preview("Theme — custom") {
    NavigationStack {
        ThemeScreen(store: ThemeStore(theme: Theme(preset: "custom", primary: "#2E86AB")))
    }
}
