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
                    session.switchTo(household)
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

/// Every tab wears the same header, so the current household is always in the same place.
extension View {
    func householdHeader(_ session: Session, switching: Binding<Bool>) -> some View {
        self
            .toolbar { HouseholdMenu(session: session, switching: switching) }
            .sheet(isPresented: switching) { HouseholdPicker(session: session) }
    }
}
