import SwiftUI

/**
 Every piece of the design system on one page, in the theme in force — the Gallery's "Design
 system" entry (debug builds), and somewhere to look when building a screen. Switch the theme
 and mode at the top to see them all repaint.
 */
struct DesignSystemView: View {
    var store = ThemeStore.shared
    @State private var email = "ryan@example.com"
    @State private var item = ""
    @State private var query = ""
    @State private var segment = "Calendar"
    @State private var chip = "All"
    @State private var toggle = true
    @State private var ticked = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                themeSwitcher

                group("Type") {
                    LargeTitle("Plan", over: "Tuesday, September 29") {
                        IconButton("plus", style: .accent, label: "New") {}
                    }
                    .padding(.horizontal, -20)
                    SheetHeader("Tuesday 29", subtitle: "Today", onClose: {})
                    SectionHead("Coming up") {
                        Text("See all").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.accentInk)
                    }
                    Text("Body text is SF Pro at 15–17pt.").font(.system(size: 16)).foregroundStyle(Palette.text)
                    Text("Muted text for the line under a title.").font(.system(size: 13)).foregroundStyle(Palette.muted)
                }

                group("Colours") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        ForEach(Self.swatches, id: \.0) { name, color in
                            VStack(spacing: 4) {
                                RoundedRectangle(cornerRadius: 10).fill(color).frame(height: 36)
                                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.border))
                                Text(name).font(.system(size: 10, weight: .medium)).foregroundStyle(Palette.muted)
                            }
                        }
                    }
                }

                group("Buttons") {
                    Button("Primary") {}.buttonStyle(.primary)
                    Button {} label: { Label("Secondary", systemImage: "link") }.buttonStyle(.secondary)
                    HStack {
                        Button("Soft") {}.buttonStyle(.soft)
                        Button("Dark") {}.buttonStyle(.dark)
                    }
                    HStack {
                        Button {} label: { Label("Ghost", systemImage: "plus") }.buttonStyle(.ghost)
                        Button("Danger") {}.buttonStyle(.danger)
                    }
                    HStack(spacing: 10) {
                        Button("Small") {}.buttonStyle(.kitchen(.primary, size: .small))
                        Button("Today") {}.buttonStyle(.kitchen(.soft, size: .small))
                        Spacer()
                        IconButton("lightbulb", label: "Ideas") {}
                        IconButton("ellipsis", label: "More") {}
                        IconButton("plus", style: .accent, label: "New") {}
                        IconButton("xmark", style: .plain, size: 32, label: "Close") {}
                    }
                }

                group("Fields") {
                    FieldBox("Email", text: $email, systemImage: "envelope")
                    FieldBox(nil, text: $item, prompt: "Add an item, e.g. \"2 lb chicken\"", systemImage: "plus")
                    SearchBox(text: $query, prompt: "Search recipes and saved links")
                    SegmentedControl(selection: $segment, options: [("Calendar", "Calendar"), ("Upcoming", "Upcoming")])
                }

                group("Pills, chips and checks") {
                    HStack {
                        Pill("On grocery list", tone: .herb, systemImage: "checkmark")
                        Pill("Not on list", tone: .mustard, systemImage: "exclamationmark.circle")
                    }
                    HStack {
                        Pill("Main", tone: .accent)
                        Pill("Eating out", tone: .plum, systemImage: "fork.knife")
                        Pill("Cupboard", tone: .sky)
                        Pill("Beta", tone: .neutral)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(["All", "Dinner", "Quick", "Veggie", "Freezer"], id: \.self) { c in
                                Chip(c, isOn: chip == c) { chip = c }
                            }
                        }
                    }
                    HStack(spacing: 14) {
                        Button { ticked.toggle() } label: { CheckCircle(isOn: ticked) }.buttonStyle(PressFade())
                        CheckCircle(isOn: false)
                        CheckBox(isOn: true)
                        CheckBox(isOn: false)
                        StepNumber(number: 1)
                        Toggle("", isOn: $toggle).labelsHidden()
                    }
                    ProgressBar(value: 0.6)
                }

                group("Cards and lists") {
                    Card {
                        SectionLabel("Preview").padding(.horizontal, -4)
                        Text("A card: surface, border, 18pt corners, soft shadow.").foregroundStyle(Palette.text)
                    }
                    ListGroup {
                        ListRow("Household settings", subtitle: "Gehan house", chevron: true, tile: ("house", .herb))
                        ListRow("Ideas board", chevron: true, tile: ("lightbulb", .mustard)) { Pill("Beta", tone: .mustard) }
                        ListRow("Theme", detail: "\(store.style.name) · \((store.theme.mode ?? .system).label)",
                                chevron: true, tile: ("paintpalette", .plum))
                        ListRow("Sign out", titleColor: Palette.accentInk,
                                tile: ("rectangle.portrait.and.arrow.right", .accent))
                    }
                    ListGroup(dividerInset: 52) {
                        ListRow("3 lemons", subtitle: "Lemon herb chicken, Green salad",
                                leading: { CheckCircle(isOn: false) }, trailing: { EmptyView() })
                        ListRow("bananas", subtitle: "Added by Jo",
                                leading: { CheckCircle(isOn: true) }, trailing: { EmptyView() })
                    }
                    NoteBox("Skipping this time: parsley garnish (optional)", tone: .mustard, systemImage: "leaf")
                    NoteBox("Cupboard says you have 1", tone: .sky, systemImage: "cabinet")
                    DashedAddButton(title: "Add aisle") {}
                }

                group("Recipe photos") {
                    HStack(spacing: 10) {
                        ForEach([Hue.mustard, .bread, .herb, .tomato, .berry], id: \.self) { hue in
                            RecipePhotoPlaceholder(hue: hue, systemImage: "fork.knife", size: 56)
                        }
                    }
                    RecipePhotoPlaceholder(hue: .tomato, systemImage: "frying.pan", radius: 18).frame(height: 180)
                }
            }
            .padding(20)
        }
        .pageBackground()
        .centeredTitle("Design system")
    }

    private var themeSwitcher: some View {
        VStack(alignment: .leading, spacing: 10) {
            SegmentedControl(selection: Binding(
                get: { store.theme.mode ?? .system },
                set: { mode in
                    var next = store.theme
                    next.mode = mode
                    store.pick(next)
                }
            ), options: [ThemeMode.light, .dark, .system].map { ($0, $0.label) })
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(ThemeStyle.presets) { style in
                        Chip(style.name, isOn: store.theme.activeKey == style.key) {
                            var next = store.theme
                            next.preset = style.key
                            store.pick(next)
                        }
                    }
                }
            }
        }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(title).padding(.horizontal, -4)
            content()
        }
    }

    private static var swatches: [(String, Color)] {
        [("bg", Palette.bg), ("surface", Palette.surface), ("surface2", Palette.surface2), ("text", Palette.text),
         ("muted", Palette.muted), ("faint", Palette.faint), ("border", Palette.border), ("accent", Palette.accent),
         ("accentSoft", Palette.accentSoft), ("onAccent", Palette.onAccent), ("accentInk", Palette.accentInk),
         ("herb", Palette.herb), ("herbSoft", Palette.herbSoft), ("mustard", Palette.mustard),
         ("mustardSoft", Palette.mustardSoft), ("plum", Palette.plum), ("plumSoft", Palette.plumSoft),
         ("sky", Palette.sky), ("skySoft", Palette.skySoft), ("tab", Palette.tab), ("scrim", Palette.scrim)]
    }
}

#Preview("Design system") {
    NavigationStack { DesignSystemView() }
}

#Preview("Design system — dark") {
    NavigationStack { DesignSystemView() }.preferredColorScheme(.dark)
}
