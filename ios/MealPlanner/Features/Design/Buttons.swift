import SwiftUI

/**
 The mockup's buttons (`.btn` and its kinds): 52pt tall, 15pt corners, 17pt semibold — or the
 small one, 36pt, 11pt corners, 14pt. Full width unless told otherwise.

     Button("Sign in") { … }.buttonStyle(.primary)
     Button { … } label: { Label("Swap", systemImage: "arrow.left.arrow.right") }
         .buttonStyle(.secondary)
     Button("Today") { … }.buttonStyle(.kitchen(.soft, size: .small, fill: false))

   primary    the accent, white text — the one thing to do on a screen
   secondary  a white card with a border — every other choice
   soft       the accent's tint, accent text — a quieter call to action ("Add 7 days")
   ghost      accent text, no fill — "Add a side", "Undo"
   dark       the text colour as a fill — a selected option among buttons
   danger     a white card with accent-red text — delete, leave, sign out
 */
struct KitchenButtonStyle: ButtonStyle {
    enum Kind: Hashable { case primary, secondary, soft, ghost, dark, danger }
    enum Size: Hashable { case large, small }

    var kind: Kind = .primary
    var size: Size = .large
    /// Stretch to the width offered (true) or hug the label (false).
    var fill: Bool = true

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let small = size == .small
        let radius: CGFloat = small ? 11 : 15
        configuration.label
            .font(.system(size: small ? 14 : 17, weight: .semibold))
            .labelStyle(KitchenButtonLabelStyle(iconSize: small ? 14 : 17))
            .lineLimit(1)
            .padding(.horizontal, small ? 14 : 20)
            .frame(maxWidth: fill ? .infinity : nil, minHeight: small ? 36 : 52)
            .foregroundStyle(foreground)
            .background(background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if bordered {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(Palette.border, lineWidth: 1)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary: return Palette.onAccent
        case .secondary: return Palette.text
        case .soft, .ghost, .danger: return Palette.accentInk
        case .dark: return Palette.bg
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return Palette.accent
        case .secondary, .danger: return Palette.surface
        case .soft: return Palette.accentSoft
        case .ghost: return .clear
        case .dark: return Palette.text
        }
    }

    private var bordered: Bool { kind == .secondary || kind == .danger }
}

/// An icon beside the title with the mockup's 8pt gap, rather than SwiftUI's wider default.
private struct KitchenButtonLabelStyle: LabelStyle {
    var iconSize: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.icon.font(.system(size: iconSize, weight: .semibold))
            configuration.title
        }
    }
}

extension ButtonStyle where Self == KitchenButtonStyle {
    static var primary: KitchenButtonStyle { KitchenButtonStyle(kind: .primary) }
    static var secondary: KitchenButtonStyle { KitchenButtonStyle(kind: .secondary) }
    static var soft: KitchenButtonStyle { KitchenButtonStyle(kind: .soft) }
    static var ghost: KitchenButtonStyle { KitchenButtonStyle(kind: .ghost) }
    static var dark: KitchenButtonStyle { KitchenButtonStyle(kind: .dark) }
    static var danger: KitchenButtonStyle { KitchenButtonStyle(kind: .danger) }

    /// Any kind, either size, filling the width or not.
    static func kitchen(_ kind: KitchenButtonStyle.Kind, size: KitchenButtonStyle.Size = .large,
                        fill: Bool? = nil) -> KitchenButtonStyle {
        KitchenButtonStyle(kind: kind, size: size, fill: fill ?? (size == .large))
    }
}

/**
 The round icon button (`.ibtn`): 38pt, a white card with a border — or `plain`, the well with no
 border (a sheet's close button), or `accent`, filled (Recipes' "+").

     IconButton("plus", style: .accent, label: "New recipe") { … }
     IconButton("xmark", style: .plain, size: 32, label: "Close") { dismiss() }
 */
struct IconButton: View {
    enum Style { case card, plain, accent }

    let systemImage: String
    var style: Style = .card
    var size: CGFloat = 38
    let label: String
    let action: () -> Void

    init(_ systemImage: String, style: Style = .card, size: CGFloat = 38, label: String,
         action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.style = style
        self.size = size
        self.label = label
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            IconButtonFace(systemImage: systemImage, style: style, size: size)
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
    }
}

/// The face of an IconButton, for a Menu's label or anything else that is not a Button.
struct IconButtonFace: View {
    let systemImage: String
    var style: IconButton.Style = .card
    var size: CGFloat = 38

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(style == .accent ? Palette.onAccent : style == .plain ? Palette.text : Palette.text)
            .frame(width: size, height: size)
            .background(style == .accent ? Palette.accent : style == .plain ? Palette.surface2 : Palette.surface,
                        in: Circle())
            .overlay {
                if style == .card { Circle().strokeBorder(Palette.border, lineWidth: 1) }
            }
            .contentShape(Circle())
    }
}

/// A press that dims rather than SwiftUI's default highlight — for custom faces.
struct PressFade: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.6 : 1)
    }
}

#Preview("Buttons") {
    ScrollView {
        VStack(spacing: 12) {
            Button("Sign in") {}.buttonStyle(.primary)
            Button {} label: { Label("Add dinner to groceries", systemImage: "cart") }.buttonStyle(.primary)
            Button {} label: { Label("Join with an invite link", systemImage: "link") }.buttonStyle(.secondary)
            Button("Add 7 days") {}.buttonStyle(.soft)
            Button {} label: { Label("Add a side", systemImage: "plus") }.buttonStyle(.ghost)
            Button("Dinner") {}.buttonStyle(.dark)
            Button {} label: { Label("Leave household", systemImage: "rectangle.portrait.and.arrow.right") }
                .buttonStyle(.danger)
            Button("Disabled") {}.buttonStyle(.primary).disabled(true)
            HStack {
                Button("Button") {}.buttonStyle(.kitchen(.primary, size: .small))
                Button("Today") {}.buttonStyle(.kitchen(.soft, size: .small))
                Button {} label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                    .buttonStyle(.kitchen(.secondary, size: .small))
            }
            HStack(spacing: 10) {
                IconButton("lightbulb", label: "Ideas") {}
                IconButton("ellipsis", label: "More") {}
                IconButton("plus", style: .accent, label: "New") {}
                IconButton("xmark", style: .plain, size: 32, label: "Close") {}
            }
        }
        .padding(20)
    }
    .background(Palette.bg)
}

#Preview("Buttons — dark") {
    VStack(spacing: 12) {
        Button("Sign in") {}.buttonStyle(.primary)
        Button("Secondary") {}.buttonStyle(.secondary)
        Button("Soft") {}.buttonStyle(.soft)
        Button("Dark") {}.buttonStyle(.dark)
        Button("Danger") {}.buttonStyle(.danger)
        HStack(spacing: 10) {
            IconButton("lightbulb", label: "Ideas") {}
            IconButton("plus", style: .accent, label: "New") {}
            IconButton("xmark", style: .plain, size: 32, label: "Close") {}
        }
    }
    .padding(20)
    .frame(maxHeight: .infinity)
    .background(Palette.bg)
    .preferredColorScheme(.dark)
}
