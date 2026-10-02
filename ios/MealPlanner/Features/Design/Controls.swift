import SwiftUI

/*
 The mockup's controls: text fields and the search box, pills and chips, the segmented control,
 check circles and boxes, and the switch. Each matches its CSS class in the mockup (named on it).
 */

// MARK: - Field

/**
 A labelled text field (`.field` / `.input`): the label over it, a 52pt box with 14pt corners, an
 optional icon in front, and — while you are typing in it — the accent border and its soft ring.

     FieldBox("Email", text: $email, prompt: "you@example.com", systemImage: "envelope")
         .keyboardType(.emailAddress)
     FieldBox("Password", text: $password, systemImage: "lock", secure: true)
 */
struct FieldBox<Trailing: View>: View {
    var label: String?
    @Binding var text: String
    var prompt: String = ""
    var systemImage: String?
    var secure = false
    var hint: String?
    var trailing: Trailing
    /// Focused as it appears, keyboard up — the one field a sheet is for. See `autofocused()`.
    var autofocus = false

    @FocusState private var focused: Bool
    @State private var revealed = false

    init(_ label: String?, text: Binding<String>, prompt: String = "", systemImage: String? = nil,
         secure: Bool = false, hint: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.label = label
        self._text = text
        self.prompt = prompt
        self.systemImage = systemImage
        self.secure = secure
        self.hint = hint
        self.trailing = trailing()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let label {
                Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 10) {
                // Light weight: the mockup's field icons are thin 1.5pt lines, and SF Symbols at the
                // regular weight read heavier than the web's.
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 17, weight: .light)).foregroundStyle(Palette.muted)
                        .frame(width: 22)
                }
                Group {
                    if secure && !revealed {
                        SecureField("", text: $text, prompt: promptText)
                    } else {
                        TextField("", text: $text, prompt: promptText)
                    }
                }
                .font(.system(size: 16))
                .foregroundStyle(Palette.text)
                .focused($focused)
                if secure {
                    Button {
                        revealed.toggle()
                    } label: {
                        Image(systemName: revealed ? "eye.slash" : "eye").font(.system(size: 17, weight: .light))
                            .foregroundStyle(Palette.muted)
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel(revealed ? "Hide password" : "Show password")
                }
                trailing
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .fieldSurface(focused: focused)
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
            if let hint {
                Text(hint).font(.system(size: 12)).foregroundStyle(Palette.muted)
            }
        }
        .task {
            guard autofocus else { return }
            // A beat after a sheet's slide-up starts, or the focus is dropped on the way in.
            try? await Task.sleep(for: .milliseconds(350))
            focused = true
        }
    }

    /// The field focused as it appears.
    func autofocused(_ on: Bool = true) -> Self {
        var copy = self
        copy.autofocus = on
        return copy
    }

    private var promptText: Text { Text(prompt).foregroundStyle(Palette.faint) }
}

extension FieldBox where Trailing == EmptyView {
    init(_ label: String?, text: Binding<String>, prompt: String = "", systemImage: String? = nil,
         secure: Bool = false, hint: String? = nil) {
        self.init(label, text: text, prompt: prompt, systemImage: systemImage, secure: secure, hint: hint) {
            EmptyView()
        }
    }
}

extension View {
    /// The input's box on any view — a TextEditor, a Menu that reads as a field — with the focus
    /// ring while `focused`.
    func fieldSurface(focused: Bool = false, radius: CGFloat = 14) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(Palette.surface, in: shape)
            .overlay(shape.strokeBorder(focused ? Palette.accent : Palette.border, lineWidth: focused ? 1.5 : 1))
            .background(
                RoundedRectangle(cornerRadius: radius + 4, style: .continuous)
                    .fill(Palette.accentSoft)
                    .padding(-4)
                    .opacity(focused ? 1 : 0)
            )
            .animation(.easeOut(duration: 0.15), value: focused)
    }
}

// MARK: - Search

