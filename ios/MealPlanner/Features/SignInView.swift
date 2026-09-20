import SwiftUI

/// The same three steps as the web: pick the house, tap your name, tap out four digits. No
/// email, no password — that is the whole point of the PIN.
struct SignInView: View {
    var session: Session

    @State private var households: [HouseholdSummary] = []
    @State private var household: HouseholdSummary?
    @State private var people: [UserSummary] = []
    @State private var person: UserSummary?
    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false
    @State private var editingServer = false
    @State private var serverDraft = Config.baseURL

    var body: some View {
        NavigationStack {
            Group {
                if let person, let household {
                    pinPad(for: person, in: household)
                } else if household != nil {
                    peopleList
                } else {
                    householdList
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if household != nil {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Back", systemImage: "chevron.left") { stepBack() }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Server", systemImage: "network") { editingServer = true }
                }
            }
        }
        .task { await loadHouseholds() }
        .alert("Kitchen server", isPresented: $editingServer) {
            TextField(Config.fallback, text: $serverDraft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            Button("Cancel", role: .cancel) { serverDraft = Config.baseURL }
            Button("Use it") { useTypedServer() }
        } message: {
            // Two audiences: whoever is developing this, and whoever in the house just
            // installed it. Only one of them knows what a simulator is.
            #if DEBUG
            Text("Where the app looks for your household. The simulator reaches this Mac at localhost.")
            #else
            Text("Where the app looks for your household. Leave this alone unless you have been given a different address.")
            #endif
        }
    }

    private var title: String {
        if person != nil { return "Your PIN" }
        if household != nil { return "Who's this?" }
        return "Meal Planner"
    }

    // MARK: - Steps

    private var householdList: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
            Section("Pick your household") {
                ForEach(households) { h in
                    Button {
                        household = h
                        Task { await loadPeople(h) }
                    } label: {
                        let members = h.memberCount ?? 0
                        LabeledContent(h.name, value: "\(members) \(members == 1 ? "person" : "people")")
                    }
                }
            }
            Section {
                LabeledContent("Server", value: Config.baseURL)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .overlay { if households.isEmpty && error == nil { ProgressView() } }
    }

    private var peopleList: some View {
        List(people) { p in
            Button(p.shown) {
                person = p
                pin = ""
            }
        }
    }

    private func pinPad(for person: UserSummary, in household: HouseholdSummary) -> some View {
        VStack(spacing: 28) {
            Text(person.shown).font(.title2.weight(.semibold))

            HStack(spacing: 18) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < pin.count ? Color.accentColor : Color.secondary.opacity(0.25))
                        .frame(width: 18, height: 18)
                }
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.callout)
            }

            // A real keypad, because a four-digit PIN on a phone should never open a keyboard.
            Grid(horizontalSpacing: 18, verticalSpacing: 18) {
                ForEach([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "⌫"]], id: \.self) { row in
                    GridRow {
                        ForEach(row, id: \.self) { key in
                            keypadKey(key, household: household, person: person)
                        }
                    }
                }
            }
            .disabled(busy)

            if busy { ProgressView() }
            Spacer()
        }
        .padding(.top, 24)
    }

    private func keypadKey(_ key: String, household: HouseholdSummary, person: UserSummary) -> some View {
        Group {
            if key.isEmpty {
                Color.clear.frame(width: 78, height: 78)
            } else {
                Button {
                    tap(key, household: household, person: person)
                } label: {
                    Text(key)
                        .font(.title.weight(.regular))
                        .frame(width: 78, height: 78)
                        .background(Color.secondary.opacity(0.12), in: Circle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Behaviour

    private func tap(_ key: String, household: HouseholdSummary, person: UserSummary) {
        error = nil
        if key == "⌫" {
            if !pin.isEmpty { pin.removeLast() }
            return
        }
        guard pin.count < 4 else { return }
        pin += key
        if pin.count == 4 {
            Task { await submit(household: household, person: person) }
        }
    }

    private func stepBack() {
        error = nil
        if person != nil {
            person = nil
            pin = ""
        } else {
            household = nil
            people = []
        }
    }

    /// Typing "meals.gehan.cloud" is the obvious thing to do, and storing it as typed left
    /// every call failing with "unsupported URL" — which reads as the server being broken
    /// rather than the address being half-written. Config fills in the scheme.
    private func useTypedServer() {
        guard let address = Config.address(from: serverDraft) else {
            error = "\(serverDraft.trimmingCharacters(in: .whitespaces)) is not a server address. "
                + "Try something like meals.gehan.cloud, or 192.168.1.10:8080."
            return
        }
        Config.baseURL = address
        serverDraft = address
        Task { await loadHouseholds() }
    }

    private func loadHouseholds() async {
        error = nil
        do {
            households = try await APIClient.shared.landing().households
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadPeople(_ h: HouseholdSummary) async {
        do {
            people = try await APIClient.shared.users(inHousehold: h.id)
        } catch {
            self.error = error.localizedDescription
            household = nil
        }
    }

    private func submit(household: HouseholdSummary, person: UserSummary) async {
        busy = true
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.logIn(username: person.username, pin: pin)
            await session.signIn(auth, household: household)
        } catch {
            self.error = error.localizedDescription
            pin = ""
        }
    }
}

#Preview("Households") {
    SignInView(session: Session())
}
