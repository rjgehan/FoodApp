import SwiftUI

/**
 Which house you are in, and the way to another (mockup 6.8). Only reachable when you are in
 more than one: the household pill in the top bar opens it.
 */
struct HouseholdPicker: View {
    @Bindable var session: Session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Switch household", onClose: { dismiss() })
                ListGroup {
                    ForEach(Array(session.households.enumerated()), id: \.element.id) { index, household in
                        Button {
                            session.choose(household)
                            dismiss()
                        } label: {
                            ListRow(household.name, subtitle: subtitle(household), leading: {
                                Avatar(household.name, tone: Self.tones[index % Self.tones.count], size: 44)
                            }) {
                                CheckCircle(isOn: household.id == session.household?.id)
                            }
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(household.id == session.household?.id ? .isSelected : [])
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .pageBackground()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(28)
    }

    /// Each house its own colour, in the order they are listed — the mockup's herb, sky, plum.
    private static let tones: [Tone] = [.herb, .sky, .plum, .mustard, .accent]

    private func subtitle(_ household: HouseholdSummary) -> String? {
        var parts: [String] = []
        if let count = household.memberCount { parts.append(count == 1 ? "1 person" : "\(count) people") }
        if household.role == "OWNER" { parts.append("owner") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Every tab wears the same header, so the current household and your own account are always
/// in the same place.
extension View {
    /**
     The top bar (mockup `topBar`) in this tab's navigation bar: the household pill on the left,
     the ideas lightbulb and your initial on the right, and the sheets they open. The tab's own
     buttons sit after them, and its title below as the bar's large title.
     */
    func householdHeader(_ session: Session, switching: Binding<Bool>, account: Binding<Bool>) -> some View {
        modifier(HouseholdHeader(session: session, switching: switching, account: account))
    }

    /**
     Only the sheets the top bar opens — for a screen that draws `TopBar` in its own content
     rather than in the navigation bar. `ideas` is the bulb's flag, shared with that TopBar.
     */
    func householdSheets(_ session: Session, switching: Binding<Bool>, account: Binding<Bool>,
                         ideas: Binding<Bool>) -> some View {
        sheet(isPresented: switching) { HouseholdPicker(session: session) }
            .sheet(isPresented: account) { SettingsView(session: session) }
            .sheet(isPresented: ideas) { IdeasView(session: session) }
    }
}

/// The header itself. A modifier rather than a chain in the extension, so the ideas board can
/// keep whether it is open to itself instead of every tab holding one more flag for it.
private struct HouseholdHeader: ViewModifier {
    var session: Session
    @Binding var switching: Bool
    @Binding var account: Bool
    @State private var ideas = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                BareToolbarItem(placement: .topBarLeading) {
                    HouseholdPill(session: session, switching: $switching)
                }
                if session.ideasBoard {
                    BareToolbarItem(placement: .topBarTrailing) { IdeasBulb(open: $ideas) }
                }
                BareToolbarItem(placement: .topBarTrailing) {
                    AccountInitial(session: session, open: $account)
                }
            }
            .householdSheets(session, switching: $switching, account: $account, ideas: $ideas)
    }
}

/**
 A toolbar item drawn as itself. From iOS 26 the bar puts every item on a shared glass capsule,
 which would put a bubble around the pill and the round buttons that already have their own.
 */
struct BareToolbarItem<Content: View>: ToolbarContent {
    var placement: ToolbarItemPlacement
    @ViewBuilder var content: Content

    var body: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: placement) { content }
                .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: placement) { content }
        }
    }
}