/// The search box (`.search`): 42pt, the well's fill, a magnifier, and a clear button once
/// something is typed.
struct SearchBox: View {
    @Binding var text: String
    var prompt: String = "Search"
    var onSubmit: () -> Void = {}

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.muted)
            TextField("", text: $text, prompt: Text(prompt).foregroundStyle(Palette.muted))
                .font(.system(size: 16))
                .foregroundStyle(Palette.text)
                .submitLabel(.search)
                .onSubmit(onSubmit)
                .autocorrectionDisabled()
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint)
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 42)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Pill and chip

/// A small status label (`.pill`): 11pt semibold on a tone's soft fill, fully rounded.
struct Pill: View {
    let text: String
    var tone: Tone = .herb
    var systemImage: String?

    init(_ text: String, tone: Tone = .herb, systemImage: String? = nil) {
        self.text = text
        self.tone = tone
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).font(.system(size: 10, weight: .bold)) }
            Text(text)
        }
        .font(.system(size: 11, weight: .semibold))
        .lineLimit(1)
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(tone.soft, in: Capsule())
        .fixedSize()
    }
}

/// A filter or choice (`.chip`): a rounded outline that fills with the text colour when on.
struct Chip: View {
    let title: String
    var systemImage: String?
    var isOn: Bool
    let action: () -> Void

    init(_ title: String, systemImage: String? = nil, isOn: Bool, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.isOn = isOn
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 12, weight: .semibold)) }
                Text(title)
            }
            .font(.system(size: 13, weight: isOn ? .semibold : .medium))
            .lineLimit(1)
            .foregroundStyle(isOn ? Palette.bg : Palette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(isOn ? Palette.text : Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
            .fixedSize()
            .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

// MARK: - Segmented control

/**
 The segmented control (`.seg`): options on the well, the chosen one lifted onto a white card.

     SegmentedControl(selection: $view, options: [(.calendar, "Calendar"), (.upcoming, "Upcoming")])
 */
struct SegmentedControl<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(Value, String)]
    @Namespace private var lift

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.0) { value, title in
                let on = value == selection
                Button {
                    withAnimation(.snappy(duration: 0.22)) { selection = value }
                } label: {
                    Text(title)
                        .font(.system(size: 14, weight: on ? .semibold : .medium))
                        .foregroundStyle(on ? Palette.text : Palette.muted)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background {
                            if on {
                                RoundedRectangle(cornerRadius: 9, style: .continuous)
                                    .fill(Palette.surface)
                                    .shadow(color: .black.opacity(0.12), radius: 1.5, y: 1)
                                    .matchedGeometryEffect(id: "on", in: lift)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}

// MARK: - Checks and the switch

/// A round tick (`.chk`): an empty ring, or herb green with a white tick — "got it", "have it".
struct CheckCircle: View {
    var isOn: Bool
    var size: CGFloat = 24

    var body: some View {
        ZStack {
            Circle().strokeBorder(isOn ? Palette.herb : Palette.faint, lineWidth: 1.6)
            if isOn {
                Circle().fill(Palette.herb)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .animation(.easeOut(duration: 0.15), value: isOn)
        .accessibilityHidden(true)
    }
}

/// A square tick (`.box`): for picking several — accent when on.
struct CheckBox: View {
    var isOn: Bool
    var size: CGFloat = 22

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .strokeBorder(isOn ? Palette.accent : Palette.faint, lineWidth: 1.6)
            if isOn {
                RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Palette.accent)
                Image(systemName: "checkmark").font(.system(size: size * 0.55, weight: .bold))
                    .foregroundStyle(Palette.onAccent)
            }
        }
        .frame(width: size, height: size)
        .animation(.easeOut(duration: 0.15), value: isOn)
        .accessibilityHidden(true)
    }
}

/**
 The mockup's switch (`.toggle`): herb green when on rather than the accent — on is "good" in this
 app's colours — and the warm border colour when off, not the system's cold grey. Set for the
 whole app in Themed, so a plain Toggle already looks right.

 Drawn by hand from iOS 18, which is when a style can see `.labelsHidden()`; before that it is the
 system switch with the herb tint.
 */
struct HerbSwitchStyle: ToggleStyle {
    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        if #available(iOS 18, *) {
            KitchenSwitch(configuration: configuration)
        } else {
            Toggle(configuration).toggleStyle(.switch).tint(Palette.herb)
        }
    }
}

