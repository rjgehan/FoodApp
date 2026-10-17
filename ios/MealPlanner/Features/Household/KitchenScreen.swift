import SwiftUI

/**
 Household → Kitchen & features (the web's Household page row of the same name): the kitchen
 questions' answers, to change any time. The machines as tiles, then Meal planning and Cupboard as
 switches, each saying what it is for and what turning it off means. Every tap saves straight away
 and is the household's, so it changes for everyone in it — and the tabs follow at once.

 Turning the cupboard on with nothing in it offers the starter list, as setting up does.
 */
struct KitchenScreen: View {
    var session: Session
    /// Draw it from this house and send nothing (previews and the Gallery).
    var sample: HouseholdSummary?

    @State private var machines: Set<String> = []
    @State private var plan = true
    @State private var cupboard = true
    @State private var loaded = false
    /// Meals on the Plan from today on: turning planning off keeps them, and says so.
    @State private var planned: Int?
    /// A few taps on the machines in a row are one save, sent once they stop.
    @State private var machinesSave: Task<Void, Never>?
    @State private var startingCupboard = false
    @State private var error: String?

    private var household: UUID? { sample?.id ?? session.household?.id }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("Machines").padding(.bottom, -4)
                MachineGrid(selected: Binding(get: { machines }, set: { picked in
                    machines = picked
                    saveMachinesSoon(picked)
                }))
                .disabled(!loaded)
                // Only what is true today: the machines are kept, and recipes are marked with theirs.
                // Making meals from what the house can make is for later, and not promised here.
                Text("Saved for your household. Recipes show the machines they need, and a drawer can be filtered by machine.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)

                SectionLabel("Features").padding(.top, 10).padding(.bottom, -4)
                ListGroup {
                    featureRow("Meal planning", line: planLine, tile: ("calendar", .accent),
                               isOn: Binding(get: { plan }, set: { on in
                                   plan = on
                                   Task { await save(plan: on) }
                               }))
                    featureRow("Cupboard", line: cupboardLine, tile: ("cabinet", .sky),
                               isOn: Binding(get: { cupboard }, set: { on in
                                   cupboard = on
                                   Task { await save(cupboard: on) }
                               }))
                }
                .disabled(!loaded)
                Text("Recipes and the grocery list are always there. These are the household's, so they change for everyone in it.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .pageBackground()
        .navigationTitle("Kitchen & features")
        .navigationBarTitleDisplayMode(.inline)
        .textBackButton("Household")
        .task { await load() }
        .sheet(isPresented: $startingCupboard) {
            if let household {
                StartCupboardSheet(household: household, first: true, sample: sample == nil ? nil : SampleData.starters)
            }
        }
    }

    /// What the Plan is for — and, once it is off, that nothing planned was thrown away.
    private var planLine: String {
        if !plan, let planned, planned > 0 {
            return "Off. Your \(planned) planned \(planned == 1 ? "meal stays" : "meals stay") saved, for when it's back on."
        }
        return plan ? "Plan the week together and add it all to Groceries in one tap."
            : "Off. Add a recipe to Groceries from its page instead."
    }

    /// What the cupboard is for, and what turning it off means for "Always have".
    private var cupboardLine: String {
        cupboard
            ? "Remembers what's at home, so the list can skip it. Turning it off puts “Always have” things (salt, oil…) back on lists."
            : "Off. “Always have” things like salt and oil go on grocery lists like everything else."
    }

    private func featureRow(_ title: String, line: String, tile: (String, Tone), isOn: Binding<Bool>) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Tile(tile.0, tone: tile.1)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.rowTitle).foregroundStyle(Palette.text)
                Text(line).font(.rowSubtitle).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle(title, isOn: isOn).labelsHidden()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: Behaviour

    private func load() async {
        // The session's copy is fresh: it is fetched again each time the app comes to the front.
        if let here = sample ?? session.household {
            machines = Set(here.machines ?? [])
            plan = here.plansMeals
            cupboard = here.tracksCupboard
        }
        loaded = true
        guard sample == nil, let household else { return }
        let today = Date()
        planned = (try? await APIClient.shared.plan(household: household, from: Day.iso(today),
                                                     to: Day.iso(Day.adding(90, to: today))))?
            .filter(\.isPlanned).count
    }

    private func saveMachinesSoon(_ picked: Set<String>) {
        machinesSave?.cancel()
        machinesSave = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            await save(machines: KitchenMachine.ordered(picked).map(\.key))
        }
    }

    /**
     One answer at a time, as it is changed. A failure puts the switch back and says why.

     Any change here answers the kitchen questions too (`setUp`): somebody who has picked the
     machines and the features here has no need of the Recipes card asking them again, nor has
     anyone who joins the house later. The server stamps it once.
    */
    private func save(plan wantedPlan: Bool? = nil, cupboard wantedCupboard: Bool? = nil,
                      machines wantedMachines: [String]? = nil) async {
        error = nil
        if sample != nil {
            if wantedCupboard == true { startingCupboard = true }
            return
        }
        guard let household else { return }
        do {
            let saved = try await APIClient.shared.updateKitchen(household: household, cupboardEnabled: wantedCupboard,
                                                                 planEnabled: wantedPlan, machines: wantedMachines,
                                                                 setUp: true)
            session.adopt(saved)
            // Answered here, so the questions waiting to be asked of this house are not.
            if session.kitchenSetupFor == household { session.kitchenSetupFor = nil }
            if wantedCupboard == true,
               let stock = try? await APIClient.shared.cupboard(household: household), stock.isEmpty {
                // Turned on with nothing in it: the common things a kitchen already has, in one go.
                startingCupboard = true
            }
        } catch {
            self.error = error.localizedDescription
            if let wantedPlan { plan = !wantedPlan }
            if let wantedCupboard { cupboard = !wantedCupboard }
            if wantedMachines != nil { machines = Set(session.household?.machines ?? []) }
        }
    }
}

#Preview("Kitchen & features") {
    NavigationStack { KitchenScreen(session: .preview, sample: SampleData.kitchenHousehold) }
}

#Preview("Kitchen & features — dark") {
    NavigationStack { KitchenScreen(session: .preview, sample: SampleData.newHousehold) }
        .preferredColorScheme(.dark)
}
