import SwiftUI
import UIKit

/**
 The app's frame in the theme: the navigation bar (page-coloured, a centred 17pt title, large
 titles in the title face, back in the accent's ink), the tab bar (the frosted `tab` colour with
 the tab you are on in the accent), the segmented control and the switch.

 These are UIKit's, which do not watch ThemeStore, so they are set here at launch and again by
 ThemeStore whenever the theme changes — on the appearance proxies for bars yet to be made, and
 on every bar already on screen.
 */
enum Chrome {
    static func apply(_ style: ThemeStyle) {
        let nav = navigationAppearance(style, atEdge: false)
        let edge = navigationAppearance(style, atEdge: true)
        let navProxy = UINavigationBar.appearance()
        navProxy.standardAppearance = nav
        navProxy.scrollEdgeAppearance = edge
        navProxy.compactAppearance = nav
        navProxy.tintColor = Palette.ui(\.accentInk, in: style)

        let tab = tabAppearance(style)
        let tabProxy = UITabBar.appearance()
        tabProxy.standardAppearance = tab
        tabProxy.scrollEdgeAppearance = tab
        tabProxy.tintColor = Palette.ui(\.accentInk, in: style)
        tabProxy.unselectedItemTintColor = Palette.ui(\.faint, in: style)

        let seg = UISegmentedControl.appearance()
        seg.backgroundColor = Palette.ui(\.surface2, in: style)
        seg.selectedSegmentTintColor = Palette.ui(\.surface, in: style)
        seg.setTitleTextAttributes([.foregroundColor: Palette.ui(\.muted, in: style),
                                    .font: UIFont.systemFont(ofSize: 14, weight: .medium)], for: .normal)
        seg.setTitleTextAttributes([.foregroundColor: Palette.ui(\.text, in: style),
                                    .font: UIFont.systemFont(ofSize: 14, weight: .semibold)], for: .selected)

        UISwitch.appearance().onTintColor = Palette.ui(\.herb, in: style)
        UIRefreshControl.appearance().tintColor = Palette.ui(\.muted, in: style)

        // Bars already on screen were made from the old proxies; give them the new look too.
        for scene in UIApplication.shared.connectedScenes {
            guard let scene = scene as? UIWindowScene else { continue }
            for window in scene.windows { restyle(window, nav: nav, edge: edge, tab: tab, style: style) }
        }
    }

    private static func restyle(_ view: UIView, nav: UINavigationBarAppearance, edge: UINavigationBarAppearance,
                                tab: UITabBarAppearance, style: ThemeStyle) {
        if let bar = view as? UINavigationBar {
            bar.standardAppearance = nav
            bar.scrollEdgeAppearance = edge
            bar.compactAppearance = nav
            bar.tintColor = Palette.ui(\.accentInk, in: style)
        } else if let bar = view as? UITabBar {
            bar.standardAppearance = tab
            bar.scrollEdgeAppearance = tab
            bar.tintColor = Palette.ui(\.accentInk, in: style)
            bar.unselectedItemTintColor = Palette.ui(\.faint, in: style)
        }
        for sub in view.subviews { restyle(sub, nav: nav, edge: edge, tab: tab, style: style) }
    }

    /**
     At the top of a page the bar is see-through, so it is the page's own colour (Palette.bg, which
     every screen sits on); scrolled, it is the system's frosted bar. Not an opaque fill: on iOS 27
     an opaque bar draws over its own large title, and the title vanishes.
     */
    private static func navigationAppearance(_ style: ThemeStyle, atEdge: Bool) -> UINavigationBarAppearance {
        let a = UINavigationBarAppearance()
        if atEdge {
            a.configureWithTransparentBackground()
        } else {
            a.configureWithDefaultBackground()
        }
        a.shadowColor = .clear
        let text = Palette.ui(\.text, in: style)
        a.titleTextAttributes = [
            .foregroundColor: text,
            .font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: .systemFont(ofSize: 17, weight: .semibold)),
        ]
        a.largeTitleTextAttributes = [
            .foregroundColor: text,
            .font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: TitleFont.uiFont(size: 34, face: style.title)),
            .kern: style.title.tracking * 34,
        ]
        let ink = Palette.ui(\.accentInk, in: style)
        let button = UIBarButtonItemAppearance()
        button.normal.titleTextAttributes = [.foregroundColor: ink]
        a.buttonAppearance = button
        a.backButtonAppearance = button
        a.doneButtonAppearance = button
        return a
    }

    private static func tabAppearance(_ style: ThemeStyle) -> UITabBarAppearance {
        let a = UITabBarAppearance()
        a.configureWithDefaultBackground()
        a.backgroundEffect = UIBlurEffect(style: .systemChromeMaterial)
        a.backgroundColor = Palette.ui(\.tab, in: style)
        a.shadowColor = Palette.ui(\.border, in: style)
        let muted = Palette.ui(\.muted, in: style), faint = Palette.ui(\.faint, in: style)
        let on = Palette.ui(\.accentInk, in: style)
        for item in [a.stackedLayoutAppearance, a.inlineLayoutAppearance, a.compactInlineLayoutAppearance] {
            item.normal.iconColor = faint
            item.normal.titleTextAttributes = [.foregroundColor: muted,
                                               .font: UIFont.systemFont(ofSize: 10.5, weight: .medium)]
            item.selected.iconColor = on
            item.selected.titleTextAttributes = [.foregroundColor: on,
                                                 .font: UIFont.systemFont(ofSize: 10.5, weight: .semibold)]
        }
        return a
    }
}

