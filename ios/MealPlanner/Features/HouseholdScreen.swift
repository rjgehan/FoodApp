import SwiftUI

/**
 The house itself, the way the web has it: who is in it, where you eat when you don't cook,
 how the shop is laid out, and the two ways out.

 Reached from Settings, behind your own face. Everything here is set up once and rarely
 touched, which is why it is a page rather than a tab — but "rarely" is not "never", and
 leaving it out of the phone meant reaching for a laptop to add a person or fix an aisle.

 Recipe icons are here too: the phone draws its drawers with the same food drawings as the web
 and reads which one the household chose, so a pick here shows on both.
*/
struct HouseholdScreen: View {
    var session: Session

    @State private var people: [HouseholdMember] = []
    @State private var loaded = false
    @State private var leaving = false
    @State private var typedName = ""
    @State private var busy = false
    @State private var error: String?

    #if DEBUG
    /// -mp_debug_scroll icons (with -mp_debug_screen household) opens Recipe icons, and
    /// -mp_debug_expand 1 its picker for Dinner, for screenshot runs.
    @State private var debugIcons = UserDefaults.standard.string(forKey: "mp_debug_scroll") == "icons"
    /// -mp_debug_scroll people opens Who's here; with -mp_debug_expand 1, a reset link too.
    @State private var debugPeople = UserDefaults.standard.string(forKey: "mp_debug_scroll") == "people"
    #endif

    private var alone: Bool { people.count <= 1 }
    private var name: String { session.household?.name ?? "this household" }