/// 51 × 31, a 27pt white knob with a soft shadow — the system switch's size, in the theme's colours.
@available(iOS 18, *)
private struct KitchenSwitch: View {
    let configuration: ToggleStyleConfiguration
    @Environment(\.labelsVisibility) private var labels
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        HStack(spacing: 8) {
            if labels != .hidden {
                configuration.label
                Spacer(minLength: 0)
            }
            Capsule()
                .fill(configuration.isOn ? Palette.herb : Palette.border)
                .frame(width: 51, height: 31)
                .overlay(alignment: configuration.isOn ? .trailing : .leading) {
                    Circle()
                        .fill(.white)
                        .frame(width: 27, height: 27)
                        .shadow(color: .black.opacity(0.2), radius: 2, y: 2)
                        .padding(2)
                }
                .contentShape(Capsule())
                .onTapGesture {
                    withAnimation(.snappy(duration: 0.2)) { configuration.isOn.toggle() }
                }
                .opacity(isEnabled ? 1 : 0.5)
        }
        // VoiceOver hears the system switch: its label, On or Off, and double-tap to change.
        .accessibilityRepresentation {
            Toggle(isOn: configuration.$isOn) { configuration.label }.toggleStyle(.switch)
        }
    }
}

extension ToggleStyle where Self == HerbSwitchStyle {
    static var herb: HerbSwitchStyle { HerbSwitchStyle() }
}

/// A progress bar (`.bar`): 6pt, the well, filled in herb (or another tone's ink).
struct ProgressBar: View {
    var value: Double
    var tint: Color = Palette.herb

    var body: some View {
        GeometryReader { geo in
            Capsule().fill(Palette.surface2)
                .overlay(alignment: .leading) {
                    Capsule().fill(tint).frame(width: geo.size.width * min(1, max(0, value)))
                }
        }
        .frame(height: 6)
        .accessibilityValue("\(Int(value * 100)) percent")
    }
}

/// A numbered step's circle (`.stepnum`).
struct StepNumber: View {
    let number: Int

    var body: some View {
        Text("\(number)")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Palette.accentInk)
            .frame(width: 26, height: 26)
            .background(Palette.accentSoft, in: Circle())
    }
}

private struct ControlsPreview: View {
    @State private var email = "ryan@example.com"
    @State private var password = "secret"
    @State private var query = ""
    @State private var view = "Calendar"
    @State private var on = true
    @State private var chip = "All"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                FieldBox("Email", text: $email, systemImage: "envelope")
                FieldBox("Password", text: $password, systemImage: "lock", secure: true, hint: "At least 8 characters.")
                FieldBox(nil, text: $query, prompt: "Add an item, e.g. \"2 lb chicken\"", systemImage: "plus")
                SearchBox(text: $query, prompt: "Search recipes and saved links")
                SegmentedControl(selection: $view, options: [("Calendar", "Calendar"), ("Upcoming", "Upcoming")])
                SegmentedControl(selection: $view, options: [("Light", "Light"), ("Dark", "Dark"), ("System", "System")])
                HStack {
                    Pill("On grocery list", tone: .herb, systemImage: "checkmark")
                    Pill("Not on list", tone: .mustard, systemImage: "exclamationmark.circle")
                    Pill("Main", tone: .accent)
                }
                HStack {
                    Pill("Eating out", tone: .plum)
                    Pill("Cupboard", tone: .sky)
                    Pill("Beta", tone: .neutral)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(["All", "Dinner", "Quick", "Veggie"], id: \.self) { c in
                            Chip(c, isOn: chip == c) { chip = c }
                        }
                    }
                }
                HStack(spacing: 16) {
                    CheckCircle(isOn: false)
                    CheckCircle(isOn: true)
                    CheckBox(isOn: false)
                    CheckBox(isOn: true)
                    StepNumber(number: 2)
                }
                Toggle("Remind me to restock", isOn: $on).foregroundStyle(Palette.text)
                ProgressBar(value: 0.6)
            }
            .padding(20)
        }
        .pageBackground()
        .toggleStyle(.herb)
    }
}

#Preview("Controls") { ControlsPreview() }

#Preview("Controls — dark") { ControlsPreview().preferredColorScheme(.dark) }
