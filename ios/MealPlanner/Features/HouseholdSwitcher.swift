import SwiftUI

/// The household name, top left, the way the web header has it — and the way to change which
/// house you are looking at. Two people share this app across two houses; being able to see
/// which one you are in without navigating anywhere is the point.
struct HouseholdMenu: ToolbarContent {
    @Bindable var session: Session
    @Binding var switching: Bool

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                switching = true
            } label: {
                HStack(spacing: 4) {
                    Text(session.household?.name ?? "Household")
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                    if session.households.count > 1 {
                        Image(systemName: "chevron.up.chevron.down").font(.caption2)
                    }
                }
                .foregroundStyle(.secondary)
            }
            .disabled(session.households.count < 2)
        }
    }
}

struct HouseholdPicker: View {
    @Bindable var session: Session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(session.households) { household in
                Button {
                    session.choose(household)
                    dismiss()
                } label: {
                    HStack {
                        Text(household.name)
                        Spacer()
                        if household.id == session.household?.id {
                            Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                        }
                    }
                }
                .foregroundStyle(.primary)
            }
            .navigationTitle("Switch household")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.medium])
    }
}

/**
 Your own face, top right, and Settings behind it.

 Settings used to be the fifth tab, which spent a fifth of the app's navigation on a screen
 you open twice: once to point the app at a server, once to sign out. Behind the avatar is
 where every app of this shape keeps it, and it frees the tab for Explore.
*/
struct AccountButton: ToolbarContent {
    var session: Session
    @Binding var open: Bool

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                open = true
            } label: {
                Text(initial)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.accent)
                    .frame(width: 30, height: 30)
                    .background(Palette.accentSoft, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Your account")
        }
    }

    private var initial: String {
        let name = session.displayName?.trimmingCharacters(in: .whitespaces) ?? ""
        return name.isEmpty ? "?" : String(name.prefix(1)).uppercased()
    }
}

/**
 The beta's ideas board, just left of your face — the web has it in the same place. Only there
 while the server has the board open, so it goes when the beta does.

 A bare lightbulb rather than a word: the toolbar also carries each tab's own buttons, and the
 board says "beta" itself once it is open.
*/
struct IdeasButton: ToolbarContent {
    var session: Session
    @Binding var open: Bool

    var body: some ToolbarContent {
        if session.ideasBoard {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    open = true
                } label: {
                    Image(systemName: "lightbulb")
                }
                .accessibilityLabel("Ideas (beta)")
            }
        }
    }
}

/// Every tab wears the same header, so the current household and your own account are always
/// in the same place.
extension View {
    func householdHeader(_ session: Session, switching: Binding<Bool>, account: Binding<Bool>) -> some View {
        modifier(HouseholdHeader(session: session, switching: switching, account: account))
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
            .toolbar { HouseholdMenu(session: session, switching: $switching) }
            .toolbar {
                IdeasButton(session: session, open: $ideas)
                AccountButton(session: session, open: $account)
            }
            .sheet(isPresented: $switching) { HouseholdPicker(session: session) }
            .sheet(isPresented: $account) { SettingsView(session: session) }
            .sheet(isPresented: $ideas) { IdeasView(session: session) }
    }
}
