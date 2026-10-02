import SwiftUI

// MARK: - Name, servings & planning

/**
 Name, servings & planning (mockup 6.6): what the house is called (the owner's to change), how
 many a recipe is planned for unless you say otherwise, and how many days ahead the Plan runs.
 One Save for all three, in the bar.
 */
struct HouseholdBasicsScreen: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var servings = 4
    @State private var days = 7
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?

    /// The planning windows offered, as the mockup's row of five.
    private static let windows = [3, 5, 7, 10, 14]

    private var isOwner: Bool { session.household?.isOwner == true }

    /// A window set before these five were offered (or on the web) is kept, and shown with them.
    private var windows: [Int] {
        Self.windows.contains(days) ? Self.windows : (Self.windows + [days]).sorted()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                FieldBox("Household name", text: $name, hint: "Only the owner can change this")
                    .disabled(!isOwner)
                    .opacity(isOwner ? 1 : 0.6)

                Card(spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Default servings").font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Palette.text)
                            Text("Used when you plan a recipe").font(.system(size: 13)).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        ServingsStepper(value: $servings)
                    }
                    Rectangle().fill(Palette.border).frame(height: 1)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Plan ahead").font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(Palette.text)
                                Text("The planning window on Plan").font(.system(size: 13)).foregroundStyle(Palette.muted)
                            }
                            Spacer(minLength: 8)
                            Text("\(days) \(days == 1 ? "day" : "days")")
                                .font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text)
                        }
                        HStack(spacing: 6) {
                            ForEach(windows, id: \.self) { n in
                                Button {
                                    days = n
                                } label: {
                                    Text("\(n)")
                                        .font(.system(size: 14, weight: .semibold))
                                        .monospacedDigit()
                                        .foregroundStyle(n == days ? Palette.bg : Palette.muted)
                                        .frame(maxWidth: .infinity, minHeight: 36)
                                        .background(n == days ? Palette.text : Palette.surface2,
                                                    in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel("\(n) days")
                                .accessibilityAddTraits(n == days ? .isSelected : [])
                            }
                        }
                    }
                }

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .pageBackground()
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        // "Back" rather than "‹ Household": the title already says Household.
        .textBackButton("Back")
        .toolbar {
            BarTextButton("Save", placement: .topBarTrailing, bold: true, disabled: busy || !loaded) {
                Task { await save() }
            }
        }
        .task { await load() }
    }

    private func load() async {
        // What the session already knows first, so the screen is never blank; then the server's.
        if let here = session.household {
            name = here.name
            servings = here.defaultServings ?? 4
            days = here.planningHorizonDays ?? 7
        }
        if let mine = try? await APIClient.shared.myHouseholds(),
           let here = mine.first(where: { $0.id == session.household?.id }) {
            name = here.name
            servings = here.defaultServings ?? 4
            days = here.planningHorizonDays ?? 7
        }
        loaded = true
    }

    private func save() async {
        guard let household = session.household?.id else { return }
        let wanted = name.trimmingCharacters(in: .whitespaces)
        busy = true
        defer { busy = false }
        do {
            if isOwner, !wanted.isEmpty, wanted != session.household?.name {
                try await APIClient.shared.renameHousehold(household, name: wanted)
            }
            try await APIClient.shared.updateHouseholdSettings(household, defaultServings: servings,
                                                               planningHorizonDays: days)
            await session.loadHouseholds()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Store aisles

/**
 Store aisles (mockup 6.7): the household's own aisles in the order you walk the shop, which is
 the order the grocery list is grouped in. Press and hold a row, then drag it; tap one to rename
 or delete it; Add aisle puts a new one at the end.
 */
struct AislesScreen: View {
    var session: Session
    var sample: [GroceryCategory]?

    @Environment(\.dismiss) private var dismiss
    @State private var aisles: [GroceryCategory] = []
    @State private var loaded = false
    @State private var adding = false
    @State private var newName = ""
    @State private var renaming: GroceryCategory?
    @State private var renameTo = ""
    @State private var error: String?

    var body: some View {
        // A plain List of card rows, as Groceries and Cupboard draw theirs: one 18pt bordered card
        // 20pt in from the sides like every other group, while each row stays a real list row
        // that can be dragged and swiped.
        List {
            Text("Drag into the order you walk the store. Groceries follow this order.")
                .font(.system(size: 14))
                .foregroundStyle(Palette.muted)
                .pageRow(top: 6, bottom: 8)
            ForEach(Array(aisles.enumerated()), id: \.element.id) { index, aisle in
                HStack(spacing: 12) {
                    Text("\(index + 1)")
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.faint)
                        .frame(width: 20, alignment: .leading)
                    Text(aisle.name)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Palette.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    GripDots()
                }
                .frame(minHeight: 46)
                .contentShape(Rectangle())
                .onTapGesture {
                    renameTo = aisle.name
                    renaming = aisle
                }
                .accessibilityElement(children: .combine)
                .accessibilityHint("Tap to rename or delete; press and hold to move")
                .accessibilityAction(named: "Move up") { move(aisle, by: -1) }
                .accessibilityAction(named: "Move down") { move(aisle, by: 1) }
                .cardRow(first: index == 0, last: index == aisles.count - 1)
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
            VStack(alignment: .leading, spacing: 10) {
                DashedAddButton(title: "Add aisle") {
                    newName = ""
                    adding = true
                }
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
            }
            .pageRow(top: 14, bottom: 28)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Palette.bg.ignoresSafeArea())
        .environment(\.defaultMinListRowHeight, 0)
        .overlay { if !loaded { ProgressView() } }
        .navigationTitle("Store aisles")
        .navigationBarTitleDisplayMode(.inline)
        .textBackButton("Household")
        .toolbar {
            BarTextButton("Done", placement: .topBarTrailing, bold: true) { dismiss() }
        }
        .task { await load() }
        .alert("Add aisle", isPresented: $adding) {
            TextField("Pharmacy, say", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Add") { Task { await add() } }
        } message: {
            Text("It goes at the end; drag it where it belongs.")
        }
        .alert(renaming?.name ?? "Aisle", isPresented: Binding(
            get: { renaming != nil }, set: { if !$0 { renaming = nil } }
        ), presenting: renaming) { aisle in
            TextField(aisle.name, text: $renameTo)
            Button("Delete aisle", role: .destructive) {
                aisles.removeAll { $0.id == aisle.id }
                Task { await remove(aisle) }
            }
            Button("Cancel", role: .cancel) {}
            Button("Rename") { Task { await rename(aisle) } }
        } message: { aisle in
            Text("Deleting \(aisle.name) leaves anything filed under it unsorted, rather than throwing it away.")
        }
    }

    private func move(_ aisle: GroceryCategory, by step: Int) {
        guard let from = aisles.firstIndex(of: aisle) else { return }
        let to = from + step
        guard aisles.indices.contains(to) else { return }
        aisles.swapAt(from, to)
        Task { await saveOrder() }
    }

    private func load() async {
        if let sample { aisles = sample; loaded = true; return }
        guard let household = session.household?.id else { loaded = true; return }
        aisles = (try? await APIClient.shared.categories(household: household)) ?? []
        loaded = true
    }

    private func add() async {
        let wanted = newName.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session.household?.id else { return }
        do {
            aisles.append(try await APIClient.shared.addAisle(household: household, name: wanted))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func rename(_ aisle: GroceryCategory) async {
        let wanted = renameTo.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, wanted != aisle.name, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.renameAisle(household: household, aisle: aisle.id, name: wanted)
            await load()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func saveOrder() async {
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.reorderAisles(household: household, order: aisles.map(\.id))
            error = nil
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func remove(_ aisle: GroceryCategory) async {
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.deleteAisle(household: household, aisle: aisle.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

/// The mockup's grip: two columns of three dots, in the faint ink.
struct GripDots: View {
    var body: some View {
        Grid(horizontalSpacing: 4, verticalSpacing: 3) {
            ForEach(0..<3, id: \.self) { _ in
                GridRow {
                    Circle().frame(width: 4, height: 4)
                    Circle().frame(width: 4, height: 4)
                }
            }
        }
        .foregroundStyle(Palette.faint)
        .frame(width: 22)
        .accessibilityHidden(true)
    }
}

// MARK: - Recipe icons

/// Which drawing each catalog drawer wears — the web's "Recipe icons". A drawer always wears
/// one; until somebody picks, it is the drawer's default.
struct RecipeIconsScreen: View {
    var session: Session
    var sample: [RecipeSection: String]?

    @State private var icons: [RecipeSection: String] = [:]
    @State private var choosing: RecipeSection?
    @State private var error: String?

    var body: some View {
        Form {
            KitchenSection {
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
                KitchenSection { Text(error).foregroundStyle(Palette.danger) }
            }
        }
        .kitchenList()
        .navigationTitle("Recipe icons")
        .textBackButton("Household")
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

// MARK: - Another house

struct NewHouseholdScreen: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    /// The house just made, whose empty cupboard is offered the starter list before going back.
    @State private var made: HouseholdSummary?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                FieldBox("Name", text: $name, prompt: "Mum and Dad's",
                         hint: "You own it, and it starts empty. Nothing moves across from here.")
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
                Button(busy ? "Creating…" : "Create it") { Task { await create() } }
                    .buttonStyle(.primary)
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
        }
        .pageBackground()
        .navigationTitle("Start another household")
        .navigationBarTitleDisplayMode(.inline)
        .textBackButton("Household")
        .sheet(item: $made, onDismiss: { dismiss() }) { household in
            StartCupboardSheet(household: household.id, first: true)
        }
    }

    private func create() async {
        let wanted = name.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let household = try await APIClient.shared.createHousehold(name: wanted)
            await session.loadHouseholds()
            // A new house has an empty cupboard, and most of what goes in it is the same everywhere.
            made = household
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Name, servings & planning") {
    NavigationStack { HouseholdBasicsScreen(session: .preview) }
}

#Preview("Store aisles") {
    NavigationStack { AislesScreen(session: .preview, sample: SampleData.storeAisles) }
}

#Preview("Store aisles — dark") {
    NavigationStack { AislesScreen(session: .preview, sample: SampleData.storeAisles) }
        .preferredColorScheme(.dark)
}