// MARK: - Top bar

/**
 The row along the top of every tab (`topBar`): the household you are in on the left — a pill
 with its initial, its name and a chevron — and on the right the ideas board's lightbulb (while
 the beta is open) and your own initial, which opens Settings.

 `householdHeader()` (HouseholdSwitcher.swift) puts the same three things in a tab's navigation
 bar; a screen that draws its own header (no navigation bar, `LargeTitle` under it) puts a TopBar
 at the top of its scroll view and keeps `householdSheets()` for what the buttons open.
 */
struct TopBar: View {
    var session: Session
    @Binding var switching: Bool
    @Binding var account: Bool
    @Binding var ideas: Bool

    var body: some View {
        HStack(spacing: 10) {
            HouseholdPill(session: session, switching: $switching)
            Spacer(minLength: 8)
            if session.ideasBoard {
                IdeasBulb(open: $ideas)
            }
            AccountInitial(session: session, open: $account)
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
    }
}

/// The household's pill: its initial on herb, its name, and a chevron when there is another to
/// switch to.
struct HouseholdPill: View {
    var session: Session
    @Binding var switching: Bool

    var body: some View {
        let name = session.household?.name ?? "Household"
        let canSwitch = session.households.count > 1
        Button {
            switching = true
        } label: {
            HStack(spacing: 6) {
                Avatar(name, tone: .herb, size: 22)
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                if canSwitch {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.muted)
                }
            }
            .padding(.leading, 5)
            .padding(.trailing, canSwitch ? 10 : 12)
            .padding(.vertical, 4)
            .background(Palette.surface2, in: Capsule())
            .contentShape(Capsule())
            // The bar offers its items very little width; the name is the point of the pill.
            .fixedSize()
        }
        .buttonStyle(PressFade())
        .disabled(!canSwitch)
        .accessibilityLabel(canSwitch ? "\(name), switch household" : name)
    }
}

/// The ideas board's round lightbulb.
struct IdeasBulb: View {
    @Binding var open: Bool

    var body: some View {
        IconButton("lightbulb", size: 36, label: "Ideas (beta)") { open = true }
    }
}

/// Your initial on the accent's tint, top right — Settings is behind it.
struct AccountInitial: View {
    var session: Session
    @Binding var open: Bool

    var body: some View {
        Button {
            open = true
        } label: {
            Avatar(session.displayName ?? "", tone: .accent, size: 36)
        }
        .buttonStyle(PressFade())
        .accessibilityLabel("Your account")
    }
}

// MARK: - Navigation bar

extension View {
    /// A pushed screen's bar (`nav`): its title centred at 17pt, back in the accent's ink.
    func centeredTitle(_ title: String) -> some View {
        navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }

    /**
     A pushed screen's back as the mockup's `nav` draws it: a chevron and the name of where you came
     from — "‹ Recipes", "‹ Main dish" — in the accent's ink, with no glass bubble round it. The
     system's own back is a bare chevron in a circle from iOS 26, which loses where Back goes.
     Swiping in from the edge still goes back (see the navigation controller extension below).
     */
    func textBackButton(_ label: String) -> some View {
        modifier(TextBackButton(label: label))
    }

