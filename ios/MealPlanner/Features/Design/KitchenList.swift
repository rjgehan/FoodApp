import SwiftUI

/**
 A system `List` or `Form` in the mockup's grouped style: the page's colour behind it, rows on
 the theme's surface with border-coloured hairlines, at least 52pt tall, and section titles as
 the small upper-case label.

     List {
         KitchenSection("Who's here") { … rows … }
         KitchenSection { … } footer: { Text("…") }
     }
     .kitchenList()

 KitchenSection takes the same forms as SwiftUI's KitchenSection (a title, or header and footer views),
 so one can stand in for the other. The surface has to be set per section: a list's row fill
 cannot be changed from the list itself. A screen built from scratch can use `ListGroup` and
 `ListRow` (Surfaces.swift) instead, which draw the mockup's 18pt card exactly.
 */
extension View {
    func kitchenList() -> some View {
        modifier(KitchenListModifier())
    }

    /// Rows on the theme's surface with its hairlines — on a Section's content, or a ForEach.
    func kitchenRows() -> some View {
        listRowBackground(Palette.surface)
            .listRowSeparatorTint(Palette.border)
    }
}

private struct KitchenListModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(Palette.bg.ignoresSafeArea())
            .listRowSeparatorTint(Palette.border)
            .environment(\.defaultMinListRowHeight, 52)
    }
}

/// A list section with its rows on the theme's surface, and a title as the mockup's label.
struct KitchenSection<Content: View, Header: View, Footer: View>: View {
    var content: Content
    var header: Header
    var footer: Footer

    var body: some View {
        Section {
            content.kitchenRows()
        } header: {
            header.foregroundStyle(Palette.muted)
        } footer: {
            // Muted as the system's footers are, which the app-wide text colour would otherwise
            // turn into body text.
            footer.foregroundStyle(Palette.muted)
        }
    }
}

/// A section title as the mockup's label (`.lbl`), lined up with the rows below it.
struct SectionTitle: View {
    let title: String
    var trailing: String?

    var body: some View {
        SectionLabel(title, trailing: trailing)
            .textCase(nil)
            .padding(.horizontal, -4)
    }
}

extension KitchenSection where Header == SectionTitle, Footer == EmptyView {
    init(_ title: String, trailing: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(content: content(), header: SectionTitle(title: title, trailing: trailing), footer: EmptyView())
    }
}

extension KitchenSection where Header == SectionTitle {
    init(_ title: String, trailing: String? = nil, @ViewBuilder content: () -> Content,
         @ViewBuilder footer: () -> Footer) {
        self.init(content: content(), header: SectionTitle(title: title, trailing: trailing), footer: footer())
    }
}

extension KitchenSection where Header == EmptyView, Footer == EmptyView {
    init(@ViewBuilder content: () -> Content) {
        self.init(content: content(), header: EmptyView(), footer: EmptyView())
    }
}

extension KitchenSection where Footer == EmptyView {
    init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Header) {
        self.init(content: content(), header: header(), footer: EmptyView())
    }
}

extension KitchenSection where Header == EmptyView {
    init(@ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.init(content: content(), header: EmptyView(), footer: footer())
    }
}

extension KitchenSection {
    init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Header,
         @ViewBuilder footer: () -> Footer) {
        self.init(content: content(), header: header(), footer: footer())
    }
}

#Preview("System list") {
    NavigationStack {
        List {
            KitchenSection("Who's here", trailing: "4") {
                Label("Ryan", systemImage: "person")
                Label("Jo", systemImage: "person")
            }
            KitchenSection("Household setup") {
                NavigationLink("Places we eat") { Text("Places") }
                Toggle("Remind me", isOn: .constant(true))
            } footer: {
                Text("A footer under the section.")
            }
            KitchenSection {
                Text("No title")
            }
        }
        .kitchenList()
        .navigationTitle("Household")
    }
}

#Preview("System list — dark") {
    NavigationStack {
        List {
            KitchenSection("Who's here") {
                Label("Ryan", systemImage: "person")
                Label("Jo", systemImage: "person")
            }
        }
        .kitchenList()
        .navigationTitle("Household")
    }
    .preferredColorScheme(.dark)
}
