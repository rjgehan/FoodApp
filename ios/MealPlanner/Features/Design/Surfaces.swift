import SwiftUI

/*
 The mockup's surfaces: cards, grouped lists and their rows, the titles that sit over them,
 and the small boxes (notes, tiles, avatars) that go inside. Every one takes its colours from
 Palette, so it is right in light, dark and every theme without anything else to do.
 */

// MARK: - Card

/// A white card on the page (`.card`): 18pt corners, a 1pt border, the soft shadow, 16pt inside.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    var spacing: CGFloat = 10
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
    }
}

extension View {
    /// The card's look on any view: surface fill, border, shadow, 18pt corners (or `radius`).
    func cardSurface(radius: CGFloat = 18, fill: Color? = nil) -> some View {
        modifier(CardSurface(radius: radius, fill: fill))
    }
}

private struct CardSurface: ViewModifier {
    var radius: CGFloat
    var fill: Color?

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(fill ?? Palette.surface, in: shape)
            .clipShape(shape)
            .overlay(shape.strokeBorder(Palette.border, lineWidth: 1))
            .shadow(color: Palette.shadow, radius: 4, y: 2)
    }
}

// MARK: - Grouped list

/**
 A grouped list (`.list`): rows on one card, a hairline between each. The rows are whatever is
 inside — usually `ListRow`s — and the hairlines are drawn between them, so a row never has to
 know whether it is the first.

     ListGroup {
         ListRow("Household settings", subtitle: "Gehan house", tile: ("house", .herb), chevron: true)
         ListRow("Ideas board", tile: ("lightbulb", .mustard)) { Pill("Beta", tone: .mustard) }
     }

 `dividerInset` starts each hairline past a leading control (the groceries' check circles).
 For a real SwiftUI `List`, use `.kitchenList()` (KitchenList.swift) instead.
 */
struct ListGroup<Content: View>: View {
    var dividerInset: CGFloat = 0
    @ViewBuilder var content: Content

    var body: some View {
        _VariadicView.Tree(DividedRows(inset: dividerInset)) { content }
            .cardSurface()
    }
}

/// Lays a group's children out in a column with a hairline between each pair.
private struct DividedRows: _VariadicView_MultiViewRoot {
    var inset: CGFloat

    func body(children: _VariadicView.Children) -> some View {
        VStack(spacing: 0) {
            ForEach(children) { child in
                if child.id != children.first?.id {
                    Rectangle().fill(Palette.border).frame(height: 1).padding(.leading, inset)
                }
                child
            }
        }
    }
}

/**
 A row in a grouped list (`.lr`): something leading, a 16pt title with a 13pt line under it, a
 value on the right, anything else after it, and a chevron if it opens something. At least 52pt
 tall, 16pt in from the sides.
 */
struct ListRow<Leading: View, Trailing: View>: View {
    let title: String
    var subtitle: String?
    var detail: String?
    var chevron = false
    var titleColor: Color?
    /// Lets the subtitle wrap rather than end in "…".
    var wrapSubtitle = false
    /// A subtitle that is a warning ("Past its date") rather than a quiet note.
    var subtitleColor: Color?
    var leading: Leading
    var trailing: Trailing