    /// A tab's own header in place of the system bar: hides the bar on this screen only.
    func hidesNavigationBar() -> some View {
        toolbar(.hidden, for: .navigationBar)
    }

    /**
     A bottom sheet as the mockup draws one (`.sheet`): the page colour, 28pt top corners and the
     grab handle. On the sheet's content, with the heights it may take:

         .sheet(isPresented: $open) { DaySheet(…).kitchenSheet([.medium, .large]) }

     Start its content with a `SheetHeader`, 20pt in from the sides.
     */
    func kitchenSheet(_ detents: Set<PresentationDetent> = [.large]) -> some View {
        presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(28)
            .presentationBackground(Palette.bg)
    }

    /**
     A sheet as tall as what is in it, ending just under its way out — the prompts (7.1, 7.2) —
     rather than at a fixed share of the screen with an empty panel under "Not now". Put it on
     the content itself: it brings its own ScrollView, and can still be pulled up to full height
     when the type is large or the keyboard needs the room.
     */
    func fittedSheet() -> some View {
        modifier(FittedSheet())
    }
}

private struct FittedSheet: ViewModifier {
    @State private var height: CGFloat = 480
    @State private var detent: PresentationDetent = .height(480)

    func body(content: Content) -> some View {
        ScrollView {
            content.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
                height = measured
                // Follows the content as it grows or shrinks (a confirm field, "You're all
                // set"), unless it has been pulled up.
                if detent != .large { detent = .height(measured) }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents([.height(height), .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
        .presentationBackground(Palette.bg)
    }
}

#Preview("Top bar") {
    @Previewable @State var a = false
    VStack(alignment: .leading, spacing: 0) {
        TopBar(session: .preview, switching: $a, account: $a, ideas: $a)
        LargeTitle("Plan", over: "Tuesday, September 29")
        Spacer()
    }
    .pageBackground()
}

#Preview("Top bar — dark") {
    @Previewable @State var a = false
    VStack(alignment: .leading, spacing: 0) {
        TopBar(session: .preview, switching: $a, account: $a, ideas: $a)
        LargeTitle("Groceries") { IconButton("ellipsis", label: "More") {} }
        Spacer()
    }
    .pageBackground()
    .preferredColorScheme(.dark)
}

/**
 A bar's text action as the mockup's `nav` draws one — "Cancel" on the left, "Save" on the right —
 plain text in the accent's ink (bold for the one that finishes the screen), with no glass
 capsule round it. `back` puts the chevron in front, for a way back inside a sheet ("‹ New").
 */
struct BarTextButton: ToolbarContent {
    var placement: ToolbarItemPlacement
    let title: String
    var bold = false
    var back = false
    var disabled = false
    let action: () -> Void

    init(_ title: String, placement: ToolbarItemPlacement, bold: Bool = false, back: Bool = false,
         disabled: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.placement = placement
        self.bold = bold
        self.back = back
        self.disabled = disabled
        self.action = action
    }

    var body: some ToolbarContent {
        BareToolbarItem(placement: placement) {
            Button(action: action) {
                HStack(spacing: 3) {
                    if back { Image(systemName: "chevron.left").font(.system(size: 20, weight: .semibold)) }
                    Text(title).font(.system(size: 17, weight: bold ? .semibold : .regular)).lineLimit(1)
                }
                .foregroundStyle(Palette.accentInk)
                .opacity(disabled ? 0.4 : 1)
                .padding(.vertical, 6)
                // Its own width: the bar would otherwise squeeze "Cancel" down to "Can…".
                .fixedSize()
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .disabled(disabled)
            .accessibilityLabel(back ? "Back to \(title)" : title)
        }
    }
}

private struct TextBackButton: ViewModifier {
    let label: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(true)
            .toolbar {
                BareToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "chevron.left").font(.system(size: 20, weight: .semibold))
                            Text(label).font(.system(size: 17)).lineLimit(1)
                        }
                        .foregroundStyle(Palette.accentInk)
                        .padding(.vertical, 6)
                        // Its own width: the bar would otherwise squeeze "Recipes" down to "…".
                        .fixedSize()
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel(label)
                    .accessibilityHint("Goes back")
                }
            }
    }
}

/// Hiding the system back button also turns off swiping in from the left edge to go back; this
/// keeps the swipe for every pushed screen, which is what anyone on an iPhone expects.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        gestureRecognizer === interactivePopGestureRecognizer ? viewControllers.count > 1 : true
    }
}
