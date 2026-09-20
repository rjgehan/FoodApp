import SwiftUI

/**
 The house itself: who is in it, and the two ways out.

 Reached from Settings, behind your own face, the same route the web takes. It is a subset of
 the web's household page on purpose — aisles, recipe icons and places are things you set up
 once, sitting down, and the phone is not where that happens. Who is here, and leaving, are
 the two that come up while you are standing in a kitchen.
*/
struct HouseholdScreen: View {
    var session: Session

    @State private var people: [UserSummary] = []
    @State private var loaded = false
    @State private var leaving = false
    @State private var typedName = ""
    @State private var busy = false
    @State private var error: String?

    /// Alone, leaving is refused by the server — there would be nobody left to let you back
    /// in — so the only exit is to delete the household, and that is a different question.
    private var alone: Bool { people.count <= 1 }
    private var name: String { session.household?.name ?? "this household" }

    var body: some View {
        Form {
            Section {
                if !loaded {
                    ProgressView()
                } else if people.isEmpty {
                    Text("Nobody else yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(people) { person in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(person.shown)
                            Text(person.username).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            } header: {
                Text("Who's here")
            } footer: {
                Text("Add someone, rename an aisle or set a recipe icon on the website — those are "
                     + "set up once, and the screen for them is bigger than a phone.")
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            Section {
                Button(alone ? "Delete “\(name)”" : "Leave “\(name)”", role: .destructive) {
                    typedName = ""
                    leaving = true
                }
                .disabled(!loaded)
            }
        }
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert(alone ? "Delete this household" : "Leave this household", isPresented: $leaving) {
            if alone {
                // Irreversible, and it takes years of recipes with it. Typing the name is the
                // difference between this and walking out of a house somebody else lives in.
                TextField(name, text: $typedName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Button("Cancel", role: .cancel) {}
            Button(alone ? "Delete for good" : "Leave", role: .destructive) {
                Task { await go() }
            }
            .disabled(busy || (alone && !nameMatches))
        } message: {
            Text(warning)
        }
    }

    private var warning: String {
        if alone {
            return "You are the only one in “\(name)”, so there is nobody to leave it to. "
                + "Deleting it takes its recipes, plan, grocery list, cupboard and photos "
                + "with it, for good. Type the name to confirm."
        }
        return "You'll lose access to “\(name)”. Its recipes, plan and grocery list stay "
            + "with everyone else, and you can be invited back."
    }

    private var nameMatches: Bool {
        typedName.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(name) == .orderedSame
    }

    private func load() async {
        guard let household = session.household?.id else { loaded = true; return }
        people = (try? await APIClient.shared.users(inHousehold: household)) ?? []
        loaded = true
    }

    private func go() async {
        guard let household = session.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if alone {
                try await APIClient.shared.deleteHousehold(household)
            } else {
                try await APIClient.shared.leaveHousehold(household)
            }
            // Whichever it was, this session no longer belongs anywhere: start again.
            await session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