    init(_ title: String, subtitle: String? = nil, detail: String? = nil, chevron: Bool = false,
         titleColor: Color? = nil, wrapSubtitle: Bool = false, subtitleColor: Color? = nil,
         @ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.detail = detail
        self.chevron = chevron
        self.titleColor = titleColor
        self.wrapSubtitle = wrapSubtitle
        self.subtitleColor = subtitleColor
        self.leading = leading()
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 12) {
            leading
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.rowTitle)
                    .foregroundStyle(titleColor ?? Palette.text)
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(subtitleColor == nil ? .rowSubtitle : .system(size: 13, weight: .semibold))
                        .foregroundStyle(subtitleColor ?? Palette.muted)
                        .lineLimit(wrapSubtitle ? nil : 1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let detail {
                Text(detail).font(.system(size: 15)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            trailing
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.faint)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

extension ListRow where Leading == EmptyView, Trailing == EmptyView {
    init(_ title: String, subtitle: String? = nil, detail: String? = nil, chevron: Bool = false,
         titleColor: Color? = nil, wrapSubtitle: Bool = false) {
        self.init(title, subtitle: subtitle, detail: detail, chevron: chevron, titleColor: titleColor,
                  wrapSubtitle: wrapSubtitle, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

extension ListRow where Leading == EmptyView {
    init(_ title: String, subtitle: String? = nil, detail: String? = nil, chevron: Bool = false,
         titleColor: Color? = nil, wrapSubtitle: Bool = false, subtitleColor: Color? = nil,
         @ViewBuilder trailing: () -> Trailing) {
        self.init(title, subtitle: subtitle, detail: detail, chevron: chevron, titleColor: titleColor,
                  wrapSubtitle: wrapSubtitle, subtitleColor: subtitleColor, leading: { EmptyView() }, trailing: trailing)
    }
}

extension ListRow where Leading == Tile, Trailing == EmptyView {
    /// With a tinted icon tile in front — the settings menu's rows.
    init(_ title: String, subtitle: String? = nil, detail: String? = nil, chevron: Bool = false,
         titleColor: Color? = nil, tile: (String, Tone)) {
        self.init(title, subtitle: subtitle, detail: detail, chevron: chevron, titleColor: titleColor,
                  leading: { Tile(tile.0, tone: tile.1) }, trailing: { EmptyView() })
    }
}

extension ListRow where Leading == Tile {
    init(_ title: String, subtitle: String? = nil, detail: String? = nil, chevron: Bool = false,
         titleColor: Color? = nil, tile: (String, Tone), @ViewBuilder trailing: () -> Trailing) {
        self.init(title, subtitle: subtitle, detail: detail, chevron: chevron, titleColor: titleColor,
                  leading: { Tile(tile.0, tone: tile.1) }, trailing: trailing)
    }
}

// MARK: - Titles

/// The small upper-case label over a section (`.lbl`): 11.5pt semibold, letter-spaced, muted.
struct SectionLabel: View {
    let text: String
    var trailing: String?

    init(_ text: String, trailing: String? = nil) {
        self.text = text
        self.trailing = trailing
    }

    var body: some View {
        HStack {
            Text(text.uppercased())
            Spacer(minLength: 8)
            if let trailing { Text(trailing) }
        }
        .font(.label)
        .tracking(0.7)
        .foregroundStyle(Palette.muted)
        .padding(.horizontal, 4)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A section's serif head (`secHead`): 20pt title face, an optional accent action on the right.
struct SectionHead<Action: View>: View {
    let title: String
    var action: Action

    init(_ title: String, @ViewBuilder action: () -> Action) {
        self.title = title
        self.action = action()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).titleFont(20).foregroundStyle(Palette.text)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            action
        }
    }
}

extension SectionHead where Action == EmptyView {
    init(_ title: String) { self.init(title) { EmptyView() } }
}

/**
 A tab's large title row (`.large`): an optional line over it ("Tuesday, September 29"), the
 title in the title face at 34pt, and its own buttons on the right. Padded 20 by the sides, as
 the mockup's page is.
 */
struct LargeTitle<Trailing: View>: View {
    let title: String
    var over: String?
    var trailing: Trailing

    init(_ title: String, over: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.over = over
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if let over {
                    Text(over).font(.system(size: 13, weight: .medium)).foregroundStyle(Palette.muted)
                }
                Text(title)
                    .titleFont(34)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            HStack(spacing: 10) { trailing }
        }
        .padding(.top, 4)
        .padding(.bottom, 12)
        .padding(.horizontal, 20)
    }
}

extension LargeTitle where Trailing == EmptyView {
    init(_ title: String, over: String? = nil) { self.init(title, over: over) { EmptyView() } }
}

/**
 A sheet's header (`sheetHead`): the title at 26pt in the title face, a line under it, and the
 round close button — the way out that is not a swipe.
 */
struct SheetHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var trailing: Trailing

    init(_ title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).titleFont(26).foregroundStyle(Palette.text)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle).font(.system(size: 14)).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension SheetHeader where Trailing == IconButton {
    /// With the close button, which calls `onClose` (usually `dismiss()`).
    init(_ title: String, subtitle: String? = nil, onClose: @escaping () -> Void) {
        self.init(title, subtitle: subtitle) {
            IconButton("xmark", style: .plain, size: 32, label: "Close", action: onClose)
        }
    }
}

// MARK: - Small boxes

/// A tinted note (`.note-box`): an icon and a line on a tone's soft fill, 14pt corners.
struct NoteBox: View {
    let text: Text
    var tone: Tone = .mustard
    var systemImage = "info.circle"

    init(_ text: String, tone: Tone = .mustard, systemImage: String = "info.circle") {
        self.text = Text(text)
        self.tone = tone
        self.systemImage = systemImage
    }

    /// With bold runs or other styling already in the Text.
    init(text: Text, tone: Tone = .mustard, systemImage: String = "info.circle") {
        self.text = text
        self.tone = tone
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: systemImage).font(.system(size: 14, weight: .semibold))
            text.font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// A square icon tile on a tone's soft fill (`tile`): 40pt with 12pt corners by default.
struct Tile: View {
    let systemImage: String
    var tone: Tone = .accent
    var size: CGFloat = 40
    var radius: CGFloat?

    init(_ systemImage: String, tone: Tone = .accent, size: CGFloat = 40, radius: CGFloat? = nil) {
        self.systemImage = systemImage
        self.tone = tone
        self.size = size
        self.radius = radius
    }

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(tone.ink)
            .frame(width: size, height: size)
            .background(tone.soft, in: RoundedRectangle(cornerRadius: radius ?? (size * 0.3).rounded(),
                                                         style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Someone's initial in a circle on a tone's soft fill (`avatar`).
struct Avatar: View {
    let initial: String
    var tone: Tone = .accent
    var size: CGFloat = 36

    init(_ name: String, tone: Tone = .accent, size: CGFloat = 36) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        self.initial = trimmed.isEmpty ? "?" : String(trimmed.prefix(1)).uppercased()
        self.tone = tone
        self.size = size
    }

    var body: some View {
        Text(initial)
            .font(.system(size: (size * 0.4).rounded(), weight: .semibold))
            .foregroundStyle(tone.ink)
            .frame(width: size, height: size)
            .background(tone.soft, in: Circle())
            .accessibilityHidden(true)
    }
}

/// A dashed outline for "add one more" (`.dash`): an accent label in a 16pt-cornered box.
struct DashedAddButton: View {
    let title: String
    var systemImage = "plus"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.accentInk)
                .frame(maxWidth: .infinity, minHeight: 46)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressFade())
    }
}

/// The page itself: the bg token behind everything, to the edges.
extension View {
    func pageBackground() -> some View {
        background(Palette.bg.ignoresSafeArea())
    }
}

#Preview("Surfaces") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            LargeTitle("Plan", over: "Tuesday, September 29") {
                IconButton("plus", style: .accent, label: "New") {}
            }
            .padding(.horizontal, -20)
            SectionHead("Coming up") { Text("See all").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.accentInk) }
            Card {
                SectionLabel("Preview")
                Text("A card with something in it.").foregroundStyle(Palette.text)
            }
            SectionLabel("Who's here · 4")
            ListGroup {
                ListRow("Household settings", subtitle: "Gehan house", chevron: true, tile: ("house", .herb))
                ListRow("Switch household", subtitle: "3 households", chevron: true, tile: ("arrow.left.arrow.right", .sky))
                ListRow("Ideas board", chevron: true, tile: ("lightbulb", .mustard)) { Pill("Beta", tone: .mustard) }
                ListRow("Sign out", titleColor: Palette.accentInk, tile: ("rectangle.portrait.and.arrow.right", .accent))
            }
            ListGroup {
                ListRow("Ryan (you)", subtitle: "Owner", leading: { Avatar("Ryan", size: 38) }) {
                    Pill("Email", tone: .herb, systemImage: "envelope")
                }
                ListRow("Places we eat", detail: "6", chevron: true, tile: ("storefront", .plum))
            }
            NoteBox("Skipping this time: parsley garnish, chili flakes (optional)", tone: .mustard, systemImage: "leaf")
            NoteBox("Cupboard says you have 1", tone: .sky, systemImage: "cabinet")
            SheetHeader("Tuesday 29", subtitle: "Today", onClose: {})
            DashedAddButton(title: "Add aisle") {}
        }
        .padding(20)
    }
    .pageBackground()
}

#Preview("Surfaces — dark") {
    VStack(alignment: .leading, spacing: 16) {
        LargeTitle("Groceries").padding(.horizontal, -20)
        Card { Text("A card").foregroundStyle(Palette.text) }
        ListGroup(dividerInset: 52) {
            ListRow("3 lemons", subtitle: "Lemon herb chicken", leading: { CheckCircle(isOn: false) }, trailing: { EmptyView() })
            ListRow("bananas", subtitle: "Added by Jo", leading: { CheckCircle(isOn: true) }, trailing: { EmptyView() })
        }
        NoteBox("A warning", tone: .mustard)
        SheetHeader("Switch household", onClose: {})
    }
    .padding(20)
    .frame(maxHeight: .infinity, alignment: .top)
    .pageBackground()
    .preferredColorScheme(.dark)
}
