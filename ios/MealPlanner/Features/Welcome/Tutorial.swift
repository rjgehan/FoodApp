import SwiftUI

/*
 The first-run tutorial: two slides showing the app, then "Light or dark?", then wherever the
 person was going — the sign-in screen, or (somebody who opened an invite and has just joined)
 straight into the app. The same as the web's (web/src/tutorial).

 Each slide is a picture of the real app in a phone's frame, a title and one line. The pictures
 are screenshots of the app itself: TutorialPlan and TutorialGroceries in the asset catalog, each
 with a dark appearance (web/public/tutorial/README.md says how they were taken).
 */

/// Whether this phone has had the tutorial. Once per phone, ever; finishing and skipping both
/// count, and so does being signed in already when the update that brought it arrived.
enum FirstRun {
    private static let key = "mp_tutorialSeen"

    static var seen: Bool { UserDefaults.standard.bool(forKey: key) }

    static func markSeen() { UserDefaults.standard.set(true, forKey: key) }

    /**
     Called once at launch, before anything is drawn. A token in the Keychain means somebody
     was signed in before the tutorial existed (or has been through it): marked seen now, so a
     later sign-out does not bring it up either.
     */
    static func settle() {
        #if DEBUG
        // -mp_debug_first_run 1: a phone that has never opened the app, for screenshot runs.
        if UserDefaults.standard.bool(forKey: "mp_debug_first_run") {
            UserDefaults.standard.removeObject(forKey: key)
            return
        }
        if UserDefaults.standard.string(forKey: "mp_debug_token") != nil { markSeen() }
        #endif
        if TokenStore.read() != nil { markSeen() }
    }
}

/**
 Light or dark as answered on this phone's first run, kept apart from the signed-in person's
 theme: theirs leaves with them at sign-out, this stays with the phone. The same answer waits to
 go on the first account signed in afterwards, if that account has no light or dark of its own.
 */
enum DeviceThemeMode {
    private static let key = "mp_deviceThemeMode"
    private static let toSaveKey = "mp_deviceThemeModeToSave"

    static var current: ThemeMode? {
        UserDefaults.standard.string(forKey: key).flatMap(ThemeMode.init(rawValue:))
    }

    static func set(_ mode: ThemeMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: key)
        UserDefaults.standard.set(mode.rawValue, forKey: toSaveKey)
    }

    /// The answer waiting for an account, taken once: whoever signs in next gets it or not.
    static func takeToSave() -> ThemeMode? {
        defer { UserDefaults.standard.removeObject(forKey: toSaveKey) }
        return UserDefaults.standard.string(forKey: toSaveKey).flatMap(ThemeMode.init(rawValue:))
    }
}

struct TutorialView: View {
    enum Finish { case signIn, app }

    var finish: Finish
    var onDone: () -> Void

    private struct Slide: Hashable {
        let title: String
        let line: String
        let image: String
        let description: String
    }

    private static let slides = [
        Slide(title: "Plan the week together",
              line: "Everyone in the house sees the same plan, and fills it in from their own phone.",
              image: "TutorialPlan",
              description: "The Plan screen: a month calendar with the planning week tinted, and the next meals under it."),
        Slide(title: "One list for the shop",
              line: "Planned meals become one grocery list, sorted by aisle and ticked off live as you shop.",
              image: "TutorialGroceries",
              description: "The Groceries screen: one shared list grouped by aisle, each item saying which meal it is for."),
    ]
    private static var steps: Int { slides.count + 1 }

    @State private var step: Int = {
        #if DEBUG
        // -mp_debug_tutorial_step 2 opens on "Light or dark?", for screenshot runs.
        return UserDefaults.standard.integer(forKey: "mp_debug_tutorial_step")
        #else
        return 0
        #endif
    }()
    @State private var mode: ThemeMode = ThemeStore.shared.theme.mode ?? .system

    private var atTheme: Bool { step == Self.slides.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if step > 0 {
                    Button {
                        withAnimation(.snappy) { step -= 1 }
                    } label: {
                        HStack(spacing: 2) {
                            Image(systemName: "chevron.left").font(.system(size: 20, weight: .medium))
                            Text("Back")
                        }
                    }
                }
                Spacer()
                if !atTheme {
                    Button("Skip") { done(answered: false) }
                        .fontWeight(.medium)
                }
            }
            .font(.system(size: 17))
            .foregroundStyle(Palette.accentInk)
            .padding(.horizontal, 16)
            .frame(height: 44)