    var body: some View {
        Form {
            Section {
                NavigationLink {
                    HouseholdBasicsScreen(session: session)
                } label: {
                    LabeledContent("Name and servings", value: name)
                }
                NavigationLink {
                    PeopleScreen(session: session, people: $people)
                } label: {
                    LabeledContent("Who's here", value: loaded ? "\(people.count)" : "—")
                }
                NavigationLink("Places we eat") { PlacesScreen(session: session) }
                NavigationLink("Store aisles") { AislesScreen(session: session) }
                NavigationLink("Recipe icons") { RecipeIconsScreen(session: session) }
            }

            Section {
                NavigationLink("Start another household") { NewHouseholdScreen(session: session) }
            } footer: {
                Text("One for your own place, one for your parents'. The switcher at the top of "
                     + "every screen moves between them.")
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
        #if DEBUG
        .navigationDestination(isPresented: $debugIcons) { RecipeIconsScreen(session: session) }
        .navigationDestination(isPresented: $debugPeople) { PeopleScreen(session: session, people: $people) }
        #endif
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
        // The members endpoint rather than the sign-in screen's roster, which goes away when the
        // PIN screens are switched off — and which knows nothing of emails or roles.
        people = (try? await APIClient.shared.members(household: household)) ?? []
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

// MARK: - What it is called, and what it assumes

/// The two numbers every other screen reads without asking: how many it cooks for, and how
/// far ahead the plan runs.
struct HouseholdBasicsScreen: View {
    var session: Session

    @State private var name = ""
    @State private var servings = 4
    @State private var horizon = 7
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Name") {
                TextField("Household", text: $name)
            }
            Section {
                Stepper("Serves \(servings)", value: $servings, in: 1...40)
                Stepper("\(horizon) days ahead", value: $horizon, in: 1...31)
            } header: {
                Text("Defaults")
            } footer: {
                Text("A new recipe starts at this many servings, and the plan loads this many "
                     + "days at a time.")
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { Task { await save() } }.disabled(busy || !loaded)
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let mine = try? await APIClient.shared.myHouseholds(),
              let here = mine.first(where: { $0.id == session.household?.id }) else {
            loaded = true
            return
        }
        name = here.name
        servings = here.defaultServings ?? 4
        horizon = here.planningHorizonDays ?? 7
        loaded = true
    }

    private func save() async {
        guard let household = session.household?.id else { return }
        let wanted = name.trimmingCharacters(in: .whitespaces)
        busy = true
        defer { busy = false }
        do {
            if !wanted.isEmpty, wanted != session.household?.name {
                try await APIClient.shared.renameHousehold(household, name: wanted)
            }
            try await APIClient.shared.updateHouseholdSettings(
                household, defaultServings: servings, planningHorizonDays: horizon)
            await session.loadHouseholds()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Who's here

struct PeopleScreen: View {
    var session: Session
    @Binding var people: [HouseholdMember]

    @State private var username = ""
    @State private var displayName = ""
    @State private var busy = false
    @State private var error: String?
    @State private var resetting: HouseholdMember?

    #if DEBUG
    /// -mp_debug_expand 1 (with -mp_debug_scroll people) opens a reset link for the first other
    /// person, for screenshot runs.
    @State private var debugExpand = UserDefaults.standard.string(forKey: "mp_debug_expand") == "1"
    #endif

    private var isOwner: Bool { session.household?.isOwner == true }

    var body: some View {
        Form {
            Section {
                ForEach(people) { person in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(person.shown)
                            Text(person.username + (person.role == "OWNER" ? " · owner" : ""))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        // Never signed in is a different job for the owner (tell them how, or send a
                        // reset link) from no email yet — the cue that the PIN screens can go.
                        if person.neverSignedIn || person.hasEmail == false {
                            Text(person.neverSignedIn ? "Hasn't signed in yet" : "No email yet")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Palette.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Palette.accentSoft, in: Capsule())
                        }
                        if isOwner && person.userId != session.userId {
                            Menu {
                                Button("Reset password", systemImage: "key") { resetting = person }
                            } label: {
                                Image(systemName: "ellipsis.circle")
                                    .font(.title3)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 32, height: 32)
                            }
                            .accessibilityLabel("More for \(person.shown)")
                        }
                    }
                }
            } footer: {
                if isOwner {
                    Text("Forgot a password? Reset it from the ••• beside them — you get a link to send.")
                }
            }

            Section {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Name (optional)", text: $displayName)
                Button("Add them") { Task { await add() } }
                    .disabled(busy || username.trimmingCharacters(in: .whitespaces).count < 2)
            } header: {
                Text("Add someone")
            } footer: {
                Text("To get in the first time, they tap “Sign in with your name and PIN” and choose "
                     + "one — or send them a reset link from the ••• beside them.")
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Who's here")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $resetting) { member in
            PasswordResetSheet(session: session, member: member)
        }
        .task { await reload() }
        #if DEBUG
        .onChange(of: people) {
            if debugExpand, let other = people.first(where: { $0.userId != session.userId }) {
                debugExpand = false
                resetting = other
            }
        }
        #endif
    }

    private func reload() async {
        guard let household = session.household?.id else { return }
        if let fresh = try? await APIClient.shared.members(household: household) { people = fresh }
    }

    private func add() async {
        guard let household = session.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.addPerson(
                household: household,
                username: username.trimmingCharacters(in: .whitespaces).lowercased(),
                displayName: displayName.trimmingCharacters(in: .whitespaces))
            username = ""
            displayName = ""
            await reload()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Recipe icons

/// Which drawing each catalog drawer wears — the web's "Recipe icons" card. A drawer always
/// wears one; until somebody picks, it is the drawer's default.
struct RecipeIconsScreen: View {
    var session: Session
    var sample: [RecipeSection: String]?

    @State private var icons: [RecipeSection: String] = [:]
    @State private var choosing: RecipeSection?
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                ForEach(RecipeSection.allCases, id: \.self) { section in
                    let current = icons[section] ?? section.defaultIcon
                    Button {
                        choosing = section
                    } label: {
                        HStack(spacing: 12) {
                            FoodIcon.named(current)?.image
                                .resizable().scaledToFit()
                                .frame(width: 30, height: 30)
                                .foregroundStyle(Palette.accent)
                            Text(section.title).foregroundStyle(.primary)
                            Spacer()
                            Text(FoodIcon.named(current)?.label ?? "").foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text("The picture on each drawer in Recipes, for everyone in the house.")
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Recipe icons")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await load()
            #if DEBUG
            if UserDefaults.standard.bool(forKey: "mp_debug_expand") { choosing = .dinner }
            #endif
        }
        .sheet(item: $choosing) { section in
            IconChooser(title: section.title, selected: icons[section] ?? section.defaultIcon, allowNone: false) { key in
                choosing = nil
                if let key { Task { await choose(key, for: section) } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func load() async {
        if let sample { icons = sample; return }
        guard let household = session.household?.id else { return }
        icons = (try? await APIClient.shared.sectionIcons(household: household)) ?? [:]
    }

    private func choose(_ key: String, for section: RecipeSection) async {
        guard let household = session.household?.id else { return }
        let before = icons
        icons[section] = key
        do {
            icons = try await APIClient.shared.setSectionIcon(household: household, section: section, iconKey: key)
        } catch {
            icons = before
            self.error = error.localizedDescription
        }
    }
}

extension RecipeSection: Identifiable {
    var id: String { rawValue }
}

// MARK: - Places we eat

struct PlacesScreen: View {
    var session: Session

    @State private var places: [Place] = []
    @State private var loaded = false
    @State private var adding = ""
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                if !loaded {
                    ProgressView()
                } else if places.isEmpty {
                    Text("Nowhere saved yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(places) { place in
                        Text(place.name)
                            .swipeActions(edge: .trailing) {
                                Button("Delete", systemImage: "trash", role: .destructive) {
                                    Task { await remove(place) }
                                }
                            }
                    }
                }
            } footer: {
                Text("A night out is planned like a meal — pick the place instead of a recipe, "
                     + "and nothing goes on the grocery list.")
            }

            Section {
                HStack {
                    TextField("Tony's, Chinese, pizza…", text: $adding)
                    Button("Add") { Task { await add() } }
                        .disabled(adding.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Places we eat")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let household = session.household?.id else { loaded = true; return }
        places = (try? await APIClient.shared.places(household: household)) ?? []
        loaded = true
    }

    private func add() async {
        let wanted = adding.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session.household?.id else { return }
        do {
            places.append(try await APIClient.shared.addPlace(household: household, name: wanted))
            adding = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ place: Place) async {
        places.removeAll { $0.id == place.id }
        do {
            try await APIClient.shared.deletePlace(place.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

// MARK: - Store aisles

/// The order the grocery list groups itself in, which is the order you walk the shop. Drag to
/// match your own supermarket and the list stops sending you back for the milk.
struct AislesScreen: View {
    var session: Session

    @State private var aisles: [GroceryCategory] = []
    @State private var drafts: [UUID: String] = [:]
    @State private var loaded = false
    @State private var adding = ""
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                if !loaded {
                    ProgressView()
                } else {
                    ForEach(aisles) { aisle in
                        TextField(aisle.name, text: draft(for: aisle))
                            .submitLabel(.done)
                            .onSubmit { Task { await rename(aisle) } }
                    }
                    .onMove { from, to in
                        aisles.move(fromOffsets: from, toOffset: to)
                        Task { await saveOrder() }
                    }
                    .onDelete { offsets in
                        let going = offsets.map { aisles[$0] }
                        aisles.remove(atOffsets: offsets)
                        Task { for aisle in going { await remove(aisle) } }
                    }
                }
            } header: {
                Text("In the order you walk the shop")
            } footer: {
                Text("Edit a name and press return. Deleting one leaves its things unsorted "
                     + "rather than throwing them away.")
            }

            Section {
                HStack {
                    TextField("New aisle", text: $adding)
                    Button("Add") { Task { await add() } }
                        .disabled(adding.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Store aisles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .task { await load() }
    }

    private func draft(for aisle: GroceryCategory) -> Binding<String> {
        Binding(get: { drafts[aisle.id] ?? aisle.name }, set: { drafts[aisle.id] = $0 })
    }

    private func load() async {
        guard let household = session.household?.id else { loaded = true; return }
        aisles = (try? await APIClient.shared.categories(household: household)) ?? []
        loaded = true
    }

    private func add() async {
        let wanted = adding.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session.household?.id else { return }
        do {
            aisles.append(try await APIClient.shared.addAisle(household: household, name: wanted))
            adding = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func rename(_ aisle: GroceryCategory) async {
        let wanted = (drafts[aisle.id] ?? aisle.name).trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, wanted != aisle.name, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.renameAisle(household: household, aisle: aisle.id, name: wanted)
            drafts[aisle.id] = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func saveOrder() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.reorderAisles(household: household, order: aisles.map(\.id))
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func remove(_ aisle: GroceryCategory) async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.deleteAisle(household: household, aisle: aisle.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

// MARK: - Another house

struct NewHouseholdScreen: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                TextField("Mum and Dad's", text: $name)
                Button("Create it") { Task { await create() } }
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            } footer: {
                Text("You own it, and it starts empty. Nothing moves across from here.")
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Start another household")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func create() async {
        let wanted = name.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.createHousehold(name: wanted)
            await session.loadHouseholds()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