            TabView(selection: $step) {
                ForEach(Array(Self.slides.enumerated()), id: \.offset) { index, slide in
                    slideView(slide).tag(index)
                }
                lightOrDark.tag(Self.slides.count)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            VStack(spacing: 20) {
                dots
                Button(atTheme ? (finish == .signIn ? "Continue" : "Start planning") : "Next") {
                    if atTheme { done(answered: true) } else { withAnimation(.snappy) { step += 1 } }
                }
                .buttonStyle(.primary)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 12)
            .frame(maxWidth: 440)
        }
        .pageBackground()
    }

    private func slideView(_ slide: Slide) -> some View {
        VStack(spacing: 0) {
            PhoneFrame(image: slide.image, description: slide.description)
                .padding(.top, 8)
            VStack(spacing: 8) {
                Text(slide.title).titleFont(28).foregroundStyle(Palette.text)
                    .accessibilityAddTraits(.isHeader)
                Text(slide.line)
                    .font(.system(size: 16))
                    .lineSpacing(3)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.center)
            .padding(.top, 28)
            .padding(.horizontal, 28)
        }
        .frame(maxWidth: 440)
    }

    /// The third step: two big cards showing the app each way, and Match my phone.
    private var lightOrDark: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Light or dark?").titleFont(28).foregroundStyle(Palette.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("Pick how Meal Planner looks. You can change it any time in Settings.")
                        .font(.system(size: 16))
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
                .padding(.top, 16)

                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        modeCard(.light, title: "Light")
                        modeCard(.dark, title: "Dark")
                    }
                    Button { choose(.system) } label: {
                        HStack(spacing: 12) {
                            Tile("iphone", tone: .sky)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Match my phone").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                                Text("Light by day, dark at night — as your phone is set")
                                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            ChoiceMark(on: mode == .system)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .cardSurface()
                        .overlay(selection(mode == .system))
                    }
                    .buttonStyle(PressFade())
                    .accessibilityAddTraits(mode == .system ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
    }

    private func modeCard(_ cardMode: ThemeMode, title: String) -> some View {
        Button { choose(cardMode) } label: {
            VStack(spacing: 10) {
                GeometryReader { geo in
                    // The app itself, from its top bar: below the picture's own corners and clock.
                    Image(Self.slides[0].image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: geo.size.width)
                        .offset(y: -geo.size.width * 0.14)
                        .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
                        .clipped()
                }
                .aspectRatio(1 / 1.05, contentMode: .fit)
                .environment(\.colorScheme, cardMode == .dark ? .dark : .light)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                HStack {
                    Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                    Spacer()
                    ChoiceMark(on: mode == cardMode)
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 2)
            }
            .padding(10)
            .cardSurface()
            .overlay(selection(mode == cardMode))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(title)
        .accessibilityAddTraits(mode == cardMode ? [.isSelected] : [])
    }

    /// The chosen card's edge, as on the Theme screen.
    private func selection(_ on: Bool) -> some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(on ? Palette.accent : .clear, lineWidth: 2.5)
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(0..<Self.steps, id: \.self) { i in
                Capsule()
                    .fill(i == step ? Palette.accent : Palette.faint)
                    .frame(width: i == step ? 18 : 6, height: 6)
            }
        }
        .animation(.snappy, value: step)
        .accessibilityElement()
        .accessibilityLabel("Page \(step + 1) of \(Self.steps)")
    }

    private func choose(_ next: ThemeMode) {
        mode = next
        // On the screen at once, so the choice is made by looking rather than imagining.
        var theme = ThemeStore.shared.theme
        theme.mode = next
        ThemeStore.shared.pick(theme)
    }

    private func done(answered: Bool) {
        // Passing the question is an answer too: Match my phone is the one already showing.
        if answered {
            DeviceThemeMode.set(mode)
            choose(mode)
        }
        FirstRun.markSeen()
        onDone()
    }
}

/// A screenshot in the shape of a phone: a dark bezel, the screen's own rounded corners, and the
/// mockup's soft shadow. As tall as there is room for, up to a real phone's proportions.
private struct PhoneFrame: View {
    let image: String
    let description: String

    var body: some View {
        GeometryReader { geo in
            let height = min(geo.size.height, 470)
            let width = height * 786 / 1706
            Image(image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: width * 0.132, style: .continuous))
                .padding(6)
                .background(Color(rgb: 0x1F1915), in: RoundedRectangle(cornerRadius: width * 0.132 + 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: width * 0.132 + 6, style: .continuous)
                    .strokeBorder(Palette.text.opacity(0.1), lineWidth: 1))
                .shadow(color: .black.opacity(0.14), radius: 15, y: 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityElement()
                .accessibilityLabel(description)
                .accessibilityAddTraits(.isImage)
        }
    }
}

/// The accent ring with a tick, for the chosen card.
private struct ChoiceMark: View {
    var on: Bool

    var body: some View {
        ZStack {
            Circle().strokeBorder(on ? Palette.accent : Palette.faint, lineWidth: 1.6)
            if on {
                Circle().fill(Palette.accent)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.onAccent)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}

#Preview("Tutorial") {
    TutorialView(finish: .signIn) {}
}

#Preview("Tutorial — dark") {
    TutorialView(finish: .app) {}.preferredColorScheme(.dark)
}
